import {ChangeDetectorRef, Component} from '@angular/core';
import {DialogsService} from "../dialogs.service";
import {AuthenticationService} from "../../authentication.service";
import {FormsModule, NgForm, ReactiveFormsModule} from "@angular/forms";
import {NgClass, NgIf} from "@angular/common";

@Component({
  selector: 'app-update-email',
  standalone: true,
  imports: [
    FormsModule,
    NgIf,
    ReactiveFormsModule,
    NgClass
  ],
  templateUrl: './update-email.component.html',
  styleUrls: ['../dialog-components.css', './update-email.component.css']
})
export class UpdateEmailComponent {
  email: string = "";

  emailRegex: RegExp = /^[a-zA-Z0-9.!#$%&’*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
  isLoading: boolean = false;

  errorMessage: string = "";
  successMessage: string = "";
  currentSuccessTimeout: ReturnType<typeof setTimeout> | undefined;

  constructor(private dialogsService: DialogsService, private authenticationService: AuthenticationService,
              private cdr: ChangeDetectorRef) {}

  closeAllDialogs() {
    this.dialogsService.closeAllDialogs();
  }

  async updateEmail(form: NgForm) {
    this.errorMessage = "";
    if (form.valid && !this.isLoading) {
      this.isLoading = true;
      try {
        const user = await this.authenticationService.updateEmail(this.email);

        // Send verification email if user is unverified.
        if (user && !user?.emailVerified) {
          await this.sendEmailVerification();
        } else {
          this.displaySuccessMessage("Email address updated successfully.");
          this.clearForm(form);
        }
      } catch (error: any) {
        console.log(error);
        this.errorMessage = `*An error occurred. Reason: ${error?.code || error?.error?.code || error?.message || "UNKNOWN"}.`;
      }
      this.isLoading = false;
    }
  }

  clearForm(form: NgForm) {
    form.resetForm({
      email: ""
    });
  }

  // Send verification email.
  async sendEmailVerification() {
    if (this.email) {
      await this.authenticationService.sendEmailVerification();
      this.dialogsService.toggleConfirmationDialog({
        message: "Verify email", imageUrl: "/images/verify-email.svg",
        description: `Email updated!<br>Please verify your email address by clicking on the link
             we've sent to <strong>${this.maskEmail(this.email)}</strong>.`, yesOption: "Okay"});

      this.dialogsService.getConfirmationDialogResult().subscribe({
        next: async () => {
          await this.authenticationService.refreshUserIdToken();
          this.closeAllDialogs();
        }
      })
    }
  }

  maskEmail(email: string) {
    return email.replace(/^(.{2})(.*)(@.*)$/, (_, firstTwo, middle, domain) => {
      return firstTwo + '*'.repeat(middle.length) + domain;
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
