import { Component } from '@angular/core';
import {AuthenticationService} from "../../authentication.service";
import {DatabaseService} from "../../database.service";
import {DialogsService} from "../../dialog-components/dialogs.service";
import {GetStatusPipe} from "../../pipes/get-status.pipe";
import {Note} from "../../models/Note";
import {Purchase} from "../../models/Purchase";
import {ContextMenuService} from "../../context-menu.service";
import {takeUntil} from "rxjs/operators";
import {User as NativeUser} from "../../models/User";
import {Subject} from "rxjs";
import {NgIf} from "@angular/common";
import {RouterLink} from "@angular/router";
import {Refund} from "../../models/Refund";
import {FormatDatePipe} from "../../pipes/format-date.pipe";
import {FormatPricePipe} from "../../pipes/format-price.pipe";

@Component({
  selector: 'app-payment',
  standalone: true,
  imports: [
    GetStatusPipe,
    NgIf,
    RouterLink,
    FormatPricePipe
  ],
  providers: [FormatDatePipe],
  templateUrl: './purchases.component.html',
  styleUrls: ['../account.component.css', './purchases.component.css']
})
export class PurchasesComponent {
  private destroy$ = new Subject<void>();
  purchases: Purchase[] = [];
  sortBy: string = "date-created-desc";

  pitId: string | undefined;

  isLoadMoreEnabled: boolean = false;
  isLoading: boolean = false;
  errorMessage: string = "";

  constructor(protected authenticationService: AuthenticationService, private db: DatabaseService,
              private dialogsService: DialogsService, private contextMenuService: ContextMenuService,
              private formatDatePipe: FormatDatePipe) { }

  ngOnInit() {
    this.authenticationService.getNativeUser().pipe(takeUntil(this.destroy$)).subscribe(async (nativeUser: NativeUser | null | undefined) => {
      if (nativeUser) {
        await this.servePurchases();
      }
    });
  }

  // Serve purchases.
  async servePurchases(nextPage: any[] | undefined = undefined) {
    this.isLoading = true;

    try {
      // Provide pitId only if provided alongside nextPage.
      const response = await this.db.getUserPurchases(this.sortBy, nextPage, nextPage != null ? this.pitId : undefined,
        await this.authenticationService.getUserIdToken());

      this.isLoading = false;
      this.errorMessage = "";
      this.pitId = response.pitId;

      // Append response if its nextPage, else assign new response.
      if (nextPage) {
        response.purchases.forEach((purchase: any) => {
          this.purchases.push(purchase);
        });
      } else {
        this.purchases = response.purchases;
      }

      this.isLoadMoreEnabled = response.isLoadMoreEnabled;

    } catch (error: any) {
      console.log(error);
      this.isLoading = false;
      this.errorMessage = "An error occurred. We could not fetch your purchases.";
    }
  }

  toggleRefund( id: string, acceptedReasons: string[]) {
    this.dialogsService.toggleRefund({ id, acceptedReasons });
  }

  toggleLogin() {
    this.dialogsService.toggleLogin();
  }

  toggleSignup() {
    this.dialogsService.toggleSignup();
  }

  toggleContextMenu(event: MouseEvent, purchase: Purchase) {
    const parentButton = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;

    // Determine if menu corresponding to parentButton is already open. If so do not create new context menu.
    const currentMenuId = this.contextMenuService.currentlyOpenContextMenu?.id ?? null;
    const parentButtonMenuId = parentButton?.id?.split(':')[1] ?? null;
    const isMenuAlreadyOpened = currentMenuId !== null && parentButtonMenuId !== null &&
      currentMenuId === parentButtonMenuId;

    if (parentButton && !isMenuAlreadyOpened) {
      const content = [
        ...(purchase.isRefundAvailable ? [{
          html: `
            <button class="button no-border fill-width transparent">
                <div class="button-text-wrap justify-left">
                    <i class="fi fi-rr-restock icon mini-icon"></i>Refund
                    <div class="text-fine-print">
                        ${ purchase.refundProperties?.refundExpiryDate ?
            this.formatDatePipe.transform(purchase.refundProperties?.refundExpiryDate, FormatDatePipe.phraseFormat.COUNTDOWN) : "" }
                    </div>
                </div>
            </button>
          `,
          function: (() => {
            if (purchase._id && purchase.detailedItem?.refundPolicy?.acceptedReasons) {
              this.toggleRefund(purchase._id, purchase.detailedItem.refundPolicy.acceptedReasons);
            }
          })
        }] : []),
        ...(purchase.orderId ? [
          {
            html: `
            <button class="button no-border fill-width transparent">
                <div class="button-text-wrap justify-left">
                    <i class="fi fi-rr-copy-alt icon mini-icon"></i>Order ID
                </div>
            </button>
          `,
            function: (() => {
              if (purchase.orderId) {
                navigator.clipboard.writeText(purchase.orderId)
                  .then(() => alert(`Copied Order ID: ${ purchase.orderId }`));
              }
            })
          }
        ] : []),
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
        }
      ]
      this.contextMenuService.createContextMenu(parentButton, content);
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected readonly Note = Note;
  protected readonly Purchase = Purchase;
  protected readonly Refund = Refund;
  protected readonly FormatPricePipe = FormatPricePipe;
}
