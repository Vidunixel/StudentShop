import { Component } from '@angular/core';
import {GetStatusPipe} from "../../../pipes/get-status.pipe";
import {NgIf} from "@angular/common";
import {PageNotFoundComponent} from "../../../page-not-found/page-not-found.component";
import {Subject as RxjsSubject} from "rxjs/internal/Subject";
import {AuthenticationService} from "../../../authentication.service";
import {DatabaseService} from "../../../database.service";
import {ContextMenuService} from "../../../context-menu.service";
import {ActivatedRoute, RouterLink} from "@angular/router";
import {DialogsService} from "../../../dialog-components/dialogs.service";
import {skip, takeUntil} from "rxjs/operators";
import {User as NativeUser} from "../../../models/User";
import {Withdrawal} from "../../../models/Withdrawal";
import {FormatPricePipe} from "../../../pipes/format-price.pipe";

@Component({
  selector: 'app-withdrawal',
  standalone: true,
  imports: [
    GetStatusPipe,
    NgIf,
    PageNotFoundComponent,
    RouterLink,
    FormatPricePipe
  ],
  templateUrl: './withdrawal.component.html',
  styleUrls: ['../../admin.component.css', '../item-components.css', './withdrawal.component.css']
})
export class WithdrawalComponent {
  private destroy$ = new RxjsSubject<void>();
  nativeUser: NativeUser | null | undefined = undefined;

  withdrawalId: string | undefined;
  withdrawal: Withdrawal | undefined;

  errorMessage: string = "";
  isLoading: boolean = false;

  constructor(protected authenticationService: AuthenticationService, protected db: DatabaseService,
              private contextMenuService: ContextMenuService, private route: ActivatedRoute,
              private dialogsService: DialogsService) { }

  async ngOnInit() {
    this.authenticationService.getNativeUser().pipe(takeUntil(this.destroy$)).subscribe(async (nativeUser: NativeUser | null | undefined) => {
      this.nativeUser = nativeUser;

      if (this.nativeUser && [NativeUser.AccountType.ADMIN, NativeUser.AccountType.STAFF].includes(nativeUser?.accountType || '')) {
        await this.setWithdrawal();
      }
    });

    // Set note on route change.
    this.route.paramMap.pipe(skip(1), takeUntil(this.destroy$)).subscribe(async params => {
      if (this.nativeUser) {
        await this.setWithdrawal();
      }
    });
  }

  toggleLogin() {
    this.dialogsService.toggleLogin();
  }

  closeAllDialogs() {
    this.dialogsService.closeAllDialogs();
  }

  async approveOrRejectWithdrawal(approveWithdrawal: boolean) {
    let message;
    let description;
    if (approveWithdrawal) {
      message = "Mark withdrawal as complete";
      description = "Are you sure you want to mark this withdrawal request as complete?";
    } else {
      message = "Reject withdrawal";
      description = "Are you sure you want to reject this withdrawal request?";
    }
    const yesOption = "Yes";
    const noOption = "No";

    this.dialogsService.toggleConfirmationDialog({ message: message, description: description,
      yesOption: yesOption, noOption: noOption });

    this.dialogsService.getConfirmationDialogResult().subscribe({
      next: async (result: boolean) => {
        if (result) {
          try {
            await this.db.updateWithdrawalAdmin(this.withdrawal?._id, { status:
                  approveWithdrawal ? Withdrawal.WithdrawalStatus.COMPLETED : Withdrawal.WithdrawalStatus.REJECTED },
              await this.authenticationService.getUserIdToken());
            this.closeAllDialogs();
          } catch (error: any) {
            this.closeAllDialogs();
            this.dialogsService.displayErrorDialog("Withdrawal could not be updated.", error);
          }
          await this.serveWithdrawal(this.withdrawalId);
        } else {
          this.closeAllDialogs();
        }
      }
    });
  }

  async setWithdrawal() {
    this.withdrawalId = this.route.snapshot.paramMap.get('id') || undefined;

    this.errorMessage = "";
    this.isLoading = true;
    if (this.withdrawalId) {
      try {
        await this.serveWithdrawal(this.withdrawalId);
      } catch (error: any) {
        this.errorMessage = `An error occurred. Reason: ${error?.code || error?.error?.code || error?.message || "UNKNOWN"}.`;
        console.log(error);
      }
    } else {
      this.errorMessage = "`An error occurred. Reason: INVALID_ID.";
    }
    this.isLoading = false;
  }

  async serveWithdrawal(id: string = ""): Promise<void> {
    const response = await this.db.getWithdrawalAdmin(id, await this.authenticationService.getUserIdToken());
    this.withdrawal = response.withdrawal;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected readonly NativeUser = NativeUser;
  protected readonly FormatPricePipe = FormatPricePipe;
  protected readonly Withdrawal = Withdrawal;
}
