import { Component } from '@angular/core';
import {Subject as RxjsSubject} from "rxjs/internal/Subject";
import {AuthenticationService} from "../../../authentication.service";
import {DatabaseService} from "../../../database.service";
import {ContextMenuService} from "../../../context-menu.service";
import {ActivatedRoute, RouterLink} from "@angular/router";
import {DialogsService} from "../../../dialog-components/dialogs.service";
import {skip, takeUntil} from "rxjs/operators";
import {User as NativeUser} from "../../../models/User";
import {Transaction} from "../../../models/Transaction";
import {NgIf} from "@angular/common";
import {PageNotFoundComponent} from "../../../page-not-found/page-not-found.component";
import {FormatPricePipe} from "../../../pipes/format-price.pipe";
import {Note} from "../../../models/Note";
import {GetStatusPipe} from "../../../pipes/get-status.pipe";

@Component({
  selector: 'app-transaction',
  standalone: true,
  imports: [
    NgIf,
    PageNotFoundComponent,
    RouterLink,
    FormatPricePipe,
    GetStatusPipe
  ],
  templateUrl: './transaction.component.html',
  styleUrls: ['../../admin.component.css', '../item-components.css', './transaction.component.css']
})
export class TransactionComponent {
  private destroy$ = new RxjsSubject<void>();
  nativeUser: NativeUser | null | undefined = undefined;

  transactionId: string | undefined;
  transaction: Transaction | undefined;

  errorMessage: string = "";
  isLoading: boolean = false;

  constructor(protected authenticationService: AuthenticationService, protected db: DatabaseService,
              private contextMenuService: ContextMenuService, private route: ActivatedRoute,
              private dialogsService: DialogsService) { }

  async ngOnInit() {
    this.authenticationService.getNativeUser().pipe(takeUntil(this.destroy$)).subscribe(async (nativeUser: NativeUser | null | undefined) => {
      this.nativeUser = nativeUser;

      if (this.nativeUser && [NativeUser.AccountType.ADMIN, NativeUser.AccountType.STAFF].includes(nativeUser?.accountType || '')) {
        await this.setTransaction();
      }
    });

    // Set note on route change.
    this.route.paramMap.pipe(skip(1), takeUntil(this.destroy$)).subscribe(async params => {
      if (this.nativeUser) {
        await this.setTransaction();
      }
    });
  }

  toggleLogin() {
    this.dialogsService.toggleLogin();
  }

  closeAllDialogs() {
    this.dialogsService.closeAllDialogs();
  }

  async setTransaction() {
    this.transactionId = this.route.snapshot.paramMap.get('id') || undefined;

    this.errorMessage = "";
    this.isLoading = true;
    if (this.transactionId) {
      try {
        await this.serveTransaction(this.transactionId);
      } catch (error: any) {
        this.errorMessage = `An error occurred. Reason: ${error?.code || error?.error?.code || error?.message || "UNKNOWN"}.`;
        console.log(error);
      }
    } else {
      this.errorMessage = "`An error occurred. Reason: INVALID_ID.";
    }
    this.isLoading = false;
  }

  async serveTransaction(id: string = ""): Promise<void> {
    const response = await this.db.getTransactionAdmin(id, await this.authenticationService.getUserIdToken());
    this.transaction = response.transaction;
  }

  canStatusBeUpdated(fulfilmentDate?: Date): boolean {
    if (fulfilmentDate) {
      // If fulfilmentDate is in the future, after an hour from now, status can be updated.
      const oneHour = 60 * 60 * 1000;
      if (new Date(fulfilmentDate) > new Date(Date.now() + oneHour)) {
        return true;
      }
    }
    return false
  }

  async placeInPendingOrRejectSaleTransaction(placeInPending: boolean) {
    let message;
    let description;
    if (placeInPending) {
      message = "Place transaction in pending";
      description = "Are you sure you want to place this transaction in pending?";
    } else {
      message = "Reject transaction";
      description = "Are you sure you want to reject this transaction?";
    }
    const yesOption = "Yes";
    const noOption = "No";

    this.dialogsService.toggleConfirmationDialog({ message: message, description: description,
      yesOption: yesOption, noOption: noOption });

    this.dialogsService.getConfirmationDialogResult().subscribe({
      next: async (result: boolean) => {
        if (result) {
          try {
            await this.db.updateSaleTransactionAdmin(this.transaction?._id, { status:
                  placeInPending ? Transaction.TransactionStatus.PENDING : Transaction.TransactionStatus.REJECTED },
              await this.authenticationService.getUserIdToken());
            this.closeAllDialogs();
          } catch (error: any) {
            this.closeAllDialogs();
            this.dialogsService.displayErrorDialog("Transaction could not be updated.", error);
          }
          await this.serveTransaction(this.transactionId);
        } else {
          this.closeAllDialogs();
        }
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected readonly NativeUser = NativeUser;
  protected readonly FormatPricePipe = FormatPricePipe;
  protected readonly Note = Note;
  protected readonly Transaction = Transaction;
}
