import {ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild} from '@angular/core';
import {Note} from "../../models/Note";
import {DatabaseService} from "../../database.service";
import {FormsModule, ReactiveFormsModule} from "@angular/forms";
import {RouterLink} from "@angular/router";
import {GetImageUrlPipe} from "../../pipes/get-image-url.pipe";
import {NgIf} from "@angular/common";
import {Subject} from "../../models/Subject";
import {AuthenticationService} from "../../authentication.service";
import {User as NativeUser} from "../../models/User";
import {UserCartService} from "../../user-cart.service";
import {FormatDatePipe} from "../../pipes/format-date.pipe";
import {Subject as RxjsSubject} from "rxjs";
import {DialogsService} from "../../dialog-components/dialogs.service";
import {takeUntil} from "rxjs/operators";
import {GetRatingPipe} from "../../pipes/get-rating.pipe";
import {SeoService} from "../../seo.service";
import {FormatPricePipe} from "../../pipes/format-price.pipe";

@Component({
  selector: 'app-notes',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    GetImageUrlPipe,
    NgIf,
    FormatDatePipe,
    GetRatingPipe,
    FormatPricePipe
  ],
  templateUrl: './notes.component.html',
  standalone: true,
  styleUrls: ['../explore-components.css', './notes.component.css']
})
export class NotesComponent implements OnInit, OnDestroy {
  private destroy$ = new RxjsSubject<void>();
  nativeUser: NativeUser | null | undefined = undefined;

  showFilters: boolean = true;
  notes: Note[] = [];

  selectedSubjects: Subject[] = [];

  allCertificates: string[] = [];
  allSubjects: Subject[] = [];

  querySubjects: Subject[] = [];
  subjectSearchQuery: string | undefined;
  isSubjectsAutocompleteVisible: boolean = false;

  searchQuery: string = "";
  filters: { subjectIds: string[], minPrice: number, maxPrice: number } = { subjectIds: [], minPrice: 0, maxPrice: 200 };
  sortBy: string = "relevance";
  pitId: string | undefined;
  inceptionDate: string | undefined;

  isLoadMoreEnabled: boolean = false;
  isLoading: boolean = false;
  errorMessage: string = "";

  @ViewChild("subjectInput") subjectInput: ElementRef | undefined;
  @ViewChild("subjectCombobox") subjectCombobox: ElementRef | undefined;
  @ViewChild("subjectAutocompleteDropdown") subjectAutocompleteDropdown: ElementRef | undefined;

  constructor(private db: DatabaseService, private authenticationService: AuthenticationService,
              private userCartService: UserCartService, private dialogsService: DialogsService,
              private seo: SeoService, private cdr: ChangeDetectorRef) { }

  async ngOnInit() {
    this.authenticationService.getNativeUser().pipe(takeUntil(this.destroy$)).subscribe(async (nativeUser: NativeUser | null | undefined) => {
      this.nativeUser = nativeUser;
      await this.serveAllSubjectsAndCertificates();
      await this.serveSubjects();
      await this.serveNotes();
    });
    this.setTitleAndMetaTags();
  }

  setTitleAndMetaTags() {
    const titleContent = "Notes";
    const descriptionContent = "Browse high school study notes, search, sort and filter by subject, year and popularity.";

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

  validatePriceRange(){
    // Round to two decimal places.
    this.filters.minPrice = Math.round(Number(this.filters.minPrice) * 100) / 100;
    this.filters.maxPrice = Math.round(Number(this.filters.maxPrice) * 100) / 100;

    if (this.filters.minPrice < 0) {
      this.filters.minPrice = 0;
    } else if (this.filters.minPrice > 200) {
      this.filters.minPrice = 200;
    }

    if (this.filters.maxPrice < 0) {
      this.filters.maxPrice = 0;
    } else if (this.filters.maxPrice > 200) {
      this.filters.maxPrice = 200;
    }

    if (this.filters.minPrice > this.filters.maxPrice) {
      this.filters.minPrice = this.filters.maxPrice;
    }
  }

  // Serve notes.
  async serveNotes(nextPage: any[] | undefined = undefined) {
    this.errorMessage = "";
    this.isLoading = true;
    try {
      // Validate price filters.
      this.validatePriceRange();

      // Set filters.subjectIds to an array of subjectIds.
      this.filters.subjectIds = this.selectedSubjects.map(subject => subject._id || '');

      // Provide pitId only if provided alongside nextPage.
      const response = await this.db.getNotes(this.searchQuery, this.filters, this.sortBy,
        nextPage, nextPage != null ? this.pitId : undefined, nextPage != null ? this.inceptionDate : undefined,
        await this.authenticationService.getUserIdToken());

      this.pitId = response.pitId;
      this.inceptionDate = response.inceptionDate;

      // Append response if its nextPage, else assign new response.
      if (nextPage) {
        response.notes.forEach((note: any) => {
          this.notes.push(note);
        });
      } else {
        this.notes = response.notes;
      }

      this.isLoadMoreEnabled = response.isLoadMoreEnabled;

    } catch (error: any) {
      this.errorMessage = error.message;

      // Navigate to top to display error.
      window.scrollTo({top: 0, behavior: "smooth"});
      console.log(error);
    }
    this.isLoading = false;
  }

  isItemInCart(_index: string, _id?: string): boolean {
    let returnValue: boolean = false
    returnValue = _id ? this.userCartService.isItemInCart({ _index, _id }) : returnValue;

    return returnValue;
  }

  async addCartItem(_index: string, _id?: string): Promise<void> {
    _id ? await this.userCartService.addCartItem({_index, _id}) : undefined;
  }

  async removeCartItem(_index: string, _id?: string): Promise<void> {
    _id ? await this.userCartService.removeCartItem({_index, _id}) : undefined;
  }

  toggleEditListing(note: Note): void {
    this.dialogsService.toggleEditListing(note);
  }

  toggleShowFilters() {
    this.showFilters = !this.showFilters;
  }

  // Add subject to selected list.
  async addSelectedSubject(subject: Subject, maxLength = 10000): Promise<void> {
    // Maximum of 10000 selected subjects.
    if (this.selectedSubjects.length < maxLength) {
      this.selectedSubjects.push(subject);
      this.subjectSearchQuery = "";

      // If the maxLength is reached hide autocompleteDropdown, else focus on combobox input.
      if (this.selectedSubjects.length === maxLength) {
        this.isSubjectsAutocompleteVisible = false;
      } else {
        this.subjectInput?.nativeElement.focus();
      }

      await this.serveSubjects();
      await this.serveNotes();
    }
  }

  // Remove subject from selected list.
  async removeSelectedSubject(subject: Subject): Promise<void> {
    this.selectedSubjects.splice(this.selectedSubjects.findIndex(selectedSubject =>
        selectedSubject._id === subject._id), 1);

    this.cdr.detectChanges();
    this.subjectInput?.nativeElement.focus();

    await this.serveNotes();
  }

  // It at least one subject of a certificate is selected?
  isSubjectOfCertificateSelected(certificate: string) {
    if (this.selectedSubjects.length) {
      return this.selectedSubjects.some((subject) => subject.certificate === certificate);
    } else {
      return false;
    }
  }

  // Are all subjects of a certificate selected?
  areAllSubjectsOfCertificateSelected(certificate: string) {
    if (this.selectedSubjects.length) {
      const subjectsOfCertificate = this.allSubjects.filter(subject =>
        subject.certificate === certificate);
      const selectedSubjectsOfCertificate = this.selectedSubjects.filter(subject =>
        subject.certificate === certificate);

      return subjectsOfCertificate.length === selectedSubjectsOfCertificate.length;
    } else {
      return false;
    }
  }

  async updateSelectedCertificates(event: Event, certificate: string) {
    const checkbox: HTMLInputElement = event.target as HTMLInputElement;

    if (checkbox.checked) {
      // Add all subjects of certificate to selectedSubjects.
      this.selectedSubjects = [
        ...this.selectedSubjects.filter(subject => subject.certificate !== certificate),
        ...this.allSubjects.filter(subject => subject.certificate === certificate)
      ];
    } else {
      // Remove all subjects of certificate from selectedSubjects.
      this.selectedSubjects = this.selectedSubjects.filter(subject => subject.certificate !== certificate);
    }
    await this.serveNotes();
  }

  async updateSelectedUserSubjects(event: Event, subject: Subject) {
    const checkbox: HTMLInputElement = event.target as HTMLInputElement;

    if (checkbox.checked) {
      this.selectedSubjects.push(subject);
    } else {
      this.selectedSubjects.splice(this.selectedSubjects.findIndex(selectedSubject =>
        selectedSubject._id === subject._id), 1);
    }
    await this.serveNotes();
  }

  isInSelectedSubjects(subject: Subject) {
    return this.selectedSubjects.some(selectedSubject => subject._id === selectedSubject._id);
  }

  getSubjectsAutocompleteList() {
    // Filter out already selected subjects.
    return this.querySubjects.filter((subject: Subject) =>
      !this.selectedSubjects.some(selected => selected._id === subject._id)
    );
  }

  async serveSubjects(): Promise<void> {
    try {
      const response = await this.db.getSubjects(this.subjectSearchQuery);

      this.querySubjects = response.subjects;
    } catch (error) {
      console.log(error);
    }
  }

  async serveAllSubjectsAndCertificates(): Promise<void> {
    try {
      const response = await this.db.getSubjects();
      this.allSubjects = response.subjects;
      this.allCertificates = [...new Set(this.allSubjects.map((subject: Subject) => subject.certificate))];
    } catch (error) {
      console.log(error);
    }
  }

  @HostListener('document:focusin', ['$event'])
  closeElementsOnFocusIn(event: Event): void {
    const target: HTMLElement = event.target as HTMLElement;

    const focusedOutsideSubjectCombobox: boolean = !this.subjectCombobox?.nativeElement.contains(target);
    const focusedOutsideSubjectAutocompleteDropdown: boolean = !this.subjectAutocompleteDropdown?.nativeElement.contains(target);

    if (this.isSubjectsAutocompleteVisible && focusedOutsideSubjectCombobox && focusedOutsideSubjectAutocompleteDropdown) {
      // Close subject autocomplete dropdown if focused outside combobox and outside dropdown.
      this.isSubjectsAutocompleteVisible = false;
    }
  }

  @HostListener('document:click', ['$event'])
  closeElementsOnClicks(event: Event): void {
    const target: HTMLElement = event.target as HTMLElement;

    const focusedOutsideSubjectCombobox: boolean = !this.subjectCombobox?.nativeElement.contains(document.activeElement);
    const clickedOutsideSubjectAutocompleteDropdown: boolean = !this.subjectAutocompleteDropdown?.nativeElement.contains(target);

    if (this.isSubjectsAutocompleteVisible && focusedOutsideSubjectCombobox && clickedOutsideSubjectAutocompleteDropdown) {
      // Close subject autocomplete dropdown if focused outside combobox and clicked outside dropdown.
      this.isSubjectsAutocompleteVisible = false;
    }
  }

  ngOnDestroy(): void {
    this.seo.resetTitleAndMetaTags();
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected readonly Note = Note;
  protected readonly FormatPricePipe = FormatPricePipe;
  protected readonly Object = Object;
  protected readonly Subject = Subject;
}
