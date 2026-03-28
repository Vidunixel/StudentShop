import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  ViewChild
} from '@angular/core';
import {FormsModule, NgForm} from "@angular/forms";
import {NgClass, NgIf} from "@angular/common";
import {School} from "../../models/School";
import {Subject as SubjectClass, Subject} from "../../models/Subject";
import {DialogsService} from "../dialogs.service";
import {AuthenticationService} from "../../authentication.service";
import {DatabaseService} from "../../database.service";
import {User as NativeUser} from '../../models/User';
import {User} from '@angular/fire/auth';
import {Subject as RxjsSubject, Subscription} from "rxjs";
import {takeUntil} from "rxjs/operators";
import {RouterLink} from "@angular/router";

@Component({
  selector: 'app-social-signup',
  standalone: true,
  imports: [
    FormsModule,
    NgIf,
    NgClass,
    RouterLink
  ],
  templateUrl: './social-signup.component.html',
  styleUrls: ['../dialog-components.css', './social-signup.component.css']
})
export class SocialSignupComponent implements OnInit, OnDestroy {
  private destroy$ = new RxjsSubject<void>();
  currentPage: number = 1;

  querySchools: School[] = [];
  schoolSearchQuery: string = "";
  isSchoolsAutocompleteVisible: boolean = false;

  querySubjects: Subject[] = [];
  subjectSearchQuery: string = "";
  isSubjectsAutocompleteVisible: boolean = false;

  name: string = "";
  username: string = "";
  isNotStudent: boolean = false;
  selectedSchool: School | undefined;
  selectedSubjects: Subject[] = [];

  isAcceptedTerms: boolean = false;

  usernameRegex: RegExp = /^[a-z0-9._-]{3,36}$/;
  nonEmptyRegex: RegExp = /^(?!\s*$).+/;

  isLoading: boolean = false;
  errorMessage: string = "";

  nativeUser: NativeUser | null | undefined = undefined;
  user: User | null = null;

  @ViewChild("subjectInput") subjectInput: ElementRef | undefined;
  @ViewChild("subjectCombobox") subjectCombobox: ElementRef | undefined;
  @ViewChild("subjectAutocompleteDropdown") subjectAutocompleteDropdown: ElementRef | undefined;

  @ViewChild("schoolInput") schoolInput: ElementRef | undefined;
  @ViewChild("schoolCombobox") schoolCombobox: ElementRef | undefined;
  @ViewChild("schoolAutocompleteDropdown") schoolAutocompleteDropdown: ElementRef | undefined;

  constructor(private dialogsService: DialogsService,
              private authenticationService: AuthenticationService, private db: DatabaseService,
              private cdr: ChangeDetectorRef) { }

  ngOnInit(): void {
    this.authenticationService.getNativeUser().pipe(takeUntil(this.destroy$)).subscribe((nativeUser: NativeUser | null | undefined) => {
      this.nativeUser = nativeUser;
    });

    this.authenticationService.getUser().pipe(takeUntil(this.destroy$)).subscribe((user: User | null) => {
      this.user = user;
      this.name = user?.displayName || "";
    });
  }

  nextPage(form: NgForm) {
    if (form.valid) {
      this.currentPage ++;

      // Serve schools and subjects immediately after visiting student options page.
      if (this.currentPage === 2){
        this.serveSchools();
        this.serveSubjects();
      }
    }
  }

  previousPage() {
    this.currentPage --;
  }

  closeAllDialogs() {
    this.dialogsService.closeAllDialogs();
  }

  async validateUsername(form: NgForm) {
    if (this.username !== this.nativeUser?.username) {
      const response = await this.db.getUsernameStatus(this.username);

      // If username already exists set usernameTaken error.
      if (response.status === "USERNAME_ALREADY_EXISTS") {
        // Add usernameTaken error.
        form.controls['username']?.setErrors({
          ...form.controls['username']?.errors, usernameTaken: true
        });
      }
    }
  }

  async registerUser(form: NgForm) {
    this.errorMessage = "";
    await this.validateUsername(form);
    if (form.valid && !this.isLoading) {
      this.isLoading = true;
      try {
        const studentDetails = !this.isNotStudent ? {
          isActive: true,
          school: this.selectedSchool?._id ? {
            visibility: "public",
            schoolId: this.selectedSchool?._id,
          } : undefined,
          subjects: this.selectedSubjects.length > 0 ? {
            visibility: "public",
            subjectIds: this.selectedSubjects
              .filter(subject => subject._id)
              .map(subject => subject._id),
          } : undefined
        } : undefined

        // Update user natively.
        await this.db.updateUser(await this.authenticationService.getUserIdToken(), {
          ...(this.name !== this.nativeUser?.name ? { name: this.name } : {}),
          ...(this.username !== this.nativeUser?.username ? { username: this.username } : {}),
          ...(studentDetails !== this.nativeUser?.studentDetails ? { studentDetails: studentDetails } : {}),
        });
        this.closeAllDialogs(); // Close dialog.

        await this.authenticationService.setCurrentNativeUser(); // Refresh details.
      } catch (error: any) {
        this.errorMessage = "*An error occurred. Could not complete sign up."
      }
      this.isLoading = false;
    }
  }

  // Add school as the selected one.
  addSelectedSchool(school: School): void {
    this.selectedSchool = school;
    this.schoolSearchQuery = "";
    this.isSchoolsAutocompleteVisible = false;
  }

  // Add subject to selected list.
  async addSelectedSubject(subject: Subject, maxLength = 6): Promise<void> {
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

  // Remove school as the selected one.
  removeSelectedSchool(): void {
    this.selectedSchool = undefined;

    this.cdr.detectChanges();
    this.schoolInput?.nativeElement.focus();
  }

  // Remove subject from selected list.
  removeSelectedSubject(subject: Subject): void {
    this.selectedSubjects.splice(this.selectedSubjects.findIndex(selectedSubject =>
        selectedSubject._id === subject._id), 1);

    this.cdr.detectChanges();
    this.subjectInput?.nativeElement.focus();
  }

  async serveSchools(): Promise<void> {
    const response = await this.db.getSchools(this.schoolSearchQuery);
    this.querySchools = response.schools;
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

    const focusedOutsideSchoolCombobox: boolean = !this.schoolCombobox?.nativeElement.contains(target);
    const focusedOutsideSchoolAutocompleteDropdown: boolean = !this.schoolAutocompleteDropdown?.nativeElement.contains(target);

    if (this.isSchoolsAutocompleteVisible && focusedOutsideSchoolCombobox && focusedOutsideSchoolAutocompleteDropdown) {
      // Close subject autocomplete dropdown if focused outside combobox and outside dropdown.
      this.isSchoolsAutocompleteVisible = false;
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

    const focusedOutsideSchoolCombobox: boolean = !this.schoolCombobox?.nativeElement.contains(document.activeElement);
    const clickedOutsideSchoolAutocompleteDropdown: boolean = !this.schoolAutocompleteDropdown?.nativeElement.contains(target);

    if (this.isSchoolsAutocompleteVisible && focusedOutsideSchoolCombobox && clickedOutsideSchoolAutocompleteDropdown) {
      // Close subject autocomplete dropdown if clicked outside combobox and outside dropdown.
      this.isSchoolsAutocompleteVisible = false;
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected readonly JSON = JSON;
}
