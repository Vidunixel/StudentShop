import { Component } from '@angular/core';
import {SeoService} from "../../seo.service";
import {RouterLink} from "@angular/router";

@Component({
  selector: 'app-terms-of-service',
  standalone: true,
  imports: [
    RouterLink
  ],
  templateUrl: './terms-of-service.component.html',
  styleUrls: ['../pages.css', './terms-of-service.component.css']
})
export class TermsOfServiceComponent {
  constructor(private seo: SeoService) { }

  async ngOnInit() {
    this.setTitleAndMetaTags();
  }

  setTitleAndMetaTags() {
    const titleContent = "Terms of Service";
    const descriptionContent = "Read our Terms of Service to understand your rights, responsibilities, and the rules for using our platform.";

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
