import {Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges} from '@angular/core';
import {NgIf, NgOptimizedImage} from "@angular/common";
import {ReactiveFormsModule} from "@angular/forms";
import {DialogsService} from "../dialogs.service";
import {Subject} from "rxjs";

@Component({
  selector: 'app-confirmation-dialog',
  standalone: true,
  imports: [
    NgIf,
    ReactiveFormsModule,
    NgOptimizedImage
  ],
  templateUrl: './confirmation-dialog.component.html',
  styleUrls: ['../dialog-components.css', './confirmation-dialog.component.css']
})
export class ConfirmationDialogComponent implements OnChanges {
  @Input() confirmationDialogData: { message: string, imageUrl?: string, description?: string, yesOption: string,
    noOption?: string } = { message: "", yesOption: "" };

  isLoading: boolean = false;

  constructor(private dialogsService: DialogsService) { }

  ngOnChanges(changes: SimpleChanges) {
    if (changes["confirmationDialogData"]) {
      this.isLoading = false;
    }
  }

  onConfirm(result: boolean): void {
    this.isLoading = true;
    this.dialogsService.emitConfirmationDialogResult(result);
  }
}
