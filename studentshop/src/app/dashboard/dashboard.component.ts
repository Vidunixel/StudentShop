import {ChangeDetectorRef, Component, ElementRef, HostListener, ViewChild} from '@angular/core';
import {RouterLink} from "@angular/router";
import {NgIf, NgOptimizedImage, NgStyle} from "@angular/common";
import {DatabaseService} from "../database.service";
import {DialogsService} from "../dialog-components/dialogs.service";
import {AuthenticationService} from "../authentication.service";
import {UserCartService} from "../user-cart.service";
import {FormatDatePipe} from "../pipes/format-date.pipe";
import {GetImageUrlPipe} from "../pipes/get-image-url.pipe";
import {Note} from "../models/Note";
import {skip, takeUntil} from "rxjs/operators";
import {User as NativeUser} from "../models/User";
import {Subject} from "rxjs";
import {GetRatingPipe} from "../pipes/get-rating.pipe";
import {SanitiseUrlPipe} from "../pipes/sanitise-url.pipe";
import {FormatPricePipe} from "../pipes/format-price.pipe";

@Component({
  selector: 'app-dashboard',
  imports: [
    RouterLink,
    NgOptimizedImage,
    FormatDatePipe,
    GetImageUrlPipe,
    NgIf,
    NgStyle,
    GetRatingPipe,
    SanitiseUrlPipe,
    FormatPricePipe
  ],
  templateUrl: './dashboard.component.html',
  standalone: true,
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent {
  freeNotes: Note[] = [];
  profilesBySales: NativeUser[] = [];

  private destroy$ = new Subject<void>();
  nativeUser: NativeUser | null | undefined = undefined;

  @ViewChild('freeNotesCarousel') freeNotesCarousel: ElementRef<HTMLDivElement> | undefined;
  @ViewChild('freeNotesCarouselBtnLeft') freeNotesCarouselBtnLeft: ElementRef<HTMLButtonElement> | undefined;
  @ViewChild('freeNotesCarouselBtnRight') freeNotesCarouselBtnRight: ElementRef<HTMLButtonElement> | undefined;

  @ViewChild('profilesBySalesCarousel') profilesBySalesCarousel: ElementRef<HTMLDivElement> | undefined;
  @ViewChild('profilesBySalesCarouselBtnLeft') profilesBySalesCarouselBtnLeft: ElementRef<HTMLButtonElement> | undefined;
  @ViewChild('profilesBySalesCarouselBtnRight') profilesBySalesCarouselBtnRight: ElementRef<HTMLButtonElement> | undefined;

  constructor(private db: DatabaseService, private dialogsService: DialogsService, private cdr: ChangeDetectorRef,
              private authenticationService: AuthenticationService, private userCartService: UserCartService) { }

  async ngOnInit(): Promise<void> {
    this.authenticationService.getNativeUser().pipe(takeUntil(this.destroy$)).subscribe(async (nativeUser: NativeUser | null | undefined) => {
      this.nativeUser = nativeUser;
      await this.setFreeNotes();
      await this.setProfilesBySales();
    });
  }

  toggleSell() {
    this.dialogsService.toggleSell();
  }

  toggleEditListing(note: Note): void {
    this.dialogsService.toggleEditListing(note);
  }

  async setFreeNotes() {
    await this.getFreeNotes();
    this.freeNotesCarousel?.nativeElement.addEventListener('scroll',
      this.setCarouselButtons.bind(this, this.freeNotesCarousel?.nativeElement,
        this.freeNotesCarouselBtnLeft?.nativeElement, this.freeNotesCarouselBtnRight?.nativeElement));
  }

  async setProfilesBySales() {
    await this.getProfilesBySales();
    this.profilesBySalesCarousel?.nativeElement.addEventListener('scroll',
      this.setCarouselButtons.bind(this, this.profilesBySalesCarousel?.nativeElement,
        this.profilesBySalesCarouselBtnLeft?.nativeElement, this.profilesBySalesCarouselBtnRight?.nativeElement));
  }

  async getFreeNotes(): Promise<void> {
    try {
      const response = await this.db.getNotes("", { minPrice: 0, maxPrice: 0 }, "relevance",
        undefined, undefined, undefined, await this.authenticationService.getUserIdToken());
      this.freeNotes = response.notes;
      // Detect changes.
      this.cdr.detectChanges();
      // Update carousel button visibility after getting notes.
      this.setCarouselButtons(this.freeNotesCarousel?.nativeElement, this.freeNotesCarouselBtnLeft?.nativeElement,
        this.freeNotesCarouselBtnRight?.nativeElement);
    } catch (error) {
      console.log(error);
    }
  }

  async getProfilesBySales(): Promise<void> {
    try {
      const response = await this.db.getProfilesBySales(await this.authenticationService.getUserIdToken());
      this.profilesBySales = response.users;
      // Detect changes.
      this.cdr.detectChanges();
      // Update carousel button visibility after getting notes.
      this.setCarouselButtons(this.profilesBySalesCarousel?.nativeElement, this.profilesBySalesCarouselBtnLeft?.nativeElement,
        this.profilesBySalesCarouselBtnRight?.nativeElement);
    } catch (error) {
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

  scrollCarousel(carousel: HTMLDivElement, carouselBtnLeft: HTMLButtonElement,
                 carouselBtnRight: HTMLButtonElement, direction: string) {
    if (carousel) {
      const scrollAmount: number = 532;

      if (direction === "left") {
        carousel.scrollTo({
          left: carousel.scrollLeft - scrollAmount,
          behavior: 'smooth'
        });
      } else {
        carousel.scrollTo({
          left: carousel.scrollLeft + scrollAmount,
          behavior: 'smooth'
        });
      }

      // Update button visibility after scrolling
      this.setCarouselButtons(carousel, carouselBtnLeft, carouselBtnRight);
    }
  }

  setCarouselButtons(carousel?: HTMLDivElement, carouselBtnLeft?: HTMLButtonElement,
                      carouselBtnRight?: HTMLButtonElement): void {
    if (carousel && carouselBtnRight && carouselBtnLeft) {
      const buffer: number = 1; // Allow a small buffer for rounding differences.

      // Show the left button if there's more content to scroll to the left.
      if (carousel.scrollLeft > buffer) {
        carouselBtnLeft.style.display = "";
      } else {
        carouselBtnLeft.style.display = "none";
      }

      // Show the right button if there's more content to scroll to the right.
      if (carousel.scrollLeft + carousel.clientWidth < carousel.scrollWidth - buffer) {
        carouselBtnRight.style.display = "";
      } else {
        carouselBtnRight.style.display = "none";
      }
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('window:resize')
  onWindowResize() {
    this.setCarouselButtons(this.freeNotesCarousel?.nativeElement, this.freeNotesCarouselBtnLeft?.nativeElement,
      this.freeNotesCarouselBtnRight?.nativeElement);
    this.setCarouselButtons(this.profilesBySalesCarousel?.nativeElement, this.profilesBySalesCarouselBtnLeft?.nativeElement,
      this.profilesBySalesCarouselBtnRight?.nativeElement);
  }

  protected readonly Note = Note;
  protected readonly FormatPricePipe = FormatPricePipe;
}
