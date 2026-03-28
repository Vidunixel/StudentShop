const {client, mongooseToJson, elasticSearchToJson} = require("./common");
const QueueLockService = require("../services/QueueLockService");
const mongoose = require("mongoose");
const mongooseLeanVirtuals = require("mongoose-lean-virtuals");
let Subject;
let School;

class User {
  static Visibility = {
    PUBLIC: "public",
    PRIVATE: "private"
  }

  static AccountType = {
    STANDARD: "standard",
    STAFF: "staff",
    ADMIN: "admin"
  }

  static defaultProfilePic = "default.svg";

  static indexName = "users";

  static #mongooseSchema;
  static mongooseModel;

  static #elasticSearchMapping = {
    properties: {
      uid: { type: "keyword" },
      name: {
        type: "text",
        fields: {
          keyword: {
            type: "keyword",
            normalizer: "lowercase_normalizer"
          }
        }
      },
      username: {
        type: "text",
        fields: {
          keyword: {
            type: "keyword",
            normalizer: "lowercase_normalizer"
          }
        }
      },
      bio: { type: "keyword" },
      profilePic: { type: "keyword" },
      studentDetails: {
        properties: {
          isActive: { type: "boolean" },
          school: {
            properties: {
              visibility: { type: "keyword" },
              schoolId: { type: "keyword" },
            }
          },
          subjects: {
            properties: {
              visibility: { type: "keyword" },
              subjectIds: { type: "keyword" },
            }
          }
        }
      },
      accountType: { "type": "keyword" },
      dateCreated: {
        type: "date",
        format: "strict_date_optional_time"
      },
      dateUpdated: {
        type: "date",
        format: "strict_date_optional_time"
      },
    }
  };

  #_index;
  #_id;
  #uid;
  #name;
  #username;
  #bio;
  #profilePic;
  #accountType;
  #studentDetails;
  #dateCreated;
  #dateUpdated;

  constructor({ _id, uid, name, username, bio, profilePic, accountType, studentDetails }) {
    this.#_index = User.indexName;
    this.#uid = uid;
    this.#name = name;
    this.#username = username.toLowerCase();
    this.#bio = bio;
    this.#profilePic = profilePic;
    this.#accountType = accountType;
    this.#studentDetails = studentDetails;
  }

  /**
   * Create an explicit mapping for users if it does not already exist.
   * @return {Promise<string>} Success message.
   */
  static async initialiseElasticIndex() {
    try {
      // Check if the index already exists.
      const indexExists = await client.indices.exists({index: User.indexName});

      if (!indexExists) {
        // Create the index with mappings.
        await client.indices.create({
          index: User.indexName,
          settings: {
            analysis: {
              normalizer: {
                lowercase_normalizer: {
                  type: "custom",
                  filter: ["lowercase"]
                }
              }
            }
          },
          mappings: User.#elasticSearchMapping
        });
        return `${User.indexName} index initialised successfully.`;
      }
      return `${User.indexName} index has already been initialised.`;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  static setModelReferences(modelReferences) {
    Subject = modelReferences.Subject;
    School = modelReferences.School;
  }

  static initialiseMongooseSchema() {
    User.#mongooseSchema = new mongoose.Schema({
      _index: { type: String, enum: [User.indexName], required: true },
      uid: { type: String, required: true, unique: true },
      name: { type: String, required: true },
      username: { type: String, required: true, unique: true },
      bio: { type: String, default: "" },
      profilePic: { type: String, required: true, default: User.defaultProfilePic },
      accountType: { type: String, enum: Object.values(User.AccountType), required: true, default: User.AccountType.STANDARD },
      studentDetails: {
        type: {
          isActive: { type: Boolean, required: true, default: false },
          school: {
            type: {
              visibility: { type: String, enum: Object.values(User.Visibility), required: true, default: User.Visibility.PUBLIC },
              schoolId: { type: mongoose.Schema.Types.ObjectId, ref: School.indexName },
            },
            required: true,
            default: {},
            _id: false
          },
          subjects: {
            type: {
              visibility: { type: String, enum: Object.values(User.Visibility), required: true, default: User.Visibility.PUBLIC },
              subjectIds: {
                type: [{ type: mongoose.Schema.Types.ObjectId, ref: Subject.indexName, required: true }],
                required: true,
                default: []
              }
            },
            required: true,
            default: {},
            _id: false
          }
        },
        required: true,
        default: {},
        _id: false
      },
      dateCreated: { type: Date, required: true },
      dateUpdated: { type: Date, required: true }
    });
    User.#mongooseSchema.virtual("studentDetails.school.school", {
      ref: School.indexName,
      localField: "studentDetails.school.schoolId",
      foreignField: "_id",
      justOne: true
    });
    User.#mongooseSchema.virtual("studentDetails.subjects.subjects", {
      ref: Subject.indexName,
      localField: "studentDetails.subjects.subjectIds",
      foreignField: "_id",
      justOne: false
    });
    User.#mongooseSchema.plugin(mongooseLeanVirtuals);
    User.mongooseModel = mongoose.model(User.indexName, User.#mongooseSchema);
  }

  /**
   * Filter out attributes of a User object that should not be visible to owner.
   * @param user The user object.
   * @return {*&{_index: string}}
   */
  static filterAttributesForOwner(user) {
    return {
      _index: user._index,
      _id: user._id,
      uid: user.uid,
      name: user.name,
      username: user.username,
      bio: user.bio,
      profilePic: user.profilePic,
      accountType: user.accountType,
      studentDetails: user.studentDetails,
      _score: user._score,
      sort: user.sort,
      dateCreated: new Date(user.dateCreated),
      dateUpdated: new Date(user.dateUpdated)
    }
  }

  /**
   * Filter out attributes of a User object that should not be visible to public.
   * @param user The user object.
   * @return {*&{_index: string}}
   */
  static filterAttributesForPublic(user) {
    return {
      _index: user._index,
      _id: user._id,
      uid: user.uid,
      name: user.name,
      username: user.username,
      bio: user.bio,
      profilePic: user.profilePic,
      // Show student details based on visibility.
      ...(user.studentDetails?.isActive === true ?
        {
          studentDetails: {
            isActive: user.studentDetails.isActive,
            ...(user.studentDetails?.school?.visibility === User.Visibility.PUBLIC ? {
              school: {
                visibility: user.studentDetails.school.visibility,
                schoolId: user.studentDetails.school.schoolId,
                ...(user?.studentDetails?.school?.school != null ? {
                  school: School.filterAttributesForPublic(user.studentDetails.school.school)
                } : {})
              }
            } : {}),
            ...(user.studentDetails?.subjects?.visibility === User.Visibility.PUBLIC ? {
              subjects: {
                visibility: user.studentDetails.subjects.visibility,
                subjectIds: user.studentDetails.subjects.subjectIds,
                ...(user?.studentDetails?.subjects?.subjects != null ? {
                  subjects: user.studentDetails.subjects.subjects.map((subject) =>
                    Subject.filterAttributesForPublic(subject))
                } : {})
              }
            } : {}),
          }
        } : {}),
      _score: user._score,
      sort: user.sort,
      dateCreated: new Date(user.dateCreated),
      dateUpdated: new Date(user.dateUpdated)
    }
  }

  /**
   * Merge ElasticSearch documents with the equivalent MongoDB ones.
   * @param response ElasticSearch response.
   * @param populate{{ all?: boolean, school?: boolean, subjects?: boolean }}
   * True if specified foreign field should be populated, false if not. 'all' populates all foreign fields.
   * @return {Promise<>} JSON response of merged documents.
   */
  static async #mergeElasticAndMongoDocuments(response, populate = {}) {
    const elasticDocuments = elasticSearchToJson(response);
    const elasticDocumentIds = elasticDocuments.map((document) => document._id);

    // Get MongoDb documents.
    const mongoDocuments = await User.findManyByIds(elasticDocumentIds, undefined,
      populate);

    // Merge documents.
    const mergedDocuments = [];
    for (let i = 0; i < elasticDocuments.length; i++) {
      const equivalentMongoDoc = mongoDocuments.find((mongoDocument) =>
        elasticDocuments[i]._id === mongoDocument._id);

      // Only add document to mergedDocuments if it exists in MongoDB.
      if (equivalentMongoDoc) {
        mergedDocuments.push({ ...elasticDocuments[i], ...equivalentMongoDoc })
      }
    }

    return mergedDocuments;
  }

  /**
   * Find all documents.
   * @param session The MongoDB session, if applicable.
   * @param populate{{ all?: boolean, school?: boolean, subjects?: boolean }}
   * @return {Promise<>} An array of Reviews that exist in the database.
   */
  static async findMany(session = undefined, populate = {}) {
    try {
      return mongooseToJson(await User.mongooseModel.find({},
        undefined, ...(session != null ? [{ session }] : []))
        .populate([
          ...(populate.all || populate.school ? [{ path: "studentDetails.school.school" }] : []),
          ...(populate.all || populate.subjects ? [{ path: "studentDetails.subjects.subjects" }] : [])
        ])
        .lean({ virtuals: true }));
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Find documents that match the given ids.
   * @param ids An array of ids to search.
   * @param session The MongoDB session, if applicable.
   * @param populate{{ all?: boolean, school?: boolean, subjects?: boolean }}
   * @return {Promise<>} An array of Reviews that exist in the database.
   */
  static async findManyByIds(ids, session = undefined, populate = {}) {
    try {
      return mongooseToJson(await User.mongooseModel.find({
        _id: { $in: ids }
      }, undefined, ...(session != null ? [{ session }] : []))
        .populate([
          ...(populate.all || populate.school ? [{ path: "studentDetails.school.school" }] : []),
          ...(populate.all || populate.subjects ? [{ path: "studentDetails.subjects.subjects" }] : [])
        ])
        .lean({ virtuals: true }));
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Find documents that match the given uids.
   * @param uids An array of uids to search.
   * @param session The MongoDB session, if applicable.
   * @param populate{{ all?: boolean, school?: boolean, subjects?: boolean }}
   * @return {Promise<>} An array of users that exist in the database.
   */
  static async findManyByUids(uids, session = undefined, populate = {}) {
    try {
      return mongooseToJson(await User.mongooseModel.find({
        uid: { $in: uids }
      }, undefined, ...(session != null ? [{ session }] : []))
        .populate([
          ...(populate.all || populate.school ? [{ path: "studentDetails.school.school" }] : []),
          ...(populate.all || populate.subjects ? [{ path: "studentDetails.subjects.subjects" }] : [])
        ])
        .lean({ virtuals: true }));
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Find a document that matches the provided username exactly.
   * @param username Username to search for.
   * @param session The MongoDB session, if applicable.
   * @param populate{{ all?: boolean, school?: boolean, subjects?: boolean }}
   * @return {Promise<>} An array of users that exist in the database.
   */
  static async findOneByUsername(username, session = undefined, populate = {}) {
    try {
      return mongooseToJson(await User.mongooseModel.find({
        username: username
      }, undefined, ...(session != null ? [{ session }] : []))
        .populate([
          ...(populate.all || populate.school ? [{ path: "studentDetails.school.school" }] : []),
          ...(populate.all || populate.subjects ? [{ path: "studentDetails.subjects.subjects" }] : [])
        ])
        .limit(1)
        .lean({ virtuals: true }));
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Method which returns an id reference for the current state of the index.
   * @return {Promise<string>} Reference ID.
   */
  static async getPointInTime() {
    try {
      const response = await client.openPointInTime({
        index: User.indexName,
        keep_alive: "45m",
      });

      return response.id;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Find documents that matches the provided query (Admin/Staff).
   * @param searchQuery Name & username to search for.
   * @param filters Filters to apply.
   * @param sortBy Sort method.
   * @param nextPage The search_after values to get next page.
   * @param pitId Id reference for the current state of the index.
   * @param size Number of documents returned.
   * @param populate{{ all?: boolean, school?: boolean, subjects?: boolean }}
   * True if specified foreign field should be populated, false if not. 'all' populates all foreign fields.
   * @return {Promise<>}
   */
  static async findManyByQueryAdminSearch(searchQuery = undefined, filters = { },
                                          sortBy = "relevance", nextPage = undefined,
                                          pitId = undefined, size = 50, populate = {}) {
    try {
      const response = await client.search({
        // Specify index only if pitId is undefined.
        ...(pitId != null ? { } : { index: User.indexName }),
        query: {
          function_score: {
            query: {
              bool: {
                must: [
                  ...(filters._id != null ? [{ term: { "_id": { value: filters._id } }}] : []),
                  ...(filters.uid != null ? [{ term: { "uid": { value: filters.uid } }}] : []),
                  ...(filters.accountType != null ? [{ term: { "accountType": { value: filters.accountType } }}] : []),
                  ...(filters.schoolId != null ? [{ term: { "studentDetails.school.schoolId": { value: filters.schoolId } }}] : []),
                  ...(filters.subjectIds != null ? [{
                    terms: {
                      "studentDetails.subjects.subjectIds": filters.subjectIds
                    }
                  }] : []),
                  ...(searchQuery != null ? [{
                    multi_match : {
                      query : searchQuery,
                      fields : [ "name", "username" ],
                      fuzziness: "AUTO"
                    }
                  }] : []),
                ]
              }
            }
          }
        },
        ...(pitId != null ? { pit: { id: pitId, keep_alive: "15m" }} : {}),
        ...(nextPage != null ? { search_after: nextPage } : {}),
        sort: [
          // Sorting by relevance score including dateCreated tiebreaker.
          ...(sortBy === "relevance" ? ["_score", { "dateCreated": "desc" }] : []),
          // Sorting by dateCreated.
          ...(sortBy === "date-created-desc" ? [{ "dateCreated": "desc" }] : []),
          ...(sortBy === "date-created-asc" ? [{ "dateCreated": "asc" }] : []),
          // Sorting by dateUpdated.
          ...(sortBy === "date-updated-desc" ? [{ "dateUpdated": "desc" }] : []),
          ...(sortBy === "date-updated-asc" ? [{ "dateUpdated": "asc" }] : [])
        ],
        size: size,
      });

      // Merge ElasticSearch response with MongoDB documents.
      return await User.#mergeElasticAndMongoDocuments(response, populate);
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Create a users document with set attributes.
   * @param session The MongoDB session, if applicable.
   * @return {Promise<Object>}
   */
  async save(session = undefined) {
    try {
      const dateCreated = new Date();

      // Save new document.
      const response = mongooseToJson(await User.mongooseModel.create([{
        ...(this.#_index != null ? { _index: this.#_index } : {}),
        ...(this.#uid != null ? { uid: this.#uid } : {}),
        ...(this.#name != null ? { name: this.#name } : {}),
        ...(this.#username != null ? { username: this.#username } : {}),
        ...(this.#bio != null ? { bio: this.#bio } : {}),
        ...(this.#profilePic != null ? { profilePic: this.#profilePic } : {}),
        ...(this.#accountType != null ? { accountType: this.#accountType } : {}),
        ...(this.#studentDetails ? { studentDetails: this.#studentDetails } : {}),
        dateCreated: dateCreated,
        dateUpdated: dateCreated
      }], ...(session != null ? [{ session }] : [])));

      if (!response?.length || !response?.[0]?._id) {
        throw new Error(`Error saving ${User.indexName} document.`);
      }

      const item = response[0];

      this.#_id = item._id;
      this.#dateCreated = dateCreated;
      this.#dateUpdated = dateCreated;

      return item;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Update a user document with defined attributes.
   * @param id The id of the user to update.
   * @param fields The fields and the values to update to.
   * @param session The MongoDB session, if applicable.
   * @return {Promise<void>}
   */
  static async updateOneById(id, fields = {}, session = undefined) {
    try {
      // Lock requests with the same id to run synchronously.
      await new QueueLockService(QueueLockService.DatabaseQueue.users).processJob({ id },
        async () => {
        const dateUpdated = new Date();

        // Update existing document.
        const response = await User.mongooseModel.updateOne(
          { _id: id },
          {
            $set: {
              ...(fields.uid != null ? { uid: fields.uid } : {}),
              ...(fields.name != null ? { name: fields.name } : {}),
              ...(fields.username != null ? { username: fields.username } : {}),
              ...(fields.bio != null ? { bio: fields.bio } : {}),
              ...(fields.profilePic != null ? { profilePic: fields.profilePic } : {}),
              ...(fields.accountType != null ? { accountType: fields.accountType } : {}),
              ...(fields.studentDetails != null ? { studentDetails: fields.studentDetails } : {}),
              dateUpdated: dateUpdated
            }
          },
          { runValidators: true, context: "query", ...(session != null ? { session } : {}) }
        );

        const matched = response.matchedCount ?? response.n ?? 0;

        if (!matched) {
          throw new Error(`Error updating ${User.indexName} document.`);
        }
      });
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

}

module.exports = User;
