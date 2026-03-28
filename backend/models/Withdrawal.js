const QueueLockService = require("../services/QueueLockService");
const mongoose = require("mongoose");
const {client, mongooseToJson, elasticSearchToJson} = require("./common");
const mongooseLeanVirtuals = require("mongoose-lean-virtuals");
let Transaction;

class Withdrawal {
  static PaypalRecipientType = {
    EMAIL: "EMAIL",
    PHONE: "PHONE"
  }

  static WithdrawalStatus = {
    AWAITING_APPROVAL: "awaiting_approval",
    COMPLETED: "completed",
    REJECTED: "rejected"
  }

  static indexName = "withdrawals";

  static #mongooseSchema;
  static mongooseModel;

  static #elasticSearchMapping = {
    properties: {
      transactionId: { type: "keyword" },
      paypalRecipient: {
        properties: {
          recipientType: { type: "keyword" },
          identifier: { type: "keyword" },
        }
      },
      status: { type: "keyword" },
      dateCreated: { type: "date", format: "strict_date_optional_time" },
      dateUpdated: { type: "date", format: "strict_date_optional_time" }
    }
  };

  #_index;
  #_id;
  #transactionId;
  #paypalRecipient;
  #status;
  #dateCreated;
  #dateUpdated;

  constructor({ _id, transactionId, paypalRecipient, status }) {
    this.#_index = Withdrawal.indexName;
    this.#transactionId = transactionId;
    this.#paypalRecipient = paypalRecipient;
    this.#status = status;
  }

  /**
   * Create an explicit mapping for Notes if it does not already exist.
   * @return {Promise<string>} Success message.
   */
  static async initialiseElasticIndex() {
    try {
      // Check if the index already exists.
      const indexExists = await client.indices.exists({index: Withdrawal.indexName});

      if (!indexExists) {
        // Create the index with mappings.
        await client.indices.create({
          index: Withdrawal.indexName,
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
          mappings: Withdrawal.#elasticSearchMapping
        });
        return `${Withdrawal.indexName} index initialised successfully.`;
      }
      return `${Withdrawal.indexName} index has already been initialised.`;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  static setModelReferences(modelReferences) {
    Transaction = modelReferences.Transaction;
  }

  static initialiseMongooseSchema() {
    Withdrawal.#mongooseSchema = new mongoose.Schema({
      _index: { type: String, enum: [Withdrawal.indexName], required: true },
      transactionId: { type: mongoose.Schema.Types.ObjectId, ref: Transaction.indexName, required: true },
      paypalRecipient: {
        type: {
          recipientType: { type: String, enum: Object.values(Withdrawal.PaypalRecipientType), required: true },
          identifier: { type: String, required: true },
        },
        _id: false,
        required: true
      },
      status: { type: String, enum: Object.values(Withdrawal.WithdrawalStatus), required: true,
        default: Withdrawal.WithdrawalStatus.AWAITING_APPROVAL },
      dateCreated: { type: Date, required: true },
      dateUpdated: { type: Date, required: true }
    });
    Withdrawal.#mongooseSchema.virtual("transaction", {
      ref: Transaction.indexName,
      localField: "transactionId",
      foreignField: "_id",
      justOne: true
    });
    Withdrawal.#mongooseSchema.plugin(mongooseLeanVirtuals);
    Withdrawal.mongooseModel =  mongoose.model(Withdrawal.indexName, Withdrawal.#mongooseSchema);
  }

  /**
   * Filter out attributes of a Withdrawal object that should not be visible to owner.
   * @param withdrawal The withdrawal object.
   * @return {*&{_index: string}}
   */
  static filterAttributesForOwner(withdrawal) {
    return {
      _index: withdrawal._index,
      _id: withdrawal._id,
      transactionId: withdrawal.transactionId,
      paypalRecipient: withdrawal.paypalRecipient,
      status: withdrawal.status,
      ...(withdrawal.transaction != null ? {
        transaction: Transaction.filterAttributesForOwner(withdrawal.transaction)
      } : {}),
      _score: withdrawal._score,
      sort: withdrawal.sort,
      dateCreated: new Date(withdrawal.dateCreated),
      dateUpdated: new Date(withdrawal.dateUpdated)
    }
  }

  /**
   * Merge ElasticSearch documents with the equivalent MongoDB ones.
   * @param response ElasticSearch response.
   * @param populate{{ all?: boolean, transaction?: boolean }}
   * True if specified foreign field should be populated, false if not. 'all' populates all foreign fields.
   * @return {Promise<>} JSON response of merged documents.
   */
  static async #mergeElasticAndMongoDocuments(response, populate = {}) {
    const elasticDocuments = elasticSearchToJson(response);
    const elasticDocumentIds = elasticDocuments.map((document) => document._id);

    // Get MongoDb documents.
    const mongoDocuments = await Withdrawal.findManyByIds(elasticDocumentIds, undefined,
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
   * @param populate{{ all?: boolean, transaction?: boolean }}
   * True if specified foreign field should be populated, false if not. 'all' populates all foreign fields.
   * @return {Promise<>} An array of Withdrawals that exist in the database.
   */
  static async findManyByIds(ids, session = undefined, populate = {}) {
    try {
      return mongooseToJson(await Withdrawal.mongooseModel.find({
        _id: { $in: ids }
      }, undefined, ...(session != null ? [{ session }] : []))
        .populate([
          ...(populate.all || populate.transaction ? [{
            path: "transaction",
            populate: [
              { path: "user" }
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
   * @param searchQuery
   * @param filters Filters to apply.
   * @param sortBy Sort method.
   * @param nextPage The search_after values to get next page.
   * @param pitId Id reference for the current state of the index.
   * @param size Number of documents returned.
   * @param populate{{ all?: boolean, transaction?: boolean }}
   * True if specified foreign field should be populated, false if not. 'all' populates all foreign fields.
   * @return {Promise<>}
   */
  static async findManyByQueryAdminSearch(searchQuery = undefined, filters = { },
                                          sortBy = "relevance", nextPage = undefined,
                                          pitId = undefined, size = 50, populate = {}) {
    try {
      const response = await client.search({
        // Specify index only if pitId is undefined.
        ...(pitId != null ? { } : { index: Withdrawal.indexName }),
        query: {
          function_score: {
            query: {
              bool: {
                must: [
                  ...(filters._id != null ? [{ term: { "_id": { value: filters._id } }}] : []),
                  ...(filters.transactionId != null ? [{ term: { "transactionId": { value: filters.transactionId } }}] : []),
                  ...(filters.recipientType != null ? [{ term: { "paypalRecipient.recipientType": { value: filters.recipientType } }}] : []),
                  ...(filters.identifier != null ? [{ term: { "paypalRecipient.identifier": { value: filters.identifier } }}] : []),
                  ...(filters.status != null ? [{ term: { "status": { value: filters.status } }}] : [])
                ]
              }
            }
          }
        },
        ...(pitId != null ? { pit: { id: pitId, keep_alive: "15m" }} : {}),
        ...(nextPage != null ? { search_after: nextPage } : {}),
        sort: [
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
      return await Withdrawal.#mergeElasticAndMongoDocuments(response, populate);
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
        index: Withdrawal.indexName,
        keep_alive: "45m",
      });

      return response.id;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Create a Withdrawals document with set attributes.
   * @param session The MongoDB session, if applicable.
   * @return {Promise<Object>}
   */
  async save(session = undefined) {
    try {
      const dateCreated = new Date();

      // Save new document.
      const response = mongooseToJson(await Withdrawal.mongooseModel.create([{
        ...(this.#_index != null ? { _index: this.#_index } : {}),
        ...(this.#transactionId != null ? { transactionId: this.#transactionId } : {}),
        ...(this.#paypalRecipient != null ? { paypalRecipient: this.#paypalRecipient } : {}),
        ...(this.#status != null ? { status: this.#status } : {}),
        dateCreated: dateCreated,
        dateUpdated: dateCreated
      }], ...(session != null ? [{ session }] : [])));

      if (!response?.length || !response?.[0]?._id) {
        throw new Error(`Error saving ${Withdrawal.indexName} document.`);
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
   * Update a Withdrawal document with defined attributes.
   * @param id The id of the Withdrawal to update.
   * @param fields The fields and the values to update to.
   * @param session The MongoDB session, if applicable.
   * @return {Promise<void>}
   */
  static async updateOneById(id, fields = {}, session = undefined) {
    try {
      // Lock requests with the same id to run synchronously.
      await new QueueLockService(QueueLockService.DatabaseQueue.withdrawals).processJob({ id },
        async () => {
        const dateUpdated = new Date();

        // Update existing document.
        const response = await Withdrawal.mongooseModel.updateOne(
          { _id: id },
          {
            $set: {
              ...(fields.transactionId != null ? { transactionId: fields.transactionId } : {}),
              ...(fields.paypalRecipient != null ? { paypalRecipient: fields.paypalRecipient } : {}),
              ...(fields.status != null ? { status: fields.status } : {}),
              dateUpdated: dateUpdated
            }
          },
          { runValidators: true, context: "query", ...(session != null ? { session } : {}) }
        );

        const matched = response.matchedCount ?? response.n ?? 0;

        if (!matched) {
          throw new Error(`Error updating ${Withdrawal.indexName} document.`);
        }
      });
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

}

module.exports = Withdrawal;
