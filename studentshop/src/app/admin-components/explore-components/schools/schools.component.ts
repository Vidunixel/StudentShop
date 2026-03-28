import {Component, ElementRef, ViewChild} from '@angular/core';
import {Subject as RxjsSubject} from "rxjs/internal/Subject";
import {Review} from "../../../models/Review";
import {AuthenticationService} from "../../../authentication.service";
import {DialogsService} from "../../../dialog-components/dialogs.service";
import {ContextMenuService} from "../../../context-menu.service";
import {DatabaseService} from "../../../database.service";
import {takeUntil} from "rxjs/operators";
import {User as NativeUser} from "../../../models/User";
import {FormsModule, NgForm} from "@angular/forms";
import {NgIf} from "@angular/common";
import {School} from "../../../models/School";
import {Note} from "../../../models/Note";
import {RouterLink} from "@angular/router";

@Component({
  selector: 'app-schools',
  standalone: true,
  imports: [
    FormsModule,
    NgIf,
    RouterLink
  ],
  templateUrl: './schools.component.html',
  styleUrls: ['../../admin.component.css', '../explore-components.css', './schools.component.css']
})
export class SchoolsComponent {
  private destroy$ = new RxjsSubject<void>();
  nativeUser: NativeUser | null | undefined = undefined;

  schools: School[] = [];

  jsonFile: File | null = null;
  @ViewChild("schoolsJson") jsonFileInput: ElementRef | undefined;

  searchQuery: string = "";
  filters: { _id: string, acaraId: string, schoolType: string, sector: string, status: string,
    campusParentAcaraId: string, parentCampusOnly?: boolean } = { _id: "", acaraId: "", schoolType: "",
    sector: "", status: "", campusParentAcaraId: "" };
  sortBy: string = "relevance";
  pitId: string | undefined;

  isLoadMoreEnabled: boolean = false;
  isLoading: boolean = false;
  errorMessage: string = "";

  constructor(protected authenticationService: AuthenticationService, private dialogsService: DialogsService,
              private contextMenuService: ContextMenuService, private db: DatabaseService) { }

  async ngOnInit() {
    this.authenticationService.getNativeUser().pipe(takeUntil(this.destroy$)).subscribe(async (nativeUser: NativeUser | null | undefined) => {
      this.nativeUser = nativeUser;

      if (this.nativeUser && [NativeUser.AccountType.ADMIN, NativeUser.AccountType.STAFF].includes(nativeUser?.accountType || '')) {
        await this.serveSchools();
      }
    });
  }

  toggleLogin() {
    this.dialogsService.toggleLogin();
  }

  closeAllDialogs() {
    this.dialogsService.closeAllDialogs();
  }

  // Set jsonFile with the selected file from input.
  onJsonFileSelected(): void {
    const input = this.jsonFileInput?.nativeElement;
    if (input.files && input.files.length > 0) {
      this.jsonFile = input.files[0];
    }
  }

  // Remove selected jsonFile
  removeJsonFile() {
    const input = this.jsonFileInput?.nativeElement;
    input.value = ""; // Reset the value of the file input.
    this.jsonFile = null;
  }

  async serveSchools(nextPage: any[] | undefined = undefined) {
    this.errorMessage = "";
    this.isLoading = true;
    try {
      // Provide pitId only if provided alongside nextPage.
      const response = await this.db.getSchoolsAdmin(this.searchQuery, this.filters, this.sortBy,
        nextPage, nextPage != null ? this.pitId : undefined, await this.authenticationService.getUserIdToken());

      this.pitId = response.pitId;

      // Append response if its nextPage, else assign new response.
      if (nextPage) {
        response.schools.forEach((review: any) => {
          this.schools.push(review);
        });
      } else {
        this.schools = response.schools;
      }

      this.isLoadMoreEnabled = response.isLoadMoreEnabled;

    } catch (error: any) {
      this.errorMessage = `An error occurred. Reason: ${error?.code || error?.error?.code || error?.message || "UNKNOWN"}.`;
      console.log(error);
    }
    this.isLoading = false;
  }

  async updateSchools(form: NgForm) {
    if (form.valid && this.jsonFile) {
      const message = "Update schools";
      const description = "Are you sure you want to update the current schools list?";
      const yesOption = "Yes";
      const noOption = "No";

      this.dialogsService.toggleConfirmationDialog({ message: message, description: description,
        yesOption: yesOption, noOption: noOption });

      this.dialogsService.getConfirmationDialogResult().subscribe({
        next: async (result: boolean) => {
          if (result) {
            try {
              const formData = new FormData();
              formData.append("jsonFile", (this.jsonFile || ""));
              await this.db.updateSchoolsAdmin(await this.authenticationService.getUserIdToken(), formData);
              this.closeAllDialogs();
            } catch (error: any) {
              this.closeAllDialogs();
              this.dialogsService.displayErrorDialog("Schools list could not be updated.", error);
            }
            await this.serveSchools();
          } else {
            this.closeAllDialogs();
          }
          this.removeJsonFile();
        }
      });
    }
  }

  clearForm(form: NgForm) {
    form.resetForm({
      schoolSearchQuery: "",
      schoolId: "",
      acaraId: "",
      campusParentAcaraId: "",
      type: "",
      sector: "",
      status: "",
      parentCampusOnly: undefined,
      sortBy: "relevance"
    });
    this.serveSchools().then();
  }

  toggleContextMenu(event: MouseEvent, school: School) {
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
                    <i class="fi fi-rr-copy-alt icon mini-icon"></i>School ID
                </div>
            </button>
          `,
          function: (() => navigator.clipboard.writeText(school?._id || "")
            .then(() => alert(`Copied School ID: ${ school?._id }`)))
        },
        {
          html: `
            <button class="button no-border fill-width transparent">
                <div class="button-text-wrap justify-left">
                    <i class="fi fi-rr-copy-alt icon mini-icon"></i>ACARA ID
                </div>
            </button>
          `,
          function: (() => navigator.clipboard.writeText(school?.acaraId || "")
            .then(() => alert(`Copied ACARA ID: ${ school?.acaraId }`)))
        },
        ...(school?.acaraId !== school?.campusParentAcaraId ? [{
          html: `
            <button class="button no-border fill-width transparent">
                <div class="button-text-wrap justify-left">
                    <i class="fi fi-rr-copy-alt icon mini-icon"></i>Parent Campus ACARA ID
                </div>
            </button>
          `,
          function: (() => navigator.clipboard.writeText(school?.campusParentAcaraId || "")
            .then(() => alert(`Copied Parent Campus ACARA ID: ${ school?.campusParentAcaraId }`)))
        }] : [])
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
  protected readonly School = School;
}
