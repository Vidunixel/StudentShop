import {ChangeDetectorRef, Component, Input} from '@angular/core';
import {DialogsService} from "../../dialogs.service";
import {AuthenticationService} from "../../../authentication.service";
import {User as NativeUser} from "../../../models/User";
import {DatabaseService} from "../../../database.service";
import {FormsModule, NgForm, ReactiveFormsModule} from "@angular/forms";
import {NgIf} from "@angular/common";

@Component({
  selector: 'app-edit-user',
  standalone: true,
  imports: [
    FormsModule,
    NgIf,
    ReactiveFormsModule
  ],
  templateUrl: './edit-user.component.html',
  styleUrls: ['../../dialog-components.css', './edit-user.component.css']
})
export class EditUserComponent {
  @Input() editUserAdminData: NativeUser | undefined;

  accountType: string = "";

  isLoading: boolean = false;
  errorMessage = "";
  successMessage = "";
  currentSuccessTimeout: ReturnType<typeof setTimeout> | undefined;

  constructor(private dialogsService: DialogsService, private authenticationService: AuthenticationService,
              private cdr: ChangeDetectorRef, private db: DatabaseService) { }

  async ngOnInit() {
    await this.serveUser();
  }

  closeAllDialogs() {
    this.dialogsService.closeAllDialogs();
  }

  toggleLogin(): void {
    this.dialogsService.toggleLogin();
  }

  async serveUser(): Promise<void> {
    if (this.editUserAdminData) {
      const response = await this.db.getUserAdmin(this.editUserAdminData.uid, await this.authenticationService.getUserIdToken());
      this.editUserAdminData = response.user;

      if (this.editUserAdminData) {
        this.accountType = this.editUserAdminData.accountType;
      }
    }
  }

  async updateUser(form: NgForm) {
    this.errorMessage = "";
    if (form.valid && this.editUserAdminData && !this.isLoading) {
      // Update user.
      this.isLoading = true;
      try {
        await this.db.updateUserAdmin(this.editUserAdminData.uid, {
          ...(this.accountType !== this.editUserAdminData.accountType ? { accountType: this.accountType } : {})
        }, await this.authenticationService.getUserIdToken());
        await this.serveUser();
        this.displaySuccessMessage("User updated successfully.");
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

  protected readonly NativeUser = NativeUser;
  protected readonly Object = Object;
}
