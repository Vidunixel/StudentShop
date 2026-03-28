const {client, mongooseToJson, elasticSearchToJson} = require("./common");
const QueueLockService = require("../services/QueueLockService");
const mongoose = require("mongoose");
const mongooseLeanVirtuals = require("mongoose-lean-virtuals");
let Purchase;
let User;
let Note;
let Withdrawal;

class Transaction {
  static TransactionType = {
    SALE: "sale",
    REFUND: "refund",
    WITHDRAWAL: "withdrawal"
  }

  static TransactionStatus = {
    PENDING: "pending",
    REJECTED: "rejected",
    COMPLETED: "completed"
  }

  static indexName = "transactions";

  static #mongooseSchema;
  static mongooseModel;

  static #elasticSearchMapping = {
    properties: {
      userUid: { type: "keyword" },
      info: {
        properties: {
          transactionType: { type: "keyword" }, // 'Sale', 'Refund' or 'Withdrawal'
          purchaseId: { type: "keyword" }, // For sales and refunds only.
        }
      },
      amount: { type: "double" },
      status: { type: "keyword" },
      fulfilmentDate: { type: "date", format: "strict_date_optional_time" },
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
  #userUid;
  #info;
  #amount;
  #status;
  #fulfilmentDate;
  #dateCreated;
  #dateUpdated;

  constructor({ _id, userUid, info, amount, status, fulfilmentDate }) {
    this.#_index = Transaction.indexName;
    this.#userUid = userUid;
    this.#info = info;
    this.#amount = amount;
    this.#status = status;

    if (fulfilmentDate instanceof Date && !isNaN(fulfilmentDate.getTime())) {
      this.#fulfilmentDate = fulfilmentDate.toISOString();
    }
  }

  /**
   * Create an explicit mapping for Orders if it does not already exist.
   * @return {Promise<string>} Success message.
   */
  static async initialiseElasticIndex() {
    try {
      // Check if the index already exists.
      const indexExists = await client.indices.exists({index: Transaction.indexName});

      if (!indexExists) {
        // Create the index with mappings.
        await client.indices.create({
          index: Transaction.indexName,
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
          mappings: Transaction.#elasticSearchMapping
        });
        return `${Transaction.indexName} index initialised successfully.`;
      }
      return `${Transaction.indexName} index has already been initialised.`;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  static setModelReferences(modelReferences) {
    Note = modelReferences.Note;
    User = modelReferences.User;
    Purchase = modelReferences.Purchase;
    Withdrawal = modelReferences.Withdrawal;
  }

  static initialiseMongooseSchema() {
    Transaction.#mongooseSchema = new mongoose.Schema({
      _index: { type: String, enum: [Transaction.indexName], required: true },
      userUid: { type: String, required: true },
      info: {
        type: {
          transactionType: { type: String, enum: Object.values(Transaction.TransactionType), required: true },
          purchaseId: { type: mongoose.Schema.Types.ObjectId, ref: Purchase.indexName }, // For 'sales' and 'refunds' only.
        },
        required: true,
        _id: false
      },
      amount: { type: Number, required: true, default: 0 },
      status: {
        type: String,
        enum: Object.values(Transaction.TransactionStatus),
        required: true,
        default: Transaction.TransactionStatus.PENDING
      },
      fulfilmentDate: { type: Date },
      dateCreated: { type: Date, required: true },
      dateUpdated: { type: Date, required: true }
    });
    Transaction.#mongooseSchema.virtual("user", {
      ref: User.indexName,
      localField: "userUid",
      foreignField: "uid",
      justOne: true
    });
    Transaction.#mongooseSchema.virtual("purchase", {
      ref: Purchase.indexName,
      localField: "info.purchaseId",
      foreignField: "_id",
      justOne: true
    });
    Transaction.#mongooseSchema.virtual("withdrawal", {
      ref: Withdrawal.indexName,
      localField: "_id",
      foreignField: "transactionId",
      justOne: true
    });
    Transaction.#mongooseSchema.virtual("detailedItem").get(function () {
      if (this.purchase?.detailedItem) {
        return this.purchase.detailedItem;
      }
      return undefined;
    });
    Transaction.#mongooseSchema.plugin(mongooseLeanVirtuals);
    Transaction.mongooseModel = mongoose.model(Transaction.indexName, Transaction.#mongooseSchema);
  }

  /**
   * Filter out attributes of a Transaction object that should not be visible to owner.
   * @param transaction The transaction object.
   * @return {*&{_index: string}}
   */
  static filterAttributesForOwner(transaction) {
    return {
      _index: transaction._index,
      _id: transaction._id,
      userUid: transaction.userUid,
      info: transaction.info,
      amount: transaction.amount,
      status: transaction.status,
      fulfilmentDate: transaction.fulfilmentDate,
      ...(transaction.detailedItem != null ? {
        ...(transaction.detailedItem._index === Note.indexName ?
          { detailedItem: Note.filterAttributesForPublic(transaction.detailedItem) } : {})
      } : {}),
      ...(transaction.withdrawal != null ? {
        withdrawal: Withdrawal.filterAttributesForOwner(transaction.withdrawal)
      } : {}),
      _score: transaction._score,
      sort: transaction.sort,
      dateCreated: new Date(transaction.dateCreated),
      dateUpdated: new Date(transaction.dateUpdated)
    }
  }

  /**
   * Merge ElasticSearch documents with the equivalent MongoDB ones.
   * @param response ElasticSearch response.
   * @param populate{{ all?: boolean, user?: boolean, purchase?: boolean, withdrawal?: boolean, detailedItem?: boolean }}
   * True if specified foreign field should be populated, false if not. 'all' populates all foreign fields.
   * @return {Promise<>} JSON response of merged documents.
   */
  static async #mergeElasticAndMongoDocuments(response, populate = {}) {
    const elasticDocuments = elasticSearchToJson(response);
    const elasticDocumentIds = elasticDocuments.map((document) => document._id);

    // Get MongoDb documents.
    const mongoDocuments = await Transaction.findManyByIds(elasticDocumentIds, undefined,
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
   * @param populate{{ all?: boolean, user?: boolean, purchase?: boolean, withdrawal?: boolean, detailedItem?: boolean }}
   * @return {Promise<>} An array of Reviews that exist in the database.
   */
  static async findManyByIds(ids, session = undefined, populate = {}) {
    try {
      return mongooseToJson(await Transaction.mongooseModel.find({
        _id: { $in: ids }
      }, undefined, ...(session != null ? [{ session }] : []))
        .populate([
          ...(populate.all || populate.user ? [{ path: "user" }] : []),
          ...(populate.all || populate.withdrawal ? [{ path: "withdrawal" }] : []),
          ...(populate.all || populate.purchase || populate.detailedItem ? [{
            path: "purchase",
            // Populate nested detailedItem within purchase.
            ...(populate.all || populate.detailedItem ? { populate: { path: "detailedItem" } } : {}),
          }] : [])
        ])
        .lean({ virtuals: true }));
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Find one document that matches the given purchase id and type.
   * @param purchaseId The purchaseId to search for.
   * @param transactionType The transaction type to search for.
   * @param status The transaction status to search for.
   * @param session The MongoDB session, if applicable.
   * @param populate{{ all?: boolean, user?: boolean, purchase?: boolean, withdrawal?: boolean, detailedItem?: boolean }}
   * @returns {Promise<>} An array of Transactions that exist in the database.
   */
  static async findOneByPurchaseIdAndType(purchaseId, transactionType, status = undefined,
                                          session = undefined, populate = {}) {
    try {
      return mongooseToJson(await Transaction.mongooseModel.find({
        "info.purchaseId": purchaseId,
        "info.transactionType": transactionType,
        ...(status ? { status: status } : {})
      }, undefined, ...(session != null ? [{ session }] : []))
        .populate([
          ...(populate.all || populate.user ? [{ path: "user" }] : []),
          ...(populate.all || populate.withdrawal ? [{ path: "withdrawal" }] : []),
          ...(populate.all || populate.purchase || populate.detailedItem ? [{
            path: "purchase",
            // Populate nested detailedItem within purchase.
            ...(populate.all || populate.detailedItem ? { populate: { path: "detailedItem" } } : {}),
          }] : [])
        ])
        .limit(1)
        .lean({ virtuals: true }));
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Find documents that match the provided userUid exactly.
   * @param userUid UserUid to search for.
   * @param sortBy Sort method.
   * @param nextPage The search_after values to get next page.
   * @param pitId Id reference for the current state of the index.
   * @param size Number of documents returned.
   * @param populate{{ all?: boolean, user?: boolean, purchase?: boolean, withdrawal?: boolean, detailedItem?: boolean }}
   * @return {Promise<>} An array of Transactions that exist in the database.
   */
  static async findManyByUserUidSearch(userUid, sortBy = "date-created-desc", nextPage = undefined, pitId = undefined,
                                       size = 25, populate = {}) {
    try {
      const response = await client.search({
        // Specify index only if pitId is undefined.
        ...(pitId != null ? { } : { index: Transaction.indexName }),
        query: {
          bool: {
            must: [
              { term: { "userUid": { value: userUid } }}
            ]
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
          ...(sortBy === "date-updated-asc" ? [{ "dateUpdated": "asc" }] : []),
          // Sorting by amount including dateCreated tiebreaker.
          ...(sortBy === "amount-desc" ? [{ "amount": "desc" }, { "dateCreated": "desc" }] : []),
          ...(sortBy === "amount-asc" ? [{ "amount": "asc" }, { "dateCreated": "desc" }] : [])
        ],
        size: size,
      });

      // Merge ElasticSearch response with MongoDB documents.
      return await Transaction.#mergeElasticAndMongoDocuments(response, populate);
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
   * @param populate{{ all?: boolean, user?: boolean, purchase?: boolean, withdrawal?: boolean, detailedItem?: boolean }}
   * True if specified foreign field should be populated, false if not. 'all' populates all foreign fields.
   * @return {Promise<>}
   */
  static async findManyByQueryAdminSearch(searchQuery = undefined, filters = { },
                                          sortBy = "date-created-desc", nextPage = undefined,
                                          pitId = undefined, size = 50, populate = {}) {
    try {
      const response = await client.search({
        // Specify index only if pitId is undefined.
        ...(pitId != null ? { } : { index: Transaction.indexName }),
        query: {
          function_score: {
            query: {
              bool: {
                must: [
                  ...(filters._id != null ? [{ term: { "_id": { value: filters._id } }}] : []),
                  ...(filters.userUid != null ? [{ term: { "userUid": { value: filters.userUid } }}] : []),
                  ...(filters.transactionType != null ? [{ term: { "info.transactionType": { value: filters.transactionType } }}] : []),
                  ...(filters.purchaseId != null ? [{ term: { "info.purchaseId": { value: filters.purchaseId } }}] : []),
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
          ...(sortBy === "date-updated-asc" ? [{ "dateUpdated": "asc" }] : []),
          // Sorting by dateUpdated including dateCreated tiebreaker.
          ...(sortBy === "fulfilment-date-desc" ? [{ "fulfilmentDate": "desc" }, { "dateCreated": "desc" }] : []),
          ...(sortBy === "fulfilment-date-asc" ? [{ "fulfilmentDate": "asc" }, { "dateCreated": "desc" }] : []),
          // Sorting by amount including dateCreated tiebreaker.
          ...(sortBy === "amount-desc" ? [{ "amount": "desc" }, { "dateCreated": "desc" }] : []),
          ...(sortBy === "amount-asc" ? [{ "amount": "asc" }, { "dateCreated": "desc" }] : [])
        ],
        size: size,
      });

      // Merge ElasticSearch response with MongoDB documents.
      return await Transaction.#mergeElasticAndMongoDocuments(response, populate);
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Find documents whose status is pending and fulfilment date has passed.
   * @param populate{{ all?: boolean, user?: boolean, purchase?: boolean, withdrawal?: boolean, detailedItem?: boolean }}
   * @returns {Promise<>} An array of Transactions that exist in the database.
   */
  static async findManyUnfulfilledSales(populate = {}) {
    try {
      return mongooseToJson(await Transaction.mongooseModel.find({
        "info.transactionType": Transaction.TransactionType.SALE,
        status: Transaction.TransactionStatus.PENDING,
        fulfilmentDate: {$lt: new Date()}
      })
        .populate([
          ...(populate.all || populate.user ? [{ path: "user" }] : []),
          ...(populate.all || populate.withdrawal ? [{ path: "withdrawal" }] : []),
          ...(populate.all || populate.purchase || populate.detailedItem ? [{
            path: "purchase",
            // Populate nested detailedItem within purchase.
            ...(populate.all || populate.detailedItem ? { populate: { path: "detailedItem" } } : {}),
          }] : [])
        ])
        .lean({ virtuals: true }));
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Returns the balance of a given user by aggregating the dollar value of documents in transaction index.
   * @param includePending True if pending transactions should also be fetched. Transactions of type
   * 'withdrawal' are always fetched despite this value.
   * @param userUid UserUid to search for.
   * @param session The MongoDB session, if applicable.
   * @returns {Promise<>} An array of Transactions that exist in the database.
   */
  static async getBalanceByUserUid(userUid, includePending = false, session = undefined) {
    try {
      const response = mongooseToJson(await Transaction.mongooseModel.aggregate([
        {
          $match: {
            userUid: userUid,
            ...(includePending ?
              { status: { $in: [Transaction.TransactionStatus.COMPLETED, Transaction.TransactionStatus.PENDING] } } :
              {
                // Include only completed transactions. Also include pending transactions if transaction
                // type is 'withdrawal'.
                $or: [
                  { status: Transaction.TransactionStatus.COMPLETED },
                  {
                    status: Transaction.TransactionStatus.PENDING,
                    "info.transactionType": Transaction.TransactionType.WITHDRAWAL
                  }
                ]
              })
          }
        },
        { $group: { _id: null, balance: { $sum: "$amount" } } },
      ], ...(session != null ? [{ session }] : [])));

      return response?.[0]?.balance ?? 0;
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
        index: Transaction.indexName,
        keep_alive: "45m",
      });

      return response.id;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Create an Orders document with set attributes.
   * @param session The MongoDB session, if applicable.
   * @return {Promise<Object>}
   */
  async save(session = undefined) {
    try {
      const dateCreated = new Date();

      // Save new document.
      const response = mongooseToJson(await Transaction.mongooseModel.create([{
        ...(this.#_index != null ? { _index: this.#_index } : {}),
        ...(this.#userUid != null ? { userUid: this.#userUid } : {}),
        ...(this.#info != null ? { info: this.#info } : {}),
        ...(this.#amount != null ? { amount: this.#amount } : {}),
        ...(this.#status != null ? { status: this.#status } : {}),
        ...(this.#fulfilmentDate != null ? { fulfilmentDate: this.#fulfilmentDate } : {}),
        dateCreated: dateCreated,
        dateUpdated: dateCreated
      }], ...(session != null ? [{ session }] : [])));

      if (!response?.length || !response?.[0]?._id) {
        throw new Error(`Error saving ${Transaction.indexName} document.`);
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
   * Update a Transaction document with defined attributes.
   * @param id The id of the Transaction to update.
   * @param fields The fields and the values to update to.
   * @param session The MongoDB session, if applicable.
   * @return {Promise<void>}
   */
  static async updateOneById(id, fields = {}, session = undefined) {
    try {
      // Lock requests with the same id to run synchronously.
      await new QueueLockService(QueueLockService.DatabaseQueue.transactions).processJob({ id },
        async () => {
        const dateUpdated = new Date();

        // Update existing document.
        const response = await Transaction.mongooseModel.updateOne(
          { _id: id },
          {
            $set: {
              ...(fields.userUid != null ? { userUid: fields.userUid } : {}),
              ...(fields.info != null ? { info: fields.info } : {}),
              ...(fields.amount != null ? { amount: fields.amount } : {}),
              ...(fields.status != null ? { status: fields.status } : {}),
              ...(fields.fulfilmentDate != null ? { fulfilmentDate: fields.fulfilmentDate } : {}),
              dateUpdated: dateUpdated
            }
          },
          { runValidators: true, context: "query", ...(session != null ? { session } : {}) }
        );

        const matched = response.matchedCount ?? response.n ?? 0;

        if (!matched) {
          throw new Error(`Error updating ${Transaction.indexName} document.`);
        }
      });
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

}

module.exports = Transaction;
