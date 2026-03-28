import type {User as IUser} from "./User";
import type {Note as INote} from "./Note";
import type {Refund as IRefund} from "./Refund";
import type {Transaction as ITransaction} from "./Transaction";
let User: any;
let Note: any;
let Refund: any;
let Transaction: any;

export class Purchase {
  static PaymentMethod = {
    FREE: "free",
    PAYPAL: "paypal",
    CREDIT: "credit"
  };

  static DisplayStatus = {
    REFUNDED: "refunded",
    PENDING_REFUND: "pending_refund",
    PAID: "paid"
  };

  static PurchaseStatus = {
    PAID: "paid"
  }

  static indexName = "purchases";

  _index: string;
  _id: string | undefined;
  userUid: string | undefined;
  sellerUid: string | undefined;
  orderId: string | undefined;
  price: { unitAmount: { sellerReceive: number, studentShopFee: number, unitTotal: number },
    tax: number, transactionFee: number, total: number } | undefined;
  item: { _index: string, _id: string } | undefined;
  detailedItem: INote | undefined;
  refund: IRefund | undefined;
  seller: IUser | undefined;
  user: IUser | undefined;
  transactions: ITransaction[] | undefined;
  isRefundAvailable: boolean | undefined;
  status: string | undefined;
  displayStatus: string | undefined;
  refundProperties: { refundExpiryDate: Date | undefined; isRefundRestricted: boolean } | undefined;
  paymentMethod: string | undefined;
  _score: number | undefined | null;
  sort: number[] | undefined;
  dateCreated: Date;
  dateUpdated: Date;

  constructor({ _id, userUid, sellerUid, orderId, price, item, detailedItem, refund, seller, user, transactions, status,
                displayStatus, isRefundAvailable, refundProperties, paymentMethod, _score, sort,
                dateCreated = new Date(), dateUpdated = new Date() } : {
    _id?: string,
    userUid?: string,
    sellerUid?: string,
    orderId?: string,
    price?: { unitAmount: { sellerReceive: number, studentShopFee: number, unitTotal: number },
      tax: number, transactionFee: number, total: number },
    item?: { _index: string, _id: string },
    detailedItem?: any,
    refund?: any,
    seller?: any,
    user?: any,
    transactions?: any[],
    isRefundAvailable?: boolean,
    status?: string,
    displayStatus?: string,
    refundProperties?: { refundExpiryDate?: Date | string, isRefundRestricted: boolean },
    paymentMethod?: string,
    _score?: number | null,
    sort?: number[],
    dateCreated?: Date | string,
    dateUpdated?: Date | string }) {

    this._index = Purchase.indexName;
    this._id = _id;
    this.userUid = userUid;
    this.sellerUid = sellerUid;
    this.orderId = orderId;
    this.price = price;
    this.item = item;
    // If detailedItem is provided and is not an instanceof Note, parse it as a Note.
    this.detailedItem = detailedItem ? (detailedItem instanceof Note ? detailedItem : new Note(detailedItem)) : undefined;
    // If refund is provided and is not an instanceof Refund, parse it as a Refund.
    this.refund = refund ? (refund instanceof Refund ? refund : new Refund(refund)) : undefined;
    // If seller is provided and is not an instanceof User, parse it as a User.
    this.seller = seller ? (seller instanceof User ? seller : new User(seller)) : undefined;
    // If user is provided and is not an instanceof User, parse it as a User.
    this.user = user ? (user instanceof User ? user : new User(user)) : undefined;
    // If transactions is provided and is not an instanceof Transaction, parse it as a Transaction.
    this.transactions = transactions ? transactions.map((transaction) => {
      return transaction instanceof Transaction ? transaction : new Transaction(transaction);
    }) : undefined;
    this.isRefundAvailable = isRefundAvailable;
    this.status = status;
    this.displayStatus = displayStatus;
    this.refundProperties = refundProperties ? {
      ...refundProperties,
      refundExpiryDate: refundProperties?.refundExpiryDate ? (refundProperties?.refundExpiryDate instanceof Date ?
          refundProperties.refundExpiryDate : new Date(refundProperties.refundExpiryDate)) : undefined
    } : undefined;
    this.paymentMethod = paymentMethod;
    this._score = _score;
    this.sort = sort;
    this.dateCreated = dateCreated instanceof Date ? dateCreated : new Date(dateCreated);
    this.dateUpdated = dateUpdated instanceof Date ? dateUpdated : new Date(dateUpdated);
  }

  static setModelReferences(modelReferences: { User: any, Note: any, Refund: any, Transaction: any }) {
    User = modelReferences.User;
    Note = modelReferences.Note;
    Refund = modelReferences.Refund;
    Transaction = modelReferences.Transaction;
  }
}
