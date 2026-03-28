import {ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild} from '@angular/core';
import {DialogsService} from "../../dialog-components/dialogs.service";
import {AuthenticationService} from "../../authentication.service";
import {FormsModule, NgForm} from "@angular/forms";
import {User as NativeUser} from "../../models/User";
import {User} from '@angular/fire/auth';
import {GetImageUrlPipe} from "../../pipes/get-image-url.pipe";
import {NgClass, NgIf} from "@angular/common";
import {DatabaseService} from "../../database.service";
import {Router, RouterLink} from "@angular/router";
import {takeUntil} from "rxjs/operators";
import {Subject} from "rxjs";
import {SanitiseUrlPipe} from "../../pipes/sanitise-url.pipe";
import {School} from "../../models/School";
import {Subject as SubjectClass} from "../../models/Subject";

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    FormsModule,
    GetImageUrlPipe,
    NgIf,
    NgClass,
    RouterLink,
    SanitiseUrlPipe
  ],
  templateUrl: './profile.component.html',
  styleUrls: ['../account.component.css', './profile.component.css']
})
export class ProfileComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  nativeUser: NativeUser | null | undefined = undefined;
  user: User | null = null;
  isSocialLinked: boolean = false;
  isEmailVerified: boolean = false;

  profilePicSrc: string | null = null;
  profilePicFile: File | null = null;
  name: string = "";
  username: string = "";
  bio: string = "";

  querySchools: School[] = [];
  schoolSearchQuery: string = "";
  isSchoolsAutocompleteVisible: boolean = false;

  allSubjects: SubjectClass[] = [];
  subjectSearchQuery: string = "";
  isSubjectsAutocompleteVisible: boolean = false;

  selectedSchool: School | undefined;
  selectedSubjects: SubjectClass[] = [];

  isNotStudent: boolean = false;

  usernameRegex: RegExp = /^[a-z0-9._-]{3,36}$/;
  nonEmptyRegex: RegExp = /^(?!\s*$).+/;
  errorMessage: string = "";

  isLoading: boolean = false;
  successMessage: string = "";
  currentSuccessTimeout: ReturnType<typeof setTimeout> | undefined;

  @ViewChild("subjectInput") subjectInput: ElementRef | undefined;
  @ViewChild("subjectCombobox") subjectCombobox: ElementRef | undefined;
  @ViewChild("subjectAutocompleteDropdown") subjectAutocompleteDropdown: ElementRef | undefined;

  @ViewChild("schoolInput") schoolInput: ElementRef | undefined;
  @ViewChild("schoolCombobox") schoolCombobox: ElementRef | undefined;
  @ViewChild("schoolAutocompleteDropdown") schoolAutocompleteDropdown: ElementRef | undefined;

  @ViewChild('profilePic') profilePicFileInput: ElementRef | undefined;

  constructor(protected authenticationService: AuthenticationService, private dialogsService: DialogsService,
              private db: DatabaseService, private router: Router, private cdr: ChangeDetectorRef) { }

  ngOnInit(): void {
    this.authenticationService.getNativeUser().pipe(takeUntil(this.destroy$)).subscribe((nativeUser: NativeUser | null | undefined) => {
      this.nativeUser = nativeUser;
      this.name = nativeUser?.name || "";
      this.username = nativeUser?.username || "";
      this.bio = nativeUser?.bio || "";
      this.selectedSchool = nativeUser?.studentDetails?.school?.school || undefined;
      this.selectedSubjects = nativeUser?.studentDetails?.subjects?.subjects || [];
      this.isNotStudent = !nativeUser?.studentDetails?.isActive;

      this.serveSchools();
      this.serveSubjects();
    });
    this.authenticationService.getUser().pipe(takeUntil(this.destroy$)).subscribe((user: User | null) => {
      this.user = user;
      this.isEmailVerified = user?.emailVerified || false;

      // If user has already registered with password, set isSocialLinked to true, else false.
      this.isSocialLinked = !!this.user?.providerData.some((providerInfo) =>
        providerInfo.providerId === "password");
    });
  }

  closeAllDialogs() {
    this.dialogsService.closeAllDialogs();
  }

  toggleLogin() {
    this.dialogsService.toggleLogin();
  }

  toggleSignup() {
    this.dialogsService.toggleSignup();
  }

  // Set profilePicFile with the selected file from input.
  onProfilePicFileSelected(): void {
    const input = this.profilePicFileInput?.nativeElement;
    if (input.files && input.files.length > 0) {
      this.profilePicFile = input.files[0];

      // Set profilePicSrc.
      if (this.profilePicFile) {
        const reader = new FileReader();
        reader.onload = () => {
          this.profilePicSrc = reader.result as string;
        };
        reader.readAsDataURL(this.profilePicFile);
      }
    }
  }

  removeProfilePicFile() {
    const input = this.profilePicFileInput?.nativeElement;
    input.value = ""; // Reset the value of the file input.
    this.profilePicFile = null;
    this.profilePicSrc = null;
  }


  // Send verification email.
  async sendEmailVerification() {
    if (this.user?.email) {
      await this.authenticationService.sendEmailVerification();
      this.dialogsService.toggleConfirmationDialog({
        message: "Verify email", imageUrl: "/images/verify-email.svg",
        description: `Hi ${this.name}!\nPlease verify your email address by clicking on the link
             we've sent to <strong>${this.maskEmail(this.user.email)}</strong>.`, yesOption: "Okay"});

      this.dialogsService.getConfirmationDialogResult().subscribe({
        next: async () => {
          await this.authenticationService.refreshUserIdToken();
          this.closeAllDialogs();
        }
      })
    }
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

  async updateUser(form: NgForm) {
    this.errorMessage = "";
    await this.validateUsername(form);
    if (form.valid && !this.isLoading) {
      this.isLoading = true;

      const studentDetails = {
        isActive: !this.isNotStudent,
        school: {
          visibility: this.nativeUser?.studentDetails?.school?.visibility || "public",
          schoolId: this.selectedSchool?._id || null,
        },
        subjects: {
          visibility: this.nativeUser?.studentDetails?.subjects?.visibility || "public",
          subjectIds: this.selectedSubjects
            .filter(subject => subject._id)
            .map(subject => subject._id)
        }
      }

      // Update user natively.
      await this.db.updateUser(await this.authenticationService.getUserIdToken(), {
        ...(this.name !== this.nativeUser?.name ? { name: this.name } : {}),
        ...(this.username !== this.nativeUser?.username ? { username: this.username } : {}),
        ...(this.bio !== this.nativeUser?.bio ? { bio: this.bio } : {}),
        studentDetails
      }).then(() => this.displaySuccessMessage("User profile updated successfully."))
        .catch(() => this.errorMessage = "*An error occurred updating account details.");

      // Send profilePic as FormData.
      if (this.profilePicFile) {
        const formData = new FormData();
        formData.append("profilePic", this.profilePicFile);
        await this.db.updateProfilePic(await this.authenticationService.getUserIdToken(), formData)
          .then(() => this.removeProfilePicFile())
          .catch(() => this.errorMessage = "*An error occurred updating profile picture. Ensure file " +
            "is under 10MB and in a supported format: (jpeg, jpg, png, gif).");
      }

      await this.authenticationService.setCurrentNativeUser(); // Refresh details.
      this.isLoading = false;
    }
  }

  maskEmail(email: string) {
    return email.replace(/^(.{2})(.*)(@.*)$/, (_, firstTwo, middle, domain) => {
      return firstTwo + '*'.repeat(middle.length) + domain;
    });
  }

  // Add school as the selected one.
  addSelectedSchool(school: School): void {
    this.selectedSchool = school;
    this.schoolSearchQuery = "";
    this.isSchoolsAutocompleteVisible = false;
  }

  // Add subject to selected list.
  async addSelectedSubject(subject: SubjectClass, maxLength = 6): Promise<void> {
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
  removeSelectedSubject(subject: SubjectClass): void {
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
    return this.allSubjects.filter((subject: SubjectClass) =>
      !this.selectedSubjects.some(selected => selected._id === subject._id)
    );
  }

  async serveSubjects(): Promise<void> {
    const response = await this.db.getSubjects(this.subjectSearchQuery);

    this.allSubjects = response.subjects;
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

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected readonly JSON = JSON;
}
