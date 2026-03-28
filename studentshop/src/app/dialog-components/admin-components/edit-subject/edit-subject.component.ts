import {ChangeDetectorRef, Component, Input} from '@angular/core';
import {DialogsService} from "../../dialogs.service";
import {AuthenticationService} from "../../../authentication.service";
import {DatabaseService} from "../../../database.service";
import {FormsModule, NgForm, ReactiveFormsModule} from "@angular/forms";
import {Subject} from "../../../models/Subject";
import {NgClass, NgIf} from "@angular/common";

@Component({
  selector: 'app-edit-subject',
  standalone: true,
  imports: [
    FormsModule,
    NgIf,
    ReactiveFormsModule,
    NgClass
  ],
  templateUrl: './edit-subject.component.html',
  styleUrls: ['../../dialog-components.css', './edit-subject.component.css']
})
export class EditSubjectComponent {
  @Input() editSubjectAdminData: Subject | undefined;
  nonEmptyRegex: RegExp = /^(?!\s*$).+/;

  name: string = "";
  certificate: string = "";

  isLoading: boolean = false;
  errorMessage = "";
  successMessage = "";
  currentSuccessTimeout: ReturnType<typeof setTimeout> | undefined;

  constructor(private dialogsService: DialogsService, private authenticationService: AuthenticationService,
              private cdr: ChangeDetectorRef, private db: DatabaseService) { }

  async ngOnInit() {
    await this.serveSubject();
  }

  closeAllDialogs() {
    this.dialogsService.closeAllDialogs();
  }

  toggleLogin(): void {
    this.dialogsService.toggleLogin();
  }

  async serveSubject(): Promise<void> {
    if (this.editSubjectAdminData) {
      const response = await this.db.getSubjectAdmin(this.editSubjectAdminData._id, await this.authenticationService.getUserIdToken());
      this.editSubjectAdminData = response.subject;

      if (this.editSubjectAdminData) {
        this.name = this.editSubjectAdminData.name;
        this.certificate = this.editSubjectAdminData.certificate;
      }
    }
  }

  async updateSubject(form: NgForm) {
    this.errorMessage = "";
    if (form.valid && this.editSubjectAdminData && !this.isLoading) {
      // Update subject.
      this.isLoading = true;
      try {
        await this.db.updateSubjectAdmin(this.editSubjectAdminData._id, {
          ...(this.name !== this.editSubjectAdminData.name ? { name: this.name } : {}),
          ...(this.certificate !== this.editSubjectAdminData.certificate ? { certificate: this.certificate } : {})
        }, await this.authenticationService.getUserIdToken());
        await this.serveSubject();
        this.displaySuccessMessage("Subject updated successfully.");
      } catch (error: any) {
        this.errorMessage = `*An error occurred. Reason: ${error?.code || error?.error?.code || error?.message || "UNKNOWN"}.`;
      }
      this.isLoading = false;
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

  protected readonly Object = Object;
  protected readonly Subject = Subject;
}
