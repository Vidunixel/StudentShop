import {ChangeDetectorRef, Component} from '@angular/core';
import {NgIf} from "@angular/common";
import {User as NativeUser} from "../../../models/User";
import {Subject as RxjsSubject} from "rxjs/internal/Subject";
import {skip, takeUntil} from "rxjs/operators";
import {AuthenticationService} from "../../../authentication.service";
import {DatabaseService} from "../../../database.service";
import {ContextMenuService} from "../../../context-menu.service";
import {DialogsService} from "../../../dialog-components/dialogs.service";
import {ActivatedRoute, Router, RouterLink} from "@angular/router";
import {Note} from "../../../models/Note";
import {FormatPricePipe} from "../../../pipes/format-price.pipe";
import {GetStatusPipe} from "../../../pipes/get-status.pipe";
import {GetImageUrlPipe} from "../../../pipes/get-image-url.pipe";
import {SanitiseUrlPipe} from "../../../pipes/sanitise-url.pipe";
import {Review} from "../../../models/Review";
import {Transaction} from "../../../models/Transaction";
import {FormsModule, NgForm} from "@angular/forms";
import {GetRatingPipe} from "../../../pipes/get-rating.pipe";
import {PageNotFoundComponent} from "../../../page-not-found/page-not-found.component";

@Component({
  selector: 'app-note',
  standalone: true,
  imports: [
    NgIf,
    FormatPricePipe,
    RouterLink,
    GetStatusPipe,
    GetImageUrlPipe,
    SanitiseUrlPipe,
    FormsModule,
    GetRatingPipe,
    PageNotFoundComponent
  ],
  templateUrl: './note.component.html',
  styleUrls: ['../../admin.component.css', '../item-components.css', './note.component.css']
})
export class NoteComponent {
  private destroy$ = new RxjsSubject<void>();
  nativeUser: NativeUser | null | undefined = undefined;

  noteId: string | undefined;
  note: Note | undefined;
  pdfUrlObject: string | undefined;

  reviews: Review[] = [];
  reviewsSortBy: string = "date-created-desc";
  reviewsPitId: string | undefined;
  reviewsIsLoadMoreEnabled: boolean = false;

  errorMessage: string = "";
  isLoading: boolean = false;

  constructor(protected authenticationService: AuthenticationService, protected db: DatabaseService,
              private contextMenuService: ContextMenuService, private route: ActivatedRoute,
              private dialogsService: DialogsService) { }

  async ngOnInit() {
    this.authenticationService.getNativeUser().pipe(takeUntil(this.destroy$)).subscribe(async (nativeUser: NativeUser | null | undefined) => {
      this.nativeUser = nativeUser;

      if (this.nativeUser && [NativeUser.AccountType.ADMIN, NativeUser.AccountType.STAFF].includes(nativeUser?.accountType || '')) {
        await this.setNote();
      }
    });

    // Set note on route change.
    this.route.paramMap.pipe(skip(1), takeUntil(this.destroy$)).subscribe(async params => {
      if (this.nativeUser) {
        await this.setNote();
      }
    });
  }

  toggleLogin() {
    this.dialogsService.toggleLogin();
  }

  closeAllDialogs() {
    this.dialogsService.closeAllDialogs();
  }

  toggleRejectNoteAdmin() {
    this.dialogsService.toggleRejectNoteAdmin(this.note);
  }

  async setNote() {
    this.noteId = this.route.snapshot.paramMap.get('id') || undefined;

    this.errorMessage = "";
    this.isLoading = true;
    if (this.noteId) {
      try {
        await this.serveNote(this.noteId);
        await this.servePdf(this.noteId);
        await this.serveReviews();
      } catch (error: any) {
        this.errorMessage = `An error occurred. Reason: ${error?.code || error?.error?.code || error?.message || "UNKNOWN"}.`;
        console.log(error);
      }
    } else {
      this.errorMessage = "`An error occurred. Reason: INVALID_ID.";
    }
    this.isLoading = false;
  }

  async serveNote(id: string = ""): Promise<void> {
    const response = await this.db.getNoteAdmin(id, await this.authenticationService.getUserIdToken());
    this.note = response.note;
  }

  async servePdf(id: string = "") {
    const response = await this.db.viewNoteAdmin(id, await this.authenticationService.getUserIdToken());
    this.pdfUrlObject = URL.createObjectURL(response);
  }

  async serveReviews(nextPage: any[] | undefined = undefined): Promise<void> {
    const response = await this.db.getItemReviewsAdmin({ _index: this.note?._index, _id: this.note?._id },
      this.reviewsSortBy, nextPage, nextPage != null ? this.reviewsPitId : undefined,
      await this.authenticationService.getUserIdToken());

    this.reviewsPitId = response.pitId;

    // Append response if its nextPage, else assign new response.
    if (nextPage) {
      response.reviews.forEach((review: any) => {
        this.reviews.push(review);
      });
    } else {
      this.reviews = response.reviews;
    }

    this.reviewsIsLoadMoreEnabled = response.reviewsIsLoadMoreEnabled;
  }

  async approveNote() {
    const message = "Approve listing";
    const description = "Are you sure you want to approve this listing?";
    const yesOption = "Yes";
    const noOption = "No";

    this.dialogsService.toggleConfirmationDialog({ message: message, description: description,
      yesOption: yesOption, noOption: noOption });

    this.dialogsService.getConfirmationDialogResult().subscribe({
      next: async (result: boolean) => {
        if (result) {
          try {
            await this.db.updateNoteAdmin(this.note?._id, { status: Note.NoteStatus.LISTED },
              await this.authenticationService.getUserIdToken());
            this.closeAllDialogs();
          } catch (error: any) {
            this.closeAllDialogs();
            this.dialogsService.displayErrorDialog("Listing could not be updated.", error);
          }
          await this.serveNote(this.noteId);
        } else {
          this.closeAllDialogs();
        }
      }
    });
  }

  async deleteNote() {
    const message = "Delete listing";
    const description = "Are you sure you want to permanently delete this listing? This action cannot be undone.";
    const yesOption = "Delete";
    const noOption = "No";

    this.dialogsService.toggleConfirmationDialog({ message: message, description: description,
      yesOption: yesOption, noOption: noOption });

    this.dialogsService.getConfirmationDialogResult().subscribe({
      next: async (result: boolean) => {
        if (result) {
          try {
            await this.db.deleteNoteAdmin(await this.authenticationService.getUserIdToken(),
              this.note?._id);
            this.closeAllDialogs();
          } catch (error: any) {
            this.closeAllDialogs();
            this.dialogsService.displayErrorDialog("Listing could not be deleted.", error);
          }
          await this.setNote();
        } else {
          this.closeAllDialogs();
        }
      }
    });
  }

  toggleNoteContextMenu(event: MouseEvent, note?: Note) {
    const parentButton = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;

    // Determine if menu corresponding to parentButton is already open. If so do not create new context menu.
    const currentMenuId = this.contextMenuService.currentlyOpenContextMenu?.id ?? null;
    const parentButtonMenuId = parentButton?.id?.split(':')[1] ?? null;
    const isMenuAlreadyOpened = currentMenuId !== null && parentButtonMenuId !== null &&
      currentMenuId === parentButtonMenuId;

    if (parentButton && !isMenuAlreadyOpened) {
      const content = [
        ...(note?.status !== Note.NoteStatus.DELETED ? [{
          html: `
            <button class="button no-border fill-width transparent danger">
                <div class="button-text-wrap justify-left"><i class="fi fi-rr-trash icon mini-icon danger"></i>Delete</div>
            </button>
          `,
          function: (() => this.deleteNote())
        }] : [])
      ]
      this.contextMenuService.createContextMenu(parentButton, content);
    }
  }

  toggleReviewContextMenu(event: MouseEvent, review: Review) {
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
          function: (() => {
            if (review._id) {
              navigator.clipboard.writeText(review._id)
                .then(() => alert(`Copied Review ID: ${ review._id }`));
            }
          })
        },
        ...(!review.isAi ? [{
          html: `
            <button class="button no-border fill-width transparent">
                <div class="button-text-wrap justify-left">
                    <i class="fi fi-rr-copy-alt icon mini-icon"></i>User UID
                </div>
            </button>
          `,
          function: (() => {
            if (review._id) {
              navigator.clipboard.writeText(review.userUid || "")
                .then(() => alert(`Copied User UID: ${ review.userUid }`));
            }
          })
        }] : [])
      ]
      this.contextMenuService.createContextMenu(parentButton, content);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();

    if (this.pdfUrlObject) {
      URL.revokeObjectURL(this.pdfUrlObject);
    }
  }

  protected readonly NativeUser = NativeUser;
  protected readonly FormatPricePipe = FormatPricePipe;
  protected readonly JSON = JSON;
  protected readonly Number = Number;
  protected readonly Transaction = Transaction;
  protected readonly Note = Note;
}
