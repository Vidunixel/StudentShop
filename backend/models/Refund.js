const QueueLockService = require("../services/QueueLockService");
const mongoose = require("mongoose");
const {client, mongooseToJson, elasticSearchToJson} = require("./common");
const mongooseLeanVirtuals = require("mongoose-lean-virtuals");
let Purchase;

class Refund {
  static RefundReason = {
    CHANGE_OF_MIND: "change_of_mind",
    NOT_AS_DESCRIBED: "not_as_described",
    ACCIDENTAL_PURCHASE: "accidental_purchase"
  }

  static RefundStatus = {
    AWAITING_APPROVAL: "awaiting_approval",
    COMPLETED: "completed",
    REJECTED: "rejected"
  }

  static RefundPeriod = {
    ONE_DAY: 24 * 60 * 60 * 1000,
    THREE_DAYS: 3 * 24 * 60 * 60 * 1000,
    SEVEN_DAYS: 7 * 24 * 60 * 60 * 1000,
    FOURTEEN_DAYS: 14 * 24 * 60 * 60 * 1000,
    THIRTY_DAYS: 30 * 24 * 60 * 60 * 1000,
  }

  static indexName = "refunds";

  static #mongooseSchema;
  static mongooseModel;

  static #elasticSearchMapping = {
    properties: {
      purchaseId: { type: "keyword" },
      reasonType: { type: "keyword" },
      reasonDescription: { type: "text" },
      status: { type: "keyword" },
      dateCreated: { type: "date", format: "strict_date_optional_time" },
      dateUpdated: { type: "date", format: "strict_date_optional_time" }
    }
  };

  #_index;
  #_id;
  #purchaseId;
  #reasonType;
  #reasonDescription;
  #status;
  #dateCreated;
  #dateUpdated;

  constructor({ _id, purchaseId, reasonType, reasonDescription, status }) {
    this.#_index = Refund.indexName;
    this.#purchaseId = purchaseId;
    this.#reasonType = reasonType;
    this.#reasonDescription = reasonDescription;
    this.#status = status;
  }

  /**
   * Create an explicit mapping for Notes if it does not already exist.
   * @return {Promise<string>} Success message.
   */
  static async initialiseElasticIndex() {
    try {
      // Check if the index already exists.
      const indexExists = await client.indices.exists({index: Refund.indexName});

      if (!indexExists) {
        // Create the index with mappings.
        await client.indices.create({
          index: Refund.indexName,
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
          mappings: Refund.#elasticSearchMapping
        });
        return `${Refund.indexName} index initialised successfully.`;
      }
      return `${Refund.indexName} index has already been initialised.`;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  static setModelReferences(modelReferences) {
    Purchase = modelReferences.Purchase;
  }

  static initialiseMongooseSchema() {
    Refund.#mongooseSchema = new mongoose.Schema({
      _index: { type: String, enum: [Refund.indexName], required: true },
      purchaseId: { type: mongoose.Schema.Types.ObjectId, ref: Purchase.indexName, required: true },
      reasonType: { type: String, enum: Object.values(Refund.RefundReason), required: true },
      reasonDescription: { type: String, required: true },
      status: { type: String, enum: Object.values(Refund.RefundStatus), required: true, default: Refund.RefundStatus.AWAITING_APPROVAL },
      dateCreated: { type: Date, required: true },
      dateUpdated: { type: Date, required: true }
    });
    Refund.#mongooseSchema.virtual("purchase", {
      ref: Purchase.indexName,
      localField: "purchaseId",
      foreignField: "_id",
      justOne: true
    });
    Refund.#mongooseSchema.plugin(mongooseLeanVirtuals);
    Refund.mongooseModel =  mongoose.model(Refund.indexName, Refund.#mongooseSchema);
  }

  /**
   * Filter out attributes of a Refund object that should not be visible to owner.
   * @param refund The refund object.
   * @return {*&{_index: string}}
   */
  static filterAttributesForOwner(refund) {
    return {
      _index: refund._index,
      _id: refund._id,
      purchaseId: refund.purchaseId,
      reasonType: refund.reasonType,
      reasonDescription: refund.reasonDescription,
      status: refund.status,
      ...(refund.purchase != null ? {
        purchase: Purchase.filterAttributesForOwner(refund.purchase)
      } : {}),
      _score: refund._score,
      sort: refund.sort,
      dateCreated: new Date(refund.dateCreated),
      dateUpdated: new Date(refund.dateUpdated)
    }
  }

  /**
   * Merge ElasticSearch documents with the equivalent MongoDB ones.
   * @param response ElasticSearch response.
   * @param populate{{ all?: boolean, purchase?: boolean }}
   * True if specified foreign field should be populated, false if not. 'all' populates all foreign fields.
   * @return {Promise<>} JSON response of merged documents.
   */
  static async #mergeElasticAndMongoDocuments(response, populate = {}) {
    const elasticDocuments = elasticSearchToJson(response);
    const elasticDocumentIds = elasticDocuments.map((document) => document._id);

    // Get MongoDb documents.
    const mongoDocuments = await Refund.findManyByIds(elasticDocumentIds, undefined,
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
   * @param populate{{ all?: boolean, purchase?: boolean }}
   * True if specified foreign field should be populated, false if not. 'all' populates all foreign fields.
   * @return {Promise<>} An array of Refunds that exist in the database.
   */
  static async findManyByIds(ids, session = undefined, populate = {}) {
    try {
      return mongooseToJson(await Refund.mongooseModel.find({
        _id: { $in: ids }
      }, undefined, ...(session != null ? [{ session }] : []))
        .populate([
          ...(populate.all || populate.purchase ? [{
            path: "purchase",
            populate: [
              { path: "user" },
              { path: "detailedItem" }
            ]
          }] : [])
        ])
        .lean({ virtuals: true }));
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Find documents that match the given purchaseIds and optionally, status.
   * @param purchaseIds An array of purchaseIds to search.
   * @param status The refund status to search.
   * @param session The MongoDB session, if applicable.
   * @param populate{{ all?: boolean, purchase?: boolean }}
   * True if specified foreign field should be populated, false if not. 'all' populates all foreign fields.
   * @return {Promise<>} An array of purchases that exist in the database.
   */
  static async findManyByPurchaseIds(purchaseIds, status = undefined, session = undefined,
                                     populate = {}) {
    try {
      return mongooseToJson(await Refund.mongooseModel.find({
        purchaseId: { $in: purchaseIds },
        ...(status ? { status } : {})
      }, undefined, ...(session != null ? [{ session }] : []))
        .populate([
          ...(populate.all || populate.purchase ? [{
            path: "purchase",
            populate: [
              { path: "user" },
              { path: "detailedItem" }
            ]
          }] : [])
        ])
        .lean({ virtuals: true }));
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Find documents that matches the provided query (Admin/Staff).
   * @param searchQuery Reason description to search for.
   * @param filters Filters to apply.
   * @param sortBy Sort method.
   * @param nextPage The search_after values to get next page.
   * @param pitId Id reference for the current state of the index.
   * @param size Number of documents returned.
   * @param populate{{ all?: boolean, purchase?: boolean }}
   * True if specified foreign field should be populated, false if not. 'all' populates all foreign fields.
   * @return {Promise<>}
   */
  static async findManyByQueryAdminSearch(searchQuery = undefined, filters = { },
                                          sortBy = "relevance", nextPage = undefined,
                                          pitId = undefined, size = 50, populate = {}) {
    try {
      const response = await client.search({
        // Specify index only if pitId is undefined.
        ...(pitId != null ? { } : { index: Refund.indexName }),
        query: {
          function_score: {
            query: {
              bool: {
                must: [
                  ...(filters._id != null ? [{ term: { "_id": { value: filters._id } }}] : []),
                  ...(filters.purchaseId != null ? [{ term: { "purchaseId": { value: filters.purchaseId } }}] : []),
                  ...(filters.reasonType != null ? [{ term: { "reasonType": { value: filters.reasonType } }}] : []),
                  ...(filters.status != null ? [{ term: { "status": { value: filters.status } }}] : []),
                  ...(searchQuery != null ? [{
                    multi_match : {
                      query : searchQuery,
                      fields : [ "reasonDescription" ],
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
      return await Refund.#mergeElasticAndMongoDocuments(response, populate);
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
        index: Refund.indexName,
        keep_alive: "45m",
      });

      return response.id;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Create a Refunds document with set attributes.
   * @param session The MongoDB session, if applicable.
   * @return {Promise<Object>}
   */
  async save(session = undefined) {
    try {
      const dateCreated = new Date();

      // Save new document.
      const response = mongooseToJson(await Refund.mongooseModel.create([{
        ...(this.#_index != null ? { _index: this.#_index } : {}),
        ...(this.#purchaseId != null ? { purchaseId: this.#purchaseId } : {}),
        ...(this.#reasonType != null ? { reasonType: this.#reasonType } : {}),
        ...(this.#reasonDescription != null ? { reasonDescription: this.#reasonDescription } : {}),
        ...(this.#status != null ? { status: this.#status } : {}),
        dateCreated: dateCreated,
        dateUpdated: dateCreated
      }], ...(session != null ? [{ session }] : [])));

      if (!response?.length || !response?.[0]?._id) {
        throw new Error(`Error saving ${Refund.indexName} document.`);
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
   * Update a Refund document with defined attributes.
   * @param id The id of the Refund to update.
   * @param fields The fields and the values to update to.
   * @param session The MongoDB session, if applicable.
   * @return {Promise<void>}
   */
  static async updateOneById(id, fields = {}, session = undefined) {
    try {
      // Lock requests with the same id to run synchronously.
      await new QueueLockService(QueueLockService.DatabaseQueue.refunds).processJob({ id },
        async () => {
        const dateUpdated = new Date();

        // Update existing document.
        const response = await Refund.mongooseModel.updateOne(
          { _id: id },
          {
            $set: {
              ...(fields.purchaseId != null ? { purchaseId: fields.purchaseId } : {}),
              ...(fields.reasonType != null ? { reasonType: fields.reasonType } : {}),
              ...(fields.reasonDescription != null ? { reasonDescription: fields.reasonDescription } : {}),
              ...(fields.status != null ? { status: fields.status } : {}),
              dateUpdated: dateUpdated
            }
          },
          { runValidators: true, context: "query", ...(session != null ? { session } : {}) }
        );

        const matched = response.matchedCount ?? response.n ?? 0;

        if (!matched) {
          throw new Error(`Error updating ${Refund.indexName} document.`);
        }
      });
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

}

module.exports = Refund;
