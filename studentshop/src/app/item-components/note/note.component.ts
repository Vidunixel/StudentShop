import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  ViewChild
} from '@angular/core';
import {DatabaseService} from "../../database.service";
import {ActivatedRoute, Router, RouterLink} from "@angular/router";
import {DialogsService} from "../../dialog-components/dialogs.service";
import {Note} from "../../models/Note";
import {GetImageUrlPipe} from "../../pipes/get-image-url.pipe";
import {NgClass, NgIf, NgStyle} from "@angular/common";
import {FormsModule, NgForm, ReactiveFormsModule} from "@angular/forms";
import {UserCartService} from "../../user-cart.service";
import {Subject} from "rxjs";
import {skip, takeUntil} from "rxjs/operators";
import {FormatDatePipe} from "../../pipes/format-date.pipe";
import {AuthenticationService} from "../../authentication.service";
import {User as NativeUser} from "../../models/User";
import {Review} from "../../models/Review";
import {PageNotFoundComponent} from "../../page-not-found/page-not-found.component";
import {NoteViewerComponent} from "../../note-viewer/note-viewer.component";
import {GetRatingPipe} from "../../pipes/get-rating.pipe";
import {SeoService} from "../../seo.service";
import {FormatPricePipe} from "../../pipes/format-price.pipe";

@Component({
  selector: 'app-note',
  imports: [
    GetImageUrlPipe,
    RouterLink,
    NgIf,
    ReactiveFormsModule,
    FormsModule,
    NgStyle,
    FormatDatePipe,
    NgClass,
    PageNotFoundComponent,
    NoteViewerComponent,
    GetRatingPipe,
    FormatPricePipe
  ],
  templateUrl: './note.component.html',
  providers: [GetImageUrlPipe],
  standalone: true,
  styleUrls: ['../item-components.css', './note.component.css']
})
export class NoteComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  nativeUser: NativeUser | null | undefined = undefined;

  isError: boolean = false;
  noteId: string | undefined;
  note: Note | undefined = undefined;
  similarNotes: Note[] = [];

  isEditUserReview: boolean = false; // Toggles the review update view.

  writeReview: string = "";
  writeRating: number | undefined;
  nonEmptyRegex: RegExp = /^(?!\s*$).+/;
  isLoading: boolean = false;

  userReview: Review | undefined;
  reviews: Review[] = [];
  reviewsSortBy: string = "date-created-desc";
  reviewsPitId: string | undefined;
  reviewsIsLoadMoreEnabled: boolean = false;

  @ViewChild('carousel') carousel: ElementRef<HTMLDivElement> | undefined;
  @ViewChild('carouselBtnLeft') carouselBtnLeft: ElementRef<HTMLDivElement> | undefined;
  @ViewChild('carouselBtnRight') carouselBtnRight: ElementRef<HTMLDivElement> | undefined;

  constructor(private db: DatabaseService, private route: ActivatedRoute, private dialogsService: DialogsService,
              private authenticationService: AuthenticationService, private userCartService: UserCartService,
              private cdr: ChangeDetectorRef, private seo: SeoService, private getImageUrl: GetImageUrlPipe) { }

  async ngOnInit(): Promise<void> {
    this.authenticationService.getNativeUser().pipe(takeUntil(this.destroy$)).subscribe(async (nativeUser: NativeUser | null | undefined) => {
      this.nativeUser = nativeUser;
      await this.setNote();
      this.setTitleAndMetaTags();
    });

    // Set note on route change.
    this.route.paramMap.pipe(skip(1), takeUntil(this.destroy$)).subscribe(params => {
      this.setNote().then(() => this.setTitleAndMetaTags());
    });
  }

  setTitleAndMetaTags() {
    const titleContent = `${this.note?.title}`;
    const descriptionContent = `${this.note?.description}`;
    const imageContent = this.getImageUrl.transform(this.note);

    // Set document title and description.
    this.seo.htmlTitle.setTitle(titleContent);
    this.seo.htmlMeta.updateTag({ name: "description", content: descriptionContent });

    // Open Graph
    this.seo.htmlMeta.updateTag({ property: "og:title", content: titleContent });
    this.seo.htmlMeta.updateTag({ property: "og:description", content: descriptionContent });
    this.seo.htmlMeta.updateTag({ property: "og:image", content: imageContent });

    // Twitter
    this.seo.htmlMeta.updateTag({ name: "twitter:card", content: "summary" });
    this.seo.htmlMeta.updateTag({ name: "twitter:title", content: titleContent });
    this.seo.htmlMeta.updateTag({ name: "twitter:description", content: descriptionContent });
    this.seo.htmlMeta.updateTag({ name: "twitter:image", content: imageContent });
  }

  async setNote() {
    this.isEditUserReview = false;
    this.writeRating = undefined;
    this.writeReview = "";
    this.isError = false;

    this.noteId = this.route.snapshot.paramMap.get('id') || undefined;

    if (this.noteId) {
      try {
        await this.serveNote(this.noteId);
        await this.getSimilarNotes();
        await this.serveUserReview();
        await this.serveReviews();

        this.carousel?.nativeElement.addEventListener('scroll', this.setCarouselButtons.bind(this));
      } catch (error: any) {
        console.log(error);
        this.isError = true;
      }
    } else {
      this.isError = true;
    }
  }

  closeAllDialogs() {
    this.dialogsService.closeAllDialogs();
  }

  toggleEditListing(): void {
    this.dialogsService.toggleEditListing(this.note);
  }

  toggleEditUserReview(): void {
    this.isEditUserReview = !this.isEditUserReview;
  }

  isItemInCart(_index?: string, _id?: string): boolean {
    let returnValue: boolean = false;

    if (_index && _id) {
      returnValue = this.userCartService.isItemInCart({ _index, _id });
    }
    return returnValue;
  }

  async addCartItem(_index?: string, _id?: string): Promise<void> {
    if (_index && _id) {
      await this.userCartService.addCartItem({_index, _id});
    }
  }

  async removeCartItem(_index?: string, _id?: string): Promise<void> {
    if (_index && _id) {
      await this.userCartService.removeCartItem({_index, _id});
    }
  }

  toggleReview(reviewData: Review): void {
    this.dialogsService.toggleReview(reviewData);
  }

  scrollCarousel(direction: string) {
    if (this.carousel) {
      const scrollAmount: number = 532;
      const carouselElement: HTMLDivElement = this.carousel.nativeElement;

      if (direction === "left") {
        carouselElement.scrollTo({
          left: carouselElement.scrollLeft - scrollAmount,
          behavior: 'smooth'
        });
      } else {
        carouselElement.scrollTo({
          left: carouselElement.scrollLeft + scrollAmount,
          behavior: 'smooth'
        });
      }

      // Update button visibility after scrolling
      this.setCarouselButtons();
    }
  }

  setCarouselButtons(): void {
    if (this.carousel && this.carouselBtnRight && this.carouselBtnLeft) {
      const carouselElement: HTMLDivElement = this.carousel.nativeElement;
      const carouselBtnRight: HTMLDivElement = this.carouselBtnRight.nativeElement;
      const carouselBtnLeft: HTMLDivElement = this.carouselBtnLeft.nativeElement;

      const buffer: number = 1; // Allow a small buffer for rounding differences.

      // Show the right button if there's more content to scroll to the right.
      if (carouselElement.scrollLeft + carouselElement.clientWidth < carouselElement.scrollWidth - buffer) {
        carouselBtnRight.style.display = "";
      } else {
        carouselBtnRight.style.display = "none";
      }

      // Show the left button if there's more content to scroll to the left.
      if (carouselElement.scrollLeft > buffer) {
        carouselBtnLeft.style.display = "";
      } else {
        carouselBtnLeft.style.display = "none";
      }
    }
  }

  async serveNote(id: string = ""): Promise<void> {
    const response = await this.db.getNote(id, await this.authenticationService.getUserIdToken());
    this.note = response.note;
  }

  async serveReviews(nextPage: any[] | undefined = undefined): Promise<void> {
    try {
      const response = await this.db.getItemReviews({ _index: this.note?._index, _id: this.note?._id },
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
    } catch (error) {
      console.log(error);
    }
  }

  async serveUserReview(): Promise<void> {
    try {
      if (this.nativeUser) {
        const response = await this.db.getItemUserReview({ _index: this.note?._index, _id: this.note?._id },
          await this.authenticationService.getUserIdToken());

        this.userReview = response.review;

        if (response.review) {
          response.review.user = this.nativeUser;
          this.userReview = response.review;

          // Set user review attributes for updating.
          this.writeReview = response.review.review;
          this.writeRating = response.review.rating;
        }
        return;
      }
    } catch (error) {
      console.log(error);
    }
    this.userReview = undefined;
  }

  async addReview(form: NgForm): Promise<void> {
    if (form.valid && !this.isLoading) {
      // Add review.
      this.isLoading = true;
      try {
        const review: Review = new Review({
          rating: Number(this.writeRating),
          review: this.writeReview,
          item: { _index: this.note?._index, _id: this.note?._id }
        });
        await this.db.addReview(await this.authenticationService.getUserIdToken(), review);
        await this.serveNote(this.note?._id);
        await this.serveUserReview();
        this.isEditUserReview = false;
      } catch (error: any) {
        this.dialogsService.displayErrorDialog("Review could not be created.", error);
      }
      this.isLoading = false;
    }
  }

  async updateReview(form: NgForm) {
    if (form.valid && !this.isLoading) {
      // Update review.
      this.isLoading = true;
      try {
        await this.db.updateReview(this.userReview?._id, {
          ...(Number(this.writeRating) !== this.userReview?.rating ? { rating: Number(this.writeRating) } : {}),
          ...(this.writeReview !== this.userReview?.review ? { review: this.writeReview } : {}),
        }, await this.authenticationService.getUserIdToken());
        await this.serveNote(this.note?._id);
        await this.serveUserReview();
        this.isEditUserReview = false;
      } catch (error: any) {
        this.dialogsService.displayErrorDialog("Review could not be updated.", error);
      }
      this.isLoading = false;
    }
  }

  async deleteReview() {
    const message = "Delete review";
    const description = "Are you sure you want to delete this review? This action cannot be undone.";
    const yesOption = "Delete";
    const noOption = "No";

    this.dialogsService.toggleConfirmationDialog({ message: message, description: description,
      yesOption: yesOption, noOption: noOption });

    this.dialogsService.getConfirmationDialogResult().subscribe({
      next: async (result: boolean) => {
        if (result) {
          try {
            await this.db.deleteReview(await this.authenticationService.getUserIdToken(), this.userReview?._id);
            await this.serveNote(this.note?._id);
            this.userReview = undefined;
            this.isEditUserReview = false;
            this.closeAllDialogs();
          } catch (error: any) {
            this.closeAllDialogs();
            this.dialogsService.displayErrorDialog("Review could not be deleted.", error);
          }
        } else {
          this.closeAllDialogs();
        }
      }
    });
  }

  async getSimilarNotes(): Promise<void> {
    if (this.note) {
      try {
        const response = await this.db.getSimilarNotes(this.note);
        this.similarNotes = response.notes;
        // Detect changes.
        this.cdr.detectChanges();
        this.setCarouselButtons(); // Update carousel button visibility after getting similar notes.
      } catch (error) {
        console.log(error);
      }
    }
  }

  @HostListener('window:resize')
  onWindowResize() {
    this.setCarouselButtons();
  }

  ngOnDestroy(): void {
    this.seo.resetTitleAndMetaTags();
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected readonly Note = Note;
  protected readonly FormatPricePipe = FormatPricePipe;
}
