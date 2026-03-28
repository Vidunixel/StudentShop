import {Component, HostListener} from '@angular/core';
import {Subject} from "rxjs";
import {Note} from "../../models/Note";
import {AuthenticationService} from "../../authentication.service";
import {DatabaseService} from "../../database.service";
import {DialogsService} from "../../dialog-components/dialogs.service";
import {takeUntil} from "rxjs/operators";
import {User as NativeUser} from "../../models/User";
import streamSaver from "streamsaver";
import {GetImageUrlPipe} from "../../pipes/get-image-url.pipe";
import {NgIf} from "@angular/common";
import {Router, RouterLink} from "@angular/router";
import {PageNotFoundComponent} from "../../page-not-found/page-not-found.component";
import {FormsModule} from "@angular/forms";
import {ContextMenuService} from "../../context-menu.service";
import {SeoService} from "../../seo.service";

@Component({
  selector: 'app-collection',
  standalone: true,
  imports: [
    GetImageUrlPipe,
    NgIf,
    RouterLink,
    PageNotFoundComponent,
    FormsModule
  ],
  templateUrl: './collection.component.html',
  styleUrls: ['../explore-components.css', './collection.component.css']
})
export class CollectionComponent {
  private destroy$ = new Subject<void>();
  collection: Note[] = [];
  sortBy: string = "date-created-desc";

  pitId: string | undefined;

  isLoadMoreEnabled: boolean = false;
  isLoading: boolean = false;
  errorMessage: string = "";
  isError: boolean = false;
  isDownloadLoading: boolean = false;

  nativeUser: NativeUser | null | undefined = undefined;

  constructor(protected authenticationService: AuthenticationService, private db: DatabaseService,
              private dialogsService: DialogsService, private contextMenuService: ContextMenuService,
              private router: Router, private seo: SeoService) {}

  async ngOnInit() {
    this.authenticationService.getNativeUser().pipe(takeUntil(this.destroy$)).subscribe(async (nativeUser: NativeUser | null | undefined) => {
      this.nativeUser = nativeUser;
      await this.serveCollection();
    });
    this.setTitleAndMetaTags();
  }

  setTitleAndMetaTags() {
    const titleContent = "Collection";
    const descriptionContent = "Access your Collection to view and download purchased notes anytime.";

    // Set document title and description.
    this.seo.htmlTitle.setTitle(titleContent);
    this.seo.htmlMeta.updateTag({ name: "description", content: descriptionContent });

    // Open Graph
    this.seo.htmlMeta.updateTag({ property: "og:title", content: titleContent });
    this.seo.htmlMeta.updateTag({ property: "og:description", content: descriptionContent });

    // Twitter
    this.seo.htmlMeta.updateTag({ name: "twitter:title", content: titleContent });
    this.seo.htmlMeta.updateTag({ name: "twitter:description", content: `${descriptionContent}` });
  }

  toggleLogin() {
    this.dialogsService.toggleLogin();
  }

  toggleSignup() {
    this.dialogsService.toggleSignup();
  }

  // Serve collection.
  async serveCollection(nextPage: any[] | undefined = undefined) {
    this.isLoading = true;

    try {
      // Provide pitId only if provided alongside nextPage.
      const response = await this.db.getPurchasedNotes(this.sortBy, nextPage, nextPage != null ? this.pitId : undefined,
        await this.authenticationService.getUserIdToken());

      this.isLoading = false;
      this.errorMessage = "";
      this.pitId = response.pitId;

      // Append response if its nextPage, else assign new response.
      if (nextPage) {
        response.notes.forEach((note: any) => {
          this.collection.push(note);
        });
      } else {
        this.collection = response.notes;
      }

      this.isLoadMoreEnabled = response.isLoadMoreEnabled;

    } catch (error: any) {
      console.log(error);
      this.isLoading = false;
      this.errorMessage = "An error occurred. We could not fetch your collection.";
    }
  }

  async confirmDownload(note: Note) {
    if (note) {
      if (note.isRefundAvailable && note.sellerUid !== this.nativeUser?.uid) {
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
                await this.downloadNote(note);
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
        await this.downloadNote(note);
      }
    }
  }

  async downloadNote(note: Note) {
    this.isDownloadLoading = true;
    try {
      const response = await this.db.downloadNote(note._id, await this.authenticationService.getUserIdToken());

      // Give the user the native save dialog + progress UI.
      const fileSize = response.headers.get("Content-Length");
      const fileStream = streamSaver.createWriteStream(note.title + ".pdf", {
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

  toggleContextMenu(event: MouseEvent, note: Note) {
    const parentButton = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;

    // Determine if menu corresponding to parentButton is already open. If so do not create new context menu.
    const currentMenuId = this.contextMenuService.currentlyOpenContextMenu?.id ?? null;
    const parentButtonMenuId = parentButton?.id?.split(':')[1] ?? null;
    const isMenuAlreadyOpened = currentMenuId !== null && parentButtonMenuId !== null &&
      currentMenuId === parentButtonMenuId;

    if (parentButton && !isMenuAlreadyOpened) {
      const content = [
        {
          html: `
            <button class="button no-border fill-width transparent">
                <div class="button-text-wrap justify-left">
                    <i class="fi fi-rr-rectangle-list icon mini-icon"></i>View Listing
                </div>
            </button>
          `,
          function: (() => this.router.navigate(["notes", note._id]))
        },
        ...(note?.isDownloadAvailable ? [{
          html: `
            <button class="button no-border fill-width transparent">
                <div class="button-text-wrap justify-left">
                    <i class="fi fi-rr-arrow-alt-circle-down icon mini-icon"></i>Download
                </div>
            </button>
            `,
          function: (() => this.confirmDownload(note))
        }] : [])
      ]
      this.contextMenuService.createContextMenu(parentButton, content);
    }
  }

  ngOnDestroy(): void {
    this.seo.resetTitleAndMetaTags();
    this.destroy$.next();
    this.destroy$.complete();
  }
}
