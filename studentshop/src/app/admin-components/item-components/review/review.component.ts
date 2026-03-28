import { Component } from '@angular/core';
import {Subject as RxjsSubject} from "rxjs/internal/Subject";
import {User as NativeUser} from "../../../models/User";
import {skip, takeUntil} from "rxjs/operators";
import {Review} from "../../../models/Review";
import {AuthenticationService} from "../../../authentication.service";
import {DatabaseService} from "../../../database.service";
import {ContextMenuService} from "../../../context-menu.service";
import {ActivatedRoute, RouterLink} from "@angular/router";
import {DialogsService} from "../../../dialog-components/dialogs.service";
import {NgIf} from "@angular/common";
import {PageNotFoundComponent} from "../../../page-not-found/page-not-found.component";
import {Note} from "../../../models/Note";

@Component({
  selector: 'app-review',
  standalone: true,
  imports: [
    NgIf,
    PageNotFoundComponent,
    RouterLink
  ],
  templateUrl: './review.component.html',
  styleUrls: ['../../admin.component.css', '../item-components.css', './review.component.css']
})
export class ReviewComponent {
  private destroy$ = new RxjsSubject<void>();
  nativeUser: NativeUser | null | undefined = undefined;

  reviewId: string | undefined;
  review: Review | undefined;

  errorMessage: string = "";
  isLoading: boolean = false;

  constructor(protected authenticationService: AuthenticationService, protected db: DatabaseService,
              private contextMenuService: ContextMenuService, private route: ActivatedRoute,
              private dialogsService: DialogsService) { }

  async ngOnInit() {
    this.authenticationService.getNativeUser().pipe(takeUntil(this.destroy$)).subscribe(async (nativeUser: NativeUser | null | undefined) => {
      this.nativeUser = nativeUser;

      if (this.nativeUser && [NativeUser.AccountType.ADMIN, NativeUser.AccountType.STAFF].includes(nativeUser?.accountType || '')) {
        await this.setReview();
      }
    });

    // Set note on route change.
    this.route.paramMap.pipe(skip(1), takeUntil(this.destroy$)).subscribe(async params => {
      if (this.nativeUser) {
        await this.setReview();
      }
    });
  }

  toggleLogin() {
    this.dialogsService.toggleLogin();
  }

  closeAllDialogs() {
    this.dialogsService.closeAllDialogs();
  }

  async setReview() {
    this.reviewId = this.route.snapshot.paramMap.get('id') || undefined;

    this.errorMessage = "";
    this.isLoading = true;
    if (this.reviewId) {
      try {
        await this.serveReview(this.reviewId);
      } catch (error: any) {
        this.errorMessage = `An error occurred. Reason: ${error?.code || error?.error?.code || error?.message || "UNKNOWN"}.`;
        console.log(error);
      }
    } else {
      this.errorMessage = "`An error occurred. Reason: INVALID_ID.";
    }
    this.isLoading = false;
  }

  async serveReview(id: string = ""): Promise<void> {
    const response = await this.db.getReviewAdmin(id, await this.authenticationService.getUserIdToken());
    this.review = response.review;
  }

  async deleteReview() {
    const message = "Delete review";
    const description = "Are you sure you want to permanently delete this review? This action cannot be undone.";
    const yesOption = "Delete";
    const noOption = "No";

    this.dialogsService.toggleConfirmationDialog({ message: message, description: description,
      yesOption: yesOption, noOption: noOption });

    this.dialogsService.getConfirmationDialogResult().subscribe({
      next: async (result: boolean) => {
        if (result) {
          try {
            await this.db.deleteReviewAdmin(await this.authenticationService.getUserIdToken(),
              this.review?._id);
            this.closeAllDialogs();
          } catch (error: any) {
            this.closeAllDialogs();
            this.dialogsService.displayErrorDialog("Review could not be deleted.", error);
          }
          await this.setReview();
        } else {
          this.closeAllDialogs();
        }
      }
    });
  }

  toggleReviewContextMenu(event: MouseEvent, review?: Review) {
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
            <button class="button no-border fill-width transparent danger">
                <div class="button-text-wrap justify-left"><i class="fi fi-rr-trash icon mini-icon danger"></i>Delete</div>
            </button>
          `,
          function: (() => this.deleteReview())
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
  protected readonly Note = Note;
}
