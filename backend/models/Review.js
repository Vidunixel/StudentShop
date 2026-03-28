const {client, mongooseToJson, elasticSearchToJson} = require("./common");
const QueueLockService = require("../services/QueueLockService");
const mongoose = require("mongoose");
const mongooseLeanVirtuals = require("mongoose-lean-virtuals");
let Note;
let User;

class Review {
  static indexName = "reviews";

  static #mongooseSchema;
  static mongooseModel;

  static #elasticSearchMapping = {
    properties: {
      userUid: { type: "keyword" },
      item: {
        properties: {
          _index: { type: "keyword" },
          _id: { type: "keyword" }
        }
      },
      rating: { type: "integer" },
      review: { type: "text" },
      isAi: { type: "boolean" },
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
  #item;
  #rating;
  #review;
  #isAi;
  #dateCreated;
  #dateUpdated;

  constructor({ _id, userUid, item, rating, review, isAi }) {
    this.#_index = Review.indexName;
    this.#userUid = userUid;
    this.#item = item;
    this.#rating = rating;
    this.#review = review;
    this.#isAi = isAi;
  }

  /**
   * Create an explicit mapping for Reviews if it does not already exist.
   * @return {Promise<string>} Success message.
   */
  static async initialiseElasticIndex() {
    try {
      // Check if the index already exists.
      const indexExists = await client.indices.exists({index: Review.indexName});

      if (!indexExists) {
        // Create the index with mappings.
        await client.indices.create({
          index: Review.indexName,
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
          mappings: Review.#elasticSearchMapping
        });
        return `${Review.indexName} index initialised successfully.`;
      }
      return `${Review.indexName} index has already been initialised.`;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  static setModelReferences(modelReferences) {
    Note = modelReferences.Note;
    User = modelReferences.User;
  }

  static initialiseMongooseSchema() {
    Review.#mongooseSchema = new mongoose.Schema({
      _index: { type: String, enum: [Review.indexName], required: true },
      userUid: { type: String }, // Missing for AiReviews
      item: {
        type: {
          _index: { type: String, enum: [Note.indexName], required: true },
          _id: { type: mongoose.Schema.Types.ObjectId, refPath: "item._index", required: true }
        },
        required: true
      },
      rating: { type: Number, required: true },
      review: { type: String, required: true },
      isAi: { type: Boolean },
      dateCreated: { type: Date, required: true },
      dateUpdated: { type: Date, required: true }
    });
    Review.#mongooseSchema.virtual("user", {
      ref: User.indexName,
      localField: "userUid",
      foreignField: "uid",
      justOne: true
    });
    Review.#mongooseSchema.virtual("detailedItem", {
      refPath: "item._index",
      localField: "item._id",
      foreignField: "_id",
      justOne: true
    });
    Review.#mongooseSchema.plugin(mongooseLeanVirtuals);
    Review.mongooseModel = mongoose.model(Review.indexName, Review.#mongooseSchema);
  }

  /**
   * Filter out attributes of a Review object that should not be visible to owner.
   * @param review The review object.
   * @return {*&{_index: string}}
   */
  static filterAttributesForOwner(review) {
    return {
      _index: review._index,
      _id: review._id,
      userUid: review.userUid,
      item: review.item,
      rating: review.rating,
      review: review.review,
      isAi: review.isAi,
      ...(review.detailedItem != null ? {
        ...(review.detailedItem._index === Note.indexName ?
          { detailedItem: Note.filterAttributesForPublic(review.detailedItem) } : {})
      } : {}),
      ...(review.user != null ? {
        user: User.filterAttributesForPublic(review.user)
      } : {}),
      _score: review._score,
      sort: review.sort,
      dateCreated: new Date(review.dateCreated),
      dateUpdated: new Date(review.dateUpdated)
    }
  }

  /**
   * Filter out attributes of a Review object that should not be visible to public.
   * @param review The review object.
   * @return {*&{_index: string}}
   */
  static filterAttributesForPublic(review) {
    return {
      _index: review._index,
      _id: review._id,
      userUid: review.userUid,
      item: review.item,
      rating: review.rating,
      review: review.review,
      isAi: review.isAi,
      ...(review.detailedItem != null ? {
        ...(review.detailedItem._index === Note.indexName ?
          { detailedItem: Note.filterAttributesForPublic(review.detailedItem) } : {})
      } : {}),
      ...(review.user != null ? {
        user: User.filterAttributesForPublic(review.user)
      } : {}),
      _score: review._score,
      sort: review.sort,
      dateCreated: new Date(review.dateCreated),
      dateUpdated: new Date(review.dateUpdated)
    }
  }

  /**
   * Merge ElasticSearch documents with the equivalent MongoDB ones.
   * @param response ElasticSearch response.
   * @param populate{{ all?: boolean, detailedItem?: boolean, user?: boolean }}
   * True if specified foreign field should be populated, false if not. 'all' populates all foreign fields.
   * @return {Promise<>} JSON response of merged documents.
   */
  static async #mergeElasticAndMongoDocuments(response, populate = {}) {
    const elasticDocuments = elasticSearchToJson(response);
    const elasticDocumentIds = elasticDocuments.map((document) => document._id);

    // Get MongoDb documents.
    const mongoDocuments = await Review.findManyByIds(elasticDocumentIds, undefined,
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
   * Delete a Review document by its id.
   * @param id The id of the Review to delete.
   * @param session The MongoDB session, if applicable.
   * @return {Promise<void>}
   */
  static async deleteOneById(id, session = undefined) {
    try {
      // Lock requests with the same id to run synchronously.
      await new QueueLockService(QueueLockService.DatabaseQueue.reviews).processJob({ id },
        async () => {
          const response = await Review.mongooseModel.deleteOne({ _id: id },
            ...(session != null ? [{ session }] : []));

          const deleted = response.deletedCount ?? response.result?.n ?? 0;

          if (!deleted) {
            throw new Error(`Error deleting ${Review.indexName} document.`);
          }
      });
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Find a document with the isAi field set to true and matches the given item.
   * @param item Item to search for.
   * @param session The MongoDB session, if applicable.
   * @param populate{{ all?: boolean, detailedItem?: boolean, user?: boolean }}
   * @return {Promise<>} An array of Reviews that exist in the database.
   */
  static async findOneAiReviewByItem(item, session = undefined, populate = {}) {
    try {
      return mongooseToJson(await Review.mongooseModel.find({
        "item._index": item._index,
        "item._id": item._id,
        isAi: true
      }, undefined, ...(session != null ? [{ session }] : []))
        .populate([
          ...(populate.all || populate.detailedItem ? [{ path: "detailedItem" }] : []),
          ...(populate.all || populate.user ? [{ path: "user" }] : [])
        ])
        .limit(1).lean({ virtuals: true }));
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Find documents that match the given ids.
   * @param ids An array of ids to search.
   * @param session The MongoDB session, if applicable.
   * @param populate{{ all?: boolean, detailedItem?: boolean, user?: boolean }}
   * @return {Promise<>} An array of Reviews that exist in the database.
   */
  static async findManyByIds(ids, session = undefined, populate = {}) {
    try {
      return mongooseToJson(await Review.mongooseModel.find({
        _id: { $in: ids }
      }, undefined, ...(session != null ? [{ session }] : []))
        .populate([
          ...(populate.all || populate.detailedItem ? [{ path: "detailedItem" }] : []),
          ...(populate.all || populate.user ? [{ path: "user" }] : [])
        ])
        .lean({ virtuals: true }));
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Find documents that match the item.
   * @param item Item to search for.
   * @param session The MongoDB session, if applicable.
   * @param populate{{ all?: boolean, detailedItem?: boolean, user?: boolean }}
   * @return {Promise<>} An array of Orders that exist in the database.
   */
  static async findManyByItem(item, session = undefined, populate = {}) {
    try {
      return mongooseToJson(await Review.mongooseModel.find({
        "item._index": item._index,
        "item._id": item._id
      }, undefined, ...(session != null ? [{ session }] : []))
        .populate([
          ...(populate.all || populate.detailedItem ? [{ path: "detailedItem" }] : []),
          ...(populate.all || populate.user ? [{ path: "user" }] : [])
        ])
        .lean({ virtuals: true }));
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Find documents that match the provided item exactly, excluding docs with the provided userUid or isAi.
   * @param item Item to search for.
   * @param userUid UserUid to exclude.
   * @param sortBy Sort method.
   * @param nextPage The search_after values to get next page.
   * @param pitId Id reference for the current state of the index.
   * @param size Number of documents returned.
   * @param populate{{ all?: boolean, detailedItem?: boolean, user?: boolean }}
   * @return {Promise<>} An array of Reviews that exist in the database.
   */
  static async findManyByItemSearch(item, userUid = undefined, sortBy = "date-created-desc", nextPage = undefined, pitId = undefined,
                                    size = 25, populate = {}) {
    try {
      const response = await client.search({
        // Specify index only if pitId is undefined.
        ...(pitId != null ? { } : { index: Review.indexName }),
        query: {
          bool: {
            must: [
              { term: { "item._index": { value: item._index } }},
              { term: { "item._id": { value: item._id } }}
            ],
            must_not: [
              { term: { "isAi": { value: true } }},
              ...(userUid ? [{ term: { "userUid": { value: userUid } }}] : []),
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

          // Sorting by rating including dateCreated tiebreaker.
          ...(sortBy === "rating-desc" ? [{ "rating": "desc" }, { "dateCreated": "desc" }] : []),
          ...(sortBy === "rating-asc" ? [{ "rating": "asc" }, { "dateCreated": "desc" }] : []),
        ],
        size: size,
      });

      // Merge ElasticSearch response with MongoDB documents.
      return await Review.#mergeElasticAndMongoDocuments(response, populate);
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Find documents that matches the provided query (Admin/Staff).
   * @param searchQuery Review to search for.
   * @param filters Filters to apply.
   * @param sortBy Sort method.
   * @param nextPage The search_after values to get next page.
   * @param pitId Id reference for the current state of the index.
   * @param size Number of documents returned.
   * @param populate{{ all?: boolean, detailedItem?: boolean, user?: boolean }}
   * True if specified foreign field should be populated, false if not. 'all' populates all foreign fields.
   * @return {Promise<>}
   */
  static async findManyByQueryAdminSearch(searchQuery = undefined, filters = { },
                                          sortBy = "relevance", nextPage = undefined,
                                          pitId = undefined, size = 50, populate = {}) {
    try {
      const response = await client.search({
        // Specify index only if pitId is undefined.
        ...(pitId != null ? { } : { index: Review.indexName }),
        query: {
          function_score: {
            query: {
              bool: {
                must: [
                  ...(filters._id != null ? [{ term: { "_id": { value: filters._id } }}] : []),
                  ...(filters.userUid != null ? [{ term: { "userUid": { value: filters.userUid } }}] : []),
                  ...(filters.rating != null ? [{ term: { "rating": { value: filters.rating } }}] : []),
                  ...(filters.isAi != null ? [{ term: { "isAi": { value: filters.isAi } }}] : []),
                  ...(searchQuery != null ? [{
                    multi_match : {
                      query : searchQuery,
                      fields : [ "review" ],
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
      return await Review.#mergeElasticAndMongoDocuments(response, populate);
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Find a document that match the given UserUid.
   * @param item Item to search for.
   * @param uid UserUid to search for.
   * @param session The MongoDB session, if applicable.
   * @param populate{{ all?: boolean, detailedItem?: boolean, user?: boolean }}
   * @return {Promise<>} An array of Reviews that exist in the database.
   */
  static async findOneByItemAndUid(item, uid, session = undefined, populate = {}) {
    try {
      return mongooseToJson(await Review.mongooseModel.find({
        "item._index": item._index,
        "item._id": item._id,
        userUid: uid
      }, undefined, ...(session != null ? [{ session }] : []))
        .populate([
          ...(populate.all || populate.detailedItem ? [{ path: "detailedItem" }] : []),
          ...(populate.all || populate.user ? [{ path: "user" }] : [])
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
        index: Review.indexName,
        keep_alive: "45m",
      });

      return response.id;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Create a Reviews document with set attributes.
   * @param session The MongoDB session, if applicable.
   * @return {Promise<Object>}
   */
  async save(session = undefined) {
    try {
      const dateCreated = new Date();

      // Save new document.
      const response = mongooseToJson(await Review.mongooseModel.create([{
        ...(this.#_index != null ? { _index: this.#_index } : {}),
        ...(this.#userUid != null ? { userUid: this.#userUid } : {}),
        ...(this.#item != null ? { item: this.#item } : {}),
        ...(this.#rating != null ? { rating: this.#rating } : {}),
        ...(this.#review != null ? { review: this.#review } : {}),
        ...(this.#isAi != null ? { isAi: this.#isAi } : {}),
        dateCreated: dateCreated,
        dateUpdated: dateCreated
      }], ...(session != null ? [{ session }] : [])));

      if (!response?.length || !response?.[0]?._id) {
        throw new Error(`Error saving ${Review.indexName} document.`);
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
   * Update a Review document with defined attributes.
   * @param id The id of the Review to update.
   * @param session The MongoDB session, if applicable.
   * @param fields The fields and the values to update to.
   * @return {Promise<void>}
   */
  static async updateOneById(id, fields = {}, session = undefined) {
    try {
      // Lock requests with the same id to run synchronously.
      await new QueueLockService(QueueLockService.DatabaseQueue.reviews).processJob({ id },
        async () => {
        const dateUpdated = new Date();

        // Update existing document.
        const response = await Review.mongooseModel.updateOne(
          { _id: id },
          {
            $set: {
              ...(fields.userUid != null ? { userUid: fields.userUid } : {}),
              ...(fields.item != null ? { item: fields.item } : {}),
              ...(fields.rating != null ? { rating: fields.rating } : {}),
              ...(fields.review != null ? { review: fields.review } : {}),
              ...(fields.isAi != null ? { isAi: fields.isAi } : {}),
              dateUpdated: dateUpdated
            }
          },
          { runValidators: true, context: "query", ...(session != null ? { session } : {}) }
        );

        const matched = response.matchedCount ?? response.n ?? 0;

        if (!matched) {
          throw new Error(`Error updating ${Review.indexName} document.`);
        }
      });
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

}

module.exports = Review;
