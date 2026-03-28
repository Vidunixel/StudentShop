import {Component, OnDestroy, OnInit} from '@angular/core';
import {NgIf} from "@angular/common";
import {AuthenticationService} from "../../authentication.service";
import {DialogsService} from "../../dialog-components/dialogs.service";
import {User as NativeUser} from "../../models/User";
import {Note} from "../../models/Note";
import {DatabaseService} from "../../database.service";
import {GetImageUrlPipe} from "../../pipes/get-image-url.pipe";
import {RouterLink} from "@angular/router";
import {FormatDatePipe} from "../../pipes/format-date.pipe";
import {GetStatusPipe} from "../../pipes/get-status.pipe";
import {skip, takeUntil} from "rxjs/operators";
import {Subject} from "rxjs";
import {SocketService} from "../../socket.service";
import {ValidatorService} from "../../validator.service";

@Component({
  selector: 'app-listings',
  standalone: true,
  imports: [
    NgIf,
    GetImageUrlPipe,
    RouterLink,
    FormatDatePipe,
    GetStatusPipe
  ],
  templateUrl: './listings.component.html',
  styleUrls: ['../account.component.css', './listings.component.css']
})
export class ListingsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  nativeUser: NativeUser | null | undefined = undefined;

  notes: Note[] = [];
  notesSortBy: string = "date-created-desc";
  notesPitId: string | undefined;
  notesIsLoadMoreEnabled: boolean = false;

  isLoading: boolean = false;
  errorMessage: string = "";

  constructor(protected authenticationService: AuthenticationService, private db: DatabaseService,
              private dialogsService: DialogsService, private socketService: SocketService) { }

  ngOnInit() {
    this.authenticationService.getNativeUser().pipe(takeUntil(this.destroy$)).subscribe(async (nativeUser: NativeUser | null | undefined) => {
      this.nativeUser = nativeUser;

      if (this.nativeUser) {
        await this.serveNotes();
      }
    });

    this.socketService.onNoteModified().pipe(skip(1), takeUntil(this.destroy$)).subscribe(note => {
      if (note) {
        const noteIndex = this.notes.findIndex((listing: Note) => listing._index === note._index &&
          listing._id === note._id);

        // If there is an instance of modified note in array.
        if (noteIndex !== -1) {
          // If note was deleted, re-serve notes, else update it.
          if (note.status === Note.NoteStatus.DELETED) {
            this.serveNotes().then();
          } else {
            this.notes[noteIndex] = note; // Update note in array.
          }
        } else {
          // If a note is added, re-serve.
          this.serveNotes().then();
        }
      }
    });
  }

  toggleLogin() {
    this.dialogsService.toggleLogin();
  }

  toggleSignup() {
    this.dialogsService.toggleSignup();
  }

  toggleEditListing(editListingData: Note | undefined = undefined) {
    this.dialogsService.toggleEditListing(editListingData);
  }

  // Serve notes.
  async serveNotes(nextPage: any[] | undefined = undefined) {
    this.isLoading = true;

    try {
      // Provide pitId only if provided alongside nextPage.
      const response = await this.db.getUsersNotes(this.notesSortBy, nextPage, nextPage != null ? this.notesPitId : undefined,
        this.nativeUser?.uid, await this.authenticationService.getUserIdToken());

      this.isLoading = false;
      this.errorMessage = "";
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

    } catch (error: any) {
      console.log(error);
      this.isLoading = false;
      this.errorMessage = "An error occurred. We could not fetch your listings.";
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
