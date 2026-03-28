import { Component } from '@angular/core';
import {Subject as RxjsSubject} from "rxjs/internal/Subject";
import {AuthenticationService} from "../../../authentication.service";
import {DialogsService} from "../../../dialog-components/dialogs.service";
import {User as NativeUser} from "../../../models/User";
import {takeUntil} from "rxjs/operators";
import {FormsModule, NgForm, ReactiveFormsModule} from "@angular/forms";
import {NgIf} from "@angular/common";
import {Transaction} from "../../../models/Transaction";
import {ContextMenuService} from "../../../context-menu.service";
import {DatabaseService} from "../../../database.service";
import {Note} from "../../../models/Note";
import {RouterLink} from "@angular/router";
import {FormatPricePipe} from "../../../pipes/format-price.pipe";
import {GetStatusPipe} from "../../../pipes/get-status.pipe";

@Component({
  selector: 'app-transactions',
  standalone: true,
  imports: [
    FormsModule,
    NgIf,
    ReactiveFormsModule,
    RouterLink,
    FormatPricePipe,
    GetStatusPipe
  ],
  templateUrl: './transactions.component.html',
  styleUrls: ['../../admin.component.css', '../explore-components.css', './transactions.component.css']
})
export class TransactionsComponent {
  private destroy$ = new RxjsSubject<void>();
  nativeUser: NativeUser | null | undefined = undefined;

  transactions: Transaction[] = [];

  searchQuery: string = "";
  filters: { transactionType: string, userUid: string, purchaseId: string, status: string,
    _id: string } = { userUid: "", transactionType: "", _id: "", purchaseId: "", status: "" };
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
        await this.serveTransactions();
      }
    });
  }

  toggleLogin() {
    this.dialogsService.toggleLogin();
  }

  async serveTransactions(nextPage: any[] | undefined = undefined) {
    this.errorMessage = "";
    this.isLoading = true;
    try {
      // Provide pitId only if provided alongside nextPage.
      const response = await this.db.getTransactionsAdmin(this.searchQuery, this.filters, this.sortBy,
        nextPage, nextPage != null ? this.pitId : undefined, await this.authenticationService.getUserIdToken());

      this.pitId = response.pitId;

      // Append response if its nextPage, else assign new response.
      if (nextPage) {
        response.transactions.forEach((transaction: any) => {
          this.transactions.push(transaction);
        });
      } else {
        this.transactions = response.transactions;
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
      transactionId: "",
      userUid: "",
      purchaseId: "",
      type: "",
      status: "",
      sortBy: "date-created-desc"
    });
    this.serveTransactions().then();
  }

  toggleContextMenu(event: MouseEvent, transaction: Transaction) {
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
          function: (() => navigator.clipboard.writeText(transaction?._id || "")
            .then(() => alert(`Copied Transaction ID: ${ transaction?._id }`)))
        },
        ...(transaction?.user ? [{
          html: `
            <button class="button no-border fill-width transparent">
                <div class="button-text-wrap justify-left">
                    <i class="fi fi-rr-copy-alt icon mini-icon"></i>User UID
                </div>
            </button>
          `,
          function: (() => navigator.clipboard.writeText(transaction?.user?.uid || "")
            .then(() => alert(`Copied User UID: ${ transaction?.user?.uid }`)))
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
  protected readonly Note = Note;
  protected readonly Number = Number;
  protected readonly Object = Object;
  protected readonly Transaction = Transaction;
  protected readonly FormatPricePipe = FormatPricePipe;
}
