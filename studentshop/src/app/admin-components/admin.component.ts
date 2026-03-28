import { Component } from '@angular/core';
import {RouterLink, RouterLinkActive, RouterOutlet} from "@angular/router";
import {NgIf} from "@angular/common";
import {SeoService} from "../seo.service";

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [
    RouterOutlet,
    NgIf,
    RouterLinkActive,
    RouterLink
  ],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.css'
})
export class AdminComponent {

  constructor(private seo: SeoService) { }

  async ngOnInit() {
    this.setTitleAndMetaTags();
  }

  setTitleAndMetaTags() {
    const titleContent = "Admin";
    const descriptionContent = "Admin dashboard: manage users, notes, refunds, withdrawals and other site operations.";

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

  ngOnDestroy(): void {
    this.seo.resetTitleAndMetaTags();
  }
}
