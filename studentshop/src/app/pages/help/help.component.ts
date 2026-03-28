import { Component } from '@angular/core';
import {SeoService} from "../../seo.service";
import {NgIf} from "@angular/common";
import {Router, RouterLink} from "@angular/router";
import {DialogsService} from "../../dialog-components/dialogs.service";

@Component({
  selector: 'app-help',
  standalone: true,
  imports: [
    NgIf,
    RouterLink
  ],
  templateUrl: './help.component.html',
  styleUrls: ['../pages.css', './help.component.css']
})
export class HelpComponent {
  constructor(private seo: SeoService, private dialogsService: DialogsService) { }

  async ngOnInit() {
    this.setTitleAndMetaTags();
  }

  setTitleAndMetaTags() {
    const titleContent = "Help";
    const descriptionContent = "Help: FAQs, guides, and support for account, purchases, and downloads.";

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

  toggleLogin() {
    this.dialogsService.toggleLogin();
  }

  toggleSignup() {
    this.dialogsService.toggleSignup();
  }

  toggleSell() {
    this.dialogsService.toggleSell();
  }

  ngOnDestroy(): void {
    this.seo.resetTitleAndMetaTags();
  }
}
