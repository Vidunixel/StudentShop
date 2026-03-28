import {ChangeDetectorRef, Component} from '@angular/core';
import {FormsModule, NgForm, ReactiveFormsModule} from "@angular/forms";
import {NgClass, NgIf} from "@angular/common";
import {DialogsService} from "../../dialogs.service";
import {AuthenticationService} from "../../../authentication.service";
import {DatabaseService} from "../../../database.service";
import {Subject} from "../../../models/Subject";

@Component({
  selector: 'app-add-subject',
  standalone: true,
  imports: [
    FormsModule,
    NgIf,
    ReactiveFormsModule,
    NgClass
  ],
  templateUrl: './add-subject.component.html',
  styleUrls: ['../../dialog-components.css', './add-subject.component.css']
})
export class AddSubjectComponent {
  name: string = "";
  certificate: string = "";

  nonEmptyRegex: RegExp = /^(?!\s*$).+/;

  isLoading: boolean = false;
  errorMessage = "";
  successMessage = "";
  currentSuccessTimeout: ReturnType<typeof setTimeout> | undefined;

  constructor(private dialogsService: DialogsService, private authenticationService: AuthenticationService,
              private cdr: ChangeDetectorRef, private db: DatabaseService) { }

  closeAllDialogs() {
    this.dialogsService.closeAllDialogs();
  }

  toggleLogin(): void {
    this.dialogsService.toggleLogin();
  }

  async addSubject(form: NgForm) {
    this.errorMessage = "";
    if (form.valid && !this.isLoading) {
      // Add subject.
      this.isLoading = true;
      try {
        const subject = new Subject({ name: this.name, certificate: this.certificate });
        await this.db.addSubjectAdmin(await this.authenticationService.getUserIdToken(), subject);

        this.displaySuccessMessage("Subject added successfully.");
        this.clearForm(form);
      } catch (error: any) {
        this.errorMessage = `*An error occurred. Reason: ${error?.code || error?.error?.code || error?.message || "UNKNOWN"}.`;
      }
      this.isLoading = false;
    }
  }

  clearForm(form: NgForm) {
    form.resetForm({
      certificate: "",
      name: ""
    });
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
