import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild
} from '@angular/core';
import {PageNotFoundComponent} from "../../page-not-found/page-not-found.component";
import {User as NativeUser} from "../../models/User";
import {Subject, Subscription} from "rxjs";
import {filter, skip, takeUntil } from "rxjs/operators";
import {ActivatedRoute, NavigationEnd, Router, RouterLink} from "@angular/router";
import {AuthenticationService} from "../../authentication.service";
import {DatabaseService} from "../../database.service";
import {GetImageUrlPipe} from "../../pipes/get-image-url.pipe";
import {NgClass, NgIf, NgStyle} from "@angular/common";
import {Note} from "../../models/Note";
import {FormatDatePipe} from "../../pipes/format-date.pipe";
import {UserCartService} from "../../user-cart.service";
import {DialogsService} from "../../dialog-components/dialogs.service";
import {FormsModule, NgForm} from "@angular/forms";
import {Review} from "../../models/Review";
import {GetRatingPipe} from "../../pipes/get-rating.pipe";
import {SeoService} from "../../seo.service";
import {FormatPricePipe} from "../../pipes/format-price.pipe";

@Component({
  selector: 'app-user',
  standalone: true,
  imports: [
    PageNotFoundComponent,
    GetImageUrlPipe,
    NgIf,
    FormatDatePipe,
    RouterLink,
    FormsModule,
    GetRatingPipe,
    FormatPricePipe
  ],
  providers: [GetImageUrlPipe],
  templateUrl: './user.component.html',
  styleUrls: ['../item-components.css', './user.component.css']
})
export class UserComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  nativeUser: NativeUser | null | undefined = undefined;

  profile: NativeUser | undefined;
  isError: boolean = false;

  notes: Note[] = [];
  notesSortBy: string = "date-created-desc";
  notesPitId: string | undefined;
  notesIsLoadMoreEnabled: boolean = false;

  nonEmptyRegex: RegExp = /^(?!\s*$).+/;
  isLoading: boolean = false;
  errorMessage: string = "";

  @ViewChild('carousel') carousel: ElementRef<HTMLDivElement> | null = null;
  @ViewChild('carouselBtnLeft') carouselBtnLeft: ElementRef<HTMLDivElement> | null = null;
  @ViewChild('carouselBtnRight') carouselBtnRight: ElementRef<HTMLDivElement> | null = null;

  constructor(private authenticationService: AuthenticationService, private router: Router,
              private route: ActivatedRoute, private db: DatabaseService, private userCartService: UserCartService,
              private dialogsService: DialogsService, private cdr: ChangeDetectorRef,
              private seo: SeoService, private getImageUrl: GetImageUrlPipe) { }

  async ngOnInit(): Promise<void> {
    this.authenticationService.getNativeUser().pipe(takeUntil(this.destroy$)).subscribe(async (nativeUser: NativeUser | null | undefined) => {
      this.nativeUser = nativeUser;
      await this.setProfile();
      this.setTitleAndMetaTags();
    });

    // Set user on route change.
    this.route.paramMap.pipe(skip(1), takeUntil(this.destroy$)).subscribe(params => {
      this.setProfile().then(() => this.setTitleAndMetaTags());
    });
  }

  setTitleAndMetaTags() {
    const titleContent = `${this.profile?.name}`;
    const descriptionContent = `${this.profile?.bio}`;
    const usernameContent = `${this.profile?.username}`;
    const imageContent = this.getImageUrl.transform(this.profile);

    // Set document title and description.
    this.seo.htmlTitle.setTitle(titleContent);
    this.seo.htmlMeta.updateTag({ name: "description", content: descriptionContent });

    // Open Graph
    this.seo.htmlMeta.updateTag({ property: "og:type", content: "profile" });
    this.seo.htmlMeta.updateTag({ property: "og:title", content: titleContent });
    this.seo.htmlMeta.updateTag({ property: "og:description", content: descriptionContent });
    this.seo.htmlMeta.updateTag({ property: "profile:username", content: usernameContent });
    this.seo.htmlMeta.updateTag({ property: "og:image", content: imageContent });

    // Twitter
    this.seo.htmlMeta.updateTag({ name: "twitter:card", content: "summary" });
    this.seo.htmlMeta.updateTag({ name: "twitter:title", content: titleContent });
    this.seo.htmlMeta.updateTag({ name: "twitter:description", content: descriptionContent });
    this.seo.htmlMeta.updateTag({ name: "twitter:image", content: imageContent });
  }

  toggleEditListing(note: Note): void {
    this.dialogsService.toggleEditListing(note);
  }

  async setProfile() {
    this.isError = false;

    const username: string | undefined = this.route.snapshot.paramMap.get('username') || undefined;

    if (username) {
      try {
        await this.serveProfile(username);
        await this.serveNotes();

        if (this.carousel) {
          this.carousel.nativeElement.addEventListener('scroll', this.setCarouselButtons.bind(this));
        }
      } catch (error: any) {
        console.log(error);
        this.isError = true;
      }
    } else {
      this.isError = true;
    }
  }

  async serveProfile(username: string = ""): Promise<void> {
    const response = await this.db.getProfile(username, await this.authenticationService.getUserIdToken());
    this.profile = response.user;
  }

  async serveNotes(nextPage: any[] | undefined = undefined) {
    try {
      // Provide pitId only if provided alongside nextPage.
      const response = await this.db.getUsersNotes(this.notesSortBy, nextPage,
        nextPage != null ? this.notesPitId : undefined, this.profile?.uid,
        await this.authenticationService.getUserIdToken());

      this.notesPitId = response.pitId;

      // Append response if its nextPage, else assign new response.
      if (nextPage) {
        response.notes.forEach((note: any) => {
          this.notes.push(note);
        });
      } else {
        this.notes = response.notes;
      }

      this.notesIsLoadMoreEnabled = response.isLoadMoreEnabled;
      // Detect changes.
      this.cdr.detectChanges();
      this.setCarouselButtons(); // Update carousel button visibility after getting notes.
    } catch (error: any) {
      console.log(error);
    }
  }

  isItemInCart(_index: string, _id?: string): boolean {
    let returnValue: boolean = false
    returnValue = _id ? this.userCartService.isItemInCart({ _index, _id }) : returnValue;

    return returnValue;
  }

  async addCartItem(_index: string, _id?: string): Promise<void> {
    _id ? await this.userCartService.addCartItem({_index, _id}) : undefined;
  }

  async removeCartItem(_index: string, _id?: string): Promise<void> {
    _id ? await this.userCartService.removeCartItem({_index, _id}) : undefined;
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

        // Load next page if notesIsLoadMoreEnabled.
        if (this.notesIsLoadMoreEnabled) {
          this.serveNotes(this.notes[this.notes.length -1].sort).catch();
        }
      }

      // Update button visibility after scrolling.
      this.setCarouselButtons();
    }
  }

  setCarouselButtons(): void {
    if (this.carousel && this.carouselBtnRight && this.carouselBtnLeft) {
      const carouselElement: HTMLDivElement = this.carousel.nativeElement;
      const carouselBtnRight: HTMLDivElement = this.carouselBtnRight.nativeElement;
      const carouselBtnLeft: HTMLDivElement = this.carouselBtnLeft.nativeElement;

      const buffer: number = 1; // Allow a small buffer for rounding differences.

      // Show the right button if there's more content to scroll to the right or notesIsLoadMoreEnabled.
      if (this.notesIsLoadMoreEnabled ||
        carouselElement.scrollLeft + carouselElement.clientWidth < carouselElement.scrollWidth - buffer) {
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
