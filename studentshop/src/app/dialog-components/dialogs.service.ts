import { Injectable } from '@angular/core';
import {DialogOverlayComponent} from "./dialog-overlay/dialog-overlay.component";
import {Observable, Subject as RxjsSubject} from "rxjs";
import {Note} from "../models/Note";
import {User as NativeUser} from "../models/User";
import {Review} from "../models/Review";
import {Subject} from "../models/Subject";

@Injectable({
  providedIn: 'root'
})
export class DialogsService {
  public dialogOverlayInstance!: DialogOverlayComponent;
  private confirmationDialogResult$ = new RxjsSubject<boolean>();

  getConfirmationDialogResult(): Observable<boolean> {
    return this.confirmationDialogResult$.asObservable();
  }

  emitConfirmationDialogResult(result: boolean): void {
    this.confirmationDialogResult$.next(result);
  }

  // Register the dialogOverlay instance.
  registerDialogOverlay(dialogOverlay: DialogOverlayComponent): void {
    this.dialogOverlayInstance = dialogOverlay;
  }

  closeAllDialogs(): void {
    if (this.dialogOverlayInstance) {
      this.dialogOverlayInstance.closeAllDialogs();
    }
  }

  toggleConfirmationDialog(confirmationDialogData: { message: string, imageUrl?: string, description?: string, yesOption: string,
    noOption?: string } | undefined = undefined): void {
    if (this.dialogOverlayInstance) {
      this.confirmationDialogResult$ = new RxjsSubject<boolean>(); // Reset confirmDialog result.
      this.dialogOverlayInstance.toggleConfirmationDialog(confirmationDialogData);
    }
  }

  displayErrorDialog(descriptionStart: string, error: any) {
    const message: string = "An Error Occurred";
    const descriptionEnd: string = `Reason: ${error?.code || error?.error?.code || error?.message || "UNKNOWN"}`;
    const yesOption: string = "Okay";

    this.toggleConfirmationDialog({ message: message, description: `${descriptionStart} ${descriptionEnd}`,
      yesOption: yesOption });
    this.getConfirmationDialogResult().subscribe({
      next: (result: boolean) => {
        this.closeAllDialogs();
      }
    });
  }

  toggleRefund(refundData: { id: string, acceptedReasons: string[] } | undefined = undefined): void {
    if (this.dialogOverlayInstance) {
      this.dialogOverlayInstance.toggleRefund(refundData);
    }
  }

  toggleLogin(): void {
    if (this.dialogOverlayInstance) {
      this.dialogOverlayInstance.toggleLogin();
    }
  }

  toggleSignup(): void {
    if (this.dialogOverlayInstance) {
      this.dialogOverlayInstance.toggleSignup();
    }
  }

  toggleSocialSignup(): void {
    if (this.dialogOverlayInstance) {
      this.dialogOverlayInstance.toggleSocialSignup();
    }
  }

  toggleForgotPassword(): void {
    if (this.dialogOverlayInstance) {
      this.dialogOverlayInstance.toggleForgotPassword();
    }
  }

  toggleSell(): void {
    if (this.dialogOverlayInstance) {
      this.dialogOverlayInstance.toggleSell();
    }
  }

  toggleWithdraw(): void {
    if (this.dialogOverlayInstance) {
      this.dialogOverlayInstance.toggleWithdraw();
    }
  }

  toggleReview(reviewData: Review | undefined = undefined): void {
    if (this.dialogOverlayInstance) {
      this.dialogOverlayInstance.toggleReview(reviewData);
    }
  }

  toggleEditListing(editListingData: Note | undefined = undefined): void {
    if (this.dialogOverlayInstance) {
      this.dialogOverlayInstance.toggleEditListing(editListingData);
    }
  }

  toggleUpdateEmail(): void {
    if (this.dialogOverlayInstance) {
      this.dialogOverlayInstance.toggleUpdateEmail();
    }
  }

  toggleLinkWithCredential(): void {
    if (this.dialogOverlayInstance) {
      this.dialogOverlayInstance.toggleLinkWithCredential();
    }
  }

  toggleUpdatePassword(): void {
    if (this.dialogOverlayInstance) {
      this.dialogOverlayInstance.toggleUpdatePassword();
    }
  }

  toggleEditUserAdmin(editUserAdminData: NativeUser | undefined = undefined): void {
    if (this.dialogOverlayInstance) {
      this.dialogOverlayInstance.toggleEditUserAdmin(editUserAdminData);
    }
  }

  toggleAddSubjectAdmin(): void {
    if (this.dialogOverlayInstance) {
      this.dialogOverlayInstance.toggleAddSubjectAdmin();
    }
  }

  toggleEditSubjectAdmin(editSubjectAdminData: Subject | undefined = undefined): void {
    if (this.dialogOverlayInstance) {
      this.dialogOverlayInstance.toggleEditSubjectAdmin(editSubjectAdminData);
    }
  }

  toggleRejectNoteAdmin(rejectNoteAdminData: Note | undefined = undefined): void {
    if (this.dialogOverlayInstance) {
      this.dialogOverlayInstance.toggleRejectNoteAdmin(rejectNoteAdminData);
    }
  }
}
