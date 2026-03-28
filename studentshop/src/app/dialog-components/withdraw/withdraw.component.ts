import {ChangeDetectorRef, Component} from '@angular/core';
import {FormsModule, NgForm} from "@angular/forms";
import {NgClass, NgIf} from "@angular/common";
import {DialogsService} from "../dialogs.service";
import {AuthenticationService} from "../../authentication.service";
import {Refund} from "../../models/Refund";
import {Transaction} from "../../models/Transaction";
import {takeUntil} from "rxjs/operators";
import {User as NativeUser} from "../../models/User";
import {Subject} from "rxjs";
import {FormatPricePipe} from "../../pipes/format-price.pipe";
import {DatabaseService} from "../../database.service";

@Component({
  selector: 'app-withdraw',
  standalone: true,
  imports: [
    FormsModule,
    NgIf,
    NgClass,
    FormatPricePipe
  ],
  templateUrl: './withdraw.component.html',
  styleUrls: ['../dialog-components.css', './withdraw.component.css']
})
export class WithdrawComponent {
  private destroy$ = new Subject<void>();
  nativeUser: NativeUser | null | undefined = undefined;

  amount: number | undefined;
  recipientType: string = "";
  receiver: string = "";
  isAcceptedTerms: boolean = false;

  receiverInputLabel: string = "";
  receiverInputAutocomplete: string = "";
  receiverInputPlaceholder: string = "";
  receiverInputType: string = "";
  receiverInputPattern: RegExp = /^(?!\s*$).+/;

  amountRegex: RegExp = /^(?!0+(\.0+)?$)(?:\d+(\.\d{1,2})?|\.\d{1,2})$/; // Accepts positive numbers with up to two decimal places.
  emailRegex: RegExp = /^[a-zA-Z0-9.!#$%&’*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
  nonEmptyRegex: RegExp = /^(?!\s*$).+/;
  isLoading: boolean = false;

  errorMessage: string = "";
  successMessage: string = "";
  currentSuccessTimeout: ReturnType<typeof setTimeout> | undefined;

  constructor(private dialogsService: DialogsService, private authenticationService: AuthenticationService,
              private cdr: ChangeDetectorRef, private db: DatabaseService) {}

  ngOnInit() {
    this.authenticationService.getNativeUser().pipe(takeUntil(this.destroy$)).subscribe(async (nativeUser: NativeUser | null | undefined) => {
      this.nativeUser = nativeUser;
    });
  }

  closeAllDialogs() {
    this.dialogsService.closeAllDialogs();
  }

  updateReceiverInput() {
    switch (this.recipientType) {
      case (Transaction.PaypalRecipientType.EMAIL):
        this.receiverInputLabel = "Email";
        this.receiverInputAutocomplete = "email";
        this.receiverInputPlaceholder = "Enter your PayPal email";
        this.receiverInputType = "email";
        this.receiverInputPattern = this.emailRegex;
        break;
      case (Transaction.PaypalRecipientType.PHONE):
        this.receiverInputLabel = "Phone";
        this.receiverInputAutocomplete = "phone";
        this.receiverInputPlaceholder = "Enter your PayPal phone number";
        this.receiverInputType = "text";
        this.receiverInputPattern = this.nonEmptyRegex;
        break;
      default:
        this.receiverInputLabel = "";
        this.receiverInputAutocomplete = "";
        this.receiverInputPlaceholder = "";
        this.receiverInputType = "text";
        this.receiverInputPattern = this.nonEmptyRegex;
    }
  }

  validateAmount(form: NgForm): void {
    if ((this.amount || 0) > (this.nativeUser?.availableBalance || 0)) {
      console.log(this.amount, this.nativeUser?.availableBalance)
      // Add insufficientFunds error.
      form.controls['amount']?.setErrors({
        ...form.controls['amount']?.errors, insufficientFunds: true
      });
    }
  }

  async withdrawBalance(form: NgForm) {
    this.errorMessage = "";
    this.validateAmount(form);
    if (form.valid && !this.isLoading) {
      this.isLoading = true;
      try {
        await this.db.withdrawBalance(await this.authenticationService.getUserIdToken(), this.recipientType,
          this.receiver, this.amount || 0);
        this.displaySuccessMessage("Withdrawal request submitted successfully.");
        this.clearForm(form);
        this.authenticationService.setCurrentNativeUser();
      } catch (error: any) {
        console.log(error);
        this.errorMessage = `*An error occurred. Reason: ${error?.code || error?.error?.code || error?.message || "UNKNOWN"}.`;
      }
      this.isLoading = false;
    }
  }

  clearForm(form: NgForm) {
    form.resetForm({
      amount: undefined,
      recipientType: "",
      receiver: "",
      isAcceptedTerms: ""
    });
  }

  displaySuccessMessage(message: string) {
    this.clearCurrentSuccessTimeout();
    this.successMessage = message;

    this.currentSuccessTimeout = setTimeout(() => {
      this.successMessage = "";
    }, 5000);
  }

  clearCurrentSuccessTimeout() {
    if (this.currentSuccessTimeout) {
      clearTimeout(this.currentSuccessTimeout);
      this.successMessage = "";
      this.cdr.detectChanges();
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected readonly Refund = Refund;
  protected readonly Object = Object;
  protected readonly Transaction = Transaction;
  protected readonly FormatPricePipe = FormatPricePipe;
}
