import { Component } from '@angular/core';
import {NgIf} from "@angular/common";
import {Subject as RxjsSubject} from "rxjs/internal/Subject";
import {skip, takeUntil} from "rxjs/operators";
import {AuthenticationService} from "../../../authentication.service";
import {DatabaseService} from "../../../database.service";
import {ContextMenuService} from "../../../context-menu.service";
import {ActivatedRoute, RouterLink} from "@angular/router";
import {User as NativeUser} from "../../../models/User";
import {DialogsService} from "../../../dialog-components/dialogs.service";
import {GetImageUrlPipe} from "../../../pipes/get-image-url.pipe";
import {FormatPricePipe} from "../../../pipes/format-price.pipe";
import {Note} from "../../../models/Note";
import {Purchase} from "../../../models/Purchase";
import {Review} from "../../../models/Review";
import {GetStatusPipe} from "../../../pipes/get-status.pipe";
import {FormsModule} from "@angular/forms";
import {Transaction} from "../../../models/Transaction";
import {PageNotFoundComponent} from "../../../page-not-found/page-not-found.component";

@Component({
  selector: 'app-user',
  standalone: true,
  imports: [
    NgIf,
    GetImageUrlPipe,
    FormatPricePipe,
    RouterLink,
    GetStatusPipe,
    FormsModule,
    PageNotFoundComponent
  ],
  templateUrl: './user.component.html',
  styleUrls: ['../../admin.component.css', '../item-components.css', './user.component.css']
})
export class UserComponent {
  private destroy$ = new RxjsSubject<void>();
  nativeUser: NativeUser | null | undefined = undefined;

  userUid: string | undefined;
  user: NativeUser | undefined;

  purchases: Purchase[] = [];
  purchasesSortBy: string = "date-created-desc";
  purchasesPitId: string | undefined;
  purchasesIsLoadMoreEnabled: boolean = false;

  transactions: Transaction[] = [];
  transactionsSortBy: string = "date-created-desc";
  transactionsPitId: string | undefined;
  transactionsIsLoadMoreEnabled: boolean = false;

  errorMessage: string = "";
  isLoading: boolean = false;

  constructor(protected authenticationService: AuthenticationService, protected db: DatabaseService,
              private contextMenuService: ContextMenuService, private route: ActivatedRoute,
              private dialogsService: DialogsService) { }

  async ngOnInit() {
    this.authenticationService.getNativeUser().pipe(takeUntil(this.destroy$)).subscribe(async (nativeUser: NativeUser | null | undefined) => {
      this.nativeUser = nativeUser;

      if (this.nativeUser && [NativeUser.AccountType.ADMIN, NativeUser.AccountType.STAFF].includes(nativeUser?.accountType || '')) {
        await this.setUser();
      }
    });

    // Set note on route change.
    this.route.paramMap.pipe(skip(1), takeUntil(this.destroy$)).subscribe(async params => {
      if (this.nativeUser) {
        await this.setUser();
      }
    });
  }

  toggleLogin() {
    this.dialogsService.toggleLogin();
  }

  toggleEditUserAdmin() {
    this.dialogsService.toggleEditUserAdmin(this.user);
  }

  async setUser() {
    this.userUid = this.route.snapshot.paramMap.get('uid') || undefined;

    this.errorMessage = "";
    this.isLoading = true;
    if (this.userUid) {
      try {
        await this.serveUser(this.userUid);
        await this.servePurchases();
        await this.serveTransactions();
      } catch (error: any) {
        this.errorMessage = `An error occurred. Reason: ${error?.code || error?.error?.code || error?.message || "UNKNOWN"}.`;
        console.log(error);
      }
    } else {
      this.errorMessage = "`An error occurred. Reason: INVALID_ID.";
    }
    this.isLoading = false;
  }

  async serveUser(uid: string = ""): Promise<void> {
    const response = await this.db.getUserAdmin(uid, await this.authenticationService.getUserIdToken());
    this.user = response.user;
  }

  async servePurchases(nextPage: any[] | undefined = undefined): Promise<void> {
    const response = await this.db.getUserPurchasesAdmin(this.userUid,
      this.purchasesSortBy, nextPage, nextPage != null ? this.purchasesPitId : undefined,
      await this.authenticationService.getUserIdToken());

    this.purchasesPitId = response.pitId;

    // Append response if its nextPage, else assign new response.
    if (nextPage) {
      response.purchases.forEach((purchase: any) => {
        this.purchases.push(purchase);
      });
    } else {
      this.purchases = response.purchases;
    }

    this.purchasesIsLoadMoreEnabled = response.purchasesIsLoadMoreEnabled;
  }

  async serveTransactions(nextPage: any[] | undefined = undefined): Promise<void> {
    const response = await this.db.getUserTransactionsAdmin(this.userUid,
      this.transactionsSortBy, nextPage, nextPage != null ? this.transactionsPitId : undefined,
      await this.authenticationService.getUserIdToken());

    this.transactionsPitId = response.pitId;

    // Append response if its nextPage, else assign new response.
    if (nextPage) {
      response.transactions.forEach((transaction: any) => {
        this.transactions.push(transaction);
      });
    } else {
      this.transactions = response.transactions;
    }

    this.transactionsIsLoadMoreEnabled = response.transactionsIsLoadMoreEnabled;
  }

  togglePurchaseContextMenu(event: MouseEvent, purchase: Purchase) {
    const parentButton = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;

    // Determine if menu corresponding to parentButton is already open. If so do not create new context menu.
    const currentMenuId = this.contextMenuService.currentlyOpenContextMenu?.id ?? null;
    const parentButtonMenuId = parentButton?.id?.split(':')[1] ?? null;
    const isMenuAlreadyOpened = currentMenuId !== null && parentButtonMenuId !== null &&
      currentMenuId === parentButtonMenuId;

    if (parentButton && !isMenuAlreadyOpened) {
      const content = [
        {
          html: `
            <button class="button no-border fill-width transparent">
                <div class="button-text-wrap justify-left">
                    <i class="fi fi-rr-copy-alt icon mini-icon"></i>Purchase ID
                </div>
            </button>
          `,
          function: (() => {
            if (purchase._id) {
              navigator.clipboard.writeText(purchase._id)
                .then(() => alert(`Copied Purchase ID: ${ purchase._id }`));
            }
          })
        },
        ...(purchase.orderId ? [{
          html: `
            <button class="button no-border fill-width transparent">
                <div class="button-text-wrap justify-left">
                    <i class="fi fi-rr-copy-alt icon mini-icon"></i>Order ID
                </div>
            </button>
          `,
          function: (() => navigator.clipboard.writeText(purchase.orderId || "")
            .then(() => alert(`Copied Order ID: ${ purchase.orderId }`)))
        }] : []),
        ...(purchase.refund ? [{
          html: `
            <button class="button no-border fill-width transparent">
                <div class="button-text-wrap justify-left">
                    <i class="fi fi-rr-copy-alt icon mini-icon"></i>Refund ID
                </div>
            </button>
          `,
          function: (() => {
            if (purchase.refund?._id) {
              navigator.clipboard.writeText(purchase.refund?._id)
                .then(() => alert(`Copied Refund ID: ${ purchase.refund?._id }`));
            }
          })
        }] : [])
      ]
      this.contextMenuService.createContextMenu(parentButton, content);
    }
  }

  toggleTransactionContextMenu(event: MouseEvent, transaction: Transaction) {
    const parentButton = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;

    // Determine if menu corresponding to parentButton is already open. If so do not create new context menu.
    const currentMenuId = this.contextMenuService.currentlyOpenContextMenu?.id ?? null;
    const parentButtonMenuId = parentButton?.id?.split(':')[1] ?? null;
    const isMenuAlreadyOpened = currentMenuId !== null && parentButtonMenuId !== null &&
      currentMenuId === parentButtonMenuId;

    if (parentButton && !isMenuAlreadyOpened) {
      const content = [
        {
          html: `
            <button class="button no-border fill-width transparent">
                <div class="button-text-wrap justify-left">
                    <i class="fi fi-rr-copy-alt icon mini-icon"></i>Transaction ID
                </div>
            </button>
          `,
          function: (() => {
            if (transaction._id) {
              navigator.clipboard.writeText(transaction._id)
                .then(() => alert(`Copied Transaction ID: ${ transaction._id }`));
            }
          })
        },
        ...(transaction.info?.purchaseId ? [{
          html: `
            <button class="button no-border fill-width transparent">
                <div class="button-text-wrap justify-left">
                    <i class="fi fi-rr-copy-alt icon mini-icon"></i>Purchase ID
                </div>
            </button>
          `,
          function: (() => navigator.clipboard.writeText(transaction.info?.purchaseId || "")
            .then(() => alert(`Copied Purchase ID: ${ transaction.info?.purchaseId }`)))
        }] : [])
      ]
      this.contextMenuService.createContextMenu(parentButton, content);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected readonly NativeUser = NativeUser;
  protected readonly FormatPricePipe = FormatPricePipe;
  protected readonly Note = Note;
  protected readonly Purchase = Purchase;
  protected readonly Transaction = Transaction;
}
