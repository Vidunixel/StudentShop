import { Component } from '@angular/core';
import {AuthenticationService} from "../../authentication.service";
import {DatabaseService} from "../../database.service";
import {DialogsService} from "../../dialog-components/dialogs.service";
import {Subject} from "rxjs";
import {Transaction} from "../../models/Transaction";
import {GetStatusPipe} from "../../pipes/get-status.pipe";
import {NgIf} from "@angular/common";
import {Note} from "../../models/Note";
import {RouterLink} from "@angular/router";
import {FormatDatePipe} from "../../pipes/format-date.pipe";
import {ContextMenuService} from "../../context-menu.service";
import {takeUntil} from "rxjs/operators";
import {User as NativeUser} from "../../models/User";
import {FormatPricePipe} from "../../pipes/format-price.pipe";
import {GetImageUrlPipe} from "../../pipes/get-image-url.pipe";
import {SanitiseUrlPipe} from "../../pipes/sanitise-url.pipe";

@Component({
  selector: 'app-earnings',
  standalone: true,
  imports: [
    GetStatusPipe,
    NgIf,
    RouterLink,
    FormatPricePipe,
    GetImageUrlPipe,
    SanitiseUrlPipe
  ],
  templateUrl: './earnings.component.html',
  styleUrls: ['../account.component.css', './earnings.component.css']
})
export class EarningsComponent {
  private destroy$ = new Subject<void>();
  nativeUser: NativeUser | null | undefined = undefined;

  transactions: Transaction[] = [];
  sortBy: string = "date-created-desc";

  pitId: string | undefined;

  isLoadMoreEnabled: boolean = false;
  isLoading: boolean = false;
  errorMessage: string = "";

  constructor(protected authenticationService: AuthenticationService, private db: DatabaseService,
              private dialogsService: DialogsService, private contextMenuService: ContextMenuService) { }

  ngOnInit() {
    this.authenticationService.getNativeUser().pipe(takeUntil(this.destroy$)).subscribe(async (nativeUser: NativeUser | null | undefined) => {
      this.nativeUser = nativeUser;
      if (nativeUser) {
        await this.serveTransactions();
      }
    });
  }

  toggleLogin() {
    this.dialogsService.toggleLogin();
  }

  toggleSignup() {
    this.dialogsService.toggleSignup();
  }

  toggleWithdraw() {
    this.dialogsService.toggleWithdraw();
  }

  // Serve transactions.
  async serveTransactions(nextPage: any[] | undefined = undefined) {
    this.isLoading = true;

    try {
      // Provide pitId only if provided alongside nextPage.
      const response = await this.db.getUserTransactions(this.sortBy, nextPage, nextPage != null ? this.pitId : undefined,
        await this.authenticationService.getUserIdToken());

      this.isLoading = false;
      this.errorMessage = "";
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
      console.log(error);
      this.isLoading = false;
      this.errorMessage = "An error occurred. We could not fetch your purchases.";
    }
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

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected readonly Note = Note;
  protected readonly Transaction = Transaction;
  protected readonly Math = Math;
  protected readonly FormatPricePipe = FormatPricePipe;
}
