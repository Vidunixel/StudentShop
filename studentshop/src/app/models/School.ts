export class School {
  static SchoolStatus = {
    OPEN: "O",
    PROPOSED: "P",
    CLOSED: "C"
  }

  static SchoolType = {
    COMBINED: "Pri/Sec",
    PRIMARY: "Prim",
    SECONDARY: "Sec",
    SPECIAL: "Special"
  }

  static SchoolSector = {
    GOVERNMENT: "Gov",
    NON_GOVERNMENT: "NG"
  }

  _index: string;
  _id: string | undefined;
  acaraId: string | undefined;
  name: string;
  schoolType: string | undefined;
  sector: string | undefined;
  status: string | undefined;
  locality: string | undefined;
  region: string | undefined;
  postcode: string | undefined;
  coordinates: { lat: number , lon: number } | undefined;
  websiteUrl: string | undefined;
  campusParentAcaraId: string | undefined;
  parentCampus: School | undefined;
  _score: number | undefined | null;
  sort: number[] | undefined;
  dateCreated: Date;
  dateUpdated: Date;

  constructor({ _id, acaraId, name, schoolType, sector, status, locality, region, postcode, coordinates, websiteUrl,
                campusParentAcaraId, parentCampus, _score, sort, dateCreated = new Date(), dateUpdated = new Date() } : {
    _id?: string,
    acaraId?: string,
    name: string,
    schoolType?: string,
    sector?: string,
    status?: string,
    locality?: string,
    region?: string,
    postcode?: string,
    coordinates?: { lat: number , lon: number },
    websiteUrl?: string,
    campusParentAcaraId?: string,
    parentCampus: any,
    _score?: number | null,
    sort?: number[],
    dateCreated?: Date | string,
    dateUpdated?: Date | string }) {

    this._index = "schools";
    this._id = _id;
    this.acaraId = acaraId;
    this.name = name;
    this.schoolType = schoolType;
    this.sector = sector;
    this.status = status;
    this.locality = locality;
    this.region = region;
    this.postcode = postcode;
    this.coordinates = coordinates;
    this.websiteUrl = websiteUrl;
    this.campusParentAcaraId = campusParentAcaraId;
    // If parentCampus is provided and is not an instanceof School, parse it as a School.
    this.parentCampus = parentCampus ? (parentCampus instanceof School ? parentCampus : new School(parentCampus)) : undefined;
    this._score = _score;
    this.sort = sort;
    this.dateCreated = dateCreated instanceof Date ? dateCreated : new Date(dateCreated);
    this.dateUpdated = dateUpdated instanceof Date ? dateUpdated : new Date(dateUpdated);
  }

  toString() {
    return `${this.name}, ${this.region}`;
  }
}
