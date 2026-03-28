import { Component } from '@angular/core';
import {NgIf, NgOptimizedImage} from "@angular/common";
import {RouterLink} from "@angular/router";
import {takeUntil} from "rxjs/operators";
import {User as NativeUser} from "../models/User";
import {AuthenticationService} from "../authentication.service";
import {Subject as RxjsSubject} from "rxjs/internal/Subject";
import {DialogsService} from "../dialog-components/dialogs.service";

@Component({
  selector: 'app-footer',
  imports: [
    NgOptimizedImage,
    RouterLink,
    NgIf
  ],
  templateUrl: './footer.component.html',
  standalone: true,
  styleUrl: './footer.component.css'
})
export class FooterComponent {
  nativeUser: NativeUser | null | undefined = undefined;

  private destroy$ = new RxjsSubject<void>();

  constructor(protected authenticationService: AuthenticationService, private dialogsService: DialogsService) {}

  async ngOnInit(): Promise<void> {
    this.authenticationService.getNativeUser().pipe(takeUntil(this.destroy$)).subscribe((nativeUser: NativeUser | null) => {
      this.nativeUser = nativeUser;
    });
  }

  closeAllDialogs() {
    this.dialogsService.closeAllDialogs();
  }

  toggleSell() {
    this.dialogsService.toggleSell();
  }

  toggleLogin() {
    this.dialogsService.toggleLogin();
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

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected readonly NativeUser = NativeUser;
}
