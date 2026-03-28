import { Component } from '@angular/core';
import {Subject as RxjsSubject} from "rxjs/internal/Subject";
import {AuthenticationService} from "../../../authentication.service";
import {DatabaseService} from "../../../database.service";
import {ContextMenuService} from "../../../context-menu.service";
import {ActivatedRoute, RouterLink} from "@angular/router";
import {DialogsService} from "../../../dialog-components/dialogs.service";
import {skip, takeUntil} from "rxjs/operators";
import {User as NativeUser} from "../../../models/User";
import {FormatPricePipe} from "../../../pipes/format-price.pipe";
import {GetStatusPipe} from "../../../pipes/get-status.pipe";
import {NgIf} from "@angular/common";
import {PageNotFoundComponent} from "../../../page-not-found/page-not-found.component";
import {Purchase} from "../../../models/Purchase";
import {Note} from "../../../models/Note";
import {FormsModule} from "@angular/forms";
import {Transaction} from "../../../models/Transaction";
import {Refund} from "../../../models/Refund";

@Component({
  selector: 'app-purchase',
  standalone: true,
  imports: [
    FormatPricePipe,
    GetStatusPipe,
    NgIf,
    PageNotFoundComponent,
    RouterLink,
    FormsModule
  ],
  templateUrl: './purchase.component.html',
  styleUrls: ['../../admin.component.css', '../item-components.css', './purchase.component.css']
})
export class PurchaseComponent {
  private destroy$ = new RxjsSubject<void>();
  nativeUser: NativeUser | null | undefined = undefined;

  purchaseId: string | undefined;
  purchase: Purchase | undefined;

  errorMessage: string = "";
  isLoading: boolean = false;

  constructor(protected authenticationService: AuthenticationService, protected db: DatabaseService,
              private contextMenuService: ContextMenuService, private route: ActivatedRoute,
              private dialogsService: DialogsService) { }

  async ngOnInit() {
    this.authenticationService.getNativeUser().pipe(takeUntil(this.destroy$)).subscribe(async (nativeUser: NativeUser | null | undefined) => {
      this.nativeUser = nativeUser;

      if (this.nativeUser && [NativeUser.AccountType.ADMIN, NativeUser.AccountType.STAFF].includes(nativeUser?.accountType || '')) {
        await this.setPurchase();
      }
    });

    // Set note on route change.
    this.route.paramMap.pipe(skip(1), takeUntil(this.destroy$)).subscribe(async params => {
      if (this.nativeUser) {
        await this.setPurchase();
      }
    });
  }

  toggleLogin() {
    this.dialogsService.toggleLogin();
  }

  closeAllDialogs() {
    this.dialogsService.closeAllDialogs();
  }

  async setPurchase() {
    this.purchaseId = this.route.snapshot.paramMap.get('id') || undefined;

    this.errorMessage = "";
    this.isLoading = true;
    if (this.purchaseId) {
      try {
        await this.servePurchase(this.purchaseId);
      } catch (error: any) {
        this.errorMessage = `An error occurred. Reason: ${error?.code || error?.error?.code || error?.message || "UNKNOWN"}.`;
        console.log(error);
      }
    } else {
      this.errorMessage = "`An error occurred. Reason: INVALID_ID.";
    }
    this.isLoading = false;
  }

  async servePurchase(id: string = ""): Promise<void> {
    const response = await this.db.getPurchaseAdmin(id, await this.authenticationService.getUserIdToken());
    this.purchase = response.purchase;
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
        }
      ]
      this.contextMenuService.createContextMenu(parentButton, content);
    }
  }

  toggleRefundContextMenu(event: MouseEvent, refund: Refund | undefined) {
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
                    <i class="fi fi-rr-copy-alt icon mini-icon"></i>Refund ID
                </div>
            </button>
          `,
          function: (() => {
            if (refund?._id) {
              navigator.clipboard.writeText(refund?._id)
                .then(() => alert(`Copied Refund ID: ${ refund?._id }`));
            }
          })
        }
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
  protected readonly Transaction = Transaction;
}
