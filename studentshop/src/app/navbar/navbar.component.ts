import {
  AfterViewChecked,
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  OnChanges, OnDestroy,
  OnInit,
  QueryList, SimpleChanges,
  ViewChild, ViewChildren
} from '@angular/core';
import {RouterLink, RouterLinkActive} from "@angular/router";
import {NgIf, NgOptimizedImage} from "@angular/common";
import {DialogsService} from "../dialog-components/dialogs.service";
import {AuthenticationService} from "../authentication.service";
import {User as NativeUser} from "../models/User";
import {GetImageUrlPipe} from "../pipes/get-image-url.pipe";
import {ReactiveFormsModule} from "@angular/forms";
import {UserCartService} from "../user-cart.service";
import {AdjustDropdownPositionDirective} from "../adjust-dropdown-position.directive";
import {DatabaseService} from "../database.service";
import {Note} from "../models/Note";
import {takeUntil} from "rxjs/operators";
import {Subject as RxjsSubject} from "rxjs";
import {User} from "@angular/fire/auth";
import {FormatPricePipe} from "../pipes/format-price.pipe";

@Component({
  selector: 'app-navbar',
  imports: [
    RouterLink,
    RouterLinkActive,
    NgOptimizedImage,
    NgIf,
    GetImageUrlPipe,
    ReactiveFormsModule,
    AdjustDropdownPositionDirective,
    FormatPricePipe
  ],
  templateUrl: './navbar.component.html',
  standalone: true,
  styleUrl: './navbar.component.css'
})
export class NavbarComponent implements OnInit, OnDestroy {
  @ViewChild('navbar') navbar: ElementRef | undefined;
  @ViewChild('hamburger') hamburger: ElementRef | undefined;
  @ViewChild('navOverlay') navOverlay: ElementRef | undefined;
  @ViewChild('navMenu') navMenu: ElementRef | undefined;
  @ViewChild('navMiddle') navMiddle: ElementRef | undefined;

  @ViewChild('userDropdown') userDropdown: ElementRef | undefined;
  @ViewChild('cartDropdown') cartDropdown: ElementRef | undefined;

  private destroy$ = new RxjsSubject<void>();

  isMenuOpen: boolean = false;
  isUserDropdownVisible: boolean = false;
  isCartDropdownVisible: boolean = false;

  nativeUser: NativeUser | null | undefined = undefined;
  user: User | null | undefined = undefined;

  isEmailVerified: boolean = false;

  detailedCart: Note[] = [];

  constructor(private db: DatabaseService, private dialogsService: DialogsService, protected authenticationService: AuthenticationService,
              private userCartService: UserCartService) { }

  async ngOnInit(): Promise<void> {
    this.authenticationService.getNativeUser().pipe(takeUntil(this.destroy$)).subscribe((nativeUser: NativeUser | null) => {
      this.nativeUser = nativeUser;
    });
    this.authenticationService.getUser().pipe(takeUntil(this.destroy$)).subscribe((user: User | null) => {
      this.user = user;
      this.isEmailVerified = !!user?.emailVerified;
    });
    this.userCartService.getDetailedCart().pipe(takeUntil(this.destroy$)).subscribe((detailedCart: Note[]) => {
      this.detailedCart = detailedCart;
    });
  }

  removeCartItem(detailedItem: Note, _index: string, _id?: string): void {
    const message = "Remove item from bag?";
    const description = detailedItem.title;
    const yesOption = "Yes";
    const noOption = "No";

    this.dialogsService.toggleConfirmationDialog({ message: message, description: description,
      yesOption: yesOption, noOption: noOption });

    this.dialogsService.getConfirmationDialogResult().subscribe({
      next: async (result: boolean) => {
        if (result) {
          _id ? await this.userCartService.removeCartItem({_index, _id}) : undefined;
          this.closeAllDialogs();
        } else {
          this.closeAllDialogs();
        }
      }
    })
  }

  getCartSubtotal(): number {
    return this.userCartService.getCartSubtotal();
  }

  toggleSell() {
    this.dialogsService.toggleSell();
  }

  toggleLogin(): void {
    this.dialogsService.toggleLogin();
  }

  toggleUserDropdown(condition: boolean): void {
    this.isUserDropdownVisible = condition;
  }

  toggleCartDropdown(condition: boolean): void {
    this.isCartDropdownVisible = condition;
  }

  closeAllDialogs() {
    this.dialogsService.closeAllDialogs();
  }

  async refreshUserIdToken(){
    await this.authenticationService.refreshUserIdToken();
  }

  logout() {
    const message = "Log out";
    const description = "Are you sure you want to log out?";
    const yesOption = "Yes";
    const noOption = "No";

    this.dialogsService.toggleConfirmationDialog({ message, description,
      yesOption, noOption });

    this.dialogsService.getConfirmationDialogResult().subscribe({
      next: (result: boolean) => {
        if (result) {
          this.authenticationService.logout()
            .then(() => this.closeAllDialogs());
        } else {
          this.closeAllDialogs();
        }
      }
    })
  }

  // Add click listeners to all links or buttons inside navMenu.
  addCloseOnClicksEvents() {
    const menuItems = this.navbar?.nativeElement.querySelectorAll('a, button');

    // Remove eventListeners before being added again.
    menuItems.forEach((item: HTMLElement) => {
      item.removeEventListener('click', this.closeOnClicks);
    });

    // Add eventListeners.
    menuItems.forEach((item: HTMLElement) => {
      item.addEventListener('click', this.closeOnClicks);
    });
  }

  // Close menu on button clicks.
  closeOnClicks = (event: Event) => {
    if (this.isMenuOpen) {
      this.toggleMenu();
    }
  };

  toggleNav(condition: boolean): void {
    if (this.navOverlay) {
      if (condition) {
        this.hamburger?.nativeElement.classList.add('--open');
        this.navOverlay.nativeElement.style.display = 'block';
        this.navMenu?.nativeElement.classList.add('--open');
        this.navOverlay.nativeElement.appendChild(this.navMenu?.nativeElement);

        const navbarHeight = this.navbar?.nativeElement.offsetHeight;
        const viewportHeight = window.innerHeight;
        this.navOverlay.nativeElement.style.maxHeight = `${viewportHeight - navbarHeight}px`;

        // Disable Scrolling.
        document.body.classList.add('no-scroll');
      } else {
        this.hamburger?.nativeElement.classList.remove('--open');
        this.navOverlay.nativeElement.style.display = 'none';
        this.navMenu?.nativeElement.classList.remove('--open');
        this.navMiddle?.nativeElement.appendChild(this.navMenu?.nativeElement);

        // Enable Scrolling.
        document.body.classList.remove('no-scroll');
      }
    }
  }

  toggleMenu(): void {
    this.addCloseOnClicksEvents();
    this.isMenuOpen = !this.isMenuOpen;
    this.toggleNav(this.isMenuOpen);
  }

  // Close menu on resize
  @HostListener('window:resize', ['$event'])
  onResize(event: Event): void {
    if (this.isMenuOpen) {
      this.isMenuOpen = false;
      this.toggleNav(false);
    }
  }

  // Listen for clicks.
  @HostListener('document:click', ['$event'])
  closeElementsOnClicks(event: Event): void {
    const target: HTMLElement = event.target as HTMLElement;

    // Close menu if clicking outside navMenu.
    const clickedOutsideNavMenu: boolean = !this.navMenu?.nativeElement.contains(target);
    if (this.isMenuOpen && clickedOutsideNavMenu && this.navOverlay?.nativeElement.contains(target)) {
      this.isMenuOpen = false;
      this.toggleNav(false); // Close the menu if clicked outside
    }

    // Close cartDropdown if clicked on a button or link tag, or anywhere outside UserDropdown.
    const clickedOutsideUserDropdown: boolean = !this.userDropdown?.nativeElement.contains(target);
    const clickedOnLinkInUserDropdown: boolean =
      !!(target.closest("a") !== this.userDropdown?.nativeElement &&
        target.closest("a"));
    const clickedOnBtnInUserDropdown: boolean =
      !!(target.closest("button") !== this.userDropdown?.nativeElement &&
        target.closest("button"));

    if (this.isUserDropdownVisible &&
      (clickedOutsideUserDropdown || clickedOnLinkInUserDropdown || clickedOnBtnInUserDropdown)) {
      this.toggleUserDropdown(false);
    }

    // Close cartDropdown if clicked on a button or link tag within cartDropdown, or anywhere outside cartDropdown.
    const clickedOutsideCartDropdown: boolean = !this.cartDropdown?.nativeElement.contains(target);
    const clickedOnLinkInCartDropdown: boolean =
      !!(target.closest("a") !== this.cartDropdown?.nativeElement &&
        target.closest("a"));
    const clickedOnBtnInCartDropdown: boolean =
      !!(target.closest("button") !== this.cartDropdown?.nativeElement &&
        target.closest("button"));

    if (this.isCartDropdownVisible &&
      (clickedOutsideCartDropdown || clickedOnLinkInCartDropdown || clickedOnBtnInCartDropdown)) {
      this.toggleCartDropdown(false);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected readonly Note = Note;
  protected readonly NativeUser = NativeUser;
  protected readonly FormatPricePipe = FormatPricePipe;
}
