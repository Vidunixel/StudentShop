import {
  AfterViewInit, ChangeDetectorRef,
  Component,
  ElementRef, HostListener,
  Input,
  OnDestroy,
  OnInit, Renderer2,
  ViewChild,
  ViewEncapsulation
} from '@angular/core';
import {DatabaseService} from "../database.service";
import {AuthenticationService} from "../authentication.service";
import {DomSanitizer, SafeHtml} from "@angular/platform-browser";
import {debounceTime, distinctUntilChanged, skip, takeUntil} from "rxjs/operators";
import {User as NativeUser} from "../models/User";
import {Subject, Subscription} from "rxjs";
import {Note} from "../models/Note";
import {FormsModule} from "@angular/forms";
import {ActivatedRoute, Router, RouterLink} from "@angular/router";
import {NgIf} from "@angular/common";
import streamSaver from "streamsaver";
import {PageNotFoundComponent} from "../page-not-found/page-not-found.component";
import Mark from "mark.js";
import {UserCartService} from "../user-cart.service";
import {ContextMenuService} from "../context-menu.service";
import {DialogsService} from "../dialog-components/dialogs.service";
import sodium from "libsodium-wrappers";
import { environment } from "../../environments/environment";

@Component({
  selector: 'app-note-viewer',
  standalone: true,
  imports: [
    FormsModule,
    NgIf,
    RouterLink,
    PageNotFoundComponent
  ],
  templateUrl: './note-viewer.component.html',
  styleUrl: './note-viewer.component.css',
  encapsulation: ViewEncapsulation.None
})
export class NoteViewerComponent implements OnInit, OnDestroy {
  @Input() noteViewerData: { isMiniViewer: boolean } = { isMiniViewer: false };
  noteId: string | undefined;
  isError: boolean = false;
  isLoading: boolean = false;

  isSample: boolean = true;
  isSampleBannerEnabled: boolean = true;
  isDownloadLoading: boolean = false;
  private destroy$ = new Subject<void>();

  nativeUser: NativeUser | null | undefined = undefined;
  note: Note | null = null;

  htmlContent: SafeHtml | null = "";
  zoomLevel: number = 1;

  @ViewChild("noteViewerContainer") noteViewerContainer: ElementRef | undefined;
  dragging = false;
  pageContainer!: HTMLElement;
  pages: HTMLElement[] = [];
  strictlyVisiblePageContents: HTMLElement[] = [];
  sidebar!: HTMLElement;

  isToolbarOpen: boolean = true;

  currentPageNumber: number = 0;
  totalPageCount: number = 0;

  isFitToPageEnabled: boolean = false; // fitToWidth if false.
  isSidebarEnabled: boolean = false;
  isSidebarOpen: boolean = false;

  // Clean up functions.
  private unlistenScroll!: () => void;
  private unlistenMouseMove!: () => void;
  private unlistenMouseUp!: () => void;
  private sidebarClickListeners: Array<{ element: Element, handler: EventListener }> = [];

  isNoteViewerContainerHovered: boolean = false;

  markInstance!: Mark;
  isFindLoading: boolean = false;
  findMatches: HTMLElement[] = [];
  currentFindIndex: number | null = null;
  currentFindQuery: string = "";
  lastQueriedFindQuery: string = "";
  isFindFieldOpen: boolean = false;
  @ViewChild("findField") findField: ElementRef | undefined;
  @ViewChild("findForm") findForm: ElementRef | undefined;

  @ViewChild("toolbar") toolbar: ElementRef | undefined;
  @ViewChild("toolbarWrap") toolbarWrap: ElementRef | undefined;
  @ViewChild("verticalScrollbarWrap") verticalScrollbarWrap: ElementRef | undefined;
  @ViewChild("verticalScrollbarContainer") verticalScrollbarContainer: ElementRef | undefined;
  @ViewChild("verticalScrollbar") verticalScrollbar: ElementRef | undefined;
  @ViewChild("horizontalScrollbarWrap") horizontalScrollbarWrap: ElementRef | undefined;
  @ViewChild("horizontalScrollbarContainer") horizontalScrollbarContainer: ElementRef | undefined;
  @ViewChild("horizontalScrollbar") horizontalScrollbar: ElementRef | undefined;

  constructor(private db: DatabaseService, private authenticationService: AuthenticationService,
              private sanitizer: DomSanitizer, private cdr: ChangeDetectorRef, private renderer: Renderer2,
              private route: ActivatedRoute, private userCartService: UserCartService, private contextMenuService: ContextMenuService,
              private router: Router, private dialogsService: DialogsService) { }

  async ngOnInit() {
    this.authenticationService.getNativeUser().pipe(takeUntil(this.destroy$)).subscribe(async (nativeUser: NativeUser | null | undefined) => {
      this.nativeUser = nativeUser;
      await this.setHtml();
    });

    // Set noteViewer on route change.
    this.route.paramMap.pipe(skip(1), takeUntil(this.destroy$)).subscribe(params => {
      this.setHtml();
    });
  }

  async setHtml() {
    this.noteId = this.route.snapshot.paramMap.get('id') || undefined;
    this.htmlContent = "<div class=\"loading-container\"><div class=\"loading-bar\"></div></div>"; // loading bar.
    this.isError = false;

    this.isLoading = true;
    if (this.noteId) {
      try {
        await this.serveNote(this.noteId);
        await this.setNoteViewer();
      } catch (error: any) {
        console.log(error);
        this.htmlContent = "";
        this.isError = true;
      }
    } else {
      this.htmlContent = "";
      this.isError = true;
    }
    this.isLoading = false;
  }

  async addCartItem(_index: string, _id?: string): Promise<void> {
    _id ? await this.userCartService.addCartItem({_index, _id}) : undefined;
  }

  async removeCartItem(_index: string, _id?: string): Promise<void> {
    _id ? await this.userCartService.removeCartItem({_index, _id}) : undefined;
  }

  isItemInCart(_index: string, _id?: string): boolean {
    let returnValue: boolean = false
    returnValue = _id ? this.userCartService.isItemInCart({ _index, _id }) : returnValue;

    return returnValue;
  }

  async confirmDownload() {
    if (this.note) {
      console.log(this.note);
      if (this.note.isRefundAvailable && this.note.sellerUid !== this.nativeUser?.uid) {
        const message = "Confirm download";
        const description = "Once downloaded, this item cannot be refunded.";
        const yesOption = "Download";
        const noOption = "No";

        this.dialogsService.toggleConfirmationDialog({ message: message, description: description,
          yesOption: yesOption, noOption: noOption });

        this.dialogsService.getConfirmationDialogResult().subscribe({
          next: async (result: boolean) => {
            if (result) {
              try {
                this.dialogsService.closeAllDialogs();
                await this.downloadNote();
                this.authenticationService.setCurrentNativeUser();
              } catch (error: any) {
                this.dialogsService.closeAllDialogs();
              }
            } else {
              this.dialogsService.closeAllDialogs();
            }
          }
        });
      } else {
        await this.downloadNote();
      }
    }
  }

  async downloadNote() {
    this.isDownloadLoading = true;
    try {
      const response = await this.db.downloadNote(this.noteId, await this.authenticationService.getUserIdToken());

      // Give the user the native save dialog + progress UI.
      const fileSize = response.headers.get("Content-Length");
      const fileStream = streamSaver.createWriteStream(this.note?.title + ".pdf", {
        size: fileSize ? parseInt(fileSize, 10) : undefined
      });
      this.isDownloadLoading = false;

      // Pipe the network stream straight to disk.
      return response.body!.pipeTo(fileStream);
    } catch (error: any) {
      this.isDownloadLoading = false;
      console.log(error);
    }
  }

  zoomIn() {
    this.zoomLevel = Math.min(4, this.zoomLevel + 0.1);
    this.applyZoom();
  }

  zoomOut() {
    this.zoomLevel = Math.max(0.20, this.zoomLevel - 0.1);
    this.applyZoom();
  }

  applyZoom() {
    // Apply zoom.
    this.pageContainer.style.transform = `scale(${this.zoomLevel})`;
    this.pageContainer.style.width = `${100 / this.zoomLevel}%`;
    this.pageContainer.style.height = `${100 / this.zoomLevel}%`;

    this.updateScrollbars();
    this.setPageContentVisibility();
    this.setCurrentPageNumber();
  }

  async serveNote(id: string = ""): Promise<void> {
    const response = await this.db.getNote(id, await this.authenticationService.getUserIdToken());
    this.note = response.note;
  }

  async setNoteViewer() {
    try {
      // Request sample note if user has not purchased note, or is not the seller.
      this.isSample = !(this.note?.isOwned || this.nativeUser?.uid === this.note?.sellerUid);
      this.isSampleBannerEnabled = true;

      // Reset zoom.
      this.zoomLevel = 1;

      const noteId = this.noteId;
      const response = await this.db.viewNote(noteId, this.isSample,
        await this.authenticationService.getUserIdToken());

      const html = this.decryptResponse(response);

      // If the route has not changed after retrieving response, set note viewer.
      if (noteId === this.noteId) {
        this.htmlContent = this.sanitizer.bypassSecurityTrustHtml(html);

        this.setFullViewerHeight();

        // Detect changes and set pageContainer.
        this.cdr.detectChanges();
        this.pageContainer = document.getElementById("page-container")!;
        this.pages = Array.from(document.getElementsByClassName("pf")) as HTMLElement[];
        this.setCurrentPageNumber();
        this.markInstance = new Mark(this.pages);

        // Set sidebar.
        this.formatSidebar();

        // Run find matches.
        this.findInNote();

        // Listen for scrolls.
        this.unlistenScroll = this.renderer.listen(this.pageContainer, "scroll", (evt: Event) => {
          this.updateScrollbars();
          this.setCurrentPageNumber();
          this.setPageContentVisibility();
        });

        // Set scrollbars.
        this.updateScrollbars();
        // Set totalPageCount.
        this.setTotalPageCount();
        // Set page content visibility.
        this.setPageContentVisibility();

        // Open sidebar if screen size is above desktop.
        if (this.isSidebarEnabled && this.noteViewerContainer?.nativeElement.clientWidth > 991) {
          this.toggleSidebar(true);
        }

        // Add sample banner's if viewing sample.
        this.insertMessagesIntoRedactedSamplePages();

        // Fit to page on load.
        this.fitToPage();
      }
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  decryptResponse(response: ArrayBuffer) {
    const nonceLength = sodium.crypto_secretbox_NONCEBYTES;

    // Convert response to uint8Array;
    const uint8Array = new Uint8Array(response);

    const key = sodium.from_base64(environment.noteEcryptionKeyB64);
    const nonce = uint8Array.slice(0, nonceLength);
    const cipher = uint8Array.slice(nonceLength);

    const plain = sodium.crypto_secretbox_open_easy(cipher, nonce, key);
    return new TextDecoder().decode(plain);
  }

  insertMessagesIntoRedactedSamplePages() {
    if (this.isSample && this.note?.pageCount && this.note?.samplePdfProperties && this.note.samplePdfProperties.length > 0) {
      const redactedPageInfo = this.getRedactedSamplePages();

      const backgroundTextMessage = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Mauris varius " +
        "justo non sem facilisis, in finibus nunc imperdiet. Donec et semper felis. Etiam vitae ante bibendum, " +
        "porttitor lorem ut, convallis nunc. Mauris non augue diam. Donec sem elit, eleifend sit amet porta et, " +
        "gravida sit amet velit. Mauris.";

      redactedPageInfo.forEach((redaction, i) => {
        if (redaction.redactedPageNumbers[0] !==
          redaction.redactedPageNumbers[redaction.redactedPageNumbers.length - 1]) {
          this.pages[redaction.priorPageIndex === null ? 0 : redaction.priorPageIndex].insertAdjacentHTML(
            redaction.priorPageIndex === null ? "beforebegin" : "afterend",
            `
              <div class="redacted-pages-message-container">
                <div class="redacted-pages-message-wrap">
                  <div class="background-text">
                    <p>${backgroundTextMessage}</p>
                  </div>
                  <div class="overview redacted-pages-message">
                    <div class="overview-left no-wrap">
                      <i class="fi fi-rr-lock small-icon"></i>
                      <div class="label-wrap">
                        <p>
                          Pages <strong>${redaction.redactedPageNumbers[0]} – ${redaction.redactedPageNumbers[redaction.redactedPageNumbers.length - 1]}</strong> locked
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
             </div>
          `);
        } else {
          this.pages[redaction.priorPageIndex === null ? 0 : redaction.priorPageIndex].insertAdjacentHTML(
            redaction.priorPageIndex === null ? "beforebegin" : "afterend",
            `
             <div class="redacted-pages-message-container">
                <div class="redacted-pages-message-wrap">
                  <div class="background-text">
                    <p>${backgroundTextMessage}</p>
                  </div>
                  <div class="overview redacted-pages-message">
                    <div class="overview-left no-wrap">
                      <i class="fi fi-rr-lock small-icon"></i>
                      <div class="label-wrap">
                        <p>
                          Page <strong>${redaction.redactedPageNumbers[0]}</strong> locked
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
             </div>
          `);
        }
      });
    }
  }

  getRedactedSamplePages() {
    const redactedPageInfo: { priorPageIndex: number | null, priorPageNumber: number, redactedPageNumbers: number[] }[] = [];
    if (this.isSample && this.note?.pageCount && this.note?.samplePdfProperties && this.note.samplePdfProperties.length > 0) {
      // Sort the samplePdfProperties pages to be safe.
      const samplePdfProperties = [...this.note.samplePdfProperties].sort((a, b) => a - b);

      let prevPage = 0;

      // For each samplePdfProperties page, collect any pages between `prevPage` and `page`.
      for (const page of samplePdfProperties) {
        if (page - prevPage > 1) {
          const redacted: number[] = [];
          for (let p = prevPage + 1; p < page; p++) {
            redacted.push(p);
          }

          // Find the index of prevPage in the visible array (or null if prevPage === 0).
          const priorIndex =
            prevPage === 0 ? null : samplePdfProperties.findIndex((v) => v === prevPage);

          redactedPageInfo.push({
            priorPageNumber: prevPage,
            priorPageIndex: priorIndex === -1 ? null : priorIndex,
            redactedPageNumbers: redacted,
          });
        }
        prevPage = page;
      }

      // If there are pages after the last samplePdfProperties one, add them too.
      if (this.note.pageCount - prevPage >= 1) {
        const redacted: number[] = [];
        for (let p = prevPage + 1; p <= this.note.pageCount; p++) {
          redacted.push(p);
        }

        const priorIndex =
          prevPage === 0 ? null : samplePdfProperties.findIndex((v) => v === prevPage);

        redactedPageInfo.push({
          priorPageNumber: prevPage,
          priorPageIndex: priorIndex === -1 ? null : priorIndex,
          redactedPageNumbers: redacted,
        });
      }
    }
    return redactedPageInfo;
  }

  setFullViewerHeight() {
    if (!this.noteViewerData.isMiniViewer) {
      const viewportHeight = window.innerHeight;
      const root = document.querySelector("app-root") as HTMLElement;
      let totalComponentHeight = 0;

      if (root) {
        const noteViewer = document.querySelector("app-note-viewer") as HTMLElement;
        const footer = document.querySelector("app-footer") as HTMLElement;
        footer.style.display = "none"; // Hide footer.

        // Select all direct children except <app-note-viewer> & <app-footer>.
        const children = Array.from(root.children).filter(child =>
          !["app-note-viewer", "app-footer"].includes(child.tagName.toLowerCase())
        );

        for (const child of children) {
          totalComponentHeight += (child as HTMLElement).clientHeight;
        }

        const noteViewerHeight = viewportHeight - totalComponentHeight;
        noteViewer.style.height = `${noteViewerHeight}px`;
      }
    }
  }

  setPageContentVisibility() {
    this.pages.forEach((element, i) => {
      const rect = element.getBoundingClientRect();

      const containerRect = this.pageContainer.getBoundingClientRect();
      const visibleTop = Math.max(rect.top, containerRect.top);
      const visibleBottom = Math.min(rect.bottom, containerRect.bottom);
      const visibleHeight = Math.max(visibleBottom - visibleTop, 0);

      const pageContents = Array.from(element.querySelectorAll(".pc")) as HTMLElement[];
      if (visibleHeight > 0) {
        pageContents.forEach(pageContent => {
          pageContent.classList.add("visible");
        })
      } else {
        pageContents.forEach(pageContent => {
          const isExcluded = this.strictlyVisiblePageContents.includes(pageContent);
          if (!isExcluded) {
            pageContent.classList.remove("visible");
          }
        })
      }
    });
  }

  setPageContentAsStrictlyVisible(pageContent: HTMLElement) {
    if (pageContent) {
      if (!pageContent.classList.contains("visible")) {
        pageContent.classList.add("visible");
      }
      this.strictlyVisiblePageContents.push(pageContent);
    }
    return pageContent;
  }

  unsetPageContentAsStrictlyVisible(pageContent: HTMLElement) {
    const indexToRemove = this.strictlyVisiblePageContents.indexOf(pageContent);
    if (indexToRemove !== -1) {
      this.strictlyVisiblePageContents.splice(indexToRemove, 1);
    }
  }

  formatSidebar() {
    const pageContainer = this.pageContainer;
    this.isSidebarEnabled = false;

    const sidebar = document.getElementById("sidebar");
    if (!sidebar) return;
    this.sidebar = sidebar;

    const outline = this.sidebar.querySelector("#outline");
    if (!outline || outline.children.length === 0) return;

    // If sidebar outline contains elements, make it togglable.
    this.isSidebarEnabled = true;

    // Get all sidebar bookmarks.
    const bookmarks = outline.querySelectorAll("a");
    // For all bookmarks, redefine the click navigation function.
    bookmarks.forEach(bookmark => {
      const href = bookmark.getAttribute("href");
      bookmark.setAttribute("title", bookmark.textContent || "");
      const dataDestDetail = bookmark.getAttribute("data-dest-detail");
      if (!(href && dataDestDetail)) return;

      // Get data-dest-detail attribute as array.
      let dataDestDetailArray;
      try {
        dataDestDetailArray = JSON.parse(dataDestDetail);
        if (dataDestDetailArray[1] != "XYZ") {
          return;
        }
      } catch (error) {
        return;
      }

      const handler = (event: Event) => {
        event.preventDefault(); // Remove href default.

        // Get the page to scroll to in href.
        const pageId = href.slice(1); // Remove hash from href id.
        const page = document.getElementById(pageId);

        if (!page) return;

        // Scroll the container.
        pageContainer.scrollTo({
          top: page.offsetTop + page.clientHeight - dataDestDetailArray[3],
          left: dataDestDetailArray[2],
          behavior: "instant"
        })
      };

      bookmark.addEventListener("click", handler);
      this.sidebarClickListeners.push({ element: bookmark, handler });

      bookmark.removeAttribute("href");
    });
  }

  updateScrollbars() {
    if (this.verticalScrollbarWrap?.nativeElement && this.verticalScrollbarContainer &&
      this.horizontalScrollbarWrap?.nativeElement && this.verticalScrollbar && this.horizontalScrollbarContainer &&
      this.horizontalScrollbar) {

      if (this.pageContainer.clientHeight >= this.pageContainer.scrollHeight) {
        this.verticalScrollbarWrap.nativeElement.style.display = "none";
      } else {
        this.verticalScrollbarWrap.nativeElement.style.display = "block";

        // Calculate and set height.
        const calculatedVerticalScrollbarHeight = this.verticalScrollbarContainer.nativeElement.scrollHeight *
          (this.pageContainer.clientHeight / this.pageContainer.scrollHeight);
        // 50px or calculated height, whichever is larger.
        const verticalScrollbarHeight =
          Math.max(50, calculatedVerticalScrollbarHeight);
        this.verticalScrollbar.nativeElement.style.height = `${verticalScrollbarHeight}px`;

        // Calculate and set position.
        const verticalScrollbarPosition = this.pageContainer.scrollTop / this.pageContainer.scrollHeight;
        this.verticalScrollbar.nativeElement.style.top = `${verticalScrollbarPosition * 100}%`;
      }

      if (this.pageContainer.clientWidth >= this.pageContainer.scrollWidth) {
        this.horizontalScrollbarWrap.nativeElement.style.display = "none";
      } else {
        this.horizontalScrollbarWrap.nativeElement.style.display = "block";

        // Calculate and set width.
        const calculatedHorizontalScrollbarWidth = this.horizontalScrollbarContainer.nativeElement.scrollWidth *
          (this.pageContainer.clientWidth / this.pageContainer.scrollWidth);
        // 50px or calculated width, whichever is larger.
        const horizontalScrollbarWidth =
          Math.max(50, calculatedHorizontalScrollbarWidth);
        this.horizontalScrollbar.nativeElement.style.width = `${horizontalScrollbarWidth}px`;

        // Calculate and set position.
        const horizontalScrollbarPosition = this.pageContainer.scrollLeft / this.pageContainer.scrollWidth;
        this.horizontalScrollbar.nativeElement.style.left = `${horizontalScrollbarPosition * 100}%`;
      }
    }
  }

  scrollVertically(event: MouseEvent) {
    event.preventDefault();
    this.dragging = true;

    // Capture initial values.
    const initialMouseY = event.clientY;
    const initialScrollTop = this.pageContainer.scrollTop;
    const viewportHeight = this.pageContainer.clientHeight;
    const contentHeight = this.pageContainer.scrollHeight;
    const scrollableDistance = contentHeight - viewportHeight;

    const calculatedVerticalScrollbarHeight = this.verticalScrollbarContainer?.nativeElement.scrollHeight *
      (this.pageContainer.clientHeight / this.pageContainer.scrollHeight);

    // Scrollbar container - calculatedVerticalScrollbarHeight.
    const trackHeight = this.verticalScrollbarContainer?.nativeElement.clientHeight -
      calculatedVerticalScrollbarHeight;

    // Listen for scroll on document.
    this.unlistenMouseMove = this.renderer.listen("document", "mousemove", (moveEvent) => {
      if (!this.dragging) {
        return
      }

      // How far the pointer moved since drag start.
      const pointerDeltaX = moveEvent.clientY - initialMouseY;
      // Map thumb‑movement → content scroll delta.
      const contentScrollDelta = pointerDeltaX * (scrollableDistance / trackHeight);
      // Apply new scroll position.
      this.pageContainer.scrollTop = initialScrollTop + contentScrollDelta;
    });
    this.unlistenMouseUp = this.renderer.listen("document", "mouseup",   () => this.endScroll())
  }

  scrollHorizontally(event: MouseEvent) {
    event.preventDefault();
    this.dragging = true;

    // Capture initial values.
    const initialMouseX = event.clientX;
    const initialScrollLeft = this.pageContainer.scrollLeft;
    const viewportWidth = this.pageContainer.clientWidth;
    const contentWidth = this.pageContainer.scrollWidth;
    const scrollableDistance = contentWidth - viewportWidth;

    const calculatedHorizontalScrollbarWidth = this.horizontalScrollbarContainer?.nativeElement.scrollWidth *
      (this.pageContainer.clientWidth / this.pageContainer.scrollWidth);

    // Scrollbar container - calculatedHorizontalScrollbarWidth.
    const trackHeight = this.horizontalScrollbarContainer?.nativeElement.clientWidth -
      calculatedHorizontalScrollbarWidth;

    // Listen for scroll on document.
    this.unlistenMouseMove = this.renderer.listen("document", "mousemove",
      (moveEvent: MouseEvent) => {
        if (!this.dragging) {
          return
        }

        // How far the pointer moved since drag start.
        const pointerDeltaX = moveEvent.clientX - initialMouseX;
        // Map thumb‑movement → content scroll delta.
        const contentScrollDelta = pointerDeltaX * (scrollableDistance / trackHeight);
        // Apply new scroll position.
        this.pageContainer.scrollLeft = initialScrollLeft + contentScrollDelta;
      }
    );

    // Cleanup on pointer up
    this.unlistenMouseUp = this.renderer.listen("document", "mouseup", () => this.endScroll());
  }

  setTotalPageCount() {
    const pages = document.getElementsByClassName("pf");
    this.totalPageCount = pages.length;
  }

  setCurrentPageNumber() {
    this.currentPageNumber = this.getCurrentPageElement().bestPageIndex + 1;
  }

  changePage() {
    const pageIndex = this.currentPageNumber - 1;

    if (this.pages[pageIndex]) {
      this.pageContainer.scrollTo({
        top: this.pages[pageIndex].offsetTop,
        behavior: "instant"
      });
    }
    else {
      this.setCurrentPageNumber();
    }
  }

  selectAll(event: FocusEvent) {
    const input = event.target as HTMLInputElement;
    input.select();
  }

  focusOnNestedInput(event: FocusEvent) {
    const element = event.target as HTMLInputElement;
    const input = element.querySelector('input');
    input?.focus();
  }

  clearFindQuery() {
    this.currentFindQuery = "";
    this.findInNote();
  }

  toggleFindForm(condition?: boolean) {
    const close = () => {
      if (this.findForm) {
        this.findForm.nativeElement.style.display = "none";
        this.isFindFieldOpen = false;
        this.hideMarks();
      }
    }

    const open = () => {
      if (this.findForm) {
        const textSelection = window.getSelection()?.toString();
        this.currentFindQuery = textSelection || this.currentFindQuery;
        this.contextMenuService.destroyContextMenu(); // close mobileActions.

        // If user highlighted text to search, run search.
        if (textSelection) {
          this.findInNote();
        }

        this.findForm.nativeElement.style.display = "block";
        this.isFindFieldOpen = true;
        setTimeout(() => {
          this.findField?.nativeElement.focus();
          this.findField?.nativeElement.select();
        }, 0);

        this.showMarks();
      }
    }

    if (condition === false) {
      close();
    } else if (condition === true) {
      open();
    } else if (this.isFindFieldOpen) {
      close();
    } else if (!this.isFindFieldOpen) {
      open();
    }
  }

  getCurrentPageElement(): { bestPage: HTMLElement, bestPageIndex: number } {
    const containerRect = this.pageContainer.getBoundingClientRect();
    const containerCenterY = containerRect.top + containerRect.height / 2;

    let minDistance = Infinity;
    let bestPage = this.pages[0];
    let bestPageIndex = 0;

    this.pages.forEach((page, i) => {
      const rect = page.getBoundingClientRect();
      const pageCenterY = rect.top + rect.height / 2;
      const distance = Math.abs(pageCenterY - containerCenterY);

      if (distance < minDistance) {
        minDistance = distance;
        bestPage = page;
        bestPageIndex = i;
      }
    });

    return { bestPage, bestPageIndex };
  }

  toggleToolbar(condition?: boolean) {
    const close = () => {
      const toolbarWrapHeight = this.toolbarWrap?.nativeElement.clientHeight;
      this.toolbar?.nativeElement.style.setProperty("transform", `translateY(${toolbarWrapHeight}px)`);
      this.isToolbarOpen = false;
    }

    const open = () => {
      this.toolbar?.nativeElement.style.setProperty("transform", "");
      this.isToolbarOpen = true;
    }

    if (condition === false) {
      close();
    } else if (condition === true) {
      open();
    } else if (this.isToolbarOpen) {
      close();
    } else if (!this.isToolbarOpen) {
      open();
    }
  }

  fitToWidth() {
    // Get the widest page's width.
    let widestPageWidth  = 0;
    this.pages.forEach((element, i) => {
      const pageWidth = element.getBoundingClientRect().width;

      if (pageWidth > widestPageWidth) {
        widestPageWidth = pageWidth;
      }
    });

    const padding = 32; // 32px of padding around page.
    const containerWidth = this.pageContainer.getBoundingClientRect().width - padding;

    // Avoid divide‐by‐zero.
    if (widestPageWidth === 0) {
      return;
    }

    // Compute zoom for fitToWidth.
    const oldZoom = this.zoomLevel;
    const newZoom = (oldZoom * containerWidth) / widestPageWidth;

    this.zoomLevel = newZoom;
    this.applyZoom();

    this.isFitToPageEnabled = true;
  }

  fitToPage() {
    const { bestPage: currentPage } = this.getCurrentPageElement();

    const containerHeight = this.pageContainer.getBoundingClientRect().height;
    const pageHeight = currentPage.getBoundingClientRect().height;

    const padding = 32; // 32px of padding around page.
    const containerWidth = this.pageContainer.getBoundingClientRect().width - padding;
    const pageWidth = currentPage.getBoundingClientRect().width;

    // Avoid divide‐by‐zero.
    if (pageHeight === 0 || pageWidth === 0) {
      return;
    }

    // Compute zoom for fitToPage.
    const oldZoom = this.zoomLevel;
    // New zoom is whichever zooms out more, fitToHeight or fitToWidth.
    const newZoom = Math.min((oldZoom * containerHeight) / pageHeight,
      (oldZoom * containerWidth) / pageWidth);

    this.zoomLevel = newZoom;
    this.applyZoom();

    this.pageContainer.scrollTop = currentPage.offsetTop;
    this.isFitToPageEnabled = false;
  }

  @HostListener('window:keydown', ['$event'])
  onKeyPress(event: KeyboardEvent) {
    // Only act if hovering over noteViewerContainer.
    if (!this.isNoteViewerContainerHovered) {
      return;
    }

    // Only act if Ctrl (or Cmd on Mac) is held down.
    if (event.ctrlKey || event.metaKey) {
      const key = event.key;
      switch (key) {
        case ("+"):
        case ("="):
          event.preventDefault();
          this.zoomIn();
          break;
        case("-"):
        case("_"):
          event.preventDefault();
          this.zoomOut();
          break;
        case("\\"):
          event.preventDefault();
          this.isFitToPageEnabled ? this.fitToPage() : this.fitToWidth();
          break;
        case("f"):
        case("F"):
          event.preventDefault();
          this.toggleFindForm(true);
      }
    }
  }

  // Listen for clicks.
  @HostListener('document:click', ['$event'])
  closeElementsOnClicks(event: Event): void {
    const target: HTMLElement = event.target as HTMLElement;

    // Close sidebar if clicked outside sidebar and inside pageContainer.
    const clickedOutsideSidebar: boolean = !this.sidebar?.contains(target);
    if (this.isSidebarOpen && clickedOutsideSidebar && this.pageContainer.contains(target)) {
      this.toggleSidebar(false); // Close the menu if clicked outside.
    }
  }

  @HostListener('window:resize', ['$event'])
  onResize(event: Event): void {
    this.setFullViewerHeight();

    // Open sidebar if above desktop screen size, else close.
    if (this.isSidebarEnabled && this.noteViewerContainer?.nativeElement.clientWidth > 991) {
      this.toggleSidebar(true);
    } else if (this.isSidebarEnabled) {
      this.toggleSidebar(false);
    }

    // Update scrollbars.
    this.updateScrollbars();
  }

  onWheelScrollNoteViewerContainer(event: WheelEvent) {
    // Only act if Ctrl (or Cmd on Mac) is held down.
    if (event.ctrlKey || event.metaKey) {
      if (event.deltaY < 0) {
        event.preventDefault();
        this.zoomIn();
      } else if (event.deltaY > 0) {
        event.preventDefault();
        this.zoomOut();
      }
    }
  }

  toggleSidebar(condition?: boolean) {
    const close = () => {
      this.sidebar.style.setProperty("transform", "translateX(calc(-100% - 10px))");
      this.isSidebarOpen = false;
    }

    const open = () => {
      this.sidebar.style.setProperty("transform", "translateX(0)");
      this.isSidebarOpen = true;
    }

    if (condition === false) {
      close();
    } else if (condition === true) {
      open();
    } else if (this.isSidebarOpen) {
      close();
    } else if (!this.isSidebarOpen) {
      open();
    }
  }

  findInNote() {
    const query = this.currentFindQuery.trim();
    this.isFindLoading = true;

    // Clear old highlights.
    this.markInstance.unmark({
      done: () => {
        this.clearFinds();
        if (!query) {
          this.isFindLoading = false;
          setTimeout(() => {
            this.findField?.nativeElement.focus();
          }, 0);
          return;
        }

        let i = 0;
        const processNextPage = () => {
          if (i >= this.pages.length) {
            // If all pages are done.
            this.isFindLoading = false;
            this.lastQueriedFindQuery = this.currentFindQuery;
            if (this.findMatches.length) {
              this.currentFindIndex = this.scrollToMatch(0);
            }
            setTimeout(() => {
              this.findField?.nativeElement.focus();
            }, 0);
            return;
          }

          // Highlight on just this one page.
          const page = this.pages[i];
          const pageMarker = new Mark(page);
          pageMarker.mark(query, {
            separateWordSearch: false,
            acrossElements: true,
            each: (node) => this.findMatches.push(node as HTMLElement),
            filter: (node, term) =>
              (node.textContent || "").toLowerCase().includes(term.toLowerCase())
          });

          i++;
          // Wait 5ms before doing the next page.
          setTimeout(processNextPage, 5);
        };
        processNextPage();
      },
    });
  }

  clearFinds() {
    this.hideMarks();
    this.findMatches = [];
    this.currentFindIndex = null;
  }

  hideMarks() {
    this.findMatches.forEach(match => {
      match.style.background = "inherit";
      match.style.color = "inherit";
    })
  }

  showMarks() {
    this.findMatches.forEach(match => {
      match.style.background = "";
      match.style.color = "";
    })
  }

  onPrevFindResult(): void {
    if (!this.findMatches.length) {
      return;
    }
    this.currentFindIndex = this.scrollToMatch((this.currentFindIndex || 0) - 1);
  }

  onNextFindResult(): void {
    if (!this.findMatches.length) {
      return;
    }
    this.currentFindIndex = this.scrollToMatch((this.currentFindIndex || 0) + 1);
  }

  /**
   * Scroll to matches[index % matches.length], wrap around, highlight the “active” one,
   * and return the new wrapped‐around index.
   */
  scrollToMatch(requestedIndex: number): number {
    const length = this.findMatches.length;
    if (!length) {
      return 0;
    }

    // Wrap around.
    let i = ((requestedIndex % length) + length) % length;
    const matchElement = this.findMatches[i];

    const matchElementPageContent = matchElement.closest(".pc") as HTMLElement;

    // Add page content to strictlyVisiblePageContents to enable scroll.
    this.setPageContentAsStrictlyVisible(matchElementPageContent);

    matchElement.scrollIntoView({ behavior: "instant", block: "center" });

    //Give the “current” mark a different background, and reset others.
    this.findMatches.forEach((mark, idx) => {
      if (idx === i) {
        this.renderer.addClass(mark, "selected");
      } else {
        this.renderer.removeClass(mark, "selected");
      }
    });

    // Remove page content from strictlyVisiblePageContent.
    this.unsetPageContentAsStrictlyVisible(matchElementPageContent);

    return i;
  }

  addHighlightsToScrollbar(matches: HTMLElement[]) {
    // Loop through the nestedChild until its offsetTop from parent is found.
    function getOffsetTopInScrollableParent(nestedChild: HTMLElement, parent: HTMLElement) {
      let top = 0;
      let currentElement: HTMLElement | null = nestedChild;
      while (currentElement && currentElement !== parent) {
        top += currentElement.offsetTop;
        currentElement  = currentElement.offsetParent as HTMLElement;
      }
      if (currentElement !== parent) {
        throw new Error("Not a descendant of the given parent");
      }
      return top;
    }

    matches.forEach(match => {
      const matchElementPageContent = match.closest(".pc") as HTMLElement;
      // Add page content to strictlyVisiblePageContents to enable scroll.
      this.setPageContentAsStrictlyVisible(matchElementPageContent);

      const matchPositionOnPage = getOffsetTopInScrollableParent(match, this.pageContainer);
      const highlightTopPosition = (matchPositionOnPage / this.pageContainer.scrollHeight) * 100;

      // Remove page content from strictlyVisiblePageContent.
      this.unsetPageContentAsStrictlyVisible(matchElementPageContent);

      this.verticalScrollbarContainer?.nativeElement.insertAdjacentHTML("afterbegin",
        `
          <div style="top: ${highlightTopPosition}%" class="highlight"></div>
        `
      );
    });
  }

  toggleContextMenu(event: MouseEvent) {
    const parentButton = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;

    // Determine if menu corresponding to parentButton is already open. If so do not create new context menu.
    const currentMenuId = this.contextMenuService.currentlyOpenContextMenu?.id ?? null;
    const parentButtonMenuId = parentButton?.id?.split(':')[1] ?? null;
    const isMenuAlreadyOpened = currentMenuId !== null && parentButtonMenuId !== null &&
      currentMenuId === parentButtonMenuId;

    if (parentButton && !isMenuAlreadyOpened && this.note) {
      const content = [
        ...(this.noteViewerData.isMiniViewer ? [{
          html: `
            <button class="button no-border fill-width transparent">
                <div class="button-text-wrap justify-left"><i class="fi fi-rr-document icon mini-icon"></i>View in full</div>
            </button>
            `,
          function: (() => this.router.navigate(["notes", this.noteId, "view"]))
        }] : []),
        ...(this.isSample && this.isItemInCart(this.note._index, this.note._id) ? [{
          html: `
            <button class="button no-border fill-width transparent">
                <div class="button-text-wrap justify-left">
                    <i class="fi fi-rr-bag-shopping-minus icon mini-icon"></i>Remove
                </div>
            </button>
            `,
          function: (() => this.removeCartItem(this.note!!._index, this.note!!._id))
        }] : []),
        ...(this.isSample && !this.isItemInCart(this.note._index, this.note._id) ? [{
          html: `
            <button class="button no-border fill-width transparent">
                <div class="button-text-wrap justify-left">
                    <i class="fi fi-rr-shopping-bag-add icon mini-icon"></i>Add to Bag
                </div>
            </button>
            `,
          function: (() => this.addCartItem(this.note!!._index, this.note!!._id))
        }] : []),
        ...(!this.isSample && (this.note?.isDownloadAvailable || this.nativeUser?.uid === this.note?.sellerUid) ? [{
          html: `
            <button class="button no-border fill-width transparent">
                <div class="button-text-wrap justify-left">
                    <i class="fi fi-rr-arrow-alt-circle-down icon mini-icon"></i>Download
                </div>
            </button>
            `,
          function: (() => this.confirmDownload())
        }] : []),
      ]
      this.contextMenuService.createContextMenu(parentButton, content);
    }
  }

  endScroll() {
    this.dragging = false;
    if (this.unlistenMouseMove) {
      this.unlistenMouseMove()
    }
    if (this.unlistenMouseUp) {
      this.unlistenMouseUp()
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();

    if (this.unlistenScroll) {
      this.unlistenScroll();
    }

    // Re-enable footer.
    const footer = document.querySelector("app-footer") as HTMLElement;
    footer.style.display = "unset";

    // Remove all sidebar event listeners.
    for (const { element, handler } of this.sidebarClickListeners) {
      element.removeEventListener("click", handler);
    }
  }
}
