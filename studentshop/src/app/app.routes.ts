import {ExtraOptions, Routes} from '@angular/router';
import {DashboardComponent} from "./dashboard/dashboard.component";
import {NotesComponent} from "./explore-components/notes/notes.component";
import {NoteComponent} from "./item-components/note/note.component";
import {PageNotFoundComponent} from "./page-not-found/page-not-found.component";
import {LoginComponent} from "./authentication-components/login/login.component";
import {SignupComponent} from "./authentication-components/signup/signup.component";
import {AccountComponent} from "./account-components/account.component";
import {ProfileComponent} from "./account-components/profile/profile.component";
import {PrivacyComponent} from "./account-components/privacy/privacy.component";
import {PurchasesComponent} from "./account-components/purchases/purchases.component";
import {ListingsComponent} from "./account-components/listings/listings.component";
import {SecurityComponent} from "./account-components/security/security.component";
import {CheckoutComponent} from "./checkout/checkout.component";
import {CollectionComponent} from "./explore-components/collection/collection.component";
import {UserComponent} from "./item-components/user/user.component";
import {NoteViewerComponent} from "./note-viewer/note-viewer.component";
import {EarningsComponent} from "./account-components/earnings/earnings.component";
import {PrivacyPolicyComponent} from "./pages/privacy-policy/privacy-policy.component";
import {TermsOfServiceComponent} from "./pages/terms-of-service/terms-of-service.component";
import {HelpComponent} from "./pages/help/help.component";
import {RefundPolicyComponent} from "./pages/refund-policy/refund-policy.component";
// Admin components.
import {AdminComponent} from "./admin-components/admin.component";
import {NotesComponent as AdminNotesComponent} from "./admin-components/explore-components/notes/notes.component";
import {NoteComponent as AdminNoteComponent} from "./admin-components/item-components/note/note.component";
import {UsersComponent as AdminUsersComponent} from "./admin-components/explore-components/users/users.component";
import {UserComponent as AdminUserComponent} from "./admin-components/item-components/user/user.component";
import {ReviewsComponent as AdminReviewsComponent} from "./admin-components/explore-components/reviews/reviews.component";
import {ReviewComponent as AdminReviewComponent} from "./admin-components/item-components/review/review.component";
import {SchoolsComponent as AdminSchoolsComponent} from "./admin-components/explore-components/schools/schools.component";
import {SchoolComponent as AdminSchoolComponent} from "./admin-components/item-components/school/school.component";
import {SubjectsComponent as AdminSubjectsComponent} from "./admin-components/explore-components/subjects/subjects.component";
import {SubjectComponent as AdminSubjectComponent} from "./admin-components/item-components/subject/subject.component";
import {PurchasesComponent as AdminPurchasesComponent} from "./admin-components/explore-components/purchases/purchases.component";
import {PurchaseComponent as AdminPurchaseComponent} from "./admin-components/item-components/purchase/purchase.component";
import {TransactionsComponent as AdminTransactionsComponent} from "./admin-components/explore-components/transactions/transactions.component";
import {TransactionComponent as AdminTransactionComponent} from "./admin-components/item-components/transaction/transaction.component";
import {RefundsComponent as AdminRefundsComponent} from "./admin-components/explore-components/refunds/refunds.component";
import {RefundComponent as AdminRefundComponent} from "./admin-components/item-components/refund/refund.component";
import {WithdrawalsComponent as AdminWithdrawalsComponent} from "./admin-components/explore-components/withdrawals/withdrawals.component";
import {WithdrawalComponent as AdminWithdrawalComponent} from "./admin-components/item-components/withdrawal/withdrawal.component";
import {BuyComponent as BuyCtaComponent} from "./cta-components/buy/buy.component";
import {SellComponent as SellCtaComponent} from "./cta-components/sell/sell.component";

export const routes: Routes = [
  { path: "", component: DashboardComponent },
  { path: "notes", component: NotesComponent },
  { path: "notes/:id", component: NoteComponent },
  { path: "notes/:id/view", component: NoteViewerComponent },
  { path: "collection", component: CollectionComponent },
  { path: "users/:username", component: UserComponent },
  { path: "account", component: AccountComponent, children: [
      { path: "profile", component: ProfileComponent },
      { path: "earnings", component: EarningsComponent },
      { path: "purchases", component: PurchasesComponent },
      { path: "privacy", component: PrivacyComponent },
      { path: "security", component: SecurityComponent },
      { path: "listings", component: ListingsComponent },
      { path: "", redirectTo: "/account/profile", pathMatch: "full" }
    ] },
  { path: "checkout", component: CheckoutComponent },
  { path: "login", component: LoginComponent },
  { path: "signup", component: SignupComponent },
  { path: "admin", component: AdminComponent, children: [
      { path: "notes", component: AdminNotesComponent },
      { path: "notes/:id", component: AdminNoteComponent },
      { path: "users", component: AdminUsersComponent },
      { path: "users/:uid", component: AdminUserComponent },
      { path: "reviews", component: AdminReviewsComponent },
      { path: "reviews/:id", component: AdminReviewComponent },
      { path: "schools", component: AdminSchoolsComponent },
      { path: "schools/:id", component: AdminSchoolComponent },
      { path: "subjects", component: AdminSubjectsComponent },
      { path: "subjects/:id", component: AdminSubjectComponent },
      { path: "purchases", component: AdminPurchasesComponent },
      { path: "purchases/:id", component: AdminPurchaseComponent },
      { path: "transactions", component: AdminTransactionsComponent },
      { path: "transactions/:id", component: AdminTransactionComponent },
      { path: "refunds", component: AdminRefundsComponent },
      { path: "refunds/:id", component: AdminRefundComponent },
      { path: "withdrawals", component: AdminWithdrawalsComponent },
      { path: "withdrawals/:id", component: AdminWithdrawalComponent },
      { path: "", redirectTo: "/admin/notes", pathMatch: "full" }
    ]
  },
  { path: "privacy-policy", component: PrivacyPolicyComponent },
  { path: "terms-of-service", component: TermsOfServiceComponent },
  { path: "refund-policy", component: RefundPolicyComponent },
  { path: "help", component: HelpComponent },

  // Cta components.
  { path: "buy", children: [
      { path: ":subject", component: BuyCtaComponent },
      { path: "", component: BuyCtaComponent, pathMatch: "full" }
    ]
  },
  { path: "sell", children: [
      { path: ":subject", component: SellCtaComponent },
      { path: "", component: SellCtaComponent, pathMatch: "full" }
    ]
  },
  { path: "**", component: PageNotFoundComponent },
];
