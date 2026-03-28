import {ChangeDetectorRef, Component, ElementRef, HostListener, Input, OnInit, ViewChild} from '@angular/core';
import {FormsModule, NgForm, ReactiveFormsModule} from "@angular/forms";
import {NgClass, NgIf} from "@angular/common";
import {Note} from "../../models/Note";
import {DialogsService} from "../dialogs.service";
import {DatabaseService} from "../../database.service";
import {Subject as SubjectClass, Subject} from "../../models/Subject";
import {AuthenticationService} from "../../authentication.service";
import {FormatDatePipe} from "../../pipes/format-date.pipe";
import {GetImageUrlPipe} from "../../pipes/get-image-url.pipe";
import {GetStatusPipe} from "../../pipes/get-status.pipe";
import {Router} from "@angular/router";
import streamSaver from "streamsaver";
import {ContextMenuService} from "../../context-menu.service";
import {SocketService} from "../../socket.service";
import {skip, takeUntil} from "rxjs/operators";
import {Subject as RxjsSubject} from "rxjs/internal/Subject";

@Component({
  selector: 'app-edit-listing',
  standalone: true,
  imports: [
    FormsModule,
    NgIf,
    ReactiveFormsModule,
    NgClass,
    FormatDatePipe,
    GetImageUrlPipe,
    GetStatusPipe
  ],
  templateUrl: './edit-listing.component.html',
  styleUrls: ['../dialog-components.css', './edit-listing.component.css']
})
export class EditListingComponent implements OnInit {
  @Input() editListingData: Note | undefined;

  isUpdateLoading: boolean = false;
  isListLoading: boolean = false;
  errorMessage: string = "";

  nonEmptyRegex: RegExp = /^(?!\s*$).+/;
  priceRegex: RegExp = /^(?:0(?:\.\d{1,2})?|\.\d{1,2}|(?:[1-9]\d?|1\d{2})(?:\.\d{1,2})?|200(?:\.0{1,2})?)$/; // Accepts [0-200] with up to two decimal places.

  // Note attributes
  querySubjects: Subject[] = [];
  subjectSearchQuery: string = "";
  isSubjectsAutocompleteVisible: boolean = false;
  isDownloadLoading: boolean = false;
  isUpdateRestricted: boolean = false;

  title: string = "";
  description: string = "";
  selectedSubjects: Subject[] = [];
  pdfFile: File | null = null;
  price: number = 0;

  successMessage: string = "";
  currentSuccessTimeout: ReturnType<typeof setTimeout> | undefined;

  private destroy$ = new RxjsSubject<void>();

  @ViewChild("subjectInput") subjectInput: ElementRef | undefined;
  @ViewChild("subjectCombobox") subjectCombobox: ElementRef | undefined;
  @ViewChild("subjectAutocompleteDropdown") subjectAutocompleteDropdown: ElementRef | undefined;

  constructor(private dialogsService: DialogsService, private db: DatabaseService,
              protected authenticationService: AuthenticationService, private router: Router,
              private cdr: ChangeDetectorRef, private contextMenuService: ContextMenuService,
              private socketService: SocketService) { }

  async ngOnInit() {
    this.setNote();
    await this.serveSubjects();

    this.socketService.onNoteModified().pipe(skip(1), takeUntil(this.destroy$)).subscribe(note => {
      if (note && note?._index === this.editListingData?._index && note?._id === this.editListingData?._id) {
        this.editListingData = note;

        this.title = this.editListingData.title;
        this.description = this.editListingData.description;
        this.price = this.editListingData.price;
        this.selectedSubjects = this.editListingData.subjects || []; // Set subjects of note.

        this.isUpdateRestricted = this.getUpdatedRestrictedStatus(this.editListingData);
      }
    });
  }

  closeAllDialogs() {
    this.dialogsService.closeAllDialogs();
  }

  toggleEditListing(editListingData: Note | undefined = undefined) {
    this.dialogsService.toggleEditListing(editListingData);
  }

  navigateToItemPage(path: string) {
    this.router.navigate([path])
      .then(() => this.closeAllDialogs());
  }

  setNote() {
    if (this.editListingData) {
      this.title = this.editListingData.title;
      this.description = this.editListingData.description;
      this.price = this.editListingData.price;
      this.selectedSubjects = this.editListingData.subjects || []; // Set subjects of note.

      this.isUpdateRestricted = this.getUpdatedRestrictedStatus(this.editListingData);
    }
  }

  async updateNote(form: NgForm) {
    this.errorMessage = "";
    if (form.valid && this.editListingData && !this.isUpdateLoading) {
      // Update note.
      this.isUpdateLoading = true;
      try {
        const subjectIds: string[] = this.selectedSubjects.filter(subject => subject._id)
          .map(subject => subject._id || '');

        await this.db.updateNote(this.editListingData._id, {
          ...(this.title !== this.editListingData.title ? { title: this.title } : {}),
          ...(this.description !== this.editListingData.description ? { description: this.description } : {}),
          ...(this.price !== this.editListingData.price ? { price: this.price } : {}),
          ...(!this.editListingData.subjectIds || !this.isDuplicateArray(subjectIds, this.editListingData.subjectIds) ? { subjectIds: subjectIds } : {}),
        }, await this.authenticationService.getUserIdToken());

        this.displaySuccessMessage("Note updated successfully.");
      } catch (error: any) {
        this.errorMessage = `*An error occurred. Reason: ${error?.code || error?.error?.code || error?.message || "UNKNOWN"}.`;
      }
      this.isUpdateLoading = false;
    }
  }

  isDuplicateArray(arrayA: string[], ArrayB: string[]) {
    if (arrayA.length !== ArrayB.length) return false;
    arrayA = [...arrayA].sort();
    ArrayB = [...ArrayB].sort();
    for (let i = 0; i < arrayA.length; i++) {
      if (arrayA[i] !== ArrayB[i]) {
        return false;
      }
    }
    return true;
  }

  displaySuccessMessage(message: string) {
    this.clearCurrentSuccessTimeout();
    this.successMessage = message;

    this.currentSuccessTimeout = setTimeout(() => {
      this.successMessage = "";
    }, 5000);
  }

  clearCurrentSuccessTimeout() {
    if (this.currentSuccessTimeout) {
      clearTimeout(this.currentSuccessTimeout);
      this.successMessage = "";
      this.cdr.detectChanges();
    }
  }

  async downloadNote(id: string = "", noteTitle: string = "") {
    this.isDownloadLoading = true;
    try {
      const response = await this.db.downloadNote(id, await this.authenticationService.getUserIdToken());

      // Give the user the native save dialog + progress UI.
      const fileSize = response.headers.get("Content-Length");
      const fileStream = streamSaver.createWriteStream(noteTitle + ".pdf", {
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

  async deleteListing() {
    const message = "Delete listing";
    const description = "Are you sure you want to permanently delete this listing? This action cannot be undone.";
    const yesOption = "Delete";
    const noOption = "No";

    this.dialogsService.toggleConfirmationDialog({ message: message, description: description,
      yesOption: yesOption, noOption: noOption });

    this.dialogsService.getConfirmationDialogResult().subscribe({
      next: async (result: boolean) => {
        if (result) {
          try {
            switch (this.editListingData?._index) {
              case ("notes"):
                await this.db.deleteNote(await this.authenticationService.getUserIdToken(),
                  this.editListingData._id);
                break;
            }
            this.closeAllDialogs();
          } catch (error: any) {
            this.closeAllDialogs();
            this.dialogsService.displayErrorDialog("Listing could not be deleted.", error);
          }
        } else {
          this.toggleEditListing(this.editListingData);
        }
      }
    });
  }

  async listListing() {
    try {
      this.isListLoading = true;
      await this.db.listNote(await this.authenticationService.getUserIdToken(),
        this.editListingData?._id);

      let successMessage = "";
      if (this.editListingData?.status === Note.NoteStatus.LISTED) {
        successMessage = "Note listed for sale.";
      } else if (this.editListingData?.status === Note.NoteStatus.DELISTED) {
        successMessage = "Note delisted.";
      }

      this.displaySuccessMessage(successMessage);
    } catch (error: any) {
      this.dialogsService.displayErrorDialog("Listing could not be listed/delisted.", error);
    }
    this.isListLoading = false;
  }

  // Add subject to selected list.
  async addSelectedSubject(subject: Subject, maxLength = 1): Promise<void> {
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

  getUpdatedRestrictedStatus(note: Note | undefined): boolean {
    if ([Note.NoteStatus.PROCESSING, Note.NoteStatus.PENDING_REVIEW,
      Note.NoteStatus.PROCESSING_ERROR, Note.NoteStatus.DELETED].includes(note?.status || '')) {
      return true;
    } else if (Note.NoteStatus.REJECTED &&
      note?.rejectReason?.flaggedSections?.includes(Note.RejectReasonFlaggedSection.NOTE_CONTENT)) {
      return true;
    }
    return false;
  }

  toggleContextMenu(event: MouseEvent) {
    const parentButton = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;

    // Determine if menu corresponding to parentButton is already open. If so do not create new context menu.
    const currentMenuId = this.contextMenuService.currentlyOpenContextMenu?.id ?? null;
    const parentButtonMenuId = parentButton?.id?.split(':')[1] ?? null;
    const isMenuAlreadyOpened = currentMenuId !== null && parentButtonMenuId !== null &&
      currentMenuId === parentButtonMenuId;

    if (parentButton && !isMenuAlreadyOpened) {
      const content = [
        ...([Note.NoteStatus.LISTED, Note.NoteStatus.DELISTED].includes(this.editListingData?.status || '') ? [{
          html: `
            <button class="button no-border fill-width transparent">
                ${this.editListingData?.status === Note.NoteStatus.LISTED ?
            '<div class="button-text-wrap justify-left"><i class="fi fi-rr-minus-circle icon mini-icon"></i>Delist</div>' :
            '<div class="button-text-wrap justify-left"><i class="fi fi-rr-add icon mini-icon"></i>Relist</div>'}
            </button>
            `,
          function: (() => this.listListing())
        }] : []),
        {
          html: `
            <button class="button no-border fill-width transparent danger">
                <div class="button-text-wrap justify-left"><i class="fi fi-rr-trash icon mini-icon danger"></i>Delete</div>
            </button>
          `,
          function: (() => this.deleteListing())
        }
      ]
      this.contextMenuService.createContextMenu(parentButton, content);
    }
  }

  protected readonly Note = Note;

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
