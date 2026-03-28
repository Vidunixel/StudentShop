export class Subject {

  static Certificate = {
    VCE: "VCE",
    HSC: "HSC",
    WACE: "WACE",
    QCE: "QCE",
    SACE: "SACE",
    TCE: "TCE"
  }

  _index: string;
  _id: string | undefined;
  name: string;
  certificate: string;
  _score: number | undefined | null;
  sort: number[] | undefined;
  dateCreated: Date;
  dateUpdated: Date;

  constructor({ _id, name, certificate, _score, sort, dateCreated = new Date(), dateUpdated = new Date() } : {
    _id?: string,
    name: string,
    certificate: string,
    _score?: number | null,
    sort?: number[],
    dateCreated?: Date | string,
    dateUpdated?: Date | string }) {

    this._index = "subjects";
    this._id = _id;
    this.name = name;
    this.certificate = certificate;
    this._score = _score;
    this.sort = sort;
    this.dateCreated = dateCreated instanceof Date ? dateCreated : new Date(dateCreated);
    this.dateUpdated = dateUpdated instanceof Date ? dateUpdated : new Date(dateUpdated);
  }

  toString() {
    return this.certificate ? `${this.certificate} / ${this.name}` : this.name;
  }
}
