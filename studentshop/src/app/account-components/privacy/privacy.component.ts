import {ChangeDetectorRef, Component, OnInit} from '@angular/core';
import {NgIf} from "@angular/common";
import {AuthenticationService} from "../../authentication.service";
import {DatabaseService} from "../../database.service";
import {DialogsService} from "../../dialog-components/dialogs.service";
import {FormsModule, NgForm, ReactiveFormsModule} from "@angular/forms";
import {takeUntil} from "rxjs/operators";
import {User as NativeUser} from "../../models/User";
import {Subject} from "rxjs";

@Component({
  selector: 'app-privacy',
  standalone: true,
    imports: [
        NgIf,
        FormsModule,
        ReactiveFormsModule
    ],
  templateUrl: './privacy.component.html',
  styleUrls: ['../account.component.css', './privacy.component.css']
})
export class PrivacyComponent implements OnInit {
  private destroy$ = new Subject<void>();
  nativeUser: NativeUser | null | undefined = undefined;

  isActiveStudent: boolean = false;

  schoolVisibility: string | undefined;
  subjectsVisibility: string | undefined;

  errorMessage: string = "";
  successMessage: string = "";
  currentSuccessTimeout: ReturnType<typeof setTimeout> | undefined;

  constructor(protected authenticationService: AuthenticationService, private db: DatabaseService,
              private dialogsService: DialogsService, private cdr: ChangeDetectorRef) { }

  ngOnInit(): void {
    this.authenticationService.getNativeUser().pipe(takeUntil(this.destroy$)).subscribe((nativeUser: NativeUser | null | undefined) => {
      this.nativeUser = nativeUser;

      this.isActiveStudent = nativeUser?.studentDetails?.isActive || false;

      this.schoolVisibility = nativeUser?.studentDetails?.school?.visibility;
      this.subjectsVisibility = nativeUser?.studentDetails?.subjects?.visibility;
    });
  }

  toggleLogin() {
    this.dialogsService.toggleLogin();
  }

  toggleSignup() {
    this.dialogsService.toggleSignup();
  }

  async updateUser(form: NgForm) {
    if (form.valid) {
      const studentDetails = {
        isActive: this.isActiveStudent,
        school: {
          visibility: this.schoolVisibility,
          schoolId: this.nativeUser?.studentDetails?.school?.schoolId,
        },
        subjects: {
          visibility: this.subjectsVisibility,
          subjectIds: this.nativeUser?.studentDetails?.subjects?.subjectIds,
        }
      }

      // Update user natively.
      await this.db.updateUser(await this.authenticationService.getUserIdToken(), {
        studentDetails
      }).then(() => this.displaySuccessMessage("Privacy settings updated successfully."))
        .catch(() => this.errorMessage = "*An error occurred updating privacy settings.");

      await this.authenticationService.setCurrentNativeUser(); // Refresh details.
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

  protected readonly NativeUser = NativeUser;
}
