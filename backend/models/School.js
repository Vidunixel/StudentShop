const {client, mongooseToJson, elasticSearchToJson} = require("./common");
const mongoose = require("mongoose");
const mongooseLeanVirtuals = require("mongoose-lean-virtuals");
const QueueLockService = require("../services/QueueLockService");

class School {
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

  static indexName = "schools";

  static #mongooseSchema;
  static mongooseModel;

  static #elasticSearchMapping = {
    properties: {
      acaraId: {
        type: "keyword"
      },
      name: {
        type: "text"
      },
      schoolType: {
        type: "keyword",
      },
      sector: {
        type: "keyword",
      },
      status: {
        type: "keyword",
      },
      locality: {
        type: "text"
      },
      region: {
        type: "text"
      },
      postcode: {
        type: "text"
      },
      coordinates: {
        type: "geo_point"
      },
      websiteUrl: {
        type: "keyword"
      },
      campusParentAcaraId: {
        type: "keyword"
      },
      dateCreated: {
        type: "date",
        format: "strict_date_optional_time"
      },
      dateUpdated: {
        type: "date",
        format: "strict_date_optional_time"
      }
    }
  };

    #_index;
  #_id;
  #acaraId;
  #name;
  #schoolType;
  #sector;
  #status;
  #locality;
  #region;
  #postcode;
  #coordinates;
  #websiteUrl;
  #campusParentAcaraId;
  #dateCreated;
  #dateUpdated;

  constructor({ acaraId, name, schoolType, sector, status, locality, region, postcode, coordinates, websiteUrl,
                campusParentAcaraId }) {
    this.#_index = School.indexName;
    this.#acaraId = acaraId;
    this.#name = name;
    this.#schoolType = schoolType;
    this.#sector = sector;
    this.#status = status;
    this.#locality = locality;
    this.#region = region;
    this.#postcode = postcode;
    this.#coordinates = coordinates;
    this.#websiteUrl = websiteUrl;
    this.#campusParentAcaraId = campusParentAcaraId;
  }

  /**
   * Create an explicit mapping for schools if it does not already exist.
   * @return {Promise<string>} Success message.
   */
  static async initialiseElasticIndex() {
    try {
      // Check if the index already exists.
      const indexExists = await client.indices.exists({index: School.indexName});

      if (!indexExists) {
        // Create the index with mappings.
        await client.indices.create({
          index: School.indexName,
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
          mappings: School.#elasticSearchMapping
        });
        return `${School.indexName} index initialised successfully.`;
      }
      return `${School.indexName} index has already been initialised.`;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  static initialiseMongooseSchema() {
    School.#mongooseSchema = new mongoose.Schema({
      _index: { type: String, enum: [School.indexName], required: true },
      acaraId: { type: String, required: true },
      name: { type: String, required: true },
      schoolType: { type: String, enum: Object.values(School.SchoolType), required: true },
      sector: { type: String, enum: Object.values(School.SchoolSector), required: true },
      status: { type: String, enum: Object.values(School.SchoolStatus), required: true },
      locality: { type: String },
      region: { type: String },
      postcode: { type: String },
      coordinates: {
        type: {
          lat: { type: Number },
          lon: { type: Number }
        },
        _id: false
      },
      websiteUrl: { type: String },
      campusParentAcaraId: { type: String },
      dateCreated: { type: Date, required: true },
      dateUpdated: { type: Date, required: true }
    });
    School.#mongooseSchema.virtual("parentCampus", {
      ref: School.indexName,
      localField: "campusParentAcaraId",
      foreignField: "acaraId",
      justOne: true
    });
    School.#mongooseSchema.plugin(mongooseLeanVirtuals);
    School.mongooseModel = mongoose.model(School.indexName, School.#mongooseSchema);
  }

  /**
   * Filter out attributes of a School object that should not be visible to public.
   * @param school The school object.
   * @return {*&{_index: string}}
   */
  static filterAttributesForPublic(school) {
    return {
      _index: school._index,
      _id: school._id,
      name: school.name,
      region: school.region,
      _score: school._score,
      sort: school.sort,
      dateCreated: new Date(school.dateCreated),
      dateUpdated: new Date(school.dateUpdated)
    }
  }

  /**
   * Merge ElasticSearch documents with the equivalent MongoDB ones.
   * @param response ElasticSearch response.
   * @param populate{{ all?: boolean, parentCampus?: boolean }}
   * True if specified foreign field should be populated, false if not. 'all' populates all foreign fields.
   * @return {Promise<>} JSON response of merged documents.
   */
  static async #mergeElasticAndMongoDocuments(response, populate = {}) {
    const elasticDocuments = elasticSearchToJson(response);
    const elasticDocumentIds = elasticDocuments.map((document) => document._id);

    // Get MongoDb documents.
    const mongoDocuments = await School.findManyByIds(elasticDocumentIds, undefined,
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
   * Find documents that match the given ids.
   * @param ids An array of ids to search.
   * @param session The MongoDB session, if applicable.
   * @param populate{{ all?: boolean, parentCampus?: boolean }}
   * @return {Promise<>} An array of Reviews that exist in the database.
   */
  static async findManyByIds(ids, session = undefined, populate = {}) {
    try {
      return mongooseToJson(await School.mongooseModel.find({
        _id: { $in: ids }
      }, undefined, ...(session != null ? [{ session }] : []))
        .populate([
          ...(populate.all || populate.parentCampus ? [{ path: "parentCampus" }] : [])
        ])
        .lean({ virtuals: true }));
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Find documents that match the given ids.
   * @param acaraIds An array of acaraIds to search.
   * @param session The MongoDB session, if applicable.
   * @param populate{{ all?: boolean, parentCampus?: boolean }}
   * @return {Promise<>} An array of Reviews that exist in the database.
   */
  static async findManyByAcaraIds(acaraIds, session = undefined, populate = {}) {
    try {
      return mongooseToJson(await School.mongooseModel.find({
        acaraId: { $in: acaraIds }
      }, undefined, ...(session != null ? [{ session }] : []))
        .populate([
          ...(populate.all || populate.parentCampus ? [{ path: "parentCampus" }] : [])
        ])
        .lean({ virtuals: true }));
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Find a document that matches the provided query.
   * @param searchQuery Name, locality, region & postcode to search for.
   * @param filters Filters to apply.
   * @param sortBy Sort method.
   * @param nextPage The search_after values to get next page.
   * @param pitId Id reference for the current state of the index.
   * @param size Number of documents returned.
   * @param populate{{ all?: boolean, parentCampus?: boolean }}
   * True if specified foreign field should be populated, false if not. 'all' populates all foreign fields.
   * @return {Promise<>}
   */
  static async findManyByQuerySearch(searchQuery = undefined, filters = { parentCampusOnly: true  },
                                     sortBy = "relevance", nextPage = undefined,
                                     pitId = undefined, size = 25, populate = {}) {
    try {
      const response = await client.search({
        // Specify index only if pitId is undefined.
        ...(pitId != null ? { } : { index: School.indexName }),
        query: {
          function_score: {
            query: {
              bool: {
                must: [
                  ...(searchQuery != null ? [{
                    multi_match : {
                      query : searchQuery,
                      fields : [ "name^3", "locality^1", "region^1", "postcode^1" ],
                      fuzziness: "AUTO"
                    }
                  }] : []),
                ],
                filter: [
                  // Script to match acaraId and campusParentAcaraId if parentCampusOnly is true.
                  ...(filters.parentCampusOnly != null ? [{
                    script: {
                      script: {
                        source: "doc['acaraId'].size() > 0 && doc['campusParentAcaraId'].size() > 0 && " +
                          "doc['acaraId'].value == doc['campusParentAcaraId'].value",
                        lang: "painless"
                      }
                    }
                  }] : [])
                ]
              }
            },
            score_mode: "avg",
            boost_mode: "avg"
          }
        },
        ...(pitId != null ? { pit: { id: pitId, keep_alive: "15m" }} : {}),
        ...(nextPage != null ? { search_after: nextPage } : {}),
        sort: [
          // Sorting by relevance score including dateCreated tiebreaker.
          ...(sortBy === "relevance" ? ["_score", { "dateCreated": "desc" }] : []),
        ],
        size: size,
      });

      // Merge ElasticSearch response with MongoDB documents.
      return await School.#mergeElasticAndMongoDocuments(response, populate);
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Find documents that matches the provided query (Admin/Staff).
   * @param searchQuery Name, locality, region & postcode to search for.
   * @param filters Filters to apply.
   * @param sortBy Sort method.
   * @param nextPage The search_after values to get next page.
   * @param pitId Id reference for the current state of the index.
   * @param size Number of documents returned.
   * @param populate{{ all?: boolean, parentCampus?: boolean }}
   * True if specified foreign field should be populated, false if not. 'all' populates all foreign fields.
   * @return {Promise<>}
   */
  static async findManyByQueryAdminSearch(searchQuery = undefined, filters = { },
                                          sortBy = "relevance", nextPage = undefined,
                                          pitId = undefined, size = 50, populate = {}) {
    try {
      const response = await client.search({
        // Specify index only if pitId is undefined.
        ...(pitId != null ? { } : { index: School.indexName }),
        query: {
          function_score: {
            query: {
              bool: {
                must: [
                  ...(filters._id != null ? [{ term: { "_id": { value: filters._id } }}] : []),
                  ...(filters.acaraId != null ? [{ term: { "acaraId": { value: filters.acaraId } }}] : []),
                  ...(filters.schoolType != null ? [{ term: { "schoolType": { value: filters.schoolType } }}] : []),
                  ...(filters.sector != null ? [{ term: { "sector": { value: filters.sector } }}] : []),
                  ...(filters.status != null ? [{ term: { "status": { value: filters.status } }}] : []),
                  ...(filters.campusParentAcaraId != null ? [{ term: { "campusParentAcaraId": { value: filters.campusParentAcaraId } }}] : []),
                  ...(searchQuery != null ? [{
                    multi_match : {
                      query : searchQuery,
                      fields : [ "name^3", "locality^1", "region^1", "postcode^1" ],
                      fuzziness: "AUTO"
                    }
                  }] : []),
                ],
                filter: [
                  // Script to match acaraId and campusParentAcaraId if parentCampusOnly is true.
                  ...(filters.parentCampusOnly != null ? [{
                    script: {
                      script: {
                        source: "doc['acaraId'].size() > 0 && doc['campusParentAcaraId'].size() > 0 && " +
                          "doc['acaraId'].value == doc['campusParentAcaraId'].value",
                        lang: "painless"
                      }
                    }
                  }] : [])
                ]
              }
            },
            score_mode: "avg",
            boost_mode: "avg"
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
      return await School.#mergeElasticAndMongoDocuments(response, populate);
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
        index: School.indexName,
        keep_alive: "45m",
      });

      return response.id;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Create a School document with set attributes.
   * @param session The MongoDB session, if applicable.
   * @return {Promise<Object>}
   */
  async save(session = undefined) {
    try {
      const dateCreated = new Date();

      // Save new document.
      const response = mongooseToJson(await School.mongooseModel.create([{
        ...(this.#_index != null ? { _index: this.#_index } : {}),
        ...(this.#acaraId != null ? { acaraId: this.#acaraId } : {}),
        ...(this.#name != null ? { name: this.#name } : {}),
        ...(this.#schoolType != null ? { schoolType: this.#schoolType } : {}),
        ...(this.#sector != null ? { sector: this.#sector } : {}),
        ...(this.#status != null ? { status: this.#status } : {}),
        ...(this.#locality != null ? { locality: this.#locality } : {}),
        ...(this.#region != null ? { region: this.#region } : {}),
        ...(this.#postcode != null ? { postcode: this.#postcode } : {}),
        ...(this.#coordinates != null ? { coordinates: this.#coordinates } : {}),
        ...(this.#websiteUrl != null ? { websiteUrl: this.#websiteUrl } : {}),
        ...(this.#campusParentAcaraId != null ? { campusParentAcaraId: this.#campusParentAcaraId } : {}),
        dateCreated: dateCreated,
        dateUpdated: dateCreated
      }], ...(session != null ? [{ session }] : [])));

      if (!response?.length || !response?.[0]?._id) {
        throw new Error(`Error saving ${School.indexName} document.`);
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
   * Create many School documents with provided attributes.
   * @param documents The documents to save.
   * @param session The MongoDB session, if applicable.
   * @return {Promise<Object>}
   */
  static async saveMany(documents = [], session = undefined) {
    try {
      const dateCreated = new Date();

      // Add necessary attributes to each document.
      documents = documents.map((document) => ({
        ...document,
        _index: School.indexName,
        dateCreated: dateCreated,
        dateUpdated: dateCreated
      }));

      // Save new document.
      const response = mongooseToJson(await School.mongooseModel.create(documents,
        ...(session != null ? [{ ordered: true, session }] : [])));

      if (!response?.length) {
        throw new Error(`Error saving ${School.indexName} documents.`);
      }
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Update School documents with provided attributes.
   * @param session The MongoDB session, if applicable.
   * @param documents The documents with the acaraId and fields to update.
   * @return {Promise<void>}
   */
  static async bulkUpdateManyByAcaraId(documents = [], session = undefined) {
    try {
      // Lock all requests to run synchronously.
      await new QueueLockService(QueueLockService.DatabaseQueue.schools).processJob(undefined,
        async () => {
          const dateUpdated = new Date();

          // Form an array of updateOne operations for each document.
          const updateArgument = documents.map((document) => ({
            updateOne: { filter: { acaraId: document.acaraId }, update: { $set: { ...document, dateUpdated } } }
          }));

          // Bulk write updateArgument operations.
          const response = await School.mongooseModel.bulkWrite(updateArgument,
            { runValidators: true, context: "query", ...(session != null ? { ordered: true, session } : {}) }
          );

          const matched = response.matchedCount ?? response.n ?? 0;

          if (!matched) {
            throw new Error(`Error updating ${School.indexName} documents.`);
          }
        });
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
}

module.exports = School;
