const {client, mongooseToJson, elasticSearchToJson} = require("./common");
const mongoose = require("mongoose");
const mongooseLeanVirtuals = require("mongoose-lean-virtuals");
const QueueLockService = require("../services/QueueLockService");
let User;
let Note;

class Subject {
  static Certificate = {
    VCE: "VCE",
    HSC: "HSC",
    WACE: "WACE",
    QCE: "QCE",
    SACE: "SACE",
    TCE: "TCE"
  }

  static indexName = "subjects";

  static #mongooseSchema;
  static mongooseModel;

  static #elasticSearchMapping = {
    properties: {
      name: {
        type: "text",
        analyzer: "standard",
        fields: {
          keyword: {
            type: "keyword",
            normalizer: "lowercase_normalizer"
          }
        }
      },
      certificate: {
        type: "text",
        fields: {
          keyword: {
            type: "keyword",
            normalizer: "lowercase_normalizer"
          }
        }
      },
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
  #name;
  #certificate;
  #dateCreated;
  #dateUpdated;

  constructor({ name, certificate }) {
    this.#_index = Subject.indexName;
    this.#name = name;
    this.#certificate = certificate;
  }

  /**
   * Create an explicit mapping for subjects if it does not already exist.
   * @return {Promise<string>} Success message.
   */
  static async initialiseElasticIndex() {
    try {
      // Check if the index already exists.
      const indexExists = await client.indices.exists({index: Subject.indexName});

      if (!indexExists) {
        // Create the index with mappings.
        await client.indices.create({
          index: Subject.indexName,
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
          mappings: Subject.#elasticSearchMapping
        });
        return `${Subject.indexName} index initialised successfully.`;
      }
      return `${Subject.indexName} index has already been initialised.`;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  static setModelReferences(modelReferences) {
    User = modelReferences.User;
    Note = modelReferences.Note;
  }

  static initialiseMongooseSchema() {
    Subject.#mongooseSchema = new mongoose.Schema({
      _index: { type: String, enum: [Subject.indexName], required: true },
      name: { type: String, required: true },
      certificate: { type: String, enum: Object.values(Subject.Certificate), required: true },
      dateCreated: { type: Date, required: true },
      dateUpdated: { type: Date, required: true }
    });
    Subject.#mongooseSchema.plugin(mongooseLeanVirtuals);
    Subject.mongooseModel = mongoose.model(Subject.indexName, Subject.#mongooseSchema);
  }

  /**
   * Filter out attributes of a Subject object that should not be visible to public.
   * @param subject The subject object.
   * @return {*&{_index: string}}
   */
  static filterAttributesForPublic(subject) {
    return {
      _index: subject._index,
      _id: subject._id,
      name: subject.name,
      certificate: subject.certificate,
      _score: subject._score,
      sort: subject.sort,
      dateCreated: new Date(subject.dateCreated),
      dateUpdated: new Date(subject.dateUpdated)
    }
  }

  /**
   * Merge ElasticSearch documents with the equivalent MongoDB ones.
   * @param response ElasticSearch response.
   * @param populate{{ all?: boolean }}
   * True if specified foreign field should be populated, false if not. 'all' populates all foreign fields.
   * @return {Promise<>} JSON response of merged documents.
   */
  static async #mergeElasticAndMongoDocuments(response, populate = {}) {
    const elasticDocuments = elasticSearchToJson(response);
    const elasticDocumentIds = elasticDocuments.map((document) => document._id);

    // Get MongoDb documents.
    const mongoDocuments = await Subject.findManyByIds(elasticDocumentIds, undefined,
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
   * Delete a Subject document by its id.
   * @param id The id of the Purchase to delete.
   * @param session The MongoDB session, if applicable.
   * @return {Promise<void>}
   */
  static async deleteOneById(id, session = undefined) {
    try {
      // Lock requests with the same id to run synchronously.
      await new QueueLockService(QueueLockService.DatabaseQueue.subjects).processJob({ id },
        async () => {
          const response = await Subject.mongooseModel.deleteOne(
            { _id: id },
            ...(session != null ? [{ session }] : [])
          );

          // Remove subject associations.
          await User.mongooseModel.updateMany(
            { "studentDetails.subjects.subjectIds": id },
            { $pull: { "studentDetails.subjects.subjectIds": id } },
            { runValidators: true, context: "query", ...(session != null ? { session } : {}) }
          );
          await Note.mongooseModel.updateMany(
            { subjectIds: id },
            { $pull: { subjectIds: id } },
            { runValidators: true, context: "query", ...(session != null ? { session } : {}) }
          );

          const deleted = response.deletedCount ?? response.result?.n ?? 0;

          if (!deleted) {
            throw new Error(`Error deleting ${Subject.indexName} document.`);
          }
        });
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Find documents that match the given ids.
   * @param ids An array of ids to search.
   * @param session The MongoDB session, if applicable.
   * @param populate{{ all?: boolean }}
   * @return {Promise<>} An array of Reviews that exist in the database.
   */
  static async findManyByIds(ids, session = undefined, populate = {}) {
    try {
      return mongooseToJson(await Subject.mongooseModel.find({
        _id: { $in: ids }
      }, undefined, ...(session != null ? [{ session }] : []))
        .populate([])
        .lean({ virtuals: true }));
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Find one document that matches the given name and certificate.
   * @param name The name to search for.
   * @param certificate The certificate to search for.
   * @param session The MongoDB session, if applicable.
   * @param populate{{ all?: boolean }}
   * @returns {Promise<>} An array of Transactions that exist in the database.
   */
  static async findOneByNameAndCertificate(name, certificate, session = undefined, populate = {}) {
    try {
      return mongooseToJson(await Subject.mongooseModel.find({
        name: name,
        certificate: certificate,
      }, undefined, ...(session != null ? [{session}] : []))
        .populate([])
        .limit(1)
        .lean({ virtuals: true }));
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Find a document that matches the provided query.
   * @param searchQuery Name and certificate to search for.
   * @param filters Filters to apply.
   * @param sortBy Sort method.
   * @param nextPage The search_after values to get next page.
   * @param pitId Id reference for the current state of the index.
   * @param size Number of documents returned.
   * @param populate{{ all?: boolean }}
   * True if specified foreign field should be populated, false if not. 'all' populates all foreign fields.
   * @return {Promise<>}
   */
  static async findManyByQuerySearch(searchQuery = undefined, filters = {},
                                     sortBy = "relevance", nextPage = undefined,
                                     pitId = undefined, size = 10000, populate = {}) {
    try {
      const response = await client.search({
        // Specify index only if pitId is undefined.
        ...(pitId != null ? { } : { index: Subject.indexName }),
        query: {
          function_score: {
            query: {
              bool: {
                must: [
                  // Only apply the match query if searchQuery is not empty
                  ...(searchQuery != null ? [{
                    multi_match : {
                      query : searchQuery,
                      type: "most_fields",
                      fields : ["name", "certificate"],
                      fuzziness: "AUTO"
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
          // Sorting by relevance score including name and certificate tiebreaker.
          ...(sortBy === "relevance" ? ["_score", { "name.keyword": "asc" }, { "certificate.keyword": "asc" }] : []),
        ],
        size: size
      });

      // Merge ElasticSearch response with MongoDB documents.
      return await Subject.#mergeElasticAndMongoDocuments(response, populate);
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Find documents that matches the provided query (Admin/Staff).
   * @param searchQuery Name & certificate to search for.
   * @param filters Filters to apply.
   * @param sortBy Sort method.
   * @param nextPage The search_after values to get next page.
   * @param pitId Id reference for the current state of the index.
   * @param size Number of documents returned.
   * @param populate{{ all?: boolean }}
   * True if specified foreign field should be populated, false if not. 'all' populates all foreign fields.
   * @return {Promise<>}
   */
  static async findManyByQueryAdminSearch(searchQuery = undefined, filters = { },
                                          sortBy = "relevance", nextPage = undefined,
                                          pitId = undefined, size = 50, populate = {}) {
    try {
      const response = await client.search({
        // Specify index only if pitId is undefined.
        ...(pitId != null ? { } : { index: Subject.indexName }),
        query: {
          function_score: {
            query: {
              bool: {
                must: [
                  ...(filters._id != null ? [{ term: { "_id": { value: filters._id } }}] : []),
                  ...(searchQuery != null ? [{
                    multi_match : {
                      query : searchQuery,
                      type: "most_fields",
                      fields : ["name", "certificate"],
                      fuzziness: "AUTO"
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
          // Sorting by relevance score including name and certificate tiebreaker.
          ...(sortBy === "relevance" ? ["_score", { "name.keyword": "asc" }, { "certificate.keyword": "asc" }] : []),
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
      return await Subject.#mergeElasticAndMongoDocuments(response, populate);
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
        index: Subject.indexName,
        keep_alive: "45m",
      });

      return response.id;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Create a subjects document with set attributes.
   * @param session The MongoDB session, if applicable.
   * @return {Promise<Object>}
   */
  async save(session = undefined) {
    try {
      const dateCreated = new Date();

      // Save new document.
      const response = mongooseToJson(await Subject.mongooseModel.create([{
        ...(this.#_index != null ? { _index: this.#_index } : {}),
        ...(this.#name != null ? { name: this.#name } : {}),
        ...(this.#certificate != null ? { certificate: this.#certificate } : {}),
        dateCreated: dateCreated,
        dateUpdated: dateCreated
      }], ...(session != null ? [{ session }] : [])));

      if (!response?.length || !response?.[0]?._id) {
        throw new Error(`Error saving ${Subject.indexName} document.`);
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
   * Update a Subject document with defined attributes.
   * @param id The id of the Subject to update.
   * @param fields The fields and the values to update to.
   * @param session The MongoDB session, if applicable.
   * @return {Promise<void>}
   */
  static async updateOneById(id, fields = {}, session = undefined) {
    try {
      // Lock requests with the same id to run synchronously.
      await new QueueLockService(QueueLockService.DatabaseQueue.subjects).processJob({ id },
        async () => {
          const dateUpdated = new Date();

          // Update existing document.
          const response = await Subject.mongooseModel.updateOne(
            { _id: id },
            {
              $set: {
                ...(fields.name != null ? { name: fields.name } : {}),
                ...(fields.certificate != null ? { certificate: fields.certificate } : {}),
                dateUpdated: dateUpdated
              }
            },
            { runValidators: true, context: "query", ...(session != null ? { session } : {}) }
          );

          const matched = response.matchedCount ?? response.n ?? 0;

          if (!matched) {
            throw new Error(`Error updating ${Subject.indexName} document.`);
          }
        });
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
}

module.exports = Subject;
