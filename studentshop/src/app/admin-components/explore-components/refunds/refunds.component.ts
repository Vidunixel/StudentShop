import { Component } from '@angular/core';
import {Subject as RxjsSubject} from "rxjs/internal/Subject";
import {AuthenticationService} from "../../../authentication.service";
import {DialogsService} from "../../../dialog-components/dialogs.service";
import {ContextMenuService} from "../../../context-menu.service";
import {DatabaseService} from "../../../database.service";
import {takeUntil} from "rxjs/operators";
import {FormsModule, NgForm, ReactiveFormsModule} from "@angular/forms";
import {User as NativeUser} from "../../../models/User";
import {NgIf} from "@angular/common";
import {Refund} from "../../../models/Refund";
import {RouterLink} from "@angular/router";
import {Note} from "../../../models/Note";
import {GetStatusPipe} from "../../../pipes/get-status.pipe";

@Component({
  selector: 'app-refunds',
  standalone: true,
  imports: [
    FormsModule,
    NgIf,
    ReactiveFormsModule,
    RouterLink,
    GetStatusPipe
  ],
  templateUrl: './refunds.component.html',
  styleUrls: ['../../admin.component.css', '../explore-components.css', './refunds.component.css']
})
export class RefundsComponent {
  private destroy$ = new RxjsSubject<void>();
  nativeUser: NativeUser | null | undefined = undefined;

  refunds: Refund[] = [];

  searchQuery: string = "";
  filters: { _id: string, purchaseId: string, reasonType: string,
    status: string } = { _id: "", purchaseId: "", reasonType: "", status: "" };
  sortBy: string = "relevance";
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
        await this.serveRefunds();
      }
    });
  }

  toggleLogin() {
    this.dialogsService.toggleLogin();
  }

  async serveRefunds(nextPage: any[] | undefined = undefined) {
    this.errorMessage = "";
    this.isLoading = true;
    try {
      // Provide pitId only if provided alongside nextPage.
      const response = await this.db.getRefundsAdmin(this.searchQuery, this.filters, this.sortBy,
        nextPage, nextPage != null ? this.pitId : undefined, await this.authenticationService.getUserIdToken());

      this.pitId = response.pitId;

      // Append response if its nextPage, else assign new response.
      if (nextPage) {
        response.refunds.forEach((refund: any) => {
          this.refunds.push(refund);
        });
      } else {
        this.refunds = response.refunds;
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
      refundSearchQuery: "",
      refundId: "",
      purchaseId: "",
      reasonType: "",
      status: "",
      sortBy: "relevance"
    });
    this.serveRefunds().then();
  }

  toggleContextMenu(event: MouseEvent, refund: Refund) {
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
          function: (() => navigator.clipboard.writeText(refund?._id || "")
            .then(() => alert(`Copied Refund ID: ${ refund?._id }`)))
        },
        {
          html: `
            <button class="button no-border fill-width transparent">
                <div class="button-text-wrap justify-left">
                    <i class="fi fi-rr-copy-alt icon mini-icon"></i>User UID
                </div>
            </button>
          `,
          function: (() => navigator.clipboard.writeText(refund?.purchase?.user?.uid || "")
            .then(() => alert(`Copied User UID: ${ refund?.purchase?.user?.uid }`)))
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
  protected readonly Refund = Refund;
  protected readonly Note = Note;
}
