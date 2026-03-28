import { Component } from '@angular/core';
import {NgIf} from "@angular/common";
import {PageNotFoundComponent} from "../../../page-not-found/page-not-found.component";
import {Subject as RxjsSubject} from "rxjs/internal/Subject";
import {Note} from "../../../models/Note";
import {AuthenticationService} from "../../../authentication.service";
import {DatabaseService} from "../../../database.service";
import {ContextMenuService} from "../../../context-menu.service";
import {ActivatedRoute, RouterLink} from "@angular/router";
import {DialogsService} from "../../../dialog-components/dialogs.service";
import {skip, takeUntil} from "rxjs/operators";
import {User as NativeUser} from "../../../models/User";
import {Refund} from "../../../models/Refund";
import {GetStatusPipe} from "../../../pipes/get-status.pipe";

@Component({
  selector: 'app-refund',
  standalone: true,
  imports: [
    NgIf,
    PageNotFoundComponent,
    RouterLink,
    GetStatusPipe
  ],
  templateUrl: './refund.component.html',
  styleUrls: ['../../admin.component.css', '../item-components.css', './refund.component.css']
})
export class RefundComponent {
  private destroy$ = new RxjsSubject<void>();
  nativeUser: NativeUser | null | undefined = undefined;

  refundId: string | undefined;
  refund: Refund | undefined;

  errorMessage: string = "";
  isLoading: boolean = false;

  constructor(protected authenticationService: AuthenticationService, protected db: DatabaseService,
              private contextMenuService: ContextMenuService, private route: ActivatedRoute,
              private dialogsService: DialogsService) { }

  async ngOnInit() {
    this.authenticationService.getNativeUser().pipe(takeUntil(this.destroy$)).subscribe(async (nativeUser: NativeUser | null | undefined) => {
      this.nativeUser = nativeUser;

      if (this.nativeUser && [NativeUser.AccountType.ADMIN, NativeUser.AccountType.STAFF].includes(nativeUser?.accountType || '')) {
        await this.setRefund();
      }
    });

    // Set note on route change.
    this.route.paramMap.pipe(skip(1), takeUntil(this.destroy$)).subscribe(async params => {
      if (this.nativeUser) {
        await this.setRefund();
      }
    });
  }

  toggleLogin() {
    this.dialogsService.toggleLogin();
  }

  closeAllDialogs() {
    this.dialogsService.closeAllDialogs();
  }

  async approveOrRejectRefund(approveRefund: boolean) {
    let message;
    let description;
    if (approveRefund) {
      message = "Approve refund";
      description = "Are you sure you want to approve this refund request? This action cannot be undone.";
    } else {
      message = "Reject refund";
      description = "Are you sure you want to reject this refund request? This action cannot be undone.";
    }
    const yesOption = "Yes";
    const noOption = "No";

    this.dialogsService.toggleConfirmationDialog({ message: message, description: description,
      yesOption: yesOption, noOption: noOption });

    this.dialogsService.getConfirmationDialogResult().subscribe({
      next: async (result: boolean) => {
        if (result) {
          try {
            await this.db.updateRefundAdmin(this.refund?._id, { status:
                  approveRefund ? Refund.RefundStatus.COMPLETED : Refund.RefundStatus.REJECTED },
              await this.authenticationService.getUserIdToken());
            this.closeAllDialogs();
          } catch (error: any) {
            this.closeAllDialogs();
            this.dialogsService.displayErrorDialog("Refund could not be updated.", error);
          }
          await this.serveRefund(this.refundId);
        } else {
          this.closeAllDialogs();
        }
      }
    });
  }

  async setRefund() {
    this.refundId = this.route.snapshot.paramMap.get('id') || undefined;

    this.errorMessage = "";
    this.isLoading = true;
    if (this.refundId) {
      try {
        await this.serveRefund(this.refundId);
      } catch (error: any) {
        this.errorMessage = `An error occurred. Reason: ${error?.code || error?.error?.code || error?.message || "UNKNOWN"}.`;
        console.log(error);
      }
    } else {
      this.errorMessage = "`An error occurred. Reason: INVALID_ID.";
    }
    this.isLoading = false;
  }

  async serveRefund(id: string = ""): Promise<void> {
    const response = await this.db.getRefundAdmin(id, await this.authenticationService.getUserIdToken());
    this.refund = response.refund;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected readonly NativeUser = NativeUser;
  protected readonly Note = Note;
  protected readonly Refund = Refund;
}
