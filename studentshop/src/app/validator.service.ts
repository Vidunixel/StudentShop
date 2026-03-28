import { Injectable } from '@angular/core';
import {School} from "./models/School";
import {Subject} from "./models/Subject";
import {User} from "./models/User";
import {Note} from "./models/Note";
import {Review} from "./models/Review";
import {Purchase} from "./models/Purchase";
import {Transaction} from "./models/Transaction";
import {Refund} from "./models/Refund";
import {Withdrawal} from "./models/Withdrawal";

@Injectable({
  providedIn: 'root'
})
export class ValidatorService {

  constructor() { }

  parseNotes(notes: any): Note[] {
    return notes.map((note: any): Note => this.parseNote(note));
  }

  parseUsers(users: any): User[] {
    return users.map((user: any): User => this.parseUser(user));
  }

  parseReviews(reviews: any): Review[] {
    return reviews.map((review: any): Review => this.parseReview(review));
  }

  parseSchools(schools: any): School[] {
    return schools.map((school: any): School => this.parseSchool(school));
  }

  parseSubjects(subjects: any): Subject[] {
    return subjects.map((subject: any): Subject => this.parseSubject(subject));
  }

  parsePurchases(purchases: any): Purchase[] {
    return purchases.map((purchase: any): Purchase => this.parsePurchase(purchase));
  }

  parseRefunds(refunds: any): Refund[] {
    return refunds.map((refund: any): Refund => this.parseRefund(refund));
  }

  parseWithdrawals(withdrawals: any): Withdrawal[] {
    return withdrawals.map((withdrawal: any): Withdrawal => this.parseWithdrawal(withdrawal));
  }

  parseTransactions(transactions: any): Transaction[] {
    return transactions.map((transaction: any): Transaction => this.parseTransaction(transaction));
  }

  parseUser(user: any): User {
    return user ? new User(user) : user;
  }

  parseNote(note: any): Note {
    return note ? new Note(note) : note;
  }

  parseReview(review: any): Review {
    return review ? new Review(review) : review;
  }

  parsePurchase(purchase: any): Purchase {
    return purchase ? new Purchase(purchase) : purchase;
  }

  parseRefund(refund: any): Refund {
    return refund ? new Refund(refund) : refund;
  }

  parseWithdrawal(withdrawal: any): Withdrawal {
    return withdrawal ? new Withdrawal(withdrawal) : withdrawal;
  }

  parseSchool(school: any): School {
    return school ? new School(school) : school;
  }

  parseSubject(subject: any): Subject {
    return subject ? new Subject(subject) : subject;
  }

  parseTransaction(transaction: any): Transaction {
    return transaction ? new Transaction(transaction) : transaction;
  }
}
