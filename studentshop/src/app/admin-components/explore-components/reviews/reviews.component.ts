import {ChangeDetectorRef, Component} from '@angular/core';
import {FormsModule, NgForm} from "@angular/forms";
import {NgIf} from "@angular/common";
import {Subject as RxjsSubject} from "rxjs/internal/Subject";
import {User as NativeUser} from "../../../models/User";
import {AuthenticationService} from "../../../authentication.service";
import {DialogsService} from "../../../dialog-components/dialogs.service";
import {takeUntil} from "rxjs/operators";
import {Router, RouterLink} from "@angular/router";
import {Review} from "../../../models/Review";
import {DatabaseService} from "../../../database.service";
import {Note} from "../../../models/Note";
import {ContextMenuService} from "../../../context-menu.service";

@Component({
  selector: 'app-reviews',
  standalone: true,
  imports: [
    FormsModule,
    NgIf,
    RouterLink
  ],
  templateUrl: './reviews.component.html',
  styleUrls: ['../../admin.component.css', '../explore-components.css', './reviews.component.css']
})
export class ReviewsComponent {
  private destroy$ = new RxjsSubject<void>();
  nativeUser: NativeUser | null | undefined = undefined;

  reviews: Review[] = [];

  searchQuery: string = "";
  filters: { isAi?: boolean, rating: number | string, userUid: string,
    _id: string } = { userUid: "", rating: "", _id: "" };
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
        await this.serveReviews();
      }
    });
  }

  toggleLogin() {
    this.dialogsService.toggleLogin();
  }

  async serveReviews(nextPage: any[] | undefined = undefined) {
    this.errorMessage = "";
    this.isLoading = true;
    try {
      // Provide pitId only if provided alongside nextPage.
      const response = await this.db.getReviewsAdmin(this.searchQuery, this.filters, this.sortBy,
        nextPage, nextPage != null ? this.pitId : undefined, await this.authenticationService.getUserIdToken());

      this.pitId = response.pitId;

      // Append response if its nextPage, else assign new response.
      if (nextPage) {
        response.reviews.forEach((review: any) => {
          this.reviews.push(review);
        });
      } else {
        this.reviews = response.reviews;
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
      reviewSearchQuery: "",
      reviewId: "",
      userUid: "",
      rating: "",
      isAi: undefined,
      sortBy: "relevance"
    });
    this.serveReviews().then();
  }

  toggleContextMenu(event: MouseEvent, review: Review) {
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
                    <i class="fi fi-rr-copy-alt icon mini-icon"></i>Review ID
                </div>
            </button>
          `,
          function: (() => navigator.clipboard.writeText(review?._id || "")
            .then(() => alert(`Copied Review ID: ${ review?._id }`)))
        },
        ...(review?.user ? [{
          html: `
            <button class="button no-border fill-width transparent">
                <div class="button-text-wrap justify-left">
                    <i class="fi fi-rr-copy-alt icon mini-icon"></i>User UID
                </div>
            </button>
          `,
          function: (() => navigator.clipboard.writeText(review?.user?.uid || "")
            .then(() => alert(`Copied User UID: ${ review?.user?.uid }`)))
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
  protected readonly Object = Object;
  protected readonly Note = Note;
  protected readonly Number = Number;
}
