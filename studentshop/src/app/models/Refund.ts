import type {Purchase as IPurchase} from "./Purchase";
let Purchase: any;

export class Refund {
  static RefundStatus = {
    AWAITING_APPROVAL: "awaiting_approval",
    COMPLETED: "completed",
    REJECTED: "rejected"
  }

  static RefundReason = {
    CHANGE_OF_MIND: "change_of_mind",
    NOT_AS_DESCRIBED: "not_as_described",
    ACCIDENTAL_PURCHASE: "accidental_purchase"
  }

  _index: string;
  _id: string | undefined;
  purchaseId: string | undefined;
  reasonType: string | undefined;
  reasonDescription: string | undefined;
  status: string | undefined;
  purchase: IPurchase | undefined;
  _score: number | undefined | null;
  sort: number[] | undefined;
  dateCreated: Date;
  dateUpdated: Date;

  constructor({ _id, purchaseId, reasonType, reasonDescription, status, purchase, _score, sort,
                dateCreated = new Date(), dateUpdated = new Date() } : {
    _id?: string,
    purchaseId?: string,
    reasonType?: string,
    reasonDescription?: string,
    status?: string,
    purchase?: any,
    _score?: number | null,
    sort?: number[],
    dateCreated?: Date | string,
    dateUpdated?: Date | string }) {

    this._index = "refunds";
    this._id = _id;
    this.purchaseId = purchaseId;
    this.reasonType = reasonType;
    this.reasonDescription = reasonDescription;
    this.status = status;
    // If purchase is provided and is not an instanceof Purchase, parse it as a Purchase.
    this.purchase = purchase ? (purchase instanceof Purchase ? purchase : new Purchase(purchase)) : undefined;
    this._score = _score;
    this.sort = sort;
    this.dateCreated = dateCreated instanceof Date ? dateCreated : new Date(dateCreated);
    this.dateUpdated = dateUpdated instanceof Date ? dateUpdated : new Date(dateUpdated);
  }

  static setModelReferences(modelReferences: { Purchase: any }) {
    Purchase = modelReferences.Purchase;
  }
}
