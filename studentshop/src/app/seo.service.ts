import { Injectable } from '@angular/core';
import {Meta, Title} from "@angular/platform-browser";

@Injectable({
  providedIn: 'root'
})
export class SeoService {

  constructor(public htmlTitle: Title, public htmlMeta: Meta) { }

  resetTitleAndMetaTags() {
    const titleContent = "StudentShop";
    const descriptionContent = "Buy and sell quality notes for HSC, VCE, SACE, QCE, " +
      "WACE and more. Earn extra cash and browse free and paid notes to ace your exams.";

    // Reset title and meta tags to default.
    this.htmlTitle.setTitle(titleContent);
    this.htmlMeta.updateTag({ name: "description", content: descriptionContent });

    this.htmlMeta.updateTag({ property: "og:type", content: "website" });
    this.htmlMeta.updateTag({ property: "og:title", content: titleContent });
    this.htmlMeta.updateTag({ property: "og:description", content: descriptionContent });
    this.htmlMeta.updateTag({ property: "og:image", content: "https://studentshop.com.au/illustration_students.svg" });

    this.htmlMeta.updateTag({ name: "twitter:card", content: "summary_large_image" });
    this.htmlMeta.updateTag({ name: "twitter:title", content: titleContent });
    this.htmlMeta.updateTag({ name: "twitter:description", content: descriptionContent });
    this.htmlMeta.updateTag({ name: "twitter:image", content: "https://studentshop.com.au/illustration_students.svg" });
  }
}
