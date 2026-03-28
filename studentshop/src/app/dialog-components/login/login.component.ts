import {Component, ElementRef, ViewChild} from '@angular/core';
import {FormsModule, NgForm, ReactiveFormsModule} from "@angular/forms";
import {NgClass, NgIf} from "@angular/common";
import {DialogsService} from "../dialogs.service";
import {AuthenticationService} from "../../authentication.service";

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    FormsModule,
    NgIf,
    ReactiveFormsModule,
    NgClass
  ],
  templateUrl: './login.component.html',
  styleUrls: ['../dialog-components.css', './login.component.css']
})
export class LoginComponent {
  email: string = "";
  password: string = "";

  nonEmptyRegex: RegExp = /^(?!\s*$).+/;
  emailRegex: RegExp = /^[a-zA-Z0-9.!#$%&’*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;

  isLoading: boolean = false;
  errorMessage: string = "";

  constructor(private dialogsService: DialogsService, private authenticationService: AuthenticationService) {}

  closeAllDialogs() {
    this.dialogsService.closeAllDialogs();
  }

  toggleSignup(): void {
    this.dialogsService.toggleSignup();
  }

  toggleForgotPassword(): void {
    this.dialogsService.toggleForgotPassword();
  }

  async login(form: NgForm) {
    this.errorMessage = "";
    if (form.valid && !this.isLoading) {
      this.isLoading = true;
      try {
        await this.authenticationService.login(this.email, this.password);
        this.closeAllDialogs();
      } catch (error: any) {
        if (["auth/user-not-found", "auth/wrong-password"].includes(error?.code)) {
          this.errorMessage = "*Email and/or password is incorrect.";
        } else {
          this.errorMessage = "*An error occurred. Could not log you in.";
        }
      }
      this.isLoading = false;
    }
  }

  async loginWithGoogle() {
    this.errorMessage = "";
    this.isLoading = true;
    try {
      await this.authenticationService.loginWithGoogle();
      this.closeAllDialogs();
    } catch (error) {
      console.log(error);
      this.errorMessage = "*An error occurred. Could not log you in.";
    }
    this.isLoading = false;
  }

  protected readonly JSON = JSON;
}
