import { Component } from '@angular/core';
import {Subject as RxjsSubject} from "rxjs/internal/Subject";
import {User as NativeUser} from "../../../models/User";
import {AuthenticationService} from "../../../authentication.service";
import {DatabaseService} from "../../../database.service";
import {ContextMenuService} from "../../../context-menu.service";
import {ActivatedRoute, RouterLink} from "@angular/router";
import {DialogsService} from "../../../dialog-components/dialogs.service";
import {skip, takeUntil} from "rxjs/operators";
import {NgIf} from "@angular/common";
import {PageNotFoundComponent} from "../../../page-not-found/page-not-found.component";
import {School} from "../../../models/School";

@Component({
  selector: 'app-school',
  standalone: true,
  imports: [
    NgIf,
    PageNotFoundComponent,
    RouterLink
  ],
  templateUrl: './school.component.html',
  styleUrls: ['../../admin.component.css', '../item-components.css', './school.component.css']
})
export class SchoolComponent {
  private destroy$ = new RxjsSubject<void>();
  nativeUser: NativeUser | null | undefined = undefined;

  schoolId: string | undefined;
  school: School | undefined;

  errorMessage: string = "";
  isLoading: boolean = false;

  constructor(protected authenticationService: AuthenticationService, protected db: DatabaseService,
              private contextMenuService: ContextMenuService, private route: ActivatedRoute,
              private dialogsService: DialogsService) { }

  async ngOnInit() {
    this.authenticationService.getNativeUser().pipe(takeUntil(this.destroy$)).subscribe(async (nativeUser: NativeUser | null | undefined) => {
      this.nativeUser = nativeUser;

      if (this.nativeUser && [NativeUser.AccountType.ADMIN, NativeUser.AccountType.STAFF].includes(nativeUser?.accountType || '')) {
        await this.setSchool();
      }
    });

    // Set note on route change.
    this.route.paramMap.pipe(skip(1), takeUntil(this.destroy$)).subscribe(async params => {
      if (this.nativeUser) {
        await this.setSchool();
      }
    });
  }

  toggleLogin() {
    this.dialogsService.toggleLogin();
  }

  closeAllDialogs() {
    this.dialogsService.closeAllDialogs();
  }

  async setSchool() {
    this.schoolId = this.route.snapshot.paramMap.get('id') || undefined;

    this.errorMessage = "";
    this.isLoading = true;
    if (this.schoolId) {
      try {
        await this.serveSchool(this.schoolId);
      } catch (error: any) {
        this.errorMessage = `An error occurred. Reason: ${error?.code || error?.error?.code || error?.message || "UNKNOWN"}.`;
        console.log(error);
      }
    } else {
      this.errorMessage = "`An error occurred. Reason: INVALID_ID.";
    }
    this.isLoading = false;
  }

  async serveSchool(id: string = ""): Promise<void> {
    const response = await this.db.getSchoolAdmin(id, await this.authenticationService.getUserIdToken());
    this.school = response.school;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected readonly NativeUser = NativeUser;
}
