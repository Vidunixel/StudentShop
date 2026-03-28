import { Pipe, PipeTransform } from '@angular/core';
import {Note} from "../models/Note";
import {Purchase} from "../models/Purchase";
import {Refund} from "../models/Refund";
import {Transaction} from "../models/Transaction";
import {User} from "../models/User";
import {Withdrawal} from "../models/Withdrawal";

@Pipe({
  name: 'getStatus',
  standalone: true
})
export class GetStatusPipe implements PipeTransform {

  transform(document: any): { text: string, textColour: string, backgroundColour: string } {
    if (document instanceof Note) {
      switch (document.status) {
        case (Note.NoteStatus.PROCESSING):
          return { text: "Processing", textColour: "#894b00", backgroundColour: "#fef9c2" };
        case (Note.NoteStatus.PENDING_REVIEW):
          return { text: "Pending", textColour: "#b45309", backgroundColour: "#ffedd5" };
        case (Note.NoteStatus.PROCESSING_ERROR):
          return { text: "Error", textColour: "#b91c1c", backgroundColour: "#fff1f2" };
        case (Note.NoteStatus.DELETED):
          return { text: "Deleted", textColour: "#9f0712", backgroundColour: "#ffe2e2" };
        case (Note.NoteStatus.REJECTED):
          return { text: "Rejected", textColour: "#7c2d12", backgroundColour: "#fff2e8" };
        case (Note.NoteStatus.LISTED):
          return { text: "Listed", textColour: "#016630", backgroundColour: "#dcfce7" };
        case (Note.NoteStatus.DELISTED):
          return { text: "Delisted", textColour: "#1e2939", backgroundColour: "#f6f3f4" };
      }
    } else if (document instanceof Purchase) {
      switch (document.displayStatus || document.status) {
        case (Purchase.DisplayStatus.PAID):
        case (Purchase.PurchaseStatus.PAID):
          return { text: "Paid", textColour: "#016630", backgroundColour: "#dcfce7" };
        case (Purchase.DisplayStatus.REFUNDED):
          return { text: "Refunded", textColour: "#1e2939", backgroundColour: "#f6f3f4" };
        case (Purchase.DisplayStatus.PENDING_REFUND):
          return { text: "Pending Refund", textColour: "#b45309", backgroundColour: "#ffedd5" };
      }
    } else if (document instanceof Transaction) {
      switch (document.status) {
        case (Transaction.TransactionStatus.PENDING):
          return { text: "Pending", textColour: "#b45309", backgroundColour: "#ffedd5" };
        case (Transaction.TransactionStatus.REJECTED):
          return { text: "Rejected", textColour: "#7c2d12", backgroundColour: "#fff2e8" };
        case (Transaction.TransactionStatus.COMPLETED):
          return { text: "Completed", textColour: "#016630", backgroundColour: "#dcfce7" };
      }
    } else if (document instanceof Refund) {
      switch (document.status) {
        case (Refund.RefundStatus.AWAITING_APPROVAL):
          return { text: "Awaiting Approval", textColour: "#b45309", backgroundColour: "#ffedd5" };
        case (Refund.RefundStatus.REJECTED):
          return { text: "Rejected", textColour: "#7c2d12", backgroundColour: "#fff2e8" };
        case (Refund.RefundStatus.COMPLETED):
          return { text: "Completed", textColour: "#016630", backgroundColour: "#dcfce7" };
      }
    } else if (document instanceof Withdrawal) {
      switch (document.status) {
        case (Withdrawal.WithdrawalStatus.AWAITING_APPROVAL):
          return { text: "Awaiting Approval", textColour: "#b45309", backgroundColour: "#ffedd5" };
        case (Withdrawal.WithdrawalStatus.REJECTED):
          return { text: "Rejected", textColour: "#7c2d12", backgroundColour: "#fff2e8" };
        case (Withdrawal.WithdrawalStatus.COMPLETED):
          return { text: "Completed", textColour: "#016630", backgroundColour: "#dcfce7" };
      }
    }

    return { text: "", textColour: "#1e2939", backgroundColour: "#f6f3f4" };
  }
}
