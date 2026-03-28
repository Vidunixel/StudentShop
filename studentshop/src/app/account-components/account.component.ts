import {Component, OnInit} from '@angular/core';
import {Router, RouterLink, RouterLinkActive, RouterOutlet} from "@angular/router";
import {AuthenticationService} from "../authentication.service";
import {DialogsService} from "../dialog-components/dialogs.service";
import {NgIf} from "@angular/common";
import {SeoService} from "../seo.service";

@Component({
  selector: 'app-account',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    NgIf
  ],
  templateUrl: './account.component.html',
  standalone: true,
  styleUrl: './account.component.css'
})
export class AccountComponent {

  constructor(protected authenticationService: AuthenticationService, private dialogsService: DialogsService,
              private seo: SeoService) {}

  async ngOnInit() {
    this.setTitleAndMetaTags();
  }

  setTitleAndMetaTags() {
    const titleContent = "Account";
    const descriptionContent = "Manage your account: withdraw earnings, manage listings, update privacy " +
      "settings, and edit your profile.";

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

  closeAllDialogs() {
    this.dialogsService.closeAllDialogs();
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

  toggleLogin(): void {
    this.dialogsService.toggleLogin();
  }

  ngOnDestroy(): void {
    this.seo.resetTitleAndMetaTags();
  }

  protected readonly AuthenticationService = AuthenticationService;
  protected readonly JSON = JSON;
}
