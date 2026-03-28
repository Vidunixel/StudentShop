import {AfterViewInit, Component, OnDestroy, OnInit} from '@angular/core';
import {loadScript, PayPalNamespace} from "@paypal/paypal-js";
import { environment } from "../../environments/environment";
import {DatabaseService} from "../database.service";
import {UserCartService} from "../user-cart.service";
import {GetImageUrlPipe} from "../pipes/get-image-url.pipe";
import {RouterLink} from "@angular/router";
import {DialogsService} from "../dialog-components/dialogs.service";
import {AuthenticationService} from "../authentication.service";
import {User} from "@angular/fire/auth";
import {NgIf, NgStyle} from "@angular/common";
import {FormsModule} from "@angular/forms";
import {Note} from "../models/Note";
import {takeUntil} from "rxjs/operators";
import {Subject} from "rxjs";
import {Purchase} from "../models/Purchase";
import {SeoService} from "../seo.service";
import {FormatPricePipe} from "../pipes/format-price.pipe";
import {Environment} from "../models/common";

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [
    GetImageUrlPipe,
    RouterLink,
    NgStyle,
    NgIf,
    FormsModule,
    FormatPricePipe
  ],
  templateUrl: './checkout.component.html',
  styleUrl: './checkout.component.css'
})
export class CheckoutComponent implements OnInit, AfterViewInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private paypal: PayPalNamespace | null | undefined;
  isEmailVerified: boolean = false;

  detailedCart: Note[] = [];
  successfulConfirmDialogData: { message: string, description: string, yesOption: string } = {
    message: "Purchase Successful",
    description: "Thank you for your purchase! You can find your notes in <strong>Collection</strong>.",
    yesOption: "Okay"
  };

  constructor(private db: DatabaseService, private userCartService: UserCartService, private dialogsService: DialogsService,
              protected authenticationService: AuthenticationService, private seo: SeoService) {}

  ngOnInit() {
    this.authenticationService.getUser().pipe(takeUntil(this.destroy$)).subscribe((user: User | null) => {
      this.isEmailVerified = user?.emailVerified || false;
    });
    this.userCartService.getDetailedCart().subscribe((detailedCart: Note[]) => {
      this.detailedCart = detailedCart;
    });
    this.setTitleAndMetaTags();
  }

  setTitleAndMetaTags() {
    const titleContent = "Checkout";
    const descriptionContent = "Secure checkout: enter payment details, review your order, and receive fast " +
      "confirmation.";

    // Set document title and description.
    this.seo.htmlTitle.setTitle(titleContent);
    this.seo.htmlMeta.updateTag({ name: "description", content: descriptionContent });

    // Open Graph
    this.seo.htmlMeta.updateTag({ property: "og:title", content: titleContent });
    this.seo.htmlMeta.updateTag({ property: "og:description", content: descriptionContent });

    // Twitter
    this.seo.htmlMeta.updateTag({ name: "twitter:title", content: titleContent });
    this.seo.htmlMeta.updateTag({ name: "twitter:description", content: `${descriptionContent}` });
  }

  async ngAfterViewInit(): Promise<void> {
    try {
      this.paypal = await loadScript({
        clientId: environment.paypalClientId,
        currency: "AUD",
        environment: environment.environment === Environment.PRODUCTION ? "production" : "sandbox"
      });

      if (!this.paypal) {
        throw new Error('PayPal SDK could not be loaded.');
      }

      await this.setupPayPalButtons();
    } catch (error) {
      console.log('Error loading PayPal SDK', error);
    }
  }

  closeAllDialogs() {
    this.dialogsService.closeAllDialogs();
  }

  toggleLogin() {
    this.dialogsService.toggleLogin();
  }

  toggleSignup() {
    this.dialogsService.toggleSignup();
  }

  getCartSubtotal(): number {
    return this.userCartService.getCartSubtotal();
  }

  async createFreeOrder() {
    try {
      await this.db.createPurchase(await this.authenticationService.getUserIdToken(),
        this.userCartService.getCart(), Purchase.PaymentMethod.FREE);

      this.dialogsService.toggleConfirmationDialog(this.successfulConfirmDialogData);
      this.dialogsService.getConfirmationDialogResult().subscribe({
        next: async (result: boolean) => {
          this.closeAllDialogs();
          await this.authenticationService.setCurrentNativeUser();
        }
      });
    } catch (error: any) {
      console.log(error);
      this.dialogsService.displayErrorDialog("Transaction could not be completed.", error);
    }
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
    });
  }

  private async setupPayPalButtons(): Promise<void> {
    if (this.paypal?.Buttons) {
      await this.paypal.Buttons({
        style: {
          layout: "vertical",
          color: "blue",
          shape: "pill",
          label: "paypal"
        },
        message: {
            amount: 10,
        },
        createOrder: async () => {
          try {
            const order = await this.db.createPurchase(await this.authenticationService.getUserIdToken(),
              this.userCartService.getCart(), Purchase.PaymentMethod.PAYPAL);
            return order.orderId;
          } catch (error: any) {
            console.log(error);
            this.dialogsService.displayErrorDialog("Transaction could not be completed.", error);
          }
        },
        onApprove: async (data, actions) => {
          try {
            await this.db.capturePurchase(await this.authenticationService.getUserIdToken(), data.orderID);

            this.dialogsService.toggleConfirmationDialog(this.successfulConfirmDialogData);
            this.dialogsService.getConfirmationDialogResult().subscribe({
              next: async (result: boolean) => {
                this.closeAllDialogs();
                await this.authenticationService.setCurrentNativeUser();
              }
            });
          } catch (error: any) {
            console.log(error);
            this.dialogsService.displayErrorDialog("Transaction could not be completed.", error);
          }
        }
      }).render('#paypal-button-container');
    }
  }

  ngOnDestroy(): void {
    this.seo.resetTitleAndMetaTags();
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected readonly Number = Number;
  protected readonly FormatPricePipe = FormatPricePipe;
}
