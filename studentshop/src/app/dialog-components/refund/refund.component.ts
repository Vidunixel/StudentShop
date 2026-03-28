import {ChangeDetectorRef, Component, Input} from '@angular/core';
import {FormsModule, NgForm, ReactiveFormsModule} from "@angular/forms";
import {NgClass, NgIf} from "@angular/common";
import {DialogsService} from "../dialogs.service";
import {Refund} from "../../models/Refund";
import {DatabaseService} from "../../database.service";
import {AuthenticationService} from "../../authentication.service";

@Component({
  selector: 'app-refund',
  standalone: true,
  imports: [
    FormsModule,
    NgIf,
    ReactiveFormsModule,
    NgClass
  ],
  templateUrl: './refund.component.html',
  styleUrls: ['../dialog-components.css', './refund.component.css']
})
export class RefundComponent {
  currentPage: number = 1;
  isLoading: boolean = false;

  errorMessage = "";
  successMessage = "";
  currentSuccessTimeout: ReturnType<typeof setTimeout> | undefined;
  nonEmptyRegex: RegExp = /^(?!\s*$).+/;

  @Input() refundData: { id: string; acceptedReasons: string[] } =
    { id: "", acceptedReasons: [] };

  reasonType: string = "";
  reasonDescription: string = "";

  constructor(private dialogsService: DialogsService, private cdr: ChangeDetectorRef,
              private db: DatabaseService, private authenticationService: AuthenticationService) { }

  closeAllDialogs() {
    this.dialogsService.closeAllDialogs();
  }

  async nextPage(form: NgForm) {
    if (form.valid) {
      this.currentPage++;
    }
  }

  previousPage() {
    this.currentPage --;
  }

  async refundItem(form: NgForm) {
    this.errorMessage = "";
    if (form.valid && !this.isLoading) {
      this.isLoading = true;
      try {
        await this.db.refundPurchase(await this.authenticationService.getUserIdToken(), this.refundData.id,
          this.reasonType, this.reasonDescription);
        this.displaySuccessMessage("Refund request submitted successfully.");
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
      reasonType: "",
      reasonDescription: ""
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

  protected readonly Refund = Refund;
  protected readonly Object = Object;
}
