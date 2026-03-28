import type {User as IUser} from "./User";
import type {Note as INote} from "./Note";
let User: any;
let Note: any;

export class Review {
  _index: string;
  _id: string | undefined;
  user: IUser | undefined;
  userUid: string | undefined;
  rating: number;
  review: string;
  item: { _index: string | undefined, _id: string | undefined } | undefined;
  detailedItem: INote | undefined;
  isAi: boolean | undefined;
  _score: number | undefined | null;
  sort: number[] | undefined;
  dateCreated: Date;
  dateUpdated: Date;

  constructor({ _id, user, userUid, rating, review, item, detailedItem, isAi, _score, sort, dateCreated = new Date(),
                dateUpdated = new Date() } : {
    _id?: string,
    user?: any,
    userUid?: string,
    rating: number,
    review: string,
    item?: { _index: string | undefined, _id: string | undefined },
    detailedItem?: any,
    isAi?: boolean,
    _score?: number | null,
    sort?: number[],
    dateCreated?: Date | string,
    dateUpdated?: Date | string }) {

    this._index = "reviews";
    this._id = _id;
    // If user is provided and is not an instanceof User, parse it as a User.
    this.user = user ? (user instanceof User ? user : new User(user)) : undefined;
    this.userUid = userUid;
    this.rating = rating;
    this.review = review.trim();
    this.item = item;
    // If detailedItem is provided and is not an instanceof Note, parse it as a Note.
    this.detailedItem = detailedItem ? (detailedItem instanceof Note ? detailedItem : new Note(detailedItem)) : undefined;
    this.isAi = isAi;
    this._score = _score;
    this.sort = sort;
    this.dateCreated = dateCreated instanceof Date ? dateCreated : new Date(dateCreated);
    this.dateUpdated = dateUpdated instanceof Date ? dateUpdated : new Date(dateUpdated);
  }

  static setModelReferences(modelReferences: { User: any, Note: any }) {
    User = modelReferences.User;
    Note = modelReferences.Note;
  }
}
