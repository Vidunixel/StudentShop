import { Component } from '@angular/core';
import {Subject as RxjsSubject} from "rxjs/internal/Subject";
import {AuthenticationService} from "../../../authentication.service";
import {DialogsService} from "../../../dialog-components/dialogs.service";
import {ContextMenuService} from "../../../context-menu.service";
import {DatabaseService} from "../../../database.service";
import {takeUntil} from "rxjs/operators";
import {FormsModule, NgForm} from "@angular/forms";
import {FormatPricePipe} from "../../../pipes/format-price.pipe";
import {GetStatusPipe} from "../../../pipes/get-status.pipe";
import {NgIf} from "@angular/common";
import {User as NativeUser} from "../../../models/User";
import {Purchase} from "../../../models/Purchase";
import {RouterLink} from "@angular/router";
import {Note} from "../../../models/Note";

@Component({
  selector: 'app-purchases',
  standalone: true,
  imports: [
    FormatPricePipe,
    FormsModule,
    GetStatusPipe,
    NgIf,
    RouterLink
  ],
  templateUrl: './purchases.component.html',
  styleUrls: ['../../admin.component.css', '../explore-components.css', './purchases.component.css']
})
export class PurchasesComponent {
  private destroy$ = new RxjsSubject<void>();
  nativeUser: NativeUser | null | undefined = undefined;

  purchases: Purchase[] = [];

  searchQuery: string = "";
  filters: { _id: string, userUid: string, sellerUid: string, orderId: string, status: string,
    paymentMethod: string } = { _id: "", userUid: "", sellerUid: "", orderId: "", status: "", paymentMethod: "" };
  sortBy: string = "date-created-desc";
  pitId: string | undefined;

  isLoadMoreEnabled: boolean = false;
  isLoading: boolean = false;
  errorMessage: string = "";

  constructor(protected authenticationService: AuthenticationService, private dialogsService: DialogsService,
              private contextMenuService: ContextMenuService, private db: DatabaseService) { }

  async ngOnInit() {
    this.authenticationService.getNativeUser().pipe(takeUntil(this.destroy$)).subscribe(async (nativeUser: NativeUser | null | undefined) => {
      this.nativeUser = nativeUser;

      if (this.nativeUser && [NativeUser.AccountType.ADMIN, NativeUser.AccountType.STAFF].includes(nativeUser?.accountType || '')) {
        await this.servePurchases();
      }
    });
  }

  toggleLogin() {
    this.dialogsService.toggleLogin();
  }

  async servePurchases(nextPage: any[] | undefined = undefined) {
    this.errorMessage = "";
    this.isLoading = true;
    try {
      // Provide pitId only if provided alongside nextPage.
      const response = await this.db.getPurchasesAdmin(this.searchQuery, this.filters, this.sortBy,
        nextPage, nextPage != null ? this.pitId : undefined, await this.authenticationService.getUserIdToken());

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
      this.errorMessage = `An error occurred. Reason: ${error?.code || error?.error?.code || error?.message || "UNKNOWN"}.`;
      console.log(error);
    }
    this.isLoading = false;
  }

  clearForm(form: NgForm) {
    form.resetForm({
      _id: "",
      userUid: "",
      sellerUid: "",
      orderId: "",
      status: "",
      method: "",
      sortBy: "date-created-desc"
    });
    this.servePurchases().then();
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
        {
          html: `
            <button class="button no-border fill-width transparent">
                <div class="button-text-wrap justify-left">
                    <i class="fi fi-rr-copy-alt icon mini-icon"></i>Purchase ID
                </div>
            </button>
          `,
          function: (() => navigator.clipboard.writeText(purchase?._id || "")
            .then(() => alert(`Copied Purchase ID: ${ purchase?._id }`)))
        },
        {
          html: `
            <button class="button no-border fill-width transparent">
                <div class="button-text-wrap justify-left">
                    <i class="fi fi-rr-copy-alt icon mini-icon"></i>User UID
                </div>
            </button>
          `,
          function: (() => navigator.clipboard.writeText(purchase?.user?.uid || "")
            .then(() => alert(`Copied User UID: ${ purchase?.user?.uid }`)))
        },
        {
          html: `
            <button class="button no-border fill-width transparent">
                <div class="button-text-wrap justify-left">
                    <i class="fi fi-rr-copy-alt icon mini-icon"></i>Seller UID
                </div>
            </button>
          `,
          function: (() => navigator.clipboard.writeText(purchase?.user?.uid || "")
            .then(() => alert(`Copied Seller UID: ${ purchase?.user?.uid }`)))
        }
      ]
      this.contextMenuService.createContextMenu(parentButton, content);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected readonly Note = Note;
  protected readonly NativeUser = NativeUser;
  protected readonly FormatPricePipe = FormatPricePipe;
  protected readonly Purchase = Purchase;
  protected readonly Object = Object;
}
