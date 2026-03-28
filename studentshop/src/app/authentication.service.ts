import {Injectable} from '@angular/core';
import {
  Auth,
  AdditionalUserInfo,
  getAdditionalUserInfo,
  authState,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword, signInWithPopup,
  signOut,
  User,
  GoogleAuthProvider,
  UserCredential, sendPasswordResetEmail, linkWithCredential,
  updateEmail,
  EmailAuthProvider, linkWithRedirect, getRedirectResult, linkWithPopup, unlink, updatePassword
} from '@angular/fire/auth';
import {User as NativeUser} from './models/User';
import {DatabaseService} from "./database.service";
import {BehaviorSubject, lastValueFrom, Observable} from "rxjs";
import {DialogsService} from "./dialog-components/dialogs.service";
import {skip, take, takeUntil} from "rxjs/operators";
import {HttpClient, HttpHeaders, HttpParams, HttpResponse} from "@angular/common/http";
import {Subject as RxjsSubject} from "rxjs/internal/Subject";

@Injectable({
  providedIn: 'root'
})
export class AuthenticationService {
  isLoggedIn: boolean = false;
  user: BehaviorSubject<any> = new BehaviorSubject<any>(null); // Firebase user info.
  nativeUser: BehaviorSubject<any> = new BehaviorSubject<any>(undefined); // Native user info.

  constructor(private auth: Auth, private db: DatabaseService, private dialogsService: DialogsService,
              private http:HttpClient) {
    // Subscribe to auth state changes
    authState(this.auth).subscribe(async (user: User | null) => {
      if (user) {
        await this.setCurrentNativeUser();
        await this.getUserIdToken(true); // Refresh the user token for the backend.
        this.user.next(user);
        this.isLoggedIn = true;
      } else {
        this.nativeUser.next(null);
        this.user.next(null);
        this.isLoggedIn = false;
      }
    });
  }

  // Get firebase user as subscription.
  getUser(): Observable<User | null> {
    return this.user.asObservable();
  }

  // Get native user as subscription.
  getNativeUser(): Observable<NativeUser | null> {
    return this.nativeUser.asObservable();
  }

  // Get current user's firebase user token for backend verification.
  async getUserIdToken(forceRefresh?: boolean) {
    return this.auth.currentUser ? await this.auth.currentUser.getIdToken(forceRefresh) : undefined;
  }

  // Set currentNativeUser.
  async setCurrentNativeUser() {
    if (this.auth.currentUser) {
      try {
        // Set currentNativeUser.
        this.nativeUser.next((await this.db.getUser(await this.getUserIdToken())).user);
      } catch (error: any) {
        console.log(error);
        // Re-register user natively if uid exists on firebase but not natively.
        if (error.error.code === "INVALID_UID") {
          const nativeUser: NativeUser = new NativeUser({
            uid: this.auth.currentUser.uid,
          });
          await this.db.addUser(await this.getUserIdToken(), nativeUser)
            .then(async response => {
              await this.setCurrentNativeUser(); // Set currentNativeUser after creating default user.
            })
            .catch(async (error: any) => {
              console.log(error);
              // Set currentNativeUser if UID already exists when creating default user,
              // else logout if adding default user fails.
              error.error.code = "UID_ALREADY_EXISTS" ?
                await this.setCurrentNativeUser() : await this.logout();
            });
        } else {
          await this.logout();
        }
      }
    }
  }

  async register(name: string,
                 username: string,
                 studentDetails:
                   { isActive: boolean,
                     school?: { visibility: string, schoolId: string },
                     subjects?: { visibility: string, subjectIds: string[] }} | undefined,
                 email: string, password: string) {
    try {
      // After currentNativeUser is set, update native user with user provided values.
      this.getNativeUser().pipe(skip(1),take(1)).subscribe(async (nativeUser: NativeUser | null | undefined) => {
        if (nativeUser) {
          await this.db.updateUser(await this.getUserIdToken(), {
            name: name,
            username: username,
            studentDetails: studentDetails
          });
          // Refresh native user details after updating.
          await this.setCurrentNativeUser();
        }
      });

      return (await createUserWithEmailAndPassword(this.auth, email, password)).user; // Create firebase user and send credentials.
    } catch (error) {
      throw error;
    }
  }

  // Send verification email.
  async sendEmailVerification() {
    if (this.auth.currentUser) {
      await sendEmailVerification(this.auth.currentUser);
    }
  }

  // Reload the user on front-end and refresh the token for the backend.
  async refreshUserIdToken() {
    await this.auth.currentUser?.reload();
    await this.getUserIdToken(true);

    // Reset the user observable value.
    const user = this.auth.currentUser;
    this.user.next(user);
    return user;
  }

  async login(email: string, password: string) {
    return await signInWithEmailAndPassword(this.auth, email, password);
  }

  // Update user's native profilePic to their social profile pic avatar.
  async #updateProfilePicToSocialAvatar(user: User) {
    if (user.photoURL) {
      try {
        // Fetch the image.
        const response: any = await lastValueFrom(this.http.get(user.photoURL, {
          responseType: "blob", // Return as blob.
        }));
        const mime = response.type;
        const extension = mime.split("/")[1];

        // Send as FormData.
        const formData = new FormData();
        formData.append("profilePic", response, `pfp.${extension}`);

        // Update user pfp.
        await this.db.updateProfilePic(await this.getUserIdToken(), formData);
      } catch (error) {
        console.log(error);
      }
    }
  }

  // Log in with Google.
  async loginWithGoogle(): Promise<void> {
    const destroy$ = new RxjsSubject<void>(); // Remove getNativeUser subscription below.

    const provider: GoogleAuthProvider = new GoogleAuthProvider();
    provider.addScope("profile");
    provider.addScope("email");

    try {
      let userCredential: UserCredential;
      let additionalUserInfo: AdditionalUserInfo | null;
      let isNewUser: boolean | undefined;

      // After currentNativeUser is set, if user isNewUser update user profilePic to social avatar.
      this.getNativeUser().pipe(skip(1), take(1), takeUntil(destroy$))
        .subscribe(async (nativeUser: NativeUser | null | undefined) => {
        if (nativeUser && isNewUser) {
          await this.#updateProfilePicToSocialAvatar(userCredential.user);
          this.dialogsService.toggleSocialSignup();
        }
      });

      userCredential = await signInWithPopup(this.auth, provider);
      additionalUserInfo = getAdditionalUserInfo(userCredential);
      isNewUser = additionalUserInfo?.isNewUser;

    } catch (error) {
      destroy$.next();
      destroy$.complete();
      throw error;
    }
  }

  // Link social with an email and password.
  async linkWithCredential(email: string, password: string) {
    if (this.auth.currentUser) {
      const credential = EmailAuthProvider.credential(email, password);
      await linkWithCredential(this.auth.currentUser, credential);

      return await this.refreshUserIdToken();
    } else {
      throw new Error("User is not logged in.", { cause: { status: 400 }});
    }
  }

  // Link email and password with Google.
  async linkWithGoogle() {
    if (this.auth.currentUser) {
      const provider = new GoogleAuthProvider();
      await linkWithPopup(this.auth.currentUser, provider);

      return await this.refreshUserIdToken();
    } else {
      throw new Error("User is not logged in.", { cause: { status: 400 }});
    }
  }

  // Unlink Google sign in.
  async unlinkGoogle() {
    if (this.auth.currentUser) {
      const provider = new GoogleAuthProvider();
      await unlink(this.auth.currentUser, provider.providerId);

      return await this.refreshUserIdToken();
    } else {
      throw new Error("User is not logged in.", { cause: { status: 400 }});
    }
  }

  async updateEmail(newEmail: string): Promise<User | null> {
    if (this.auth.currentUser) {
      await updateEmail(this.auth.currentUser, newEmail);

      return await this.refreshUserIdToken();
    } else {
      throw new Error("User is not logged in.", { cause: { status: 400 }});
    }
  }

  async updatePassword(newPassword: string) {
    if (this.auth.currentUser) {
      await updatePassword(this.auth.currentUser, newPassword);

      return await this.refreshUserIdToken();
    } else {
      throw new Error("User is not logged in.", { cause: { status: 400 }});
    }
  }

  // Send password reset email.
  async resetPassword(email: string): Promise<void> {
    await sendPasswordResetEmail(this.auth, email);
  }

  async logout() {
    return await signOut(this.auth);
  }
}
