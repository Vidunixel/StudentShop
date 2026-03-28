import { Injectable } from '@angular/core';
import {io, Socket} from "socket.io-client";
import {AuthenticationService} from "./authentication.service";
import {User} from "@angular/fire/auth";
import {BehaviorSubject, fromEvent, Observable, of} from "rxjs";
import {User as NativeUser} from "./models/User";
import {Note} from "./models/Note";
import {ValidatorService} from "./validator.service";
import { environment } from "../environments/environment";
import {Environment} from "./models/common";

@Injectable({
  providedIn: 'root'
})
export class SocketService {

  SERVER_URL = environment.environment === Environment.PRODUCTION ? "https://studentshop.com.au" : "http://localhost:8081";
  socket: Socket | undefined;

  noteModified: BehaviorSubject<any> = new BehaviorSubject<any>(null);

  constructor(private authenticationService: AuthenticationService, private validatorService: ValidatorService) {
    this.authenticationService.getUser().pipe().subscribe(async (user: User | null | undefined) => {
      this.disconnect();

      if (user) {
        this.socket = io(this.SERVER_URL, { auth: { token: await this.authenticationService.getUserIdToken() },
          path: "/api/socket.io/",
          transports: ["websocket"] });

        this.socket.on("note:modified", (payload: any) => {
          if (payload) {
            const note = this.validatorService.parseNote(payload);
            this.noteModified.next(note);
          } else {
            this.noteModified.next(null);
          }
        });
      }
    });
  }

  onNoteModified(): Observable<Note | null> {
    return this.noteModified.asObservable();
  }

  disconnect(){
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}
