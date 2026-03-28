import type {User as IUser} from "./User";
import type {Note as INote} from "./Note";
import type {Withdrawal as IWithdrawal} from "./Withdrawal";
let User: any;
let Note: any;
let Withdrawal: any;

export class Transaction {
  static PaypalRecipientType = {
    EMAIL: "EMAIL",
    PHONE: "PHONE"
  }

  static TransactionType = {
    SALE: "sale",
    REFUND: "refund",
    WITHDRAWAL: "withdrawal"
  }

  static TransactionStatus = {
    PENDING: "pending",
    REJECTED: "rejected",
    COMPLETED: "completed"
  }

  static indexName = "transactions";

  _index: string;
  _id: string | undefined;
  userUid: string | undefined;
  user: IUser | undefined;
  info: { transactionType: string, purchaseId?: string } | undefined;
  amount: number | undefined;
  status: string | undefined;
  detailedItem: INote | undefined;
  withdrawal: IWithdrawal | undefined;
  fulfilmentDate: Date | undefined;
  _score: number | undefined | null;
  sort: number[] | undefined;
  dateCreated: Date;
  dateUpdated: Date;

  constructor({ _id, userUid, user, info, amount, status, fulfilmentDate, detailedItem, withdrawal,
                dateCreated = new Date(), _score, sort, dateUpdated = new Date() } : {
    _id?: string,
    userUid?: string,
    user?: any,
    info?: { transactionType: string, purchaseId?: string },
    amount?: number,
    status?: string,
    detailedItem?: any,
    withdrawal?: any,
    fulfilmentDate?: Date | string,
    _score?: number | null,
    sort?: number[],
    dateCreated?: Date | string,
    dateUpdated?: Date | string }) {

    this._index = Transaction.indexName;
    this._id = _id;
    this.userUid = userUid;
    // If user is provided and is not an instanceof User, parse it as a User.
    this.user = user ? (user instanceof User ? user : new User(user)) : undefined;
    this.info = info;
    this.amount = amount;
    this.status = status;
    // If detailedItem is provided and is not an instanceof Note, parse it as a Note.
    this.detailedItem = detailedItem ? (detailedItem instanceof Note ? detailedItem : new Note(detailedItem)) : undefined;
    this.withdrawal = withdrawal ? (withdrawal instanceof Withdrawal ? withdrawal : new Withdrawal(withdrawal)) : undefined;
    this.fulfilmentDate = fulfilmentDate ? (fulfilmentDate instanceof Date ? fulfilmentDate : new Date(fulfilmentDate)) : undefined;
    this._score = _score;
    this.sort = sort;
    this.dateCreated = dateCreated instanceof Date ? dateCreated : new Date(dateCreated);
    this.dateUpdated = dateUpdated instanceof Date ? dateUpdated : new Date(dateUpdated);
  }

  static setModelReferences(modelReferences: { User: any, Note: any, Withdrawal: any }) {
    User = modelReferences.User;
    Note = modelReferences.Note;
    Withdrawal = modelReferences.Withdrawal;
  }
}
