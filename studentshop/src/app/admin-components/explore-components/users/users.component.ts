import {ChangeDetectorRef, Component, ElementRef, HostListener, ViewChild} from '@angular/core';
import {Subject as RxjsSubject} from "rxjs/internal/Subject";
import {User as NativeUser} from "../../../models/User";
import {takeUntil} from "rxjs/operators";
import {Subject as SubjectClass, Subject} from "../../../models/Subject";
import {AuthenticationService} from "../../../authentication.service";
import {DatabaseService} from "../../../database.service";
import {ContextMenuService} from "../../../context-menu.service";
import {DialogsService} from "../../../dialog-components/dialogs.service";
import {FormatPricePipe} from "../../../pipes/format-price.pipe";
import {FormsModule, NgForm, ReactiveFormsModule} from "@angular/forms";
import {GetStatusPipe} from "../../../pipes/get-status.pipe";
import {NgIf} from "@angular/common";
import {RouterLink} from "@angular/router";
import {GetImageUrlPipe} from "../../../pipes/get-image-url.pipe";
import {Note} from "../../../models/Note";
import {School} from "../../../models/School";

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [
    FormsModule,
    NgIf,
    ReactiveFormsModule,
    RouterLink,
    GetImageUrlPipe
  ],
  templateUrl: './users.component.html',
  styleUrls: ['../../admin.component.css', '../explore-components.css', './users.component.css']
})
export class UsersComponent {
  private destroy$ = new RxjsSubject<void>();
  nativeUser: NativeUser | null | undefined = undefined;

  users: NativeUser[] = [];

  selectedSubjects: Subject[] = [];
  selectedSchool: School | undefined;

  searchQuery: string = "";
  filters: { subjectIds: string[], accountType: string, schoolId: string, uid: string,
    _id: string } = { subjectIds: [], accountType: "", schoolId: "", uid: "", _id: "" };
  sortBy: string = "relevance";
  pitId: string | undefined;

  querySubjects: Subject[] = [];
  subjectSearchQuery: string | undefined;
  isSubjectsAutocompleteVisible: boolean = false;

  querySchools: School[] = [];
  schoolSearchQuery: string = "";
  isSchoolsAutocompleteVisible: boolean = false;

  isLoadMoreEnabled: boolean = false;
  isLoading: boolean = false;
  errorMessage: string = "";

  @ViewChild("subjectInput") subjectInput: ElementRef | undefined;
  @ViewChild("subjectCombobox") subjectCombobox: ElementRef | undefined;
  @ViewChild("subjectAutocompleteDropdown") subjectAutocompleteDropdown: ElementRef | undefined;

  @ViewChild("schoolInput") schoolInput: ElementRef | undefined;
  @ViewChild("schoolCombobox") schoolCombobox: ElementRef | undefined;
  @ViewChild("schoolAutocompleteDropdown") schoolAutocompleteDropdown: ElementRef | undefined;

  constructor(protected authenticationService: AuthenticationService, private db: DatabaseService,
              private contextMenuService: ContextMenuService, private cdr: ChangeDetectorRef, private dialogsService: DialogsService) { }

  async ngOnInit() {
    this.authenticationService.getNativeUser().pipe(takeUntil(this.destroy$)).subscribe(async (nativeUser: NativeUser | null | undefined) => {
      this.nativeUser = nativeUser;

      if (this.nativeUser && [NativeUser.AccountType.ADMIN, NativeUser.AccountType.STAFF].includes(nativeUser?.accountType || '')) {
        await this.serveSchools();
        await this.serveSubjects();
        await this.serveUsers();
      }
    });
  }

  toggleLogin() {
    this.dialogsService.toggleLogin();
  }

  async serveUsers(nextPage: any[] | undefined = undefined) {
    this.errorMessage = "";
    this.isLoading = true;
    try {
      // Set filters.subjectIds to an array of subjectIds.
      this.filters.subjectIds = this.selectedSubjects.filter(subject => subject._id)
        .map(subject => subject._id || '');

      // Set filters.schoolId.
      this.filters.schoolId = this.selectedSchool?._id || "";

      // Provide pitId only if provided alongside nextPage.
      const response = await this.db.getUsersAdmin(this.searchQuery, this.filters, this.sortBy,
        nextPage, nextPage != null ? this.pitId : undefined, await this.authenticationService.getUserIdToken());

      this.pitId = response.pitId;

      // Append response if its nextPage, else assign new response.
      if (nextPage) {
        response.users.forEach((user: any) => {
          this.users.push(user);
        });
      } else {
        this.users = response.users;
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
      userSearchQuery: "",
      userUid: "",
      userId: "",
      subject: "",
      schoolId: "",
      accountType: "",
      sortBy: "relevance"
    });
    this.selectedSchool = undefined;
    this.selectedSubjects = [];
    this.serveUsers().then();
  }

  addSelectedSchool(school: School): void {
    this.selectedSchool = school;
    this.schoolSearchQuery = "";
    this.isSchoolsAutocompleteVisible = false;
  }

  removeSelectedSchool(): void {
    this.selectedSchool = undefined;

    this.cdr.detectChanges();
    this.schoolInput?.nativeElement.focus();
  }

  async serveSchools(): Promise<void> {
    const response = await this.db.getSchools(this.schoolSearchQuery);
    this.querySchools = response.schools;
  }

  // Add subject to selected list.
  async addSelectedSubject(subject: Subject, maxLength = 10000): Promise<void> {
    // Maximum of 10000 selected subjects.
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

  toggleContextMenu(event: MouseEvent, user: NativeUser) {
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
                    <i class="fi fi-rr-copy-alt icon mini-icon"></i>User UID
                </div>
            </button>
          `,
          function: (() => navigator.clipboard.writeText(user.uid)
            .then(() => alert(`Copied User UID: ${ user.uid }`)))
        },
        {
          html: `
            <button class="button no-border fill-width transparent">
                <div class="button-text-wrap justify-left">
                    <i class="fi fi-rr-copy-alt icon mini-icon"></i>Username
                </div>
            </button>
          `,
          function: (() => navigator.clipboard.writeText(user.username || "")
            .then(() => alert(`Copied Username: ${ user.username }`)))
        }
      ]
      this.contextMenuService.createContextMenu(parentButton, content);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected readonly NativeUser = NativeUser;
  protected readonly Note = Note;
  protected readonly Object = Object;
}
