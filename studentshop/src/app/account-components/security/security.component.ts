import { Component } from '@angular/core';
import {AuthenticationService} from "../../authentication.service";
import {DatabaseService} from "../../database.service";
import {DialogsService} from "../../dialog-components/dialogs.service";
import {FormsModule, NgForm, ReactiveFormsModule} from "@angular/forms";
import {NgClass, NgIf} from "@angular/common";
import {takeUntil} from "rxjs/operators";
import {User, UserInfo} from "@angular/fire/auth";
import {Subject} from "rxjs";

@Component({
  selector: 'app-security',
  standalone: true,
  imports: [
    FormsModule,
    NgIf,
    ReactiveFormsModule,
    NgClass
  ],
  templateUrl: './security.component.html',
  styleUrls: ['../account.component.css', './security.component.css']
})
export class SecurityComponent {
  private destroy$ = new Subject<void>();

  user: User | null = null;

  providerGoogle: UserInfo | undefined;
  providerPassword: UserInfo | undefined;
  isEmailVerified: boolean = false;

  constructor(protected authenticationService: AuthenticationService, private db: DatabaseService,
              private dialogsService: DialogsService) { }

  ngOnInit() {
    this.authenticationService.getUser().pipe(takeUntil(this.destroy$)).subscribe((user: User | null) => {
      this.user = user;

      this.isEmailVerified = !!user?.emailVerified;

      // If user has already registered with Google, set providerGoogle.
      this.providerGoogle = user?.providerData?.find(
        (providerInfo) => providerInfo.providerId === "google.com"
      );

      // If user has already registered with password, set providerPassword.
      this.providerPassword = user?.providerData?.find(
        (providerInfo) => providerInfo.providerId === "password"
      );
    });
  }

  toggleLogin() {
    this.dialogsService.toggleLogin();
  }

  toggleSignup() {
    this.dialogsService.toggleSignup();
  }

  toggleLinkWithCredential() {
    this.dialogsService.toggleLinkWithCredential();
  }

  toggleUpdateEmail() {
    this.dialogsService.toggleUpdateEmail();
  }

  toggleUpdatePassword() {
    this.dialogsService.toggleUpdatePassword();
  }

  async linkWithGoogle() {
    await this.authenticationService.linkWithGoogle();
  }

  async unlinkGoogle() {
    this.dialogsService.toggleConfirmationDialog({
      message: "Unlink provider",
      description: `Are you sure you want to remove Google as a sign-in method?`,
      yesOption: "Yes",
      noOption: "No"
    });

    this.dialogsService.getConfirmationDialogResult().subscribe({
      next: async (result: boolean) => {
        if (result) {
          await this.authenticationService.unlinkGoogle();
        }
        this.dialogsService.closeAllDialogs();
      }
    });
  }

  // Send verification email.
  async sendEmailVerification() {
    if (this.providerPassword?.email) {
      await this.authenticationService.sendEmailVerification();
      this.dialogsService.toggleConfirmationDialog({
        message: "Verify email", imageUrl: "/images/verify-email.svg",
        description: `Verification link sent!<br>Please verify your email address by clicking on the link
             we've sent to <strong>${this.maskEmail(this.providerPassword?.email)}</strong>.`, yesOption: "Okay"});

      this.dialogsService.getConfirmationDialogResult().subscribe({
        next: async () => {
          await this.authenticationService.refreshUserIdToken();
          this.dialogsService.closeAllDialogs();
        }
      });
    }
  }

  maskEmail(email: string) {
    return email.replace(/^(.{2})(.*)(@.*)$/, (_, firstTwo, middle, domain) => {
      return firstTwo + '*'.repeat(middle.length) + domain;
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
