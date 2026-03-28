import {ChangeDetectorRef, Component, Input} from '@angular/core';
import {Note} from "../../../models/Note";
import {DialogsService} from "../../dialogs.service";
import {AuthenticationService} from "../../../authentication.service";
import {DatabaseService} from "../../../database.service";
import {FormsModule, NgForm, ReactiveFormsModule} from "@angular/forms";
import {NgClass, NgIf} from "@angular/common";

@Component({
  selector: 'app-reject-note',
  standalone: true,
  imports: [
    FormsModule,
    NgIf,
    ReactiveFormsModule,
    NgClass
  ],
  templateUrl: './reject-note.component.html',
  styleUrls: ['../../dialog-components.css', './reject-note.component.css']
})
export class RejectNoteComponent {
  @Input() rejectNoteAdminData: Note | undefined;

  rejectReason: { flaggedSections: string[], feedback: string } =
    { flaggedSections: [], feedback: "" };

  nonEmptyRegex: RegExp = /^(?!\s*$).+/;

  isLoading: boolean = false;
  errorMessage = "";
  successMessage = "";
  currentSuccessTimeout: ReturnType<typeof setTimeout> | undefined;

  constructor(private dialogsService: DialogsService, private authenticationService: AuthenticationService,
              private cdr: ChangeDetectorRef, private db: DatabaseService) { }

  async ngOnInit() {
    await this.serveNote();
  }

  closeAllDialogs() {
    this.dialogsService.closeAllDialogs();
  }

  toggleLogin(): void {
    this.dialogsService.toggleLogin();
  }

  validateFlaggedSections(form: NgForm): void {
    if (!this.rejectReason.flaggedSections.length) {
      // Add required error.
      form.controls['flaggedSections']?.setErrors({
        ...form.controls['flaggedSections']?.errors, required: true
      });
    }
  }

  async serveNote(): Promise<void> {
    if (this.rejectNoteAdminData) {
      const response = await this.db.getNoteAdmin(this.rejectNoteAdminData._id, await this.authenticationService.getUserIdToken());
      this.rejectNoteAdminData = response.note;

      if (this.rejectNoteAdminData) {
        this.rejectReason = this.rejectNoteAdminData.rejectReason ?? { flaggedSections: [], feedback: "" };
      }
    }
  }

  async updateNote(form: NgForm) {
    this.errorMessage = "";
    this.validateFlaggedSections(form);
    if (form.valid && this.rejectNoteAdminData && !this.isLoading) {
      // Update note.
      this.isLoading = true;
      try {
        await this.db.updateNoteAdmin(this.rejectNoteAdminData._id, {
          status: Note.NoteStatus.REJECTED, rejectReason: this.rejectReason },
          await this.authenticationService.getUserIdToken());
        this.displaySuccessMessage("Note updated successfully.");
        this.clearForm(form);
      } catch (error: any) {
        this.errorMessage = `*An error occurred. Reason: ${error?.code || error?.error?.code || error?.message || "UNKNOWN"}.`;
      }
      this.isLoading = false;
    }
  }

  clearForm(form: NgForm) {
    form.resetForm({
      flaggedSections: "",
      feedback: ""
    });
    this.rejectReason.flaggedSections = [];
  }

  isFlaggedSectionSelected(flaggedSection: string) {
    return !!this.rejectReason?.flaggedSections?.includes(flaggedSection);
  }

  onFlaggedSectionToggle(value: string, event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      if (!this.rejectReason?.flaggedSections.includes(value)) this.rejectReason?.flaggedSections.push(value);
    } else {
      this.rejectReason.flaggedSections = this.rejectReason?.flaggedSections
        .filter(flaggedSection => flaggedSection !== value);
    }
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

  protected readonly Object = Object;
  protected readonly Note = Note;
}
