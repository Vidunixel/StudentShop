import {v4 as uuidv4} from "uuid";
import type {School as ISchool} from "./School";
import type {Subject as ISubject} from "./Subject";
let School: any;
let Subject: any;

export class User {
  static Visibility = {
    PUBLIC: "public",
    PRIVATE: "private"
  };

  static AccountType = {
    STANDARD: "standard",
    STAFF: "staff",
    ADMIN: "admin"
  }

  static defaultProfilePic = "default.svg";

  _index: string;
  _id: string | undefined;
  uid: string;
  name: string;
  username: string;
  bio: string;
  profilePic: string;
  accountType: string;
  studentDetails: {
    isActive: boolean,
    school?: {
      visibility: string,
      schoolId?: string,
      school?: ISchool
    },
    subjects?: {
      visibility: string,
      subjectIds: string[],
      subjects?: ISubject[]
    }
  } | undefined;
  balance: number;
  availableBalance: number;
  _score: number | undefined | null;
  sort: number[] | undefined;
  dateCreated: Date;
  dateUpdated: Date;

  constructor({ _id, uid, name = "John Doe", username = uuidv4(), bio = "", profilePic = User.defaultProfilePic,
                accountType = User.AccountType.STANDARD, studentDetails, balance = 0, availableBalance = 0,
                _score, sort, dateCreated = new Date(), dateUpdated = new Date() } : {
    _id?: string,
    uid: string,
    name?: string,
    username?: string,
    bio?: string,
    profilePic?: string,
    accountType?: string,
    studentDetails?: {
      isActive: boolean,
      school?: {
        visibility: string,
        schoolId?: string,
        school?: any
      },
      subjects?: {
        visibility: string,
        subjectIds: string[],
        subjects?: any[]
      }
    },
    school?: any,
    subjects?: any[],
    balance?: number,
    availableBalance?: number,
    _score?: number | null,
    sort?: number[],
    dateCreated?: Date | string,
    dateUpdated?: Date | string }) {

    this._index = "users";
    this._id = _id;
    this.uid = uid;
    this.name = name.trim();
    this.username = username.trim().toLowerCase();
    this.bio = bio.trim();
    this.profilePic = profilePic;
    this.accountType = accountType;
    this.studentDetails = studentDetails ? {
      ...studentDetails,
      school: studentDetails.school ? {
        ...studentDetails.school,
        school: studentDetails.school.school ? studentDetails.school.school instanceof School ?
          studentDetails.school.school : new School(studentDetails.school.school) : undefined
      } : undefined,
      subjects: studentDetails.subjects ? {
        ...studentDetails.subjects,
        subjects: studentDetails.subjects.subjects ? studentDetails.subjects.subjects
          .map((subject: any) => subject instanceof Subject ? subject : new Subject(subject)) : []
      } : undefined,
    } : undefined;
    this.balance = balance;
    this.availableBalance = availableBalance;
    this._score = _score;
    this.sort = sort;
    this.dateCreated = dateCreated instanceof Date ? dateCreated : new Date(dateCreated);
    this.dateUpdated = dateUpdated instanceof Date ? dateUpdated : new Date(dateUpdated);
  }

  static setModelReferences(modelReferences: { Subject: any, School: any }) {
    Subject = modelReferences.Subject;
    School = modelReferences.School;
  }
}
