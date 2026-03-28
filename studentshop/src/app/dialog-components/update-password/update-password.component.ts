import {ChangeDetectorRef, Component} from '@angular/core';
import {FormsModule, NgForm} from "@angular/forms";
import {NgClass, NgIf} from "@angular/common";
import {DialogsService} from "../dialogs.service";
import {AuthenticationService} from "../../authentication.service";

@Component({
  selector: 'app-update-password',
  standalone: true,
  imports: [
    FormsModule,
    NgIf,
    NgClass
  ],
  templateUrl: './update-password.component.html',
  styleUrls: ['../dialog-components.css', './update-password.component.css']
})
export class UpdatePasswordComponent {
  password: string = "";
  confirmPassword: string = "";

  passwordRegex: RegExp = /^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9])(?=.*?[#?!@$ %^&*-.]).{8,}$/;

  isLoading: boolean = false;
  errorMessage: string = "";
  successMessage: string = "";
  currentSuccessTimeout: ReturnType<typeof setTimeout> | undefined;

  constructor(private dialogsService: DialogsService, private authenticationService: AuthenticationService,
              private cdr: ChangeDetectorRef) {}

  closeAllDialogs() {
    this.dialogsService.closeAllDialogs();
  }

  validateConfirmPassword(form: NgForm): void {
    if (this.password !== this.confirmPassword) {
      // Add mismatch error.
      form.controls['confirmPassword']?.setErrors({
        ...form.controls['confirmPassword']?.errors, mismatch: true
      });
    }
  }

  async updatePassword(form: NgForm) {
    this.errorMessage = "";
    this.validateConfirmPassword(form);
    if (form.valid && !this.isLoading) {
      this.isLoading = true;
      try {
        const user = await this.authenticationService.updatePassword(this.password);
        this.displaySuccessMessage("Password updated successfully.");
        this.clearForm(form);
      } catch (error: any) {
        console.log(error);
        this.errorMessage = `*An error occurred. Reason: ${error?.code || error?.error?.code || error?.message || "UNKNOWN"}.`;
      }
      this.isLoading = false;
    }
  }

  clearForm(form: NgForm) {
    form.resetForm({
      password: "",
      confirmPassword: ""
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
}
