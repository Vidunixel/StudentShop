import { Injectable } from '@angular/core';
import {HttpClient, HttpHeaders, HttpParams} from "@angular/common/http";
import {lastValueFrom, Observable} from "rxjs";
import {ValidatorService} from "./validator.service";
import {User} from "./models/User";
import {Note} from "./models/Note";
import {Review} from "./models/Review";
import {Subject} from "./models/Subject";
import {environment} from "../environments/environment";
import {Environment} from "./models/common";

@Injectable({
  providedIn: 'root'
})
export class DatabaseService {

  API_URL = `${ environment.environment === Environment.PRODUCTION ? "https://studentshop.com.au" : "http://localhost:8081" }/api/v1`;
  ADMIN_API_URL = `${ environment.environment === Environment.PRODUCTION ? "https://studentshop.com.au" : "http://localhost:8081" }/api/v1/admin`;

  constructor(private http:HttpClient, private validatorService: ValidatorService) { }

  async getNotes(searchQuery: string, filters: any, sortBy: string, nextPage: any[] | undefined,
                 pitId: string | undefined, inceptionDate: string | undefined, token: string = "") {
    let params: HttpParams = new HttpParams()
      .set("filters", JSON.stringify(filters));

    if (searchQuery) {
      params = params.set("searchQuery", searchQuery.toString());
    }
    if (sortBy) {
      params = params.set("sortBy", sortBy.toString());
    }
    if (pitId) {
      params = params.set("pitId", pitId);
    }
    if (inceptionDate) {
      params = params.set("inceptionDate", inceptionDate);
    }
    if (nextPage) {
      params = params.set("nextPage", JSON.stringify(nextPage));
    }

    const response: any = await lastValueFrom(this.http.get(this.API_URL + "/notes", {
      params: params,
      headers: new HttpHeaders({
        Authorization: token,
      }),
      withCredentials: true
    }));

    // Parse notes and return response.
    response.notes = this.validatorService.parseNotes(response.notes);
    return response;
  }

  async getNotesAdmin(searchQuery: string, filters: any, sortBy: string, nextPage: any[] | undefined,
                      pitId: string | undefined, token: string = "") {
    let params: HttpParams = new HttpParams()
      .set("filters", JSON.stringify(filters));

    if (searchQuery) {
      params = params.set("searchQuery", searchQuery.toString());
    }
    if (sortBy) {
      params = params.set("sortBy", sortBy.toString());
    }
    if (pitId) {
      params = params.set("pitId", pitId);
    }
    if (nextPage) {
      params = params.set("nextPage", JSON.stringify(nextPage));
    }

    const response: any = await lastValueFrom(this.http.get(this.ADMIN_API_URL + "/notes", {
      params: params,
      headers: new HttpHeaders({
        Authorization: token,
      }),
      withCredentials: true
    }));

    // Parse notes and return response.
    response.notes = this.validatorService.parseNotes(response.notes);
    return response;
  }

  async getSimilarNotes(note: Note) {
    let params: HttpParams = new HttpParams();

    if (note._id) {
      params = params.set("id", note._id.toString());
    }

    const response: any = await lastValueFrom(this.http.get(this.API_URL + "/notes/similar", {
      params: params,
      headers: new HttpHeaders({
      }),
      withCredentials: true
    }));

    // Parse notes and return response.
    response.notes = this.validatorService.parseNotes(response.notes);
    return response;
  }

  async getPurchasedNotes(sortBy: string, nextPage: any[] | undefined, pitId: string | undefined, token: string = "") {
    let params: HttpParams = new HttpParams()
      .set("sortBy", sortBy.toString());

    if (pitId) {
      params = params.set("pitId", pitId);
    }
    if (nextPage) {
      params = params.set("nextPage", JSON.stringify(nextPage));
    }

    const response: any = await lastValueFrom(this.http.get(this.API_URL + "/notes/purchased", {
      params: params,
      headers: new HttpHeaders({
        Authorization: token,
      }),
      withCredentials: true
    }));

    // Parse notes and return response.
    response.notes = this.validatorService.parseNotes(response.notes);
    return response;
  }

  async getPurchaseAdmin(id: string = "", token: string = "") {

    let params: HttpParams = new HttpParams();
    if (id) {
      params = params.set("id", id.toString());
    }

    const response: any = await lastValueFrom(this.http.get(this.ADMIN_API_URL + "/purchases", {
      params: params,
      headers: new HttpHeaders({
        Authorization: token,
      }),
      withCredentials: true
    }));

    // Parse purchase and return response.
    response.purchase = this.validatorService.parsePurchase(response.purchase);
    return response;
  }

  async getPurchasesAdmin(searchQuery: string, filters: any, sortBy: string, nextPage: any[] | undefined,
                             pitId: string | undefined, token: string = "") {
    let params: HttpParams = new HttpParams()
      .set("filters", JSON.stringify(filters));

    if (searchQuery) {
      params = params.set("searchQuery", searchQuery.toString());
    }
    if (sortBy) {
      params = params.set("sortBy", sortBy.toString());
    }
    if (pitId) {
      params = params.set("pitId", pitId);
    }
    if (nextPage) {
      params = params.set("nextPage", JSON.stringify(nextPage));
    }

    const response: any = await lastValueFrom(this.http.get(this.ADMIN_API_URL + "/purchases", {
      params: params,
      headers: new HttpHeaders({
        Authorization: token,
      }),
      withCredentials: true
    }));

    // Parse purchases and return response.
    response.purchases = this.validatorService.parsePurchases(response.purchases);
    return response;
  }

  async getUserPurchases(sortBy: string, nextPage: any[] | undefined, pitId: string | undefined, token: string = "") {
    let params: HttpParams = new HttpParams()
      .set("sortBy", sortBy.toString());

    if (pitId) {
      params = params.set("pitId", pitId);
    }
    if (nextPage) {
      params = params.set("nextPage", JSON.stringify(nextPage));
    }

    const response: any = await lastValueFrom(this.http.get(this.API_URL + "/purchases/user", {
      params: params,
      headers: new HttpHeaders({
        Authorization: token,
      }),
      withCredentials: true
    }));

    // Parse purchases and return response.
    response.purchases = this.validatorService.parsePurchases(response.purchases);
    return response;
  }

  async getUserPurchasesAdmin(uid: string = "", sortBy: string, nextPage: any[] | undefined, pitId: string | undefined, token: string = "") {
    let params: HttpParams = new HttpParams()
      .set("uid", uid.toString())
      .set("sortBy", sortBy.toString());

    if (pitId) {
      params = params.set("pitId", pitId);
    }
    if (nextPage) {
      params = params.set("nextPage", JSON.stringify(nextPage));
    }

    const response: any = await lastValueFrom(this.http.get(this.ADMIN_API_URL + "/purchases/user", {
      params: params,
      headers: new HttpHeaders({
        Authorization: token,
      }),
      withCredentials: true
    }));

    // Parse purchases and return response.
    response.purchases = this.validatorService.parsePurchases(response.purchases);
    return response;
  }

  async updateSaleTransactionAdmin(id: string = "", fields: any, token: string = "") {
    const response: any = await lastValueFrom(this.http.put(this.ADMIN_API_URL + "/transactions/sale/update",
      { id: id, fields: fields }, {
        headers: new HttpHeaders({
          Authorization: token
        }),
        withCredentials: true
      }));

    // Return response.
    return response;
  }

  async getTransactionAdmin(id: string = "", token: string = "") {

    let params: HttpParams = new HttpParams();
    if (id) {
      params = params.set("id", id.toString());
    }

    const response: any = await lastValueFrom(this.http.get(this.ADMIN_API_URL + "/transactions", {
      params: params,
      headers: new HttpHeaders({
        Authorization: token,
      }),
      withCredentials: true
    }));

    // Parse transaction and return response.
    response.transaction = this.validatorService.parseTransaction(response.transaction);
    return response;
  }

  async getTransactionsAdmin(searchQuery: string, filters: any, sortBy: string, nextPage: any[] | undefined,
                      pitId: string | undefined, token: string = "") {
    let params: HttpParams = new HttpParams()
      .set("filters", JSON.stringify(filters));

    if (searchQuery) {
      params = params.set("searchQuery", searchQuery.toString());
    }
    if (sortBy) {
      params = params.set("sortBy", sortBy.toString());
    }
    if (pitId) {
      params = params.set("pitId", pitId);
    }
    if (nextPage) {
      params = params.set("nextPage", JSON.stringify(nextPage));
    }

    const response: any = await lastValueFrom(this.http.get(this.ADMIN_API_URL + "/transactions", {
      params: params,
      headers: new HttpHeaders({
        Authorization: token,
      }),
      withCredentials: true
    }));

    // Parse transactions and return response.
    response.transactions = this.validatorService.parseTransactions(response.transactions);
    return response;
  }

  async getUserTransactionsAdmin(uid: string = "", sortBy: string, nextPage: any[] | undefined, pitId: string | undefined, token: string = "") {
    let params: HttpParams = new HttpParams()
      .set("uid", uid.toString())
      .set("sortBy", sortBy.toString());

    if (pitId) {
      params = params.set("pitId", pitId);
    }
    if (nextPage) {
      params = params.set("nextPage", JSON.stringify(nextPage));
    }

    const response: any = await lastValueFrom(this.http.get(this.ADMIN_API_URL + "/transactions/user", {
      params: params,
      headers: new HttpHeaders({
        Authorization: token,
      }),
      withCredentials: true
    }));

    // Parse transactions and return response.
    response.transactions = this.validatorService.parseTransactions(response.transactions);
    return response;
  }

  async getUserTransactions(sortBy: string, nextPage: any[] | undefined, pitId: string | undefined, token: string = "") {
    let params: HttpParams = new HttpParams()
      .set("sortBy", sortBy.toString());

    if (pitId) {
      params = params.set("pitId", pitId);
    }
    if (nextPage) {
      params = params.set("nextPage", JSON.stringify(nextPage));
    }

    const response: any = await lastValueFrom(this.http.get(this.API_URL + "/transactions/user", {
      params: params,
      headers: new HttpHeaders({
        Authorization: token,
      }),
      withCredentials: true
    }));

    // Parse transactions and return response.
    response.transactions = this.validatorService.parseTransactions(response.transactions);
    return response;
  }

  async refundPurchase(token: string = "", id: string, reasonType: string, reasonDescription: string) {
    const response: any = await lastValueFrom(this.http.post(this.API_URL + "/purchases/refund", {
      id: id, reasonType: reasonType, reasonDescription: reasonDescription
    }, {
      headers: new HttpHeaders({
        "Content-Type": "application/json",
        Authorization: token
      }),
      withCredentials: true
    }));

    // Return response.
    return response;
  }

  async getWithdrawalAdmin(id: string = "", token: string = "") {

    let params: HttpParams = new HttpParams();
    if (id) {
      params = params.set("id", id.toString());
    }

    const response: any = await lastValueFrom(this.http.get(this.ADMIN_API_URL + "/withdrawals", {
      params: params,
      headers: new HttpHeaders({
        Authorization: token,
      }),
      withCredentials: true
    }));

    // Parse withdrawal and return response.
    response.withdrawal = this.validatorService.parseWithdrawal(response.withdrawal);
    return response;
  }

  async getWithdrawalsAdmin(searchQuery: string, filters: any, sortBy: string, nextPage: any[] | undefined,
                        pitId: string | undefined, token: string = "") {
    let params: HttpParams = new HttpParams()
      .set("filters", JSON.stringify(filters));

    if (searchQuery) {
      params = params.set("searchQuery", searchQuery.toString());
    }
    if (sortBy) {
      params = params.set("sortBy", sortBy.toString());
    }
    if (pitId) {
      params = params.set("pitId", pitId);
    }
    if (nextPage) {
      params = params.set("nextPage", JSON.stringify(nextPage));
    }

    const response: any = await lastValueFrom(this.http.get(this.ADMIN_API_URL + "/withdrawals", {
      params: params,
      headers: new HttpHeaders({
        Authorization: token,
      }),
      withCredentials: true
    }));

    // Parse withdrawals and return response.
    response.withdrawals = this.validatorService.parseWithdrawals(response.withdrawals);
    return response;
  }

  async updateWithdrawalAdmin(id: string = "", fields: any, token: string = "") {
    const response: any = await lastValueFrom(this.http.put(this.ADMIN_API_URL + "/withdrawals/update",
      { id: id, fields: fields }, {
        headers: new HttpHeaders({
          Authorization: token
        }),
        withCredentials: true
      }));

    // Return response.
    return response;
  }

  async withdrawBalance(token: string = "", recipientType: string, identifier: string, amount: number) {
    const response: any = await lastValueFrom(this.http.post(this.API_URL + "/withdrawals/withdraw", {
      recipientType, identifier, amount
    }, {
      headers: new HttpHeaders({
        "Content-Type": "application/json",
        Authorization: token
      }),
      withCredentials: true
    }));

    // Return response.
    return response;
  }

  async getUsersNotes(sortBy: string, nextPage: any[] | undefined, pitId: string | undefined, uid: string = "",
                      token: string = "") {
    let params: HttpParams = new HttpParams()
      .set("sortBy", sortBy.toString())
      .set("uid", uid.toString());

    if (pitId) {
      params = params.set("pitId", pitId);
    }
    if (nextPage) {
      params = params.set("nextPage", JSON.stringify(nextPage));
    }

    const response: any = await lastValueFrom(this.http.get(this.API_URL + "/notes/user", {
      params: params,
      headers: new HttpHeaders({
        Authorization: token,
      }),
      withCredentials: true
    }));

    // Parse notes and return response.
    response.notes = this.validatorService.parseNotes(response.notes);
    return response;
  }

  async getUserAdmin(uid: string = "", token: string = "") {

    let params: HttpParams = new HttpParams();
    if (uid) {
      params = params.set("uid", uid.toString());
    }

    const response: any = await lastValueFrom(this.http.get(this.ADMIN_API_URL + "/users", {
      params: params,
      headers: new HttpHeaders({
        Authorization: token,
      }),
      withCredentials: true
    }));

    // Parse user and return response.
    response.user = this.validatorService.parseUser(response.user);
    return response;
  }

  async getUsersAdmin(searchQuery: string, filters: any, sortBy: string, nextPage: any[] | undefined,
                      pitId: string | undefined, token: string = "") {
    let params: HttpParams = new HttpParams()
      .set("filters", JSON.stringify(filters));

    if (searchQuery) {
      params = params.set("searchQuery", searchQuery.toString());
    }
    if (sortBy) {
      params = params.set("sortBy", sortBy.toString());
    }
    if (pitId) {
      params = params.set("pitId", pitId);
    }
    if (nextPage) {
      params = params.set("nextPage", JSON.stringify(nextPage));
    }

    const response: any = await lastValueFrom(this.http.get(this.ADMIN_API_URL + "/users", {
      params: params,
      headers: new HttpHeaders({
        Authorization: token,
      }),
      withCredentials: true
    }));

    // Parse users and return response.
    response.users = this.validatorService.parseUsers(response.users);
    return response;
  }

  async downloadNote(id: string = "", token: string = "") {
    const url = `${this.API_URL}/notes/download?id=${encodeURIComponent(id)}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: token
      },
      credentials: "include"
    });
    if (!response.ok) {
      throw new Error(`Download failed: ${response.statusText}`);
    }

    return response;
  }

  async getNote(id: string = "", token: string = "") {

    let params: HttpParams = new HttpParams();
    if (id) {
      params = params.set("id", id.toString());
    }

    const response: any = await lastValueFrom(this.http.get(this.API_URL + "/notes", {
      params: params,
      headers: new HttpHeaders({
        Authorization: token,
      }),
      withCredentials: true
    }));

    // Parse note and return response.
    response.note = this.validatorService.parseNote(response.note);
    return response;
  }

  async getNoteAdmin(id: string = "", token: string = "") {

    let params: HttpParams = new HttpParams();
    if (id) {
      params = params.set("id", id.toString());
    }

    const response: any = await lastValueFrom(this.http.get(this.ADMIN_API_URL + "/notes", {
      params: params,
      headers: new HttpHeaders({
        Authorization: token,
      }),
      withCredentials: true
    }));

    // Parse note and return response.
    response.note = this.validatorService.parseNote(response.note);
    return response;
  }

  async updateNote(id: string = "", fields: any, token: string = "") {
    const response: any = await lastValueFrom(this.http.put(this.API_URL + "/notes/update",
      { id: id, fields: fields }, {
        headers: new HttpHeaders({
          Authorization: token
        }),
        withCredentials: true
      }));

    // Return response.
    return response;
  }

  async updateNoteAdmin(id: string = "", fields: any, token: string = "") {
    const response: any = await lastValueFrom(this.http.put(this.ADMIN_API_URL + "/notes/update",
      { id: id, fields: fields }, {
        headers: new HttpHeaders({
          Authorization: token
        }),
        withCredentials: true
      }));

    // Return response.
    return response;
  }

  async updateSchoolsAdmin(token: string = "", formData: FormData) {
    const response: any = await lastValueFrom(this.http.put(this.ADMIN_API_URL + "/schools/update",
      formData, {
        headers: new HttpHeaders({
          Authorization: token
        }),
        withCredentials: true
      }));

    // Return response.
    return response;
  }

  async getSchoolAdmin(id: string = "", token: string = "") {

    let params: HttpParams = new HttpParams();
    if (id) {
      params = params.set("id", id.toString());
    }

    const response: any = await lastValueFrom(this.http.get(this.ADMIN_API_URL + "/schools", {
      params: params,
      headers: new HttpHeaders({
        Authorization: token,
      }),
      withCredentials: true
    }));

    // Parse school and return response.
    response.school = this.validatorService.parseSchool(response.school);
    return response;
  }

  async getSchoolsAdmin(searchQuery: string, filters: any, sortBy: string, nextPage: any[] | undefined,
                      pitId: string | undefined, token: string = "") {
    let params: HttpParams = new HttpParams()
      .set("filters", JSON.stringify(filters));

    if (searchQuery) {
      params = params.set("searchQuery", searchQuery.toString());
    }
    if (sortBy) {
      params = params.set("sortBy", sortBy.toString());
    }
    if (pitId) {
      params = params.set("pitId", pitId);
    }
    if (nextPage) {
      params = params.set("nextPage", JSON.stringify(nextPage));
    }

    const response: any = await lastValueFrom(this.http.get(this.ADMIN_API_URL + "/schools", {
      params: params,
      headers: new HttpHeaders({
        Authorization: token,
      }),
      withCredentials: true
    }));

    // Parse schools and return response.
    response.schools = this.validatorService.parseSchools(response.schools);
    return response;
  }

  async getSchools(searchQuery: string = "") {
    let params: HttpParams = new HttpParams()
      .set("searchQuery", searchQuery.toString());

    const response: any = await lastValueFrom(this.http.get(this.API_URL + "/schools", {
      params: params,
      withCredentials: true
    }));

    // Parse schools and return response.
    response.schools = this.validatorService.parseSchools(response.schools);
    return response;
  }

  async getSubjects(searchQuery: string = "", filters: any = {}, sortBy?: string) {
    let params: HttpParams = new HttpParams()
      .set("filters", JSON.stringify(filters));

    if (searchQuery) {
      params = params.set("searchQuery", searchQuery.toString());
    }
    if (sortBy) {
      params = params.set("sortBy", sortBy.toString());
    }

    const response: any = await lastValueFrom(this.http.get(this.API_URL + "/subjects", {
      params: params,
      withCredentials: true
    }));

    // Parse schools and return response.
    response.subjects = this.validatorService.parseSubjects(response.subjects);
    return response;
  }

  async addSubjectAdmin(token: string = "", subject: Subject) {
    const response: any = await lastValueFrom(this.http.post(this.ADMIN_API_URL + "/subjects/add", subject, {
      headers: new HttpHeaders({
        "Content-Type": "application/json",
        Authorization: token
      }),
      withCredentials: true
    }));

    // Parse subject and return response.
    response.subject = this.validatorService.parseSubject(response.subject);
    return response;
  }

  async updateSubjectAdmin(id: string = "", fields: any, token: string = "") {
    const response: any = await lastValueFrom(this.http.put(this.ADMIN_API_URL + "/subjects/update",
      { id, fields: fields }, {
        headers: new HttpHeaders({
          Authorization: token
        }),
        withCredentials: true
      }));

    // Return response.
    return response;
  }

  async deleteSubjectAdmin(token: string = "", id: string = "") {
    let params: HttpParams = new HttpParams()
      .set("id", id.toString());

    const response: any = await lastValueFrom(this.http.delete(this.ADMIN_API_URL + "/subjects/delete", {
      params: params,
      headers: new HttpHeaders({
        Authorization: token
      }),
      withCredentials: true
    }));

    return response;
  }

  async getSubjectAdmin(id: string = "", token: string = "") {

    let params: HttpParams = new HttpParams();
    if (id) {
      params = params.set("id", id.toString());
    }

    const response: any = await lastValueFrom(this.http.get(this.ADMIN_API_URL + "/subjects", {
      params: params,
      headers: new HttpHeaders({
        Authorization: token,
      }),
      withCredentials: true
    }));

    // Parse subject and return response.
    response.subject = this.validatorService.parseSubject(response.subject);
    return response;
  }

  async getSubjectsAdmin(searchQuery: string, filters: any, sortBy: string, nextPage: any[] | undefined,
                        pitId: string | undefined, token: string = "") {
    let params: HttpParams = new HttpParams()
      .set("filters", JSON.stringify(filters));

    if (searchQuery) {
      params = params.set("searchQuery", searchQuery.toString());
    }
    if (sortBy) {
      params = params.set("sortBy", sortBy.toString());
    }
    if (pitId) {
      params = params.set("pitId", pitId);
    }
    if (nextPage) {
      params = params.set("nextPage", JSON.stringify(nextPage));
    }

    const response: any = await lastValueFrom(this.http.get(this.ADMIN_API_URL + "/subjects", {
      params: params,
      headers: new HttpHeaders({
        Authorization: token,
      }),
      withCredentials: true
    }));

    // Parse subjects and return response.
    response.subjects = this.validatorService.parseSubjects(response.subjects);
    return response;
  }

  async getUsernameStatus(username: string) {
    let params: HttpParams = new HttpParams()
      .set("username", username.toString());

    const response: any = await lastValueFrom(this.http.get(this.API_URL + "/users/username-status", {
      params: params,
      withCredentials: true
    }));

    return response;
  }

  async addUser(token: string = "", user: User) {
    const response: any = await lastValueFrom(this.http.post(this.API_URL + "/users/add", user, {
      headers: new HttpHeaders({
        "Content-Type": "application/json",
        Authorization: token
      }),
      withCredentials: true
    }));

    // Parse user and return response.
    response.user = this.validatorService.parseUser(response.user);
    return response;
  }

  async getUser(token: string = "") {
    const response: any = await lastValueFrom(this.http.get(this.API_URL + "/users", {
      headers: new HttpHeaders({
        Authorization: token
      }),
      withCredentials: true
    }));

    // Parse user and return response.
    response.user = this.validatorService.parseUser(response.user);
    return response;
  }

  async updateUser(token: string = "", fields: any) {
    const response: any = await lastValueFrom(this.http.put(this.API_URL + "/users/update",
      { fields: fields }, {
        headers: new HttpHeaders({
          Authorization: token
        }),
        withCredentials: true
      }));

    // Return response.
    return response;
  }

  async updateUserAdmin(uid: string = "", fields: any, token: string = "") {
    const response: any = await lastValueFrom(this.http.put(this.ADMIN_API_URL + "/users/update",
      { uid, fields: fields }, {
        headers: new HttpHeaders({
          Authorization: token
        }),
        withCredentials: true
      }));

    // Return response.
    return response;
  }

  async getCart(token: string = "") {
    const response: any = await lastValueFrom(this.http.get(this.API_URL + "/carts", {
      headers: new HttpHeaders({
        Authorization: token
      }),
      withCredentials: true
    }));

    // Return response.
    return response;
  }

  async updateCart(token: string = "", fields: any) {
    const response: any = await lastValueFrom(this.http.put(this.API_URL + "/carts/update",
      { fields: fields }, {
        headers: new HttpHeaders({
          Authorization: token
        }),
        withCredentials: true
      }));

    // Return response.
    return response;
  }

  async updateProfilePic(token: string = "", formData: FormData) {
    const response: any = await lastValueFrom(this.http.put(this.API_URL + "/users/update/profile-photo",
      formData, {
      headers: new HttpHeaders({
        Authorization: token
      }),
      withCredentials: true
    }));

    // Return response.
    return response;
  }

  async addNote(token: string = "", formData: FormData, note: Note) {
    formData.append("params", JSON.stringify(note));
    const response: any = await lastValueFrom(this.http.post(this.API_URL + "/notes/add",
      formData, {
        headers: new HttpHeaders({
          Authorization: token
        }),
        withCredentials: true
      }));

    // Parse note and return response.
    response.note = this.validatorService.parseNote(response.note);
    return response;
  }

  async deleteNote(token: string = "", id: string = "") {
    let params: HttpParams = new HttpParams()
      .set("id", id.toString());

    const response: any = await lastValueFrom(this.http.delete(this.API_URL + "/notes/delete", {
      params: params,
      headers: new HttpHeaders({
        Authorization: token
      }),
      withCredentials: true
    }));

    return response;
  }

  async deleteNoteAdmin(token: string = "", id: string = "") {
    let params: HttpParams = new HttpParams()
      .set("id", id.toString());

    const response: any = await lastValueFrom(this.http.delete(this.ADMIN_API_URL + "/notes/delete", {
      params: params,
      headers: new HttpHeaders({
        Authorization: token
      }),
      withCredentials: true
    }));

    return response;
  }

  async listNote(token: string = "", id: string = "") {
    const response: any = await lastValueFrom(this.http.put(this.API_URL + "/notes/list",
      { id }, {
      headers: new HttpHeaders({
        Authorization: token
      }),
      withCredentials: true
    }));

    return response;
  }

  async createPurchase(token: string = "", cart: { _index: string, _id: string }[], paymentMethod: string) {
    const response: any = await lastValueFrom(this.http.post(this.API_URL + "/purchases/create",
      {cart, paymentMethod}, {
        headers: new HttpHeaders({
          Authorization: token
        }),
        withCredentials: true
      }));

    return response;
  }

  async capturePurchase(token: string = "", orderId: string = "") {
    let params: HttpParams = new HttpParams()
      .set("orderId", orderId.toString());

    const response: any = await lastValueFrom(this.http.post(this.API_URL + `/purchases/capture`, {}, {
      params: params,
      headers: new HttpHeaders({
        Authorization: token
      }),
      withCredentials: true
      }));

    return response;
  }

  async getRefundAdmin(id: string = "", token: string = "") {

    let params: HttpParams = new HttpParams();
    if (id) {
      params = params.set("id", id.toString());
    }

    const response: any = await lastValueFrom(this.http.get(this.ADMIN_API_URL + "/refunds", {
      params: params,
      headers: new HttpHeaders({
        Authorization: token,
      }),
      withCredentials: true
    }));

    // Parse refund and return response.
    response.refund = this.validatorService.parseRefund(response.refund);
    return response;
  }

  async getRefundsAdmin(searchQuery: string, filters: any, sortBy: string, nextPage: any[] | undefined,
                          pitId: string | undefined, token: string = "") {
    let params: HttpParams = new HttpParams()
      .set("filters", JSON.stringify(filters));

    if (searchQuery) {
      params = params.set("searchQuery", searchQuery.toString());
    }
    if (sortBy) {
      params = params.set("sortBy", sortBy.toString());
    }
    if (pitId) {
      params = params.set("pitId", pitId);
    }
    if (nextPage) {
      params = params.set("nextPage", JSON.stringify(nextPage));
    }

    const response: any = await lastValueFrom(this.http.get(this.ADMIN_API_URL + "/refunds", {
      params: params,
      headers: new HttpHeaders({
        Authorization: token,
      }),
      withCredentials: true
    }));

    // Parse refunds and return response.
    response.refunds = this.validatorService.parseRefunds(response.refunds);
    return response;
  }

  async updateRefundAdmin(id: string = "", fields: any, token: string = "") {
    const response: any = await lastValueFrom(this.http.put(this.ADMIN_API_URL + "/refunds/update",
      { id: id, fields: fields }, {
        headers: new HttpHeaders({
          Authorization: token
        }),
        withCredentials: true
      }));

    // Return response.
    return response;
  }

  async getReviewAdmin(id: string = "", token: string = "") {

    let params: HttpParams = new HttpParams();
    if (id) {
      params = params.set("id", id.toString());
    }

    const response: any = await lastValueFrom(this.http.get(this.ADMIN_API_URL + "/reviews", {
      params: params,
      headers: new HttpHeaders({
        Authorization: token,
      }),
      withCredentials: true
    }));

    // Parse review and return response.
    response.review = this.validatorService.parseReview(response.review);
    return response;
  }

  async getReviewsAdmin(searchQuery: string, filters: any, sortBy: string, nextPage: any[] | undefined,
                      pitId: string | undefined, token: string = "") {
    let params: HttpParams = new HttpParams()
      .set("filters", JSON.stringify(filters));

    if (searchQuery) {
      params = params.set("searchQuery", searchQuery.toString());
    }
    if (sortBy) {
      params = params.set("sortBy", sortBy.toString());
    }
    if (pitId) {
      params = params.set("pitId", pitId);
    }
    if (nextPage) {
      params = params.set("nextPage", JSON.stringify(nextPage));
    }

    const response: any = await lastValueFrom(this.http.get(this.ADMIN_API_URL + "/reviews", {
      params: params,
      headers: new HttpHeaders({
        Authorization: token,
      }),
      withCredentials: true
    }));

    // Parse reviews and return response.
    response.reviews = this.validatorService.parseReviews(response.reviews);
    return response;
  }

  async getItemReviewsAdmin(item: { _index: string | undefined, _id: string | undefined }, sortBy: string,
                       nextPage: any[] | undefined, pitId: string | undefined, token: string = "") {
    let params: HttpParams = new HttpParams()
      .set("sortBy", sortBy.toString())
      .set("item", JSON.stringify(item));

    if (pitId) {
      params = params.set("pitId", pitId);
    }
    if (nextPage) {
      params = params.set("nextPage", JSON.stringify(nextPage));
    }

    const response: any = await lastValueFrom(this.http.get(this.API_URL + "/reviews/item", {
      params: params,
      headers: new HttpHeaders({
        Authorization: token,
      }),
      withCredentials: true
    }));

    // Parse reviews and return response.
    response.reviews = this.validatorService.parseReviews(response.reviews);
    return response;
  }

  async getItemReviews(item: { _index: string | undefined, _id: string | undefined }, sortBy: string,
                       nextPage: any[] | undefined, pitId: string | undefined, token: string = "") {
    let params: HttpParams = new HttpParams()
      .set("sortBy", sortBy.toString())
      .set("item", JSON.stringify(item));

    if (pitId) {
      params = params.set("pitId", pitId);
    }
    if (nextPage) {
      params = params.set("nextPage", JSON.stringify(nextPage));
    }

    const response: any = await lastValueFrom(this.http.get(this.API_URL + "/reviews/item", {
      params: params,
      headers: new HttpHeaders({
        Authorization: token,
      }),
      withCredentials: true
    }));

    // Parse reviews and return response.
    response.reviews = this.validatorService.parseReviews(response.reviews);
    return response;
  }

  async deleteReviewAdmin(token: string = "", id: string = "") {
    let params: HttpParams = new HttpParams()
      .set("id", id.toString());

    const response: any = await lastValueFrom(this.http.delete(this.ADMIN_API_URL + "/reviews/delete", {
      params: params,
      headers: new HttpHeaders({
        Authorization: token
      }),
      withCredentials: true
    }));

    return response;
  }

  async getItemUserReview(item: { _index: string | undefined, _id: string | undefined }, token: string = "") {
    let params: HttpParams = new HttpParams()
      .set("item", JSON.stringify(item));

    const response: any = await lastValueFrom(this.http.get(this.API_URL + "/reviews/item/user", {
      params: params,
      headers: new HttpHeaders({
        Authorization: token,
      }),
      withCredentials: true
    }));

    // Parse review and return response.
    response.review = this.validatorService.parseReview(response.review);
    return response;
  }

  async addReview(token: string = "", review: Review) {
    const response: any = await lastValueFrom(this.http.post(this.API_URL + "/reviews/add",
      {
        review: review.review,
        rating: review.rating,
        item: review.item
      }, {
      headers: new HttpHeaders({
        "Content-Type": "application/json",
        Authorization: token
      }),
      withCredentials: true
    }));

    // Parse review and return response.
    response.review = this.validatorService.parseReview(response.review);
    return response;
  }

  async updateReview(id: string = "", fields: any, token: string = "") {
    const response: any = await lastValueFrom(this.http.put(this.API_URL + "/reviews/update",
      { id: id, fields: fields }, {
        headers: new HttpHeaders({
          "Content-Type": "application/json",
          Authorization: token
        }),
        withCredentials: true
      }));

    return response;
  }

  async deleteReview(token: string = "", id: string = "") {
    let params: HttpParams = new HttpParams()
      .set("id", id.toString());

    const response: any = await lastValueFrom(this.http.delete(this.API_URL + "/reviews/delete", {
      params: params,
      headers: new HttpHeaders({
        Authorization: token
      }),
      withCredentials: true
    }));

    return response;
  }

  async getProfilesBySales(token: string = "") {
    let params: HttpParams = new HttpParams();

    const response: any = await lastValueFrom(this.http.get(this.API_URL + "/users/profiles/sales", {
      params: params,
      headers: new HttpHeaders({
        Authorization: token,
      }),
      withCredentials: true
    }));

    // Parse users and return response.
    response.users = this.validatorService.parseUsers(response.users);
    return response;
  }

  async getProfile(username: string = "",  token: string = "") {
    let params: HttpParams = new HttpParams()
      .set("username", username.toString());

    const response: any = await lastValueFrom(this.http.get(this.API_URL + "/users/profiles", {
      params: params,
      headers: new HttpHeaders({
        Authorization: token,
      }),
      withCredentials: true
    }));

    // Parse user and return response.
    response.user = this.validatorService.parseUser(response.user);
    return response;
  }

  async viewNote(id: string = "", requestSample = true, token: string = "") {

    let params: HttpParams = new HttpParams();
    if (id) {
      params = params.set("id", id.toString());
      params = params.set("sample", requestSample.toString());
    }

    const response: any = await lastValueFrom(this.http.get(this.API_URL + "/notes/view", {
      params: params,
      headers: new HttpHeaders({
        Authorization: token,
      }),
      withCredentials: true,
      responseType: "arraybuffer"
    }));

    return response;
  }

  async viewNoteAdmin(id: string = "", token: string = "") {

    let params: HttpParams = new HttpParams();
    if (id) {
      params = params.set("id", id.toString());
    }

    const response: any = await lastValueFrom(this.http.get(this.ADMIN_API_URL + "/notes/view", {
      params: params,
      headers: new HttpHeaders({
        Authorization: token,
      }),
      withCredentials: true,
      responseType: "blob"
    }));

    return response;
  }
}
