import { Component } from '@angular/core';
import {SeoService} from "../../seo.service";
import {RouterLink} from "@angular/router";

@Component({
  selector: 'app-refund-policy',
  standalone: true,
  imports: [
    RouterLink
  ],
  templateUrl: './refund-policy.component.html',
  styleUrls: ['../pages.css', './refund-policy.component.css']
})
export class RefundPolicyComponent {
  constructor(private seo: SeoService) { }

  async ngOnInit() {
    this.setTitleAndMetaTags();
  }

  setTitleAndMetaTags() {
    const titleContent = "Refund Policy";
    const descriptionContent = "Refund Policy: outlines eligibility, return and cancellation rules, processing times, " +
      "any fees, and how to submit a refund request.";

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
