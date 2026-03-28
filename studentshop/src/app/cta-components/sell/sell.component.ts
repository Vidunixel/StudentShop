import { Component } from '@angular/core';
import {ActivatedRoute, Router} from "@angular/router";
import {Subject as RxjsSubject} from "rxjs/internal/Subject";
import {skip, takeUntil} from "rxjs/operators";
import {User as NativeUser} from "../../models/User";
import {AuthenticationService} from "../../authentication.service";
import {DatabaseService} from "../../database.service";
import {Subject} from "../../models/Subject";
import {DialogsService} from "../../dialog-components/dialogs.service";
import {SeoService} from "../../seo.service";

@Component({
  selector: 'app-sell',
  standalone: true,
  imports: [],
  templateUrl: './sell.component.html',
  styleUrls: ['../cta-components.css', './sell.component.css']
})
export class SellComponent {
  private destroy$ = new RxjsSubject<void>();

  subject: string | undefined;
  region: string | undefined;

  constructor(protected authenticationService: AuthenticationService, protected db: DatabaseService,
              private route: ActivatedRoute, private router: Router, private dialogsService: DialogsService,
              private seo: SeoService) { }

  async ngOnInit() {
    this.authenticationService.getNativeUser().pipe(takeUntil(this.destroy$)).subscribe(async (nativeUser: NativeUser | null | undefined) => {
      this.setSubjectAndRegion();
      this.setTitleAndMetaTags();
    });

    // Set subject on route change.
    this.route.paramMap.pipe(skip(1), takeUntil(this.destroy$)).subscribe(async params => {
      this.setSubjectAndRegion();
      this.setTitleAndMetaTags();
    });
  }

  setTitleAndMetaTags() {
    const titleContent = `Sell your ${this.subject || 'high school'} notes`;
    const descriptionContent = `Sell your ${this.subject || 'high school'} notes and start earning. Upload your
    PDF, set a price, and receive payouts directly to your PayPal account.`;

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

  toggleSignup() {
    this.dialogsService.toggleSignup();
  }

  toggleSell() {
    this.dialogsService.toggleSell();
  }

  navigateToHomeAndToggleSell() {
    this.router.navigate([""])
      .then(status => this.toggleSell());
  }

  setSubjectAndRegion() {
    const subject = this.route.snapshot.paramMap.get("subject")?.toUpperCase() || "";

    if (Object.values(Subject.Certificate).includes(subject)) {
      switch (subject) {
        case "VCE":
          this.region = "Victoria";
          break;
        case "HSC":
          this.region = "New South Wales";
          break;
        case "WACE":
          this.region = "Western Australia";
          break;
        case "QCE":
          this.region = "Queensland";
          break;
        case "SACE":
          this.region = "South Australia";
          break;
        case "TCE":
          this.region = "Tasmania";
          break;
        default:
          this.region = undefined;
          break;
      }
      this.subject = subject;
    } else {
      this.subject = undefined;
      this.region = undefined;
    }
  }

  ngOnDestroy(): void {
    this.seo.resetTitleAndMetaTags();
    this.destroy$.next();
    this.destroy$.complete();
  }
}
