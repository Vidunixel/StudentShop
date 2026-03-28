import type {Transaction as ITransaction} from "./Transaction";
let Transaction: any;

export class Withdrawal {
  static PaypalRecipientType = {
    EMAIL: "EMAIL",
    PHONE: "PHONE"
  }

  static WithdrawalStatus = {
    AWAITING_APPROVAL: "awaiting_approval",
    COMPLETED: "completed",
    REJECTED: "rejected"
  }

  _index: string | undefined;
  _id: string | undefined;
  transactionId: string | undefined;
  paypalRecipient: { recipientType: string, identifier: string } | undefined;
  status: string | undefined;
  transaction: ITransaction | undefined;
  _score: number | undefined | null;
  sort: number[] | undefined;
  dateCreated: Date;
  dateUpdated: Date;

  constructor({ _id, transactionId, paypalRecipient, status, transaction, _score, sort,
                dateCreated = new Date(), dateUpdated = new Date() } : {
    _id?: string,
    transactionId?: string,
    paypalRecipient?: { recipientType: string, identifier: string },
    status?: string,
    transaction?: any,
    _score?: number | null,
    sort?: number[],
    dateCreated?: Date | string,
    dateUpdated?: Date | string }) {

    this._index = "withdrawals";
    this._id = _id;
    this.transactionId = transactionId;
    this.paypalRecipient = paypalRecipient;
    this.status = status;
    // If transaction is provided and is not an instanceof Transaction, parse it as a Transaction.
    this.transaction = transaction ? (transaction instanceof Transaction ? transaction : new Transaction(transaction)) : undefined;
    this._score = _score;
    this.sort = sort;
    this.dateCreated = dateCreated instanceof Date ? dateCreated : new Date(dateCreated);
    this.dateUpdated = dateUpdated instanceof Date ? dateUpdated : new Date(dateUpdated);
  }

  static setModelReferences(modelReferences: { Transaction: any }) {
    Transaction = modelReferences.Transaction;
  }
}
