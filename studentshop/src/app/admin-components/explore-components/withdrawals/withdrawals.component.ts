import { Component } from '@angular/core';
import {Subject as RxjsSubject} from "rxjs/internal/Subject";
import {AuthenticationService} from "../../../authentication.service";
import {DialogsService} from "../../../dialog-components/dialogs.service";
import {ContextMenuService} from "../../../context-menu.service";
import {DatabaseService} from "../../../database.service";
import {takeUntil} from "rxjs/operators";
import {FormsModule, NgForm, ReactiveFormsModule} from "@angular/forms";
import {GetStatusPipe} from "../../../pipes/get-status.pipe";
import {NgIf} from "@angular/common";
import {User as NativeUser} from "../../../models/User";
import {Withdrawal} from "../../../models/Withdrawal";
import {RouterLink} from "@angular/router";
import {FormatPricePipe} from "../../../pipes/format-price.pipe";

@Component({
  selector: 'app-withdrawals',
  standalone: true,
  imports: [
    FormsModule,
    GetStatusPipe,
    NgIf,
    ReactiveFormsModule,
    RouterLink,
    FormatPricePipe
  ],
  templateUrl: './withdrawals.component.html',
  styleUrls: ['../../admin.component.css', '../explore-components.css', './withdrawals.component.css']
})
export class WithdrawalsComponent {
  private destroy$ = new RxjsSubject<void>();
  nativeUser: NativeUser | null | undefined = undefined;

  withdrawals: Withdrawal[] = [];

  searchQuery: string = "";
  filters: { _id: string, transactionId: string, recipientType: string, identifier: string,
    status: string } = { _id: "", transactionId: "", recipientType: "", identifier: "", status: "" };
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
        await this.serveWithdrawals();
      }
    });
  }

  toggleLogin() {
    this.dialogsService.toggleLogin();
  }

  async serveWithdrawals(nextPage: any[] | undefined = undefined) {
    this.errorMessage = "";
    this.isLoading = true;
    try {
      // Provide pitId only if provided alongside nextPage.
      const response = await this.db.getWithdrawalsAdmin(this.searchQuery, this.filters, this.sortBy,
        nextPage, nextPage != null ? this.pitId : undefined, await this.authenticationService.getUserIdToken());

      this.pitId = response.pitId;

      // Append response if its nextPage, else assign new response.
      if (nextPage) {
        response.withdrawals.forEach((refund: any) => {
          this.withdrawals.push(refund);
        });
      } else {
        this.withdrawals = response.withdrawals;
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
      withdrawalId: "",
      transactionId: "",
      recipientType: "",
      identifier: "",
      status: "",
      sortBy: "date-created-desc"
    });
    this.serveWithdrawals().then();
  }

  toggleContextMenu(event: MouseEvent, withdrawal: Withdrawal) {
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
                    <i class="fi fi-rr-copy-alt icon mini-icon"></i>Withdrawal ID
                </div>
            </button>
          `,
          function: (() => navigator.clipboard.writeText(withdrawal?._id || "")
            .then(() => alert(`Copied Withdrawal ID: ${ withdrawal?._id }`)))
        },
        {
          html: `
            <button class="button no-border fill-width transparent">
                <div class="button-text-wrap justify-left">
                    <i class="fi fi-rr-copy-alt icon mini-icon"></i>User UID
                </div>
            </button>
          `,
          function: (() => navigator.clipboard.writeText(withdrawal?.transaction?.userUid || "")
            .then(() => alert(`Copied User UID: ${ withdrawal?.transaction?.userUid }`)))
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
  protected readonly Object = Object;
  protected readonly Withdrawal = Withdrawal;
  protected readonly FormatPricePipe = FormatPricePipe;
}
