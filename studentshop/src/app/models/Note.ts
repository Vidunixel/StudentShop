import type {User as IUser} from "./User";
import type {Subject as ISubject} from "./Subject";
let User: any;
let Subject: any;

export class Note {
  static NoteStatus = {
    PROCESSING: "processing",
    PENDING_REVIEW: "pending_review",
    PROCESSING_ERROR: "processing_error",
    REJECTED: "rejected",
    LISTED: "listed",
    DELISTED: "delisted",
    DELETED: "deleted"
  };

  static RejectReasonFlaggedSection = {
    TITLE: "title",
    DESCRIPTION: "description",
    SUBJECTS: "subjects",
    NOTE_CONTENT: "note_content",
  };

  static indexName = "notes";

  _index: string;
  _id: string | undefined;
  seller: IUser | undefined;
  sellerUid: string | undefined;
  title: string;
  description: string;
  subjectIds: string[] | undefined;
  subjects: ISubject[] | undefined;
  price: number;
  pdfFile: string | undefined;
  pageCount: number | undefined;
  purchaseCount: number | undefined;
  status: string | undefined;
  noteCover: string;
  samplePdfProperties: number[];
  ratingCount: { "1": number, "2": number, "3": number, "4": number, "5": number };
  refundPolicy: { refundPeriod: Number, acceptedReasons: string[], isApprovalRequired: boolean } | undefined;
  rejectReason: { isAi?: boolean, flaggedSections: string[], feedback: string } | undefined;
  isOwned: boolean;
  isPurchased: boolean;
  isRefundAvailable: boolean | undefined;
  isDownloadAvailable: boolean | undefined;
  _score: number | undefined | null;
  sort: number[] | undefined;
  dateCreated: Date;
  dateUpdated: Date;

  constructor({ _id, seller, sellerUid, title = "", description = "", subjectIds, subjects, price = 0, pdfFile,
                pageCount = 0, purchaseCount = 0, status, noteCover = "placeholder.jpg", samplePdfProperties = [],
                ratingCount = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 }, refundPolicy, rejectReason, isOwned = false,
                isPurchased = false, isDownloadAvailable, isRefundAvailable, _score, sort, dateCreated = new Date(),
                dateUpdated = new Date() } : {
    _id?: string,
    seller?: any,
    sellerUid?: string,
    title: string,
    description: string,
    subjectIds?: string[],
    subjects?: any[],
    price: number,
    pdfFile?: string,
    pageCount?: number,
    purchaseCount?: number,
    status?: string,
    noteCover?: string,
    samplePdfProperties?: number[]
    ratingCount?: { "1": number, "2": number, "3": number, "4": number, "5": number },
    refundPolicy?: { refundPeriod: Number, acceptedReasons: string[], isApprovalRequired: boolean },
    rejectReason?: { isAi?: boolean, flaggedSections: string[], feedback: string },
    isOwned?: boolean,
    isPurchased?: boolean,
    isRefundAvailable?: boolean,
    isDownloadAvailable?: boolean,
    _score?: number | null,
    sort?: number[],
    dateCreated?: Date | string,
    dateUpdated?: Date | string }) {

    this._index = Note.indexName;
    this._id = _id;
    // If seller is provided and is not an instanceof User, parse it as a User.
    this.seller = seller ? (seller instanceof User ? seller : new User(seller)) : undefined;
    this.sellerUid = sellerUid;
    this.title = title.trim();
    this.description = description.trim();
    this.subjectIds = subjectIds;
    // If subjects is provided and is not an instanceof Subject, parse it as a Subject.
    this.subjects = subjects ? subjects.map((subject) => {
      return subject instanceof Subject ? subject : new Subject(subject);
    }) : undefined;
    this.price = price;
    this.pdfFile = pdfFile;
    this.pageCount = pageCount;
    this.purchaseCount = purchaseCount;
    this.status = status;
    this.noteCover = noteCover;
    this.samplePdfProperties = samplePdfProperties;
    this.ratingCount = ratingCount;
    this.refundPolicy = refundPolicy;
    this.rejectReason = rejectReason;
    this.isOwned = isOwned;
    this.isPurchased = isPurchased;
    this.isRefundAvailable = isRefundAvailable;
    this.isDownloadAvailable = isDownloadAvailable;
    this._score = _score;
    this.sort = sort;
    this.dateCreated = dateCreated instanceof Date ? dateCreated : new Date(dateCreated);
    this.dateUpdated = dateUpdated instanceof Date ? dateUpdated : new Date(dateUpdated);
  }

  static setModelReferences(modelReferences: { User: any, Subject: any }) {
    User = modelReferences.User;
    Subject = modelReferences.Subject;
  }
}
