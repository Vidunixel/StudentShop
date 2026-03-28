import {ChangeDetectorRef, Component, ElementRef, HostListener, ViewChild} from '@angular/core';
import {DatabaseService} from "../../../database.service";
import {AuthenticationService} from "../../../authentication.service";
import {takeUntil} from "rxjs/operators";
import {User as NativeUser} from "../../../models/User";
import {Subject as RxjsSubject} from "rxjs/internal/Subject";
import {Note} from "../../../models/Note";
import {FormatPricePipe} from "../../../pipes/format-price.pipe";
import {NgIf} from "@angular/common";
import {Transaction} from "../../../models/Transaction";
import {RouterLink} from "@angular/router";
import {GetStatusPipe} from "../../../pipes/get-status.pipe";
import {ContextMenuService} from "../../../context-menu.service";
import {FormsModule, NgForm, ReactiveFormsModule} from "@angular/forms";
import {Subject as SubjectClass, Subject} from "../../../models/Subject";
import {DialogsService} from "../../../dialog-components/dialogs.service";
import {GetImageUrlPipe} from "../../../pipes/get-image-url.pipe";
import {GetRatingPipe} from "../../../pipes/get-rating.pipe";

@Component({
  selector: 'app-notes',
  standalone: true,
  imports: [
    NgIf,
    RouterLink,
    FormatPricePipe,
    GetStatusPipe,
    ReactiveFormsModule,
    FormsModule,
    GetImageUrlPipe,
    GetRatingPipe
  ],
  templateUrl: './notes.component.html',
  styleUrls: ['../../admin.component.css', '../explore-components.css', './notes.component.css']
})
export class NotesComponent {
  private destroy$ = new RxjsSubject<void>();
  nativeUser: NativeUser | null | undefined = undefined;

  notes: Note[] = [];

  selectedSubjects: Subject[] = [];

  searchQuery: string = "";
  filters: { subjectIds: string[], status: string, minPrice: number, maxPrice: number, sellerUid: string,
    _id: string } = { subjectIds: [], status: "", minPrice: 0, maxPrice: 200, sellerUid: "", _id: "" };
  sortBy: string = "relevance";
  pitId: string | undefined;

  querySubjects: Subject[] = [];
  subjectSearchQuery: string | undefined;
  isSubjectsAutocompleteVisible: boolean = false;

  isLoadMoreEnabled: boolean = false;
  isLoading: boolean = false;
  errorMessage: string = "";

  @ViewChild("subjectInput") subjectInput: ElementRef | undefined;
  @ViewChild("subjectCombobox") subjectCombobox: ElementRef | undefined;
  @ViewChild("subjectAutocompleteDropdown") subjectAutocompleteDropdown: ElementRef | undefined;

  constructor(protected authenticationService: AuthenticationService, private db: DatabaseService,
              private contextMenuService: ContextMenuService, private cdr: ChangeDetectorRef,
              private dialogsService: DialogsService) { }

  async ngOnInit() {
    this.authenticationService.getNativeUser().pipe(takeUntil(this.destroy$)).subscribe(async (nativeUser: NativeUser | null | undefined) => {
      this.nativeUser = nativeUser;

      if (this.nativeUser && [NativeUser.AccountType.ADMIN, NativeUser.AccountType.STAFF].includes(nativeUser?.accountType || '')) {
        await this.serveSubjects();
        await this.serveNotes();
      }
    });
  }

  validatePriceRange(){
    // Round to two decimal places.
    this.filters.minPrice = Math.round(Number(this.filters.minPrice) * 100) / 100;
    this.filters.maxPrice = Math.round(Number(this.filters.maxPrice) * 100) / 100;

    if (this.filters.minPrice < 0) {
      this.filters.minPrice = 0;
    } else if (this.filters.minPrice > 200) {
      this.filters.minPrice = 200;
    }

    if (this.filters.maxPrice < 0) {
      this.filters.maxPrice = 0;
    } else if (this.filters.maxPrice > 200) {
      this.filters.maxPrice = 200;
    }

    if (this.filters.minPrice > this.filters.maxPrice) {
      this.filters.minPrice = this.filters.maxPrice;
    }
  }

  toggleLogin() {
    this.dialogsService.toggleLogin();
  }

  // Serve notes.
  async serveNotes(nextPage: any[] | undefined = undefined) {
    this.errorMessage = "";
    this.isLoading = true;
    try {
      // Validate price filters.
      this.validatePriceRange();

      // Set filters.subjectIds to an array of subjectIds.
      this.filters.subjectIds = this.selectedSubjects.filter(subject => subject._id)
        .map(subject => subject._id || '');

      // Provide pitId only if provided alongside nextPage.
      const response = await this.db.getNotesAdmin(this.searchQuery, this.filters, this.sortBy,
        nextPage, nextPage != null ? this.pitId : undefined, await this.authenticationService.getUserIdToken());

      this.pitId = response.pitId;

      // Append response if its nextPage, else assign new response.
      if (nextPage) {
        response.notes.forEach((note: any) => {
          this.notes.push(note);
        });
      } else {
        this.notes = response.notes;
      }

      this.isLoadMoreEnabled = response.isLoadMoreEnabled;

    } catch (error: any) {
      this.errorMessage = `An error occurred. Reason: ${error?.code || error?.error?.code || error?.message || "UNKNOWN"}.`;
      console.log(error);
    }
    this.isLoading = false;
  }

  clearForm(form: NgForm) {
    form.resetForm({
      noteSearchQuery: "",
      noteId: "",
      sellerUid: "",
      minPrice: 0,
      maxPrice: 1000,
      subject: "",
      status: "",
      sortBy: "relevance"
    });
    this.selectedSubjects = [];
    this.serveNotes().then();
  }

  // Add subject to selected list.
  async addSelectedSubject(subject: Subject, maxLength = 10000): Promise<void> {
    // Maximum of 1 selected subjects.
    if (this.selectedSubjects.length < maxLength) {
      this.selectedSubjects.push(subject);
      this.subjectSearchQuery = "";

      // If the maxLength is reached hide autocompleteDropdown, else focus on combobox input.
      if (this.selectedSubjects.length === maxLength) {
        this.isSubjectsAutocompleteVisible = false;
      } else {
        this.subjectInput?.nativeElement.focus();
      }

      await this.serveSubjects();
    }
  }

  // Remove subject from selected list.
  removeSelectedSubject(subject: Subject): void {
    this.selectedSubjects.splice(this.selectedSubjects.findIndex(selectedSubject =>
        selectedSubject._id === subject._id), 1);

    this.cdr.detectChanges();
    this.subjectInput?.nativeElement.focus();
  }

  getSubjectsAutocompleteList() {
    // Filter out already selected subjects.
    return this.querySubjects.filter((subject: SubjectClass) =>
      !this.selectedSubjects.some(selected => selected._id === subject._id)
    );
  }

  async serveSubjects(): Promise<void> {
    const response = await this.db.getSubjects(this.subjectSearchQuery);

    this.querySubjects = response.subjects;
  }

  @HostListener('document:focusin', ['$event'])
  closeElementsOnFocusIn(event: Event): void {
    const target: HTMLElement = event.target as HTMLElement;

    const focusedOutsideSubjectCombobox: boolean = !this.subjectCombobox?.nativeElement.contains(target);
    const focusedOutsideSubjectAutocompleteDropdown: boolean = !this.subjectAutocompleteDropdown?.nativeElement.contains(target);

    // console.log("focusin:", focusedOutsideSubjectCombobox, focusedOutsideSubjectAutocompleteDropdown)

    if (this.isSubjectsAutocompleteVisible && focusedOutsideSubjectCombobox && focusedOutsideSubjectAutocompleteDropdown) {
      // Close subject autocomplete dropdown if focused outside combobox and outside dropdown.
      this.isSubjectsAutocompleteVisible = false;
    }
  }

  @HostListener('document:click', ['$event'])
  closeElementsOnClicks(event: Event): void {
    const target: HTMLElement = event.target as HTMLElement;

    const focusedOutsideSubjectCombobox: boolean = !this.subjectCombobox?.nativeElement.contains(document.activeElement);
    const clickedOutsideSubjectAutocompleteDropdown: boolean = !this.subjectAutocompleteDropdown?.nativeElement.contains(target);

    if (this.isSubjectsAutocompleteVisible && focusedOutsideSubjectCombobox && clickedOutsideSubjectAutocompleteDropdown) {
      // Close subject autocomplete dropdown if focused outside combobox and clicked outside dropdown.
      this.isSubjectsAutocompleteVisible = false;
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
                    <i class="fi fi-rr-copy-alt icon mini-icon"></i>Note ID
                </div>
            </button>
          `,
          function: (() => {
            if (note._id) {
              navigator.clipboard.writeText(note._id)
                .then(() => alert(`Copied Note ID: ${ note._id }`));
            }
          })
        },
        {
          html: `
            <button class="button no-border fill-width transparent">
                <div class="button-text-wrap justify-left">
                    <i class="fi fi-rr-copy-alt icon mini-icon"></i>Seller UID
                </div>
            </button>
          `,
          function: (() => {
            if (note._id) {
              navigator.clipboard.writeText(note.sellerUid || "")
                .then(() => alert(`Copied Seller UID: ${ note.sellerUid }`));
            }
          })
        }
      ]
      this.contextMenuService.createContextMenu(parentButton, content);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected readonly Object = Object;
  protected readonly Transaction = Transaction;
  protected readonly FormatPricePipe = FormatPricePipe;
  protected readonly Note = Note;
  protected readonly NativeUser = NativeUser;
}
