const {client, mongooseToJson, elasticSearchToJson} = require("./common");
const QueueLockService = require("../services/QueueLockService");
const mongoose = require("mongoose");
const mongooseLeanVirtuals = require("mongoose-lean-virtuals");
let User;
let Subject;
let Refund;
let Review;

class Note {
  static NoteStatus = {
    PROCESSING: "processing",
    PENDING_REVIEW: "pending_review",
    PROCESSING_ERROR: "processing_error",
    REJECTED: "rejected",
    LISTED: "listed",
    DELISTED: "delisted",
    DELETED: "deleted"
  }

  static RejectReasonFlaggedSection = {
    TITLE: "title",
    DESCRIPTION: "description",
    SUBJECTS: "subjects",
    NOTE_CONTENT: "note_content",
  }

  static defaultNoteCover = "placeholder.jpg";

  static indexName = "notes";

  static #mongooseSchema;
  static mongooseModel;

  static #elasticSearchMapping = {
    properties: {
      sellerUid: { type: "keyword" },
      title: { type: "text" },
      description: { type: "text" },
      subjectIds: { type: "keyword" },
      price: { type: "double" },
      pdfFile: { type: "keyword" },
      noteCover: { type: "keyword" },
      pageCount: { type: "integer" },
      purchaseCount: { type: "integer" },
      status: { type: "keyword" },
      samplePdfProperties: { type: "integer" },
      ratingCount: {
        properties: {
          "1": { type: "integer" },
          "2": { type: "integer" },
          "3": { type: "integer" },
          "4": { type: "integer" },
          "5": { type: "integer" }
        }
      },
      refundPolicy: {
        properties: {
          refundPeriod: { type: "date", format: "epoch_millis" },
          acceptedReasons: { type: "keyword" },
          isApprovalRequired: { type: "boolean" }
        }
      },
      rejectReason: {
        properties: {
          isAi: { type: "boolean" },
          flaggedSections: { type: "keyword" },
          feedback: { type: "keyword" }
        }
      },
      fileHash: { type: "keyword" },
      dateCreated: { type: "date", format: "strict_date_optional_time" },
      dateUpdated: { type: "date", format: "strict_date_optional_time" }
    }
  };

  #_index;
  #_id;
  #sellerUid;
  #title;
  #description;
  #subjectIds;
  #price;
  #pdfFile;
  #pageCount;
  #purchaseCount;
  #status;
  #noteCover;
  #samplePdfProperties;
  #ratingCount;
  #refundPolicy;
  #rejectReason;
  #fileHash;
  #dateCreated;
  #dateUpdated;

  constructor({ _id, sellerUid, title, description, subjectIds, price, pdfFile, pageCount, samplePdfProperties,
                status, noteCover, ratingCount, refundPolicy, rejectReason, fileHash }) {
    this.#_index = Note.indexName;
    this.#sellerUid = sellerUid;
    this.#title = title;
    this.#description = description;
    this.#subjectIds = subjectIds;
    this.#price = price;
    this.#pdfFile = pdfFile;
    this.#pageCount = pageCount;
    this.#purchaseCount = 0;
    this.#status = status;
    this.#noteCover = noteCover;
    this.#samplePdfProperties = samplePdfProperties;
    this.#refundPolicy = refundPolicy;
    this.#rejectReason = rejectReason;
    this.#fileHash = fileHash;
    this.#ratingCount = ratingCount;
  }

  /**
   * Create an explicit mapping for Notes if it does not already exist.
   * @return {Promise<string>} Success message.
   */
  static async initialiseElasticIndex() {
    try {
      // Check if the index already exists.
      const indexExists = await client.indices.exists({index: Note.indexName});

      if (!indexExists) {
        // Create the index with mappings.
        await client.indices.create({
          index: Note.indexName,
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
          mappings: Note.#elasticSearchMapping
        });
        return `${Note.indexName} index initialised successfully.`;
      }
      return `${Note.indexName} index has already been initialised.`;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  static setModelReferences(modelReferences) {
    User = modelReferences.User;
    Subject = modelReferences.Subject;
    Refund = modelReferences.Refund;
    Review = modelReferences.Review;
  }

  static initialiseMongooseSchema() {
    Note.#mongooseSchema = new mongoose.Schema({
      _index: { type: String, enum: [Note.indexName], required: true },
      sellerUid: { type: String, required: true },
      title: { type: String, required: true },
      description: { type: String, required: true },
      subjectIds: {
        type: [{ type: mongoose.Schema.Types.ObjectId, ref: Subject.indexName, required: true }],
        required: true,
        default: []
      },
      price: { type: Number, required: true, default: 0 },
      pdfFile: { type: String },
      noteCover: { type: String, required: true, default: Note.defaultNoteCover },
      pageCount: { type: Number, required: true, default: 0 },
      purchaseCount: { type: Number, required: true, default: 0 },
      status: { type: String, enum: Object.values(Note.NoteStatus), default: Note.NoteStatus.PROCESSING },
      samplePdfProperties: {
        type: [{ type: Number, required: true }],
        required: true,
        default: []
      },
      rating: { type: Number, required: true, default: 0 },
      ratingCount: {
        type: {
          "1": { type: Number, required: true, default: 0 },
          "2": { type: Number, required: true, default: 0 },
          "3": { type: Number, required: true, default: 0 },
          "4": { type: Number, required: true, default: 0 },
          "5": { type: Number, required: true, default: 0 },
        },
        required: true,
        default: {},
        _id: false
      },
      refundPolicy: {
        type: {
          refundPeriod: { type: Number, required: true, default: Refund.RefundPeriod.ONE_DAY }, // epoch_millis.
          acceptedReasons: {
            type: [{ type: String, enum: Object.values(Refund.RefundReason), required: true }],
            required: true,
            default: [Refund.RefundReason.CHANGE_OF_MIND, Refund.RefundReason.NOT_AS_DESCRIBED,
              Refund.RefundReason.ACCIDENTAL_PURCHASE]
          },
          isApprovalRequired: { type: Boolean, required: true, default: false }
        },
        required: true,
        default: {},
        _id: false
      },
      rejectReason: {
        type: {
          isAi: { type: Boolean },
          flaggedSections: {
            type: [{ type: String, enum: Object.values(Note.RejectReasonFlaggedSection), required: true }],
            required: true,
            default: []
          },
          feedback: { type: String, required: true }
        },
        _id: false
      },
      fileHash: { type: String, required: true },
      dateCreated: { type: Date, required: true },
      dateUpdated: { type: Date, required: true }
    });
    Note.#mongooseSchema.virtual("seller", {
      ref: User.indexName,
      localField: "sellerUid",
      foreignField: "uid",
      justOne: true
    });
    Note.#mongooseSchema.virtual("subjects", {
      ref: Subject.indexName,
      localField: "subjectIds",
      foreignField: "_id",
      justOne: false
    });
    Note.#mongooseSchema.plugin(mongooseLeanVirtuals);
    Note.mongooseModel =  mongoose.model(Note.indexName, Note.#mongooseSchema);
  }

  /**
   * Filter out attributes of a Note object that should not be visible to owner.
   * @param note The note object.
   * @return {*&{_index: string}}
   */
  static filterAttributesForOwner(note) {
    return {
      _index: note._index,
      _id: note._id,
      sellerUid: note.sellerUid,
      title: note.title,
      description: note.description,
      subjectIds: note.subjectIds,
      price: note.price,
      pageCount: note.pageCount,
      purchaseCount: note.purchaseCount,
      status: note.status,
      samplePdfProperties: note.samplePdfProperties,
      ratingCount: note.ratingCount,
      noteCover: note.noteCover,
      refundPolicy: note.refundPolicy,
      rejectReason: note.rejectReason,
      ...(note.seller != null ? {
        seller: User.filterAttributesForPublic(note.seller)
      } : {}),
      ...(note.subjects != null ? {
        subjects: note.subjects.map((subject) => Subject.filterAttributesForPublic(subject))
      } : {}),
      _score: note._score,
      sort: note.sort,
      dateCreated: new Date(note.dateCreated),
      dateUpdated: new Date(note.dateUpdated)
    }
  }

  /**
   * Filter out attributes of a Note object that should not be visible to public.
   * @param note The note object.
   * @return {*&{_index: string}}
   */
  static filterAttributesForPublic(note) {
    return {
      _index: note._index,
      _id: note._id,
      sellerUid: note.sellerUid,
      title: note.title,
      description: note.description,
      subjectIds: note.subjectIds,
      price: note.price,
      pageCount: note.pageCount,
      purchaseCount: note.purchaseCount,
      status: note.status,
      samplePdfProperties: note.samplePdfProperties,
      ratingCount: note.ratingCount,
      noteCover: note.noteCover,
      refundPolicy: note.refundPolicy,
      ...(note.seller != null ? {
        seller: User.filterAttributesForPublic(note.seller)
      } : {}),
      ...(note.subjects != null ? {
        subjects: note.subjects.map((subject) => Subject.filterAttributesForPublic(subject))
      } : {}),
      _score: note._score,
      sort: note.sort,
      dateCreated: new Date(note.dateCreated),
      dateUpdated: new Date(note.dateUpdated)
    }
  }

  /**
   * Merge ElasticSearch documents with the equivalent MongoDB ones.
   * @param response ElasticSearch response.
   * @param populate{{ all?: boolean, seller?: boolean, subjects?: boolean }}
   * True if specified foreign field should be populated, false if not. 'all' populates all foreign fields.
   * @return {Promise<>} JSON response of merged documents.
   */
  static async #mergeElasticAndMongoDocuments(response, populate = {}) {
    const elasticDocuments = elasticSearchToJson(response);
    const elasticDocumentIds = elasticDocuments.map((document) => document._id);

    // Get MongoDb documents.
    const mongoDocuments = await Note.findManyByIds(elasticDocumentIds, undefined,
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
   * @param status The note status to search.
   * @param session The MongoDB session, if applicable.
   * @param populate{{ all?: boolean, seller?: boolean, subjects?: boolean }}
   * True if specified foreign field should be populated, false if not. 'all' populates all foreign fields.
   * @return {Promise<>} An array of Notes that exist in the database.
   */
  static async findMany(status = undefined, session = undefined, populate = {}) {
    try {
      return mongooseToJson(await Note.mongooseModel.find({
          ...(status ? { status } : {})
        },
        undefined, ...(session != null ? [{ session }] : []))
        .populate([
          ...(populate.all || populate.seller ? [{ path: "seller" }] : []),
          ...(populate.all || populate.subjects ? [{ path: "subjects" }] : [])
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
   * @param populate{{ all?: boolean, seller?: boolean, subjects?: boolean }}
   * True if specified foreign field should be populated, false if not. 'all' populates all foreign fields.
   * @return {Promise<>} An array of Notes that exist in the database.
   */
  static async findManyByIds(ids, session = undefined, populate = {}) {
    try {
      return mongooseToJson(await Note.mongooseModel.find({
        _id: { $in: ids }
      }, undefined, ...(session != null ? [{ session }] : []))
        .populate([
          ...(populate.all || populate.seller ? [{ path: "seller" }] : []),
          ...(populate.all || populate.subjects ? [{ path: "subjects" }] : [])
        ])
        .lean({ virtuals: true }));
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Find documents that match the given fileHash.
   * @param fileHash fileHash to search for.
   * @param excludeNoteStatuses The statuses the note must not be.
   * @param session The MongoDB session, if applicable.
   * @param populate{{ all?: boolean, seller?: boolean, subjects?: boolean }}
   * True if specified foreign field should be populated, false if not. 'all' populates all foreign fields.
   * @return {Promise<>} An array of Notes that exist in the database.
   */
  static async findOneByFileHash(fileHash, excludeNoteStatuses = undefined, session = undefined,
                                 populate = {}) {
    try {
      return mongooseToJson(await Note.mongooseModel.find({
        fileHash: fileHash,
        ...(excludeNoteStatuses ? { status: { $nin: excludeNoteStatuses } } : {})
      }, undefined, ...(session != null ? [{ session }] : []))
        .populate([
          ...(populate.all || populate.seller ? [{ path: "seller" }] : []),
          ...(populate.all || populate.subjects ? [{ path: "subjects" }] : [])
        ])
        .limit(1)
        .lean({ virtuals: true }));
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Delete a Note document by its id.
   * @param id The id of the Purchase to delete.
   * @param session The MongoDB session, if applicable.
   * @return {Promise<void>}
   */
  static async deleteOneById(id, session = undefined) {
    try {
      // Lock requests with the same id to run synchronously.
      await new QueueLockService(QueueLockService.DatabaseQueue.notes).processJob({ id },
        async () => {
          const response = await Note.mongooseModel.deleteOne(
            { _id: id },
            ...(session != null ? [{ session }] : [])
          );

          // Remove note associations.
          await Review.mongooseModel.deleteMany({
            "item._index": Note.indexName,
            "item._id": id
          }, ...(session != null ? [{ session }] : []))

          const deleted = response.deletedCount ?? response.result?.n ?? 0;

          if (!deleted) {
            throw new Error(`Error deleting ${Note.indexName} document.`);
          }
        });
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Find documents that matches the provided query.
   * @param searchQuery Title & description to search for.
   * @param filters Filters to apply.
   * @param sortBy Sort method.
   * @param nextPage The search_after values to get next page.
   * @param pitId Id reference for the current state of the index.
   * @param inceptionDate The date in ISO of when the first request was made (i.e. when page was initialised).
   * @param userSubjectIds SubjectIds of a user.
   * @param size Number of documents returned.
   * @param populate{{ all?: boolean, seller?: boolean, subjects?: boolean }}
   * True if specified foreign field should be populated, false if not. 'all' populates all foreign fields.
   * @return {Promise<>} An array of subjects that exist in the database.
   */
  static async findManyByQuerySearch(searchQuery = undefined, filters = { }, sortBy = "relevance", nextPage = undefined,
                                     pitId = undefined, inceptionDate = new Date().toISOString(),
                                     userSubjectIds = undefined, size = 25, populate = {}) {
    try {
      const response = await client.search({
        // Specify index only if pitId is undefined.
        ...(pitId != null ? { } : { index: Note.indexName }),
        runtime_mappings: {
          ratingAverage: {
            type: "double",
            script: {
              source: `
                double oneStar = doc['ratingCount.1'].size() > 0 ? doc['ratingCount.1'].value : 0;
                double twoStar = doc['ratingCount.2'].size() > 0 ? doc['ratingCount.2'].value : 0;
                double threeStar = doc['ratingCount.3'].size() > 0 ? doc['ratingCount.3'].value : 0;
                double fourStar = doc['ratingCount.4'].size() > 0 ? doc['ratingCount.4'].value : 0;
                double fiveStar = doc['ratingCount.5'].size() > 0 ? doc['ratingCount.5'].value : 0;

                double ratingSum = 1.0 * oneStar + 2.0 * twoStar + 3.0 * threeStar + 4.0 * fourStar + 5.0 * fiveStar;
                double ratingCountTotal = oneStar + twoStar + threeStar + fourStar + fiveStar;
                double ratingAverage = ratingCountTotal > 0.0 ? (ratingSum / ratingCountTotal) : 0.0;
                
                emit(ratingAverage);
              `
            }
          },
          ratingCountTotal: {
            type: "double",
            script: {
              source: `
                double oneStar = doc['ratingCount.1'].size() > 0 ? doc['ratingCount.1'].value : 0;
                double twoStar = doc['ratingCount.2'].size() > 0 ? doc['ratingCount.2'].value : 0;
                double threeStar = doc['ratingCount.3'].size() > 0 ? doc['ratingCount.3'].value : 0;
                double fourStar = doc['ratingCount.4'].size() > 0 ? doc['ratingCount.4'].value : 0;
                double fiveStar = doc['ratingCount.5'].size() > 0 ? doc['ratingCount.5'].value : 0;

                double ratingCountTotal = oneStar + twoStar + threeStar + fourStar + fiveStar;
                emit(ratingCountTotal);
              `
            }
          }
        },
        query: {
          function_score: {
            query: {
              bool: {
                must: [
                  // Only apply the searchQuery if searchQuery is not empty, but always match documents with
                  // the status "listed".
                  { term: { "status": { value: Note.NoteStatus.LISTED } }},
                  ...(filters.subjectIds != null ? [{
                    terms: {
                      "subjectIds": filters.subjectIds
                    }
                  }] : []),
                  ...(searchQuery != null ? [{
                    multi_match : {
                      query : searchQuery,
                      fields : [ "title^3", "description^1" ], // Boost title scores by a factor of 3 as compared to description.
                      fuzziness: "AUTO"
                    }
                  }] : []),
                  ...(filters.minPrice != null || filters.maxPrice != null ? [{
                    range: {
                      "price": {
                        ...(filters.minPrice != null ? { gte: filters.minPrice } : {}), // Greater than or equal to minPrice.
                        ...(filters.maxPrice != null ? { lte: filters.maxPrice } : {}) // Less than or equal to maxPrice.
                      }
                    }
                  }] : [])
                ]
              }
            },
            functions:
              [...(sortBy === "relevance" ? [
                {
                  gauss: {
                    "dateCreated": {
                      // Setting origin to "now" will affect pagination as elapsed time changes _score. Instead, use
                      // inceptionDate.
                      origin: inceptionDate,
                      scale: "31d",
                      offset: "7d",
                      decay: 0.5
                    }
                  }
                },
                {
                  script_score: {
                    script: {
                      params: {
                        userSubjectIds: userSubjectIds ? userSubjectIds : [],

                        // Weightings.
                        subjectRelevanceWeighting: 0.3,
                        ratingRelevanceWeighting: 1,
                        purchaseRelevanceWeighting: 0.3
                      },
                      source: `
                    // Note subjectIds as an array.
                    String[] subjectIdsArray = doc['subjectIds'].size() > 0 ? doc['subjectIds'].toArray(new String[0]) : new String[] {};

                    // User subjectIds as an array.
                    String[] userSubjectIdsArray = params.userSubjectIds.toArray(new String[0]).length > 0 ? params.userSubjectIds.toArray(new String[0]) : new String[] {};

                    // Set subject relevance.
                    double subjectRelevance;
                    double subjectRelevanceWeighting = params.subjectRelevanceWeighting;
                    double subjectIdsLength = subjectIdsArray.length;

                    if (subjectIdsLength > 0 && userSubjectIdsArray.length > 0) {
                      // Convert note and user subjectIds arrays to lists for easier checking.
                      List subjectIds = Arrays.asList(subjectIdsArray);
                      List userSubjectIds = Arrays.asList(userSubjectIdsArray);

                      // Get the number of userSubjectIds present in note subjectIds.
                      int matchingSubjectsCount = 0;
                      for (String userSubjectId : userSubjectIds) {
                          if (subjectIds.contains(userSubjectId)) {
                              matchingSubjectsCount++;
                          }
                      }
                      subjectRelevance = (matchingSubjectsCount / subjectIdsLength) * subjectRelevanceWeighting;
                    } else {
                      subjectRelevance = 0.0;
                    }

                    // Fields.
                    double ratingAverage = doc['ratingAverage'].size() > 0 ? doc['ratingAverage'].value : 0;
                    double ratingCountTotal = doc['ratingCountTotal'].size() > 0 ? doc['ratingCountTotal'].value : 0;
                    double purchaseCountTotal = doc['purchaseCount'].size() > 0 ? doc['purchaseCount'].value : 0;
                    
                    // (Default to 2.5/5 if 0 reviews).
                    double normalisedAvgRating = (ratingCountTotal > 0 ? ratingAverage : 2.5) / 5; // Divide by 5 to normalise.
                    
                    // Cap maximum normalisedRatingCountTotal at 10 reviews.
                    double normalisedRatingCountTotal = (ratingCountTotal > 10 ? 10 : ratingCountTotal) / 10; // Divide by 10 to normalise.
                    
                    // Normalise ratingRelevance.
                    double ratingRelevance = (
                      normalisedAvgRating + // Contributes 66% to ratingRelevance.
                      normalisedRatingCountTotal / 2 // Contributes 33% to ratingRelevance.
                    ) / 1.5;
                    ratingRelevance = ratingRelevance * params.ratingRelevanceWeighting; // Add weighting.
                    ratingRelevance = ratingRelevance > 0 ? ratingRelevance : 0; // Make absolute minimum 0.
                    
                    // Cap maximum purchaseRelevance at 10 purchases.
                    double purchaseRelevance = (purchaseCountTotal > 10 ? 10 : purchaseCountTotal) / 10; // Divide by 10 to normalise.
                    purchaseRelevance = purchaseRelevance * params.purchaseRelevanceWeighting; // Add weighting.

                    return ratingRelevance + purchaseRelevance + subjectRelevance;
                    `,
                      lang: "painless"
                    },
                  }
                }
              ] : []),
            ],
            score_mode: "avg", // Avg the gauss and script_score functions.
            boost_mode: "avg" // The gauss and script_score functions gets averaged with the query score.
          },
        },
        ...(pitId != null ? { pit: { id: pitId, keep_alive: "15m" }} : {}),
        ...(nextPage != null ? { search_after: nextPage } : {}),
        sort: [
          // Sorting by relevance score including dateCreated tiebreaker.
          ...(sortBy === "relevance" ? ["_score", { "dateCreated": "desc" }] : []),
          // Sorting by price including dateCreated tiebreaker.
          ...(sortBy === "price-desc" ? [{ "price": "desc" }, { "dateCreated": "desc" }] : []),
          ...(sortBy === "price-asc" ? [{ "price": "asc" }, { "dateCreated": "desc" }] : []),
          // Sorting by ratingAverage including ratingCountTotal tiebreaker.
          ...(sortBy === "rating-desc" ? [{ "ratingAverage": "desc" }, { "ratingCountTotal": "desc" }] : []),
          // Sorting by purchaseCount including dateCreated tiebreaker.
          ...(sortBy === "purchase-count-desc" ? [{ "purchaseCount": "desc" }, { "dateCreated": "desc" }] : []),
        ],
        size: size,
      });

      // Merge ElasticSearch response with MongoDB documents.
      return await Note.#mergeElasticAndMongoDocuments(response, populate);
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Find documents that match the provided userUid exactly.
   * @param sellerUid Seller uid to search for.
   * @param noteStatuses The statuses the note can have.
   * @param sortBy Sort method.
   * @param nextPage The search_after values to get next page.
   * @param pitId Id reference for the current state of the index.
   * @param size Number of documents returned.
   * @param populate{{ all?: boolean, seller?: boolean, subjects?: boolean }}
   * True if specified foreign field should be populated, false if not. 'all' populates all foreign fields.
   * @return {Promise<>} An array of Orders that exist in the database.
   */
  static async findManyBySellerUidSearch(sellerUid, noteStatuses, sortBy = "date-created-desc",
                                         nextPage = undefined, pitId = undefined,
                                         size = 25, populate = {}) {
    try {
      const response = await client.search({
        // Specify index only if pitId is undefined.
        ...(pitId != null ? { } : { index: Note.indexName }),
        runtime_mappings: {
          ratingAverage: {
            type: "double",
            script: {
              source: `
                double oneStar = doc['ratingCount.1'].size() > 0 ? doc['ratingCount.1'].value : 0;
                double twoStar = doc['ratingCount.2'].size() > 0 ? doc['ratingCount.2'].value : 0;
                double threeStar = doc['ratingCount.3'].size() > 0 ? doc['ratingCount.3'].value : 0;
                double fourStar = doc['ratingCount.4'].size() > 0 ? doc['ratingCount.4'].value : 0;
                double fiveStar = doc['ratingCount.5'].size() > 0 ? doc['ratingCount.5'].value : 0;

                double ratingSum = 1.0 * oneStar + 2.0 * twoStar + 3.0 * threeStar + 4.0 * fourStar + 5.0 * fiveStar;
                double ratingCountTotal = oneStar + twoStar + threeStar + fourStar + fiveStar;
                double ratingAverage = ratingCountTotal > 0.0 ? (ratingSum / ratingCountTotal) : 0.0;
                
                emit(ratingAverage);
              `
            }
          },
          ratingCountTotal: {
            type: "double",
            script: {
              source: `
                double oneStar = doc['ratingCount.1'].size() > 0 ? doc['ratingCount.1'].value : 0;
                double twoStar = doc['ratingCount.2'].size() > 0 ? doc['ratingCount.2'].value : 0;
                double threeStar = doc['ratingCount.3'].size() > 0 ? doc['ratingCount.3'].value : 0;
                double fourStar = doc['ratingCount.4'].size() > 0 ? doc['ratingCount.4'].value : 0;
                double fiveStar = doc['ratingCount.5'].size() > 0 ? doc['ratingCount.5'].value : 0;

                double ratingCountTotal = oneStar + twoStar + threeStar + fourStar + fiveStar;
                emit(ratingCountTotal);
              `
            }
          }
        },
        query: {
          bool: {
            must: [
              { term: { "sellerUid": { value: sellerUid } }},
              ...(noteStatuses ? [{ terms: { "status": noteStatuses }}] : [])
            ]
          }
        },
        ...(pitId != null ? { pit: { id: pitId, keep_alive: "15m" }} : {}),
        ...(nextPage != null ? { search_after: nextPage } : {}),
        sort: [
          // Sorting by dateCreated.
          ...(sortBy === "date-created-desc" ? [{ "dateCreated": "desc" }] : []),
          ...(sortBy === "date-created-asc" ? [{ "dateCreated": "asc" }] : []),
          // Sorting by ratingAverage including ratingCountTotal tiebreaker.
          ...(sortBy === "rating-desc" ? [{ "ratingAverage": "desc" }, { "ratingCountTotal": "desc" }] : []),
          ...(sortBy === "rating-asc" ? [{ "ratingAverage": "asc" }, { "ratingCountTotal": "desc" }] : [])
        ],
        size: size,
      });

      // Merge ElasticSearch response with MongoDB documents.
      return await Note.#mergeElasticAndMongoDocuments(response, populate);
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Find documents that don't include the provided id, and loosely matches the searchQuery and subjectIds.
   * @param id The id to exclude.
   * @param searchQuery The title & description to loosely match.
   * @param subjectIds The subjectIds to loosely match.
   * @param nextPage The search_after values to get next page.
   * @param pitId Id reference for the current state of the index.
   * @param size Number of documents returned.
   * @param populate{{ all?: boolean, seller?: boolean, subjects?: boolean }}
   * True if specified foreign field should be populated, false if not. 'all' populates all foreign fields.
   * @return {Promise<>} An array of Notes that exist in the database.
   */
  static async findManyBySimilaritySearch(id, searchQuery = undefined, subjectIds = undefined,
                                          nextPage = undefined, pitId = undefined,
                                          size = 10, populate = {}) {
    try {
      const response = await client.search({
        // Specify index only if pitId is undefined.
        ...(pitId != null ? { } : { index: Note.indexName }),
        runtime_mappings: {
          ratingAverage: {
            type: "double",
            script: {
              source: `
                double oneStar = doc['ratingCount.1'].size() > 0 ? doc['ratingCount.1'].value : 0;
                double twoStar = doc['ratingCount.2'].size() > 0 ? doc['ratingCount.2'].value : 0;
                double threeStar = doc['ratingCount.3'].size() > 0 ? doc['ratingCount.3'].value : 0;
                double fourStar = doc['ratingCount.4'].size() > 0 ? doc['ratingCount.4'].value : 0;
                double fiveStar = doc['ratingCount.5'].size() > 0 ? doc['ratingCount.5'].value : 0;

                double ratingSum = 1.0 * oneStar + 2.0 * twoStar + 3.0 * threeStar + 4.0 * fourStar + 5.0 * fiveStar;
                double ratingCountTotal = oneStar + twoStar + threeStar + fourStar + fiveStar;
                double ratingAverage = ratingCountTotal > 0.0 ? (ratingSum / ratingCountTotal) : 0.0;
                
                emit(ratingAverage);
              `
            }
          },
          ratingCountTotal: {
            type: "double",
            script: {
              source: `
                double oneStar = doc['ratingCount.1'].size() > 0 ? doc['ratingCount.1'].value : 0;
                double twoStar = doc['ratingCount.2'].size() > 0 ? doc['ratingCount.2'].value : 0;
                double threeStar = doc['ratingCount.3'].size() > 0 ? doc['ratingCount.3'].value : 0;
                double fourStar = doc['ratingCount.4'].size() > 0 ? doc['ratingCount.4'].value : 0;
                double fiveStar = doc['ratingCount.5'].size() > 0 ? doc['ratingCount.5'].value : 0;

                double ratingCountTotal = oneStar + twoStar + threeStar + fourStar + fiveStar;
                emit(ratingCountTotal);
              `
            }
          }
        },
        query: {
          function_score: {
            query: {
              bool: {
                must_not: {
                  term: {
                    _id: id
                  }
                },
                must: [
                  { term: { "status": { value: Note.NoteStatus.LISTED } }}
                ]
              }
            },
            functions: [
              {
                filter: {
                  multi_match : {
                    query : searchQuery,
                    fields : [ "title^3", "description^1" ], // Boost title scores by a factor of 3 as compared to description.
                    fuzziness: "AUTO"
                  }
                },
                weight: 1
              },
              {
                script_score: {
                  script: {
                    params: {
                      subjectIds: subjectIds ? subjectIds : [],
                      globalAvgRating: 4,

                      // Weightings.
                      subjectRelevanceWeighting: 0.3,
                      ratingRelevanceWeighting: 1,
                      purchaseRelevanceWeighting: 0.3
                    },
                    source: `
                    // Note subjectIds as an array.
                    String[] subjectIdsArray = doc['subjectIds'].size() > 0 ? doc['subjectIds'].toArray(new String[0]) : new String[] {};

                    // Search subjectIds as an array.
                    String[] searchSubjectIdsArray = params.subjectIds.toArray(new String[0]).length > 0 ? params.subjectIds.toArray(new String[0]) : new String[] {};

                    // Set subject relevance.
                    double subjectRelevance;
                    double subjectRelevanceWeighting = params.subjectRelevanceWeighting;
                    double subjectIdsLength = subjectIdsArray.length;

                    if (subjectIdsLength > 0 && searchSubjectIdsArray.length > 0) {
                      // Convert note and search subjectIds arrays to lists for easier checking.
                      List subjectIds = Arrays.asList(subjectIdsArray);
                      List searchSubjectIds = Arrays.asList(searchSubjectIdsArray);

                      // Get the number of searchSubjectIds present in note subjectIds.
                      int matchingSubjectsCount = 0;
                      for (String searchSubjectId : searchSubjectIds) {
                          if (subjectIds.contains(searchSubjectId)) {
                              matchingSubjectsCount++;
                          }
                      }
                      subjectRelevance = (matchingSubjectsCount / subjectIdsLength) * subjectRelevanceWeighting;
                    } else {
                      subjectRelevance = 0.0;
                    }

                    // Fields.
                    double ratingAverage = doc['ratingAverage'].size() > 0 ? doc['ratingAverage'].value : 0;
                    double ratingCountTotal = doc['ratingCountTotal'].size() > 0 ? doc['ratingCountTotal'].value : 0;
                    double purchaseCountTotal = doc['purchaseCount'].size() > 0 ? doc['purchaseCount'].value : 0;
                    
                    // (Default to 2.5/5 if 0 reviews).
                    double normalisedAvgRating = (ratingCountTotal > 0 ? ratingAverage : 2.5) / 5; // Divide by 5 to normalise.
                    
                    // Cap maximum normalisedRatingCountTotal at 10 reviews.
                    double normalisedRatingCountTotal = (ratingCountTotal > 10 ? 10 : ratingCountTotal) / 10; // Divide by 10 to normalise.
                    
                    // Normalise ratingRelevance.
                    double ratingRelevance = (
                      normalisedAvgRating + // Contributes 66% to ratingRelevance.
                      normalisedRatingCountTotal / 2 // Contributes 33% to ratingRelevance.
                    ) / 1.5;
                    ratingRelevance = ratingRelevance * params.ratingRelevanceWeighting; // Add weighting.
                    ratingRelevance = ratingRelevance > 0 ? ratingRelevance : 0; // Make absolute minimum 0.
                    
                    // Cap maximum purchaseRelevance at 10 purchases.
                    double purchaseRelevance = (purchaseCountTotal > 10 ? 10 : purchaseCountTotal) / 10; // Divide by 10 to normalise.
                    purchaseRelevance = purchaseRelevance * params.purchaseRelevanceWeighting; // Add weighting.

                    return ratingRelevance + purchaseRelevance + subjectRelevance;
                    `,
                    lang: "painless"
                  },
                }
              }
            ],
            score_mode: "avg", // Average the filter & script_score functions.
            boost_mode: "replace" // The filter & script_score functions replace the query score.
          }
        },
        ...(pitId != null ? { pit: { id: pitId, keep_alive: "15m" }} : {}),
        ...(nextPage != null ? { search_after: nextPage } : {}),
        sort: ["_score"],
        size: size
      });

      // Merge ElasticSearch response with MongoDB documents.
      return await Note.#mergeElasticAndMongoDocuments(response, populate);
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Find documents that matches the provided query (Admin/Staff).
   * @param searchQuery Title & description to search for.
   * @param filters Filters to apply.
   * @param sortBy Sort method.
   * @param nextPage The search_after values to get next page.
   * @param pitId Id reference for the current state of the index.
   * @param size Number of documents returned.
   * @param populate{{ all?: boolean, seller?: boolean, subjects?: boolean }}
   * True if specified foreign field should be populated, false if not. 'all' populates all foreign fields.
   * @return {Promise<>}
   */
  static async findManyByQueryAdminSearch(searchQuery = undefined, filters = { },
                                          sortBy = "relevance", nextPage = undefined,
                                          pitId = undefined, size = 50, populate = {}) {
    try {
      const response = await client.search({
        // Specify index only if pitId is undefined.
        ...(pitId != null ? { } : { index: Note.indexName }),
        runtime_mappings: {
          ratingAverage: {
            type: "double",
            script: {
              source: `
                double oneStar = doc['ratingCount.1'].size() > 0 ? doc['ratingCount.1'].value : 0;
                double twoStar = doc['ratingCount.2'].size() > 0 ? doc['ratingCount.2'].value : 0;
                double threeStar = doc['ratingCount.3'].size() > 0 ? doc['ratingCount.3'].value : 0;
                double fourStar = doc['ratingCount.4'].size() > 0 ? doc['ratingCount.4'].value : 0;
                double fiveStar = doc['ratingCount.5'].size() > 0 ? doc['ratingCount.5'].value : 0;

                double ratingSum = 1.0 * oneStar + 2.0 * twoStar + 3.0 * threeStar + 4.0 * fourStar + 5.0 * fiveStar;
                double ratingCountTotal = oneStar + twoStar + threeStar + fourStar + fiveStar;
                double ratingAverage = ratingCountTotal > 0.0 ? (ratingSum / ratingCountTotal) : 0.0;
                
                emit(ratingAverage);
              `
            }
          },
          ratingCountTotal: {
            type: "double",
            script: {
              source: `
                double oneStar = doc['ratingCount.1'].size() > 0 ? doc['ratingCount.1'].value : 0;
                double twoStar = doc['ratingCount.2'].size() > 0 ? doc['ratingCount.2'].value : 0;
                double threeStar = doc['ratingCount.3'].size() > 0 ? doc['ratingCount.3'].value : 0;
                double fourStar = doc['ratingCount.4'].size() > 0 ? doc['ratingCount.4'].value : 0;
                double fiveStar = doc['ratingCount.5'].size() > 0 ? doc['ratingCount.5'].value : 0;

                double ratingCountTotal = oneStar + twoStar + threeStar + fourStar + fiveStar;
                emit(ratingCountTotal);
              `
            }
          }
        },
        query: {
          function_score: {
            query: {
              bool: {
                must: [
                  ...(filters._id != null ? [{ term: { "_id": { value: filters._id } }}] : []),
                  ...(filters.sellerUid != null ? [{ term: { "sellerUid": { value: filters.sellerUid } }}] : []),
                  ...(filters.status != null ? [{ term: { "status": { value: filters.status } }}] : []),
                  ...(filters.subjectIds != null ? [{
                    terms: {
                      "subjectIds": filters.subjectIds
                    }
                  }] : []),
                  ...(searchQuery != null ? [{
                    multi_match : {
                      query : searchQuery,
                      fields : [ "title^3", "description^1" ], // Boost title scores by a factor of 3 as compared to description.
                      fuzziness: "AUTO"
                    }
                  }] : []),
                  ...(filters.minPrice != null || filters.maxPrice != null ? [{
                    range: {
                      "price": {
                        ...(filters.minPrice != null ? { gte: filters.minPrice } : {}), // Greater than or equal to minPrice.
                        ...(filters.maxPrice != null ? { lte: filters.maxPrice } : {}) // Less than or equal to maxPrice.
                      }
                    }
                  }] : [])
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
          ...(sortBy === "date-updated-asc" ? [{ "dateUpdated": "asc" }] : []),
          // Sorting by price including dateCreated tiebreaker.
          ...(sortBy === "price-desc" ? [{ "price": "desc" }, { "dateCreated": "desc" }] : []),
          ...(sortBy === "price-asc" ? [{ "price": "asc" }, { "dateCreated": "desc" }] : []),
          // Sorting by purchaseCount including dateCreated tiebreaker.
          ...(sortBy === "purchase-count-desc" ? [{ "purchaseCount": "desc" }, { "dateCreated": "desc" }] : []),
          ...(sortBy === "purchase-count-asc" ? [{ "purchaseCount": "asc" }, { "dateCreated": "desc" }] : []),
          // Sorting by ratingAverage including ratingCountTotal tiebreaker.
          ...(sortBy === "rating-desc" ? [{ "ratingAverage": "desc" }, { "ratingCountTotal": "desc" }] : []),
          ...(sortBy === "rating-asc" ? [{ "ratingAverage": "asc" }, { "ratingCountTotal": "desc" }] : [])
        ],
        size: size,
      });

      // Merge ElasticSearch response with MongoDB documents.
      return await Note.#mergeElasticAndMongoDocuments(response, populate);
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
        index: Note.indexName,
        keep_alive: "45m",
      });

      return response.id;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Update a Note document by removing passed fields.
   * @param id The id of the Note to update.
   * @param fields An array of fields to remove.
   * @param session The MongoDB session, if applicable.
   * @return {Promise<void>}
   */
  static async removeFieldsById(id, fields, session = undefined) {
    try {
      // Lock requests with the same id to run synchronously.
      await new QueueLockService(QueueLockService.DatabaseQueue.notes).processJob({ id },
        async () => {
          const dateUpdated = new Date();

          const unsetObj = {};
          for (const f of fields) unsetObj[f] = "";

          const response = await Note.mongooseModel.updateOne(
            { _id: id },
            { $unset: unsetObj, $set: { dateUpdated } },
            ...(session != null ? [{ session }] : [])
          );

          const matched = response.matchedCount ?? response.n ?? 0;

          if (!matched) {
            throw new Error(`Error updating ${Note.indexName} document.`);
          }
      });
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Create a Notes document with set attributes.
   * @param session The MongoDB session, if applicable.
   * @return {Promise<Object>}
   */
  async save(session = undefined) {
    try {
      const dateCreated = new Date();

      // Save new document.
      const response = mongooseToJson(await Note.mongooseModel.create([{
        ...(this.#_index != null ? { _index: this.#_index } : {}),
        ...(this.#sellerUid != null ? { sellerUid: this.#sellerUid } : {}),
        ...(this.#title != null ? { title: this.#title } : {}),
        ...(this.#description != null ? { description: this.#description } : {}),
        ...(this.#subjectIds != null ? { subjectIds: this.#subjectIds } : {}),
        ...(this.#price != null ? { price: this.#price } : {}),
        ...(this.#pdfFile != null ? { pdfFile: this.#pdfFile } : {}),
        ...(this.#noteCover != null ? { noteCover: this.#noteCover } : {}),
        ...(this.#pageCount != null ? { pageCount: this.#pageCount } : {}),
        ...(this.#purchaseCount != null ? { purchaseCount: this.#purchaseCount } : {}),
        ...(this.#status != null ? { status: this.#status } : {}),
        ...(this.#samplePdfProperties != null ? { samplePdfProperties: this.#samplePdfProperties } : {}),
        ...(this.#ratingCount != null ? { ratingCount: this.#ratingCount } : {}),
        ...(this.#refundPolicy != null ? { refundPolicy: this.#refundPolicy } : {}),
        ...(this.#rejectReason != null ? { rejectReason: this.#rejectReason } : {}),
        ...(this.#fileHash != null ? { fileHash: this.#fileHash } : {}),
        dateCreated: dateCreated,
        dateUpdated: dateCreated
      }], ...(session != null ? [{ session }] : [])));

      if (!response?.length || !response?.[0]?._id) {
        throw new Error(`Error saving ${Note.indexName} document.`);
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
   * Update a Note document with defined attributes.
   * @param id The id of the Note to update.
   * @param fields The fields and the values to update to.
   * @param session The MongoDB session, if applicable.
   * @return {Promise<void>}
   */
  static async updateOneById(id, fields = {}, session = undefined) {
    try {
      // Lock requests with the same id to run synchronously.
      await new QueueLockService(QueueLockService.DatabaseQueue.notes).processJob({ id },
        async () => {
        const dateUpdated = new Date();

        // Update existing document.
        const response = await Note.mongooseModel.updateOne(
          { _id: id },
          {
            $set: {
              ...(fields.sellerUid != null ? { sellerUid: fields.sellerUid } : {}),
              ...(fields.title != null ? { title: fields.title } : {}),
              ...(fields.description != null ? { description: fields.description } : {}),
              ...(fields.subjectIds != null ? { subjectIds: fields.subjectIds } : {}),
              ...(fields.price != null ? { price: fields.price } : {}),
              ...(fields.pdfFile != null ? { pdfFile: fields.pdfFile } : {}),
              ...(fields.pageCount != null ? { pageCount: fields.pageCount } : {}),
              ...(fields.purchaseCount != null ? { purchaseCount: fields.purchaseCount } : {}),
              ...(fields.status != null ? { status: fields.status } : {}),
              ...(fields.noteCover != null ? { noteCover: fields.noteCover } : {}),
              ...(fields.samplePdfProperties != null ? { samplePdfProperties: fields.samplePdfProperties } : {}),
              ...(fields.rating != null ? { rating: fields.rating } : {}),
              ...(fields.ratingCount != null ? { ratingCount: fields.ratingCount } : {}),
              ...(fields.refundPolicy != null ? { refundPolicy: fields.refundPolicy } : {}),
              ...(fields.rejectReason != null ? { rejectReason: fields.rejectReason } : {}),
              ...(fields.fileHash != null ? { fileHash: fields.fileHash } : {}),
              dateUpdated: dateUpdated
            }
          },
          { runValidators: true, context: "query", ...(session != null ? { session } : {}) }
        );

        const matched = response.matchedCount ?? response.n ?? 0;

        if (!matched) {
          throw new Error(`Error updating ${Note.indexName} document.`);
        }
      });
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

}

module.exports = Note;
