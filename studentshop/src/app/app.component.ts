import {AfterViewInit, Component, HostListener, OnInit, ViewChild} from '@angular/core';
import {ActivatedRoute, NavigationEnd, Router, RouterOutlet} from '@angular/router';
import {NavbarComponent} from "./navbar/navbar.component";
import {FooterComponent} from "./footer/footer.component";
import {DialogsService} from "./dialog-components/dialogs.service";
import {DialogOverlayComponent} from "./dialog-components/dialog-overlay/dialog-overlay.component";
import {Auth, User} from "@angular/fire/auth";
import {AuthenticationService} from "./authentication.service";
import {User as NativeUser} from "./models/User";
import {NgIf} from "@angular/common";
import {ContextMenuService} from "./context-menu.service";
import {Note} from "./models/Note";
import {Purchase} from "./models/Purchase";
import {Refund} from "./models/Refund";
import {Review} from "./models/Review";
import {Transaction} from "./models/Transaction";
import {Subject} from "./models/Subject";
import {School} from "./models/School";
import {Withdrawal} from "./models/Withdrawal";

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NavbarComponent, FooterComponent, DialogOverlayComponent, NgIf],
  templateUrl: './app.component.html',
  standalone: true,
  styleUrl: './app.component.css'
})
export class AppComponent implements AfterViewInit, OnInit {
  title = 'studentshop';
  user: User | null = null;
  nativeUser: NativeUser | null | undefined = undefined;

  @ViewChild(DialogOverlayComponent) dialogOverlay!: DialogOverlayComponent;

  constructor(private dialogsService: DialogsService, private authenticationService: AuthenticationService,
              private contextMenuService: ContextMenuService) { }

  async ngOnInit() {
    this.setModelReferences();
    this.authenticationService.getUser().subscribe((user: User | null) => {
      this.user = user;
    });
    this.authenticationService.getNativeUser().subscribe(async (nativeUser: NativeUser | null | undefined) => {
      this.nativeUser = nativeUser;
    });
  }

  ngAfterViewInit(): void {
    this.dialogsService.registerDialogOverlay(this.dialogOverlay);
  }

  setModelReferences() {
    Note.setModelReferences({ User: NativeUser, Subject });
    Purchase.setModelReferences({ User: NativeUser, Note, Refund, Transaction });
    Refund.setModelReferences({ Purchase });
    Review.setModelReferences({ User: NativeUser, Note });
    Transaction.setModelReferences({ User: NativeUser, Note, Withdrawal });
    NativeUser.setModelReferences({ School, Subject });
    Withdrawal.setModelReferences({ Transaction });
  }

  // Close context menu on window resize and clicks.
  @HostListener('document:mousedown', ['$event'])
  @HostListener('document:touchstart', ['$event'])
  closeContextMenuOnClick(event: Event) {
    this.contextMenuService.closeContextMenuOnClicks(event);
  }

  @HostListener('window:resize')
  @HostListener('window:scroll')
  closeContextMenu() {
    this.contextMenuService.destroyContextMenu();
  }
}
