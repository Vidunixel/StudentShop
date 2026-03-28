const {mongooseToJson} = require("./common");
const QueueLockService = require("../services/QueueLockService");
const mongoose = require("mongoose");
const mongooseLeanVirtuals = require("mongoose-lean-virtuals");
let Note;

class Cart {
  static indexName = "carts";

  static #mongooseSchema;
  static mongooseModel;

  #_index;
  #_id;
  #userUid;
  #cartItems;
  #dateCreated;
  #dateUpdated;

  constructor({ userUid, cartItems }) {
    this.#_index = Cart.indexName;
    this.#userUid = userUid;
    this.#cartItems = cartItems;
  }

  static setModelReferences(modelReferences) {
    Note = modelReferences.Note;
  }

  static initialiseMongooseSchema() {
    Cart.#mongooseSchema = new mongoose.Schema({
      _index: { type: String, enum: [Cart.indexName], required: true },
      userUid: { type: String, required: true, unique: true },
      cartItems: {
        type: [{ _index: { type: String, enum: [Note.indexName], required: true },
          _id: { type: mongoose.Schema.Types.ObjectId, refPath: "cartItems._index", required: true } }],
        required: true,
        default: []
      },
      dateCreated: { type: Date, required: true },
      dateUpdated: { type: Date, required: true }
    });
    Cart.#mongooseSchema.virtual("detailedCartItems", {
      refPath: "cartItems._index",
      localField: "cartItems._id",
      foreignField: "_id",
      justOne: false
    });
    Cart.#mongooseSchema.plugin(mongooseLeanVirtuals);
    Cart.mongooseModel =  mongoose.model(Cart.indexName, Cart.#mongooseSchema);
  }

  /**
   * Filter out attributes of a Cart object that should not be visible to owner.
   * @param cart The cart object.
   * @return {*&{_index: string}}
   */
  static filterAttributesForOwner(cart) {
    return {
      _index: cart._index,
      _id: cart._id,
      userUid: cart.userUid,
      cartItems: cart.cartItems,
      ...(cart.detailedCartItems != null ? [[
        ...(cart.detailedCartItems.map((detailedCartItem) => {
          if (detailedCartItem.detailedItem._index === Note.indexName) {
            return Note.filterAttributesForPublic(detailedCartItem)
          }
        }))
      ]] : []),
      dateCreated: new Date(cart.dateCreated),
      dateUpdated: new Date(cart.dateUpdated)
    }
  }

  /**
   * Find documents that match the given ids.
   * @param ids An array of ids to search.
   * @param session The MongoDB session, if applicable.
   * @param populate{{ all?: boolean, detailedCartItems?: boolean }}
   * @return {Promise<>} An array of carts that exist in the database.
   */
  static async findManyByIds(ids, session = undefined, populate = {}) {
    try {
      return mongooseToJson(await Cart.mongooseModel.find({
        _id: { $in: ids }
      })
        .populate([
          ...(populate.all || populate.detailedCartItems ? [{ path: "detailedCartItems" }] : [])
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
   * @param populate{{ all?: boolean, detailedCartItems?: boolean }}
   * @return {Promise<>} An array of users that exist in the database.
   */
  static async findManyByUids(uids, session = undefined, populate = {}) {
    try {
      return mongooseToJson(await Cart.mongooseModel.find({
        userUid: { $in: uids }
      }, undefined, ...(session != null ? [{ session }] : []))
        .populate([
          ...(populate.all || populate.detailedCartItems ? [{ path: "detailedCartItems" }] : [])
        ])
        .lean({ virtuals: true }));
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /**
   * Create a carts document with set attributes.
   * @param session The MongoDB session, if applicable.
   * @return {Promise<Object>}
   */
  async save(session = undefined) {
    try {
      const dateCreated = new Date();

      // Save new document.
      const response = mongooseToJson(await Cart.mongooseModel.create([{
        ...(this.#_index != null ? { _index: this.#_index } : {}),
        ...(this.#userUid != null ? { userUid: this.#userUid } : {}),
        ...(this.#cartItems != null ? { cartItems: this.#cartItems } : {}),
        dateCreated: dateCreated,
        dateUpdated: dateCreated
      }], ...(session != null ? [{ session }] : [])));

      if (!response?.length || !response?.[0]?._id) {
        throw new Error(`Error saving ${Cart.indexName} document.`);
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
   * Update a Cart document with defined attributes.
   * @param id The id of the Cart to update.
   * @param fields The fields and the values to update to.
   * @param session The MongoDB session, if applicable.
   * @return {Promise<void>}
   */
  static async updateOneById(id, fields = {}, session = undefined) {
    try {
      // Lock requests with the same id to run synchronously.
      await new QueueLockService(QueueLockService.DatabaseQueue.carts).processJob({ id },
        async () => {
        const dateUpdated = new Date();

        // Update existing document.
        const response = await Cart.mongooseModel.updateOne(
          { _id: id },
          {
            $set: {
              ...(fields.userUid != null ? { userUid: fields.userUid } : {}),
              ...(fields.cartItems != null ? { cartItems: fields.cartItems } : {}),
              dateUpdated: dateUpdated
            }
          },
          { runValidators: true, context: "query", ...(session != null ? { session } : {}) }
        );

        const matched = response.matchedCount ?? response.n ?? 0;

        if (!matched) {
          throw new Error(`Error updating ${Cart.indexName} document.`);
        }
      });
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

}

module.exports = Cart;
