import {ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild} from '@angular/core';
import {FormsModule, NgForm} from "@angular/forms";
import {NgClass, NgIf} from "@angular/common";
import {DialogsService} from "../dialogs.service";
import {Subject as SubjectClass, Subject} from "../../models/Subject";
import {DatabaseService} from "../../database.service";
import {AuthenticationService} from "../../authentication.service";
import {Router, RouterLink} from "@angular/router";
import {Note} from "../../models/Note";
import {User} from "@angular/fire/auth";
import {takeUntil} from "rxjs/operators";
import {Subject as RxjsSubject, Subscription} from "rxjs";

@Component({
  selector: 'app-sell',
  standalone: true,
  imports: [
    FormsModule,
    NgIf,
    NgClass
  ],
  templateUrl: './sell.component.html',
  styleUrls: ['../dialog-components.css', './sell.component.css']
})
export class SellComponent implements OnInit, OnDestroy {
  private destroy$ = new RxjsSubject<void>();
  isEmailVerified: boolean = false;

  currentPage: number = 1;
  isLoading: boolean = false;
  errorMessage: string = "";

  nonEmptyRegex: RegExp = /^(?!\s*$).+/;
  priceRegex: RegExp = /^(?:0(?:\.\d{1,2})?|\.\d{1,2}|(?:[1-9]\d?|1\d{2})(?:\.\d{1,2})?|200(?:\.0{1,2})?)$/; // Accepts [0-200] with up to two decimal places.

  isAcceptedTerms: boolean = false;

  // Note attributes
  querySubjects: Subject[] = [];
  subjectSearchQuery: string = "";
  isSubjectsAutocompleteVisible: boolean = false;
  @ViewChild('notePdf') pdfFileInput: ElementRef | undefined;

  title: string = "";
  description: string = "";
  selectedSubjects: Subject[] = [];
  pdfFile: File | null = null;
  price: number = 0;

  @ViewChild("subjectInput") subjectInput: ElementRef | undefined;
  @ViewChild("subjectCombobox") subjectCombobox: ElementRef | undefined;
  @ViewChild("subjectAutocompleteDropdown") subjectAutocompleteDropdown: ElementRef | undefined;

  constructor(protected authenticationService: AuthenticationService, private dialogsService: DialogsService,
              private db: DatabaseService, private router: Router, private cdr: ChangeDetectorRef) {
  }

  ngOnInit() {
    this.authenticationService.getUser().pipe(takeUntil(this.destroy$)).subscribe((user: User | null) => {
      this.isEmailVerified = user?.emailVerified || false;
    });
  }

  closeAllDialogs() {
    this.dialogsService.closeAllDialogs();
  }

  toggleLogin() {
    this.dialogsService.toggleLogin();
  }

  navigateToSecuritySettings () {
    this.router.navigate(["account", "security"])
      .then(status => this.closeAllDialogs());
  }

  toggleSignup() {
    this.dialogsService.toggleSignup();
  }

  async nextPage(form: NgForm) {
    if (form.valid) {
      this.currentPage++;

      // Serve subjects immediately after visiting second page.
      if (this.currentPage === 2) {
        await this.serveSubjects();
      }
    }
  }

  previousPage() {
    this.currentPage --;
  }

  // Set pdfFile with the selected file from input.
  onPdfFileSelected(): void {
    const input = this.pdfFileInput?.nativeElement;
    if (input.files && input.files.length > 0) {
      this.pdfFile = input.files[0];
    }
  }

  // Remove selected pdfFile
  removePdfFile() {
    const input = this.pdfFileInput?.nativeElement;
    input.value = ""; // Reset the value of the file input.
    this.pdfFile = null;
  }

  async addNote(form: NgForm) {
    this.errorMessage = "";
    if (form.valid && !this.isLoading && this.pdfFile) {
      // Add note.
      this.isLoading = true;
      try {
        const note: Note = new Note({
          title: this.title,
          description: this.description,
          subjectIds: this.selectedSubjects
            .filter(subject => subject._id)
            .map(subject => subject._id || ''),
          price: this.price
        });

        const formData = new FormData();
        formData.append("pdfFile", this.pdfFile);
        await this.db.addNote(await this.authenticationService.getUserIdToken(), formData, note);

        this.dialogsService.toggleConfirmationDialog({
          message: "Note uploaded successfully.", imageUrl: "/images/notes.svg",
          description: `Your notes are being processed. View and manage this listing in
          <strong>Account > Manage Listings</strong>.`, yesOption: "Okay"});

        this.dialogsService.getConfirmationDialogResult().subscribe({
          next: () => {
            this.closeAllDialogs();
          }
        });

      } catch (error: any) {
        switch (error?.error?.code) {
          case "UNSUPPORTED_FILE_TYPE":
            this.errorMessage = "*Unsupported file type. Please ensure your upload contains a PDF file.";
            break;
          case "FILE_NOT_UPLOADED":
            this.errorMessage = "*No file was received. Please choose a PDF and try again.";
            break;
          case "LIMIT_FILE_SIZE":
            this.errorMessage = "*File is too large. Please upload a PDF file under 10MB in size.";
            break;
          case "LIMIT_FILE_COUNT":
            this.errorMessage = "*Upload must contain only one PDF file.";
            break;
          default:
            this.errorMessage = `*An error occurred. Reason: ${error?.code || error?.error?.code || error?.message || "UNKNOWN"}.`;
        }
      }
      this.isLoading = false;
    }
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

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
