import { Component } from '@angular/core';
import {SeoService} from "../../seo.service";

@Component({
  selector: 'app-privacy-policy',
  standalone: true,
  imports: [],
  templateUrl: './privacy-policy.component.html',
  styleUrls: ['../pages.css', './privacy-policy.component.css']
})
export class PrivacyPolicyComponent {
  constructor(private seo: SeoService) { }

  async ngOnInit() {
    this.setTitleAndMetaTags();
  }

  setTitleAndMetaTags() {
    const titleContent = "Privacy Policy";
    const descriptionContent = "Our Privacy Policy explains what data we collect, how we use it, " +
      "and how to contact us about your privacy.";

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
