const {client, mongooseToJson, elasticSearchToJson} = require("./common");
const QueueLockService = require("../services/QueueLockService");
const mongoose = require("mongoose");
const mongooseLeanVirtuals = require("mongoose-lean-virtuals");
let Refund;
let Note;
let User;
let Transaction;

class Purchase {
  static PurchaseStatus = {
    PAID: "paid"
  }

  static DisplayStatus = {
    REFUNDED: "refunded",
    PENDING_REFUND: "pending_refund",
    PAID: "paid"
  };

  static PaymentMethod = {
    FREE: "free",
    CREDIT: "credit",
    PAYPAL: "paypal"
  }

  static indexName = "purchases";

  static #mongooseSchema;
  static mongooseModel;

  static #elasticSearchMapping = {
    properties: {
      userUid: { type: "keyword" },
      sellerUid: { type: "keyword" },
      orderId: { type: "keyword" },
      price: {
        properties: {
          unitAmount: {
            properties: {
              sellerReceive: { type: "double" },
              studentShopFee: { type: "double" },
              unitTotal: { type: "double" },
            }
          },
          tax: { type: "double" },
          transactionFee: { type: "double" },
          total: { type: "double" }
        }
      },
      item: {
        properties: {
          _index: { type: "keyword" },
          _id: { type: "keyword" }
        }
      },
      status: { type: "keyword" },
      refundProperties: {
        properties: {
          refundExpiryDate: { type: "date", format: "strict_date_optional_time" },
          isRefundRestricted: { type: "boolean" },
        }
      },
      paymentMethod: { type: "keyword" },
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
  #sellerUid;
  #orderId;
  #item;
  #price
  #status;
  #refundProperties;
  #paymentMethod;
  #dateCreated;
  #dateUpdated;

  constructor({ _id, userUid, sellerUid, orderId, item, price, status, paymentMethod, refundProperties }) {
    this.#_index = Purchase.indexName;
    this.#userUid = userUid;
    this.#sellerUid = sellerUid;
    this.#orderId = orderId;
    this.#item = item;
    this.#price = price;
    this.#status = status;
    this.#paymentMethod = paymentMethod;
    this.#refundProperties = refundProperties;
  }

  /**
   * Create an explicit mapping for Orders if it does not already exist.
   * @return {Promise<string>} Success message.
   */
  static async initialiseElasticIndex() {
    try {
      // Check if the index already exists.
      const indexExists = await client.indices.exists({index: Purchase.indexName});

      if (!indexExists) {
        // Create the index with mappings.
        await client.indices.create({
          index: Purchase.indexName,
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
          mappings: Purchase.#elasticSearchMapping
        });
        return `${Purchase.indexName} index initialised successfully.`;
      }
      return `${Purchase.indexName} index has already been initialised.`;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  static setModelReferences(modelReferences) {
    User = modelReferences.User;
    Note = modelReferences.Note;
    Refund = modelReferences.Refund;
    Transaction = modelReferences.Transaction;
  }

  static initialiseMongooseSchema() {
    Purchase.#mongooseSchema = new mongoose.Schema({
      _index: { type: String, enum: [Purchase.indexName], required: true },
      userUid: { type: String, required: true },
      sellerUid: { type: String, required: true },
      orderId: { type: String }, // For PayPal purchases only.
      price: {
        type: {
          unitAmount: {
            type: {
              sellerReceive: { type: Number, required: true, default: 0 },
              studentShopFee: { type: Number, required: true, default: 0 },
              unitTotal: { type: Number, required: true, default: 0 },
            },
            required: true,
            default: {},
            _id: false
          },
          tax: { type: Number, required: true, default: 0 },
          transactionFee: { type: Number, required: true, default: 0 },
          total: { type: Number, required: true, default: 0 }
        },
        required: true,
        default: {},
        _id: false
      },
      item: {
        type: {
          _index: { type: String, enum: [Note.indexName], required: true },
          _id: { type: mongoose.Schema.Types.ObjectId, refPath: "item._index", required: true }
        },
        required: true
      },
      status: { type: String, required: true, enum: Object.values(Purchase.PurchaseStatus), default: Purchase.PurchaseStatus.PAID },
      refundProperties: {
        type: {
          refundExpiryDate: { type: Date }, // Only set if refundable.
          isRefundRestricted: { type: Boolean },
        },
        _id: false,
        required: true,
        default: {}
      },
      paymentMethod: { type: String, required: true, enum: Object.values(Purchase.PaymentMethod), default: Purchase.PaymentMethod.FREE },
      dateCreated: { type: Date },
      dateUpdated: { type: Date }
    });
    Purchase.#mongooseSchema.virtual("user", {
      ref: User.indexName,
      localField: "userUid",
      foreignField: "uid",
      justOne: true
    });
    Purchase.#mongooseSchema.virtual("seller", {
      ref: User.indexName,
      localField: "sellerUid",
      foreignField: "uid",
      justOne: true
    });
    Purchase.#mongooseSchema.virtual("detailedItem", {
      refPath: "item._index",
      localField: "item._id",
      foreignField: "_id",
      justOne: true
    });
    Purchase.#mongooseSchema.virtual("transactions", {
      ref: Transaction.indexName,
      localField: "_id",
      foreignField: "info.purchaseId",
      justOne: false
    });
    Purchase.#mongooseSchema.virtual("refund", {
      ref: Refund.indexName,
      localField: "_id",
      foreignField: "purchaseId",
      justOne: true
    });
    Purchase.#mongooseSchema.plugin(mongooseLeanVirtuals);
    Purchase.mongooseModel =  mongoose.model(Purchase.indexName, Purchase.#mongooseSchema);
  }

  /**
   * Filter out attributes of a Purchase object that should not be visible to owner.
   * @param purchase The purchase object.
   * @return {*&{_index: string}}
   */
  static filterAttributesForOwner(purchase) {
    return {
      _index: purchase._index,
      _id: purchase._id,
      userUid: purchase.userUid,
      sellerUid: purchase.sellerUid,
      orderId: purchase.orderId,
      item: purchase.item,
      price: purchase.price,
      status: purchase.status,
      refundProperties: purchase.refundProperties,
      paymentMethod: purchase.paymentMethod,
      ...(purchase.user != null ? {
        user: User.filterAttributesForPublic(purchase.user)
      } : {}),
      ...(purchase.seller != null ? {
        seller: User.filterAttributesForPublic(purchase.seller)
      } : {}),
      ...(purchase.detailedItem != null ? {
        ...(purchase.detailedItem._index === Note.indexName ?
          { detailedItem: Note.filterAttributesForPublic(purchase.detailedItem) } : {})
      } : {}),
      _score: purchase._score,
      sort: purchase.sort,
      dateCreated: new Date(purchase.dateCreated),
      dateUpdated: new Date(purchase.dateUpdated)
    }
  }

  /**
   * Merge ElasticSearch documents with the equivalent MongoDB ones.
   * @param response ElasticSearch response.
   * @param populate{{ all?: boolean, user?: boolean, seller?: boolean, detailedItem?: boolean, refund?: boolean, transactions?: boolean }}
   * True if specified foreign field should be populated, false if not. 'all' populates all foreign fields.
   * @return {Promise<>} JSON response of merged documents.
   */
  static async #mergeElasticAndMongoDocuments(response, populate = {}) {
    const elasticDocuments = elasticSearchToJson(response);
    const elasticDocumentIds = elasticDocuments.map((document) => document._id);

    // Get MongoDb documents.
    const mongoDocuments = await Purchase.findManyByIds(elasticDocumentIds, undefined,
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
   * @param populate{{ all?: boolean, user?: boolean, seller?: boolean, detailedItem?: boolean, refund?: boolean, transactions?: boolean }}
   * True if specified foreign field should be populated, false if not. 'all' populates all foreign fields.
   * @return {Promise<>} An array of Orders that exist in the database.
   */
  static async findManyByIds(ids, session = undefined, populate = {}) {
    try {
      return mongooseToJson(await Purchase.mongooseModel.find({
        _id: { $in: ids }
      }, undefined, ...(session != null ? [{ session }] : []))
        .populate([
          ...(populate.all || populate.user ? [{ path: "user" }] : []),
          ...(populate.all || populate.seller ? [{ path: "seller" }] : []),
          ...(populate.all || populate.detailedItem ? [{ path: "detailedItem" }] : []),
          ...(populate.all || populate.refund ? [{ path: "refund" }] : []),
          ...(populate.all || populate.transactions ? [{
            path: "transactions",
            populate: { path: "user" }
          }] : [])
        ])
        .lean({ virtuals: true }));
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Find documents that match the given userUid, items, or optionally, status.
   * @param userUid User's uid to search for.
   * @param items Items to search for.
   * @param status Status to search for.
   * @param session The MongoDB session, if applicable.
   * @param populate{{ all?: boolean, user?: boolean, seller?: boolean, detailedItem?: boolean, refund?: boolean, transactions?: boolean }}
   * True if specified foreign field should be populated, false if not. 'all' populates all foreign fields.
   * @return {Promise<>} An array of Orders that exist in the database.
   */
  static async findManyByItems(items, userUid = undefined, status = undefined,
                               session = undefined, populate = {}) {
    try {
      return mongooseToJson(await Purchase.mongooseModel.find({
        ...(userUid ? { userUid } : {}),
        ...(status ? { status } : {}),
        ...(items && items.length ? { $or: items.map(item => ({ "item._index": item._index, "item._id": item._id })) } : {})
      }, undefined, ...(session != null ? [{ session }] : []))
        .populate([
          ...(populate.all || populate.user ? [{ path: "user" }] : []),
          ...(populate.all || populate.seller ? [{ path: "seller" }] : []),
          ...(populate.all || populate.detailedItem ? [{ path: "detailedItem" }] : []),
          ...(populate.all || populate.refund ? [{ path: "refund" }] : []),
          ...(populate.all || populate.transactions ? [{
            path: "transactions",
            populate: { path: "user" }
          }] : [])
        ])
        .lean({ virtuals: true }));
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Find documents that match the provided userUid exactly.
   * @param userUid UserUid to search for.
   * @param index The index, "notes" to search for.
   * @param isUniqueItemId Only one purchase instance is returned per purchased item if true.
   * @param sortBy Sort method.
   * @param nextPage The search_after values to get next page.
   * @param pitId Id reference for the current state of the index.
   * @param size Number of documents returned.
   * @param populate{{ all?: boolean, user?: boolean, seller?: boolean, detailedItem?: boolean, refund?: boolean, transactions?: boolean }}
   * True if specified foreign field should be populated, false if not. 'all' populates all foreign fields.
   * @return {Promise<>} An array of Orders that exist in the database.
   */
  static async findManyByUserUidSearch(userUid, index = undefined, isUniqueItemId = false,
                                       sortBy = "date-created-desc", nextPage = undefined, pitId = undefined,
                                       size = 25, populate = {}) {
    try {
      const response = await client.search({
        // Specify index only if pitId is undefined.
        ...(pitId != null ? { } : { index: Purchase.indexName }),
        query: {
          bool: {
            must: [
              { term: { "userUid": { value: userUid } }},
              ...(index ? [{ term: { "item._index": { value: index } }}] : [])
            ]
          }
        },
        ...(pitId != null ? { pit: { id: pitId, keep_alive: "15m" }} : {}),
        ...(nextPage != null ? { search_after: nextPage } : {}),
        ...(isUniqueItemId ? { collapse: { field: "item._id" } } : {}),
        sort: [
          // Sorting by dateCreated.
          ...(sortBy === "date-created-desc" ? [{ "dateCreated": "desc" }] : []),
          ...(sortBy === "date-created-asc" ? [{ "dateCreated": "asc" }] : []),
          // Sorting by dateUpdated.
          ...(sortBy === "date-updated-desc" ? [{ "dateUpdated": "desc" }] : []),
          ...(sortBy === "date-updated-asc" ? [{ "dateUpdated": "asc" }] : []),
          // Sorting by price including dateCreated tiebreaker.
          ...(sortBy === "price-desc" ? [{ "price.total": "desc" }, { "dateCreated": "desc" }] : []),
          ...(sortBy === "price-asc" ? [{ "price.total": "asc" }, { "dateCreated": "desc" }] : [])
        ],
        size: size,
      });

      // Merge ElasticSearch response with MongoDB documents.
      return await Purchase.#mergeElasticAndMongoDocuments(response, populate);
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
   * @param populate{{ all?: boolean, user?: boolean, seller?: boolean, detailedItem?: boolean, refund?: boolean, transactions?: boolean }}
   * True if specified foreign field should be populated, false if not. 'all' populates all foreign fields.
   * @return {Promise<>}
   */
  static async findManyByQueryAdminSearch(searchQuery = undefined, filters = { },
                                          sortBy = "date-created-desc", nextPage = undefined,
                                          pitId = undefined, size = 50, populate = {}) {
    try {
      const response = await client.search({
        // Specify index only if pitId is undefined.
        ...(pitId != null ? { } : { index: Purchase.indexName }),
        query: {
          function_score: {
            query: {
              bool: {
                must: [
                  ...(filters._id != null ? [{ term: { "_id": { value: filters._id } }}] : []),
                  ...(filters.userUid != null ? [{ term: { "userUid": { value: filters.userUid } }}] : []),
                  ...(filters.sellerUid != null ? [{ term: { "sellerUid": { value: filters.sellerUid } }}] : []),
                  ...(filters.orderId != null ? [{ term: { "orderId": { value: filters.orderId } }}] : []),
                  ...(filters.status != null ? [{ term: { "status": { value: filters.status } }}] : []),
                  ...(filters.paymentMethod != null ? [{ term: { "paymentMethod": { value: filters.paymentMethod } }}] : [])
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
          // Sorting by price including dateCreated tiebreaker.
          ...(sortBy === "price-desc" ? [{ "price.total": "desc" }, { "dateCreated": "desc" }] : []),
          ...(sortBy === "price-asc" ? [{ "price.total": "asc" }, { "dateCreated": "desc" }] : [])
        ],
        size: size,
      });

      // Merge ElasticSearch response with MongoDB documents.
      return await Purchase.#mergeElasticAndMongoDocuments(response, populate);
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Get userUids with sales, ordered by the number of sales.
   * @param size Number of documents returned.
   * @return {Promise<>}
   */
  static async getUserUidsByRecentSalesSearch(size = 10) {
    try {
      const response = await client.search({
        index: Purchase.indexName,
        query: {
          range: {
            dateCreated: {
              gte: "now-31d", // Include only last 31 days (inclusive).
              lte: "now"
            }
          }
        },
        aggs: {
          top_sellers: {
            terms: {
              field: "sellerUid",
              order: { "_count": "desc" },
              size: size
            }
          }
        },
        size: 0, // Don’t return hits, only aggregations.
      });

      return response.aggregations.top_sellers.buckets.map(entry => entry.key);
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
        index: Purchase.indexName,
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
      const response = mongooseToJson(await Purchase.mongooseModel.create([{
        ...(this.#_index != null ? { _index: this.#_index } : {}),
        ...(this.#userUid != null ? { userUid: this.#userUid } : {}),
        ...(this.#sellerUid != null ? { sellerUid: this.#sellerUid } : {}),
        ...(this.#orderId != null ? { orderId: this.#orderId } : {}),
        ...(this.#item != null ? { item: this.#item } : {}),
        ...(this.#price != null ? { price: this.#price } : {}),
        ...(this.#status != null ? { status: this.#status } : {}),
        ...(this.#refundProperties != null ? { refundProperties: this.#refundProperties } : {}),
        ...(this.#paymentMethod != null ? { paymentMethod: this.#paymentMethod } : {}),
        dateCreated: dateCreated,
        dateUpdated: dateCreated
      }], ...(session != null ? [{ session }] : [])));

      if (!response?.length || !response?.[0]?._id) {
        throw new Error(`Error saving ${Purchase.indexName} document.`);
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
   * Update a Purchase document with defined attributes.
   * @param id The id of the Purchase to update.
   * @param fields The fields and the values to update to.
   * @param session The MongoDB session, if applicable.
   * @return {Promise<void>}
   */
  static async updateOneById(id, fields = {}, session = undefined) {
    try {
      // Lock requests with the same id to run synchronously.
      await new QueueLockService(QueueLockService.DatabaseQueue.purchases).processJob({ id },
        async () => {
        const dateUpdated = new Date();

        // Update existing document.
        const response = await Purchase.mongooseModel.updateOne(
          { _id: id },
          {
            $set: {
              ...(fields.userUid != null ? { userUid: fields.userUid } : {}),
              ...(fields.sellerUid != null ? { sellerUid: fields.sellerUid } : {}),
              ...(fields.orderId != null ? { orderId: fields.orderId } : {}),
              ...(fields.item != null ? { item: fields.item } : {}),
              ...(fields.price != null ? { price: fields.price } : {}),
              ...(fields.status != null ? { status: fields.status } : {}),
              ...(fields.refundProperties != null ? { refundProperties: fields.refundProperties } : {}),
              ...(fields.paymentMethod != null ? { paymentMethod: fields.paymentMethod } : {}),
              dateUpdated: dateUpdated
            }
          },
          { runValidators: true, context: "query", ...(session != null ? { session } : {}) }
        );

        const matched = response.matchedCount ?? response.n ?? 0;

        if (!matched) {
          throw new Error(`Error updating ${Purchase.indexName} document.`);
        }
      });
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

}

module.exports = Purchase;
