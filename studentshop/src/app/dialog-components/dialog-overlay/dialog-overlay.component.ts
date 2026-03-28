import {Component, ElementRef, ViewChild, HostListener, Input, ChangeDetectorRef, Renderer2} from '@angular/core';import { NgIf } from "@angular/common";
import {ConfirmationDialogComponent} from "../confirmation-dialog/confirmation-dialog.component";
import {LoginComponent} from "../login/login.component";
import {SignupComponent} from "../signup/signup.component";
import {SocialSignupComponent} from "../social-signup/social-signup.component";
import {User as NativeUser} from '../../models/User';
import {ForgotPasswordComponent} from "../forgot-password/forgot-password.component";
import {SellComponent} from "../sell/sell.component";
import {ReviewComponent} from "../review/review.component";
import {EditListingComponent} from "../edit-listing/edit-listing.component";
import {Note} from "../../models/Note";
import {Review} from "../../models/Review";
import {UpdateEmailComponent} from "../update-email/update-email.component";
import {LinkWithCredentialComponent} from "../link-with-credential/link-with-credential.component";
import {UpdatePasswordComponent} from "../update-password/update-password.component";
import {RefundComponent} from "../refund/refund.component";
import {WithdrawComponent} from "../withdraw/withdraw.component";
import {EditUserComponent} from "../admin-components/edit-user/edit-user.component";
import {AddSubjectComponent} from "../admin-components/add-subject/add-subject.component";
import {EditSubjectComponent} from "../admin-components/edit-subject/edit-subject.component";
import {Subject} from "../../models/Subject";
import {RejectNoteComponent} from "../admin-components/edit-note/reject-note.component";

@Component({
  selector: 'app-dialog-overlay',
  standalone: true,
  imports: [
    NgIf,
    ConfirmationDialogComponent,
    LoginComponent,
    SignupComponent,
    SocialSignupComponent,
    ForgotPasswordComponent,
    SellComponent,
    ReviewComponent,
    EditListingComponent,
    UpdateEmailComponent,
    LinkWithCredentialComponent,
    UpdatePasswordComponent,
    RefundComponent,
    WithdrawComponent,
    EditUserComponent,
    AddSubjectComponent,
    EditSubjectComponent,
    RejectNoteComponent
  ],
  templateUrl: './dialog-overlay.component.html',
  styleUrl: './dialog-overlay.component.css'
})
export class DialogOverlayComponent {
  @ViewChild('overlay') overlay: ElementRef | undefined;
  isOverlayOpen: boolean = false;

  dialogs = {
    isConfirmationDialogOpen: false,
    isRefundOpen: false,
    isLoginOpen: false,
    isSignupOpen: false,
    isSocialSignupOpen: false,
    isForgotPasswordOpen: false,
    isSellOpen: false,
    isWithdrawOpen: false,
    isReviewOpen: false,
    isPdfViewerOpen: false,
    isEditListingOpen: false,
    isUpdateEmailOpen: false,
    isLinkWithCredentialOpen: false,
    isUpdatePasswordOpen: false,
    isEditUserAdminOpen: false,
    isAddSubjectAdminOpen: false,
    isEditSubjectAdminOpen: false,
    isRejectNoteAdminOpen: false
  };

  // Data.
  confirmationDialogData: { message: string, imageUrl?: string, description?: string, yesOption: string,
    noOption?: string } = { message: "", yesOption: "" };
  reviewData: Review = new Review({ rating: 0, review: "" });
  refundData: { id: string, acceptedReasons: string[] } = { id: "", acceptedReasons: [] };
  editListingData: Note | undefined = undefined;
  editUserAdminData: NativeUser | undefined = undefined;
  editSubjectAdminData: Subject | undefined = undefined;
  rejectNoteAdminData: Note | undefined = undefined;

  constructor(private renderer: Renderer2) {
  }

  toggleDialogOverlay() {
    this.isOverlayOpen = !this.isOverlayOpen;
    if (this.isOverlayOpen) {
      this.overlay?.nativeElement.classList.add("--open");

      // Disable Scrolling.
      document.body.classList.add('no-scroll');
    } else {
      this.overlay?.nativeElement.classList.remove("--open");

      // Enable Scrolling.
      document.body.classList.remove('no-scroll');
    }
  }

  closeAllDialogs(): void {
    // Close all dialogs.
    for (const key of Object.keys(this.dialogs)) {
      this.dialogs[`${ key as keyof typeof this.dialogs }`] = false;
    }

    // Close overlay if its open.
    if (this.isOverlayOpen) {
      this.toggleDialogOverlay();
    }
  }

  onOverlayClick(event: MouseEvent |TouchEvent): void {
    // Check if the clicked element is the overlay itself.
    if (event.target === this.overlay?.nativeElement) {
      // Animate shake
      this.triggerShakeAnimation();
    }
  }

  triggerShakeAnimation() {
    const dialog = this.overlay?.nativeElement.querySelector(".dialog")!;
    let animation = "squeeze";

    if (dialog.id === "confirmation-dialog") {
      animation = "shake"
    }
    this.renderer.removeClass(dialog, animation);
    dialog.offsetWidth; // force reflow
    this.renderer.addClass(dialog, animation);
  }

  toggleConfirmationDialog(confirmationDialogData: { message: string, imageUrl?: string, description?: string, yesOption: string,
    noOption?: string } | undefined): void {
    if (confirmationDialogData) {
      this.confirmationDialogData = confirmationDialogData;
    }
    // If not already open, close overlay and all other dialogs.
    if (!this.dialogs.isConfirmationDialogOpen) {
      this.closeAllDialogs();
    }
    // Open dialog and overlay.
    this.dialogs.isConfirmationDialogOpen = !this.dialogs.isConfirmationDialogOpen;
    this.toggleDialogOverlay();
  }

  toggleRefund(refundData: { id: string, acceptedReasons: string[] } | undefined): void {
    if (refundData) {
      this.refundData = refundData;
    }
    // If not already open, close overlay and all other dialogs.
    if (!this.dialogs.isRefundOpen) {
      this.closeAllDialogs();
    }
    // Open dialog and overlay.
    this.dialogs.isRefundOpen = !this.dialogs.isRefundOpen;
    this.toggleDialogOverlay();
  }

  toggleLogin(): void {
    // If not already open, close overlay and all other dialogs.
    if (!this.dialogs.isLoginOpen) {
      this.closeAllDialogs();
    }
    // Open dialog and overlay.
    this.dialogs.isLoginOpen = !this.dialogs.isLoginOpen;
    this.toggleDialogOverlay();
  }

  toggleSignup(): void {
    // If not already open, close overlay and all other dialogs.
    if (!this.dialogs.isSignupOpen) {
      this.closeAllDialogs();
    }
    // Open dialog and overlay.
    this.dialogs.isSignupOpen = !this.dialogs.isSignupOpen;
    this.toggleDialogOverlay();
  }

  toggleSocialSignup(): void {
    // If not already open, close overlay and all other dialogs.
    if (!this.dialogs.isSocialSignupOpen) {
      this.closeAllDialogs();
    }
    // Open dialog and overlay.
    this.dialogs.isSocialSignupOpen = !this.dialogs.isSocialSignupOpen;
    this.toggleDialogOverlay();
  }

  toggleForgotPassword(): void {
    // If not already open, close overlay and all other dialogs.
    if (!this.dialogs.isForgotPasswordOpen) {
      this.closeAllDialogs();
    }
    // Open dialog and overlay.
    this.dialogs.isForgotPasswordOpen = !this.dialogs.isForgotPasswordOpen;
    this.toggleDialogOverlay();
  }

  toggleSell(): void {
    // If not already open, close overlay and all other dialogs.
    if (!this.dialogs.isSellOpen) {
      this.closeAllDialogs();
    }
    // Open dialog and overlay.
    this.dialogs.isSellOpen = !this.dialogs.isSellOpen;
    this.toggleDialogOverlay();
  }

  toggleWithdraw(): void {
    // If not already open, close overlay and all other dialogs.
    if (!this.dialogs.isWithdrawOpen) {
      this.closeAllDialogs();
    }
    // Open dialog and overlay.
    this.dialogs.isWithdrawOpen = !this.dialogs.isWithdrawOpen;
    this.toggleDialogOverlay();
  }

  toggleReview(reviewData: Review | undefined): void {
    if (reviewData) {
      this.reviewData = reviewData;
    }
    // If not already open, close overlay and all other dialogs.
    if (!this.dialogs.isReviewOpen) {
      this.closeAllDialogs();
    }
    // Open dialog and overlay.
    this.dialogs.isReviewOpen = !this.dialogs.isReviewOpen;
    this.toggleDialogOverlay();
  }

  toggleEditListing(editListingData: Note | undefined): void {
    if (editListingData) {
      this.editListingData = editListingData;
    }
    // If not already open, close overlay and all other dialogs.
    if (!this.dialogs.isEditListingOpen) {
      this.closeAllDialogs();
    }
    // Open dialog and overlay.
    this.dialogs.isEditListingOpen = !this.dialogs.isEditListingOpen;
    this.toggleDialogOverlay();
  }

  toggleUpdateEmail(): void {
    // If not already open, close overlay and all other dialogs.
    if (!this.dialogs.isUpdateEmailOpen) {
      this.closeAllDialogs();
    }
    // Open dialog and overlay.
    this.dialogs.isUpdateEmailOpen = !this.dialogs.isUpdateEmailOpen;
    this.toggleDialogOverlay();
  }

  toggleLinkWithCredential(): void {
    // If not already open, close overlay and all other dialogs.
    if (!this.dialogs.isLinkWithCredentialOpen) {
      this.closeAllDialogs();
    }
    // Open dialog and overlay.
    this.dialogs.isLinkWithCredentialOpen = !this.dialogs.isLinkWithCredentialOpen;
    this.toggleDialogOverlay();
  }

  toggleUpdatePassword(): void {
    // If not already open, close overlay and all other dialogs.
    if (!this.dialogs.isUpdatePasswordOpen) {
      this.closeAllDialogs();
    }
    // Open dialog and overlay.
    this.dialogs.isUpdatePasswordOpen = !this.dialogs.isUpdatePasswordOpen;
    this.toggleDialogOverlay();
  }

  toggleEditUserAdmin(editUserAdminData: NativeUser | undefined): void {
    if (editUserAdminData) {
      this.editUserAdminData = editUserAdminData;
    }
    // If not already open, close overlay and all other dialogs.
    if (!this.dialogs.isEditUserAdminOpen) {
      this.closeAllDialogs();
    }
    // Open dialog and overlay.
    this.dialogs.isEditUserAdminOpen = !this.dialogs.isEditUserAdminOpen;
    this.toggleDialogOverlay();
  }

  toggleAddSubjectAdmin(): void {
    // If not already open, close overlay and all other dialogs.
    if (!this.dialogs.isAddSubjectAdminOpen) {
      this.closeAllDialogs();
    }
    // Open dialog and overlay.
    this.dialogs.isAddSubjectAdminOpen = !this.dialogs.isAddSubjectAdminOpen;
    this.toggleDialogOverlay();
  }

  toggleEditSubjectAdmin(editSubjectAdminData: Subject | undefined): void {
    if (editSubjectAdminData) {
      this.editSubjectAdminData = editSubjectAdminData;
    }
    // If not already open, close overlay and all other dialogs.
    if (!this.dialogs.isEditSubjectAdminOpen) {
      this.closeAllDialogs();
    }
    // Open dialog and overlay.
    this.dialogs.isEditSubjectAdminOpen = !this.dialogs.isEditSubjectAdminOpen;
    this.toggleDialogOverlay();
  }

  toggleRejectNoteAdmin(rejectNoteAdminData: Note | undefined): void {
    if (rejectNoteAdminData) {
      this.rejectNoteAdminData = rejectNoteAdminData;
    }
    // If not already open, close overlay and all other dialogs.
    if (!this.dialogs.isRejectNoteAdminOpen) {
      this.closeAllDialogs();
    }
    // Open dialog and overlay.
    this.dialogs.isRejectNoteAdminOpen = !this.dialogs.isRejectNoteAdminOpen;
    this.toggleDialogOverlay();
  }
}
