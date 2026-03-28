const Subject = require("../models/Subject");
const School = require("../models/School");
const Note = require("../models/Note");
const Ajv = require("ajv");
const Purchase = require("../models/Purchase");
const {mongoDbTransactionOptions} = require("../services/QueueLockService");
const {startSession} = require("mongoose");
const User = require("../models/User");
const ajv = new Ajv();

class Validator {

  // JSON schemas.
  static #userStudentDetailsSchema = {
    type: "object",
    properties: {
      isActive: { type: "boolean" },
      school: {
        type: "object",
        properties: {
          visibility: {
            type: "string"
          },
          schoolId: {
            type: ["string", "null"]
          },
        },
        required: ["visibility", "schoolId"]
      },
      subjects: {
        type: "object",
        properties: {
          visibility: {
            type: "string"
          },
          subjectIds: {
            type: "array",
            items: { type: "string" }
          }
        },
        required: ["visibility", "subjectIds"]
      }
    },
    required: ["isActive"]
  };
  static #userCartSchema = {
    type: "array",
    items: {
      type: "object",
      properties: {
        _id: { type: "string" },
        _index: { type: "string" }
      },
      required: ["_id", "_index"]
    }
  };
  static #openAiFormatterResponseSchema = {
    type: "object",
    properties: {
      flaggedSections: {
        type: "array",
        items: {
          enum: [
            "title",
            "description",
            "subjects",
            "note_content"
          ]
        }
      },
      feedback: {
        type: "string"
      },
      rating: {
        type: "integer",
        enum: [
          1,
          2,
          3,
          4,
          5
        ]
      },
      review: {
        type: "string"
      },
      isAccepted: {
        type: "boolean"
      }
    },
    required: [
      "isAccepted"
    ],
    additionalProperties: false
  };
  static #paypalCaptureOrderResponseSchema = {
    type: "object",
    properties: {
      id: {
        type: "string",
      },
      status: {
        type: "string",
        const: "COMPLETED",
      },
      purchase_units: {
        type: "array",
        items: {
          type: "object",
          properties: {
            payments: {
              type: "object",
              properties: {
                captures: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: {
                        type: "string"
                      },
                      status: {
                        type: "string",
                        const: "COMPLETED"
                      },
                      amount: {
                        type: "object",
                        properties: {
                          currency_code: {
                            type: "string",
                            const: "AUD"
                          },
                          value: {
                            type: "string"
                          }
                        },
                        required: ["currency_code", "value"]
                      },
                      final_capture: {
                        type: "boolean",
                        const: true
                      },
                      seller_receivable_breakdown: {
                        type: "object",
                        properties: {
                          gross_amount: {
                            type: "object",
                            properties: {
                              currency_code: {
                                type: "string",
                                const: "AUD"
                              },
                              value: {
                                type: "string"
                              }
                            },
                            required: ["currency_code", "value"]
                          },
                          net_amount: {
                            type: "object",
                            properties: {
                              currency_code: {
                                type: "string",
                                const: "AUD"
                              },
                              value: {
                                type: "string"
                              }
                            },
                            required: ["currency_code", "value"]
                          },
                        }
                      },
                    },
                    required: ["id", "status", "amount", "final_capture", "seller_receivable_breakdown"]
                  },
                  minItems: 1
                }
              },
              required: ["captures"]
            }
          },
          required: ["payments"]
        }
      }
    },
    required: ["id", "status", "purchase_units"]
  };
  static #paypalCreateOrderResponseSchema = {
    type: "object",
    properties: {
      id: {
        type: "string",
      },
      status: {
        type: "string",
      }
    },
    required: ["id"]
  };
  static #paypalGetOrderResponseSchema = {
    type: "object",
    properties: {
      id: {
        type: "string",
      },
      purchase_units: {
        type: "array",
        items: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: {
                    type: "string",
                  },
                  unit_amount: {
                    type: "object",
                    properties: {
                      currency_code: {
                        type: "string",
                        const: "AUD"
                      },
                      value: {
                        type: "string",
                      }
                    },
                    required: ["currency_code", "value"]
                  },
                  tax: {
                    type: "object",
                    properties: {
                      currency_code: {
                        type: "string",
                        const: "AUD"
                      },
                      value: {
                        type: "string",
                      }
                    },
                    required: ["currency_code", "value"]
                  },
                  quantity: {
                    type: "string",
                    const: "1"
                  },
                  sku: {
                    type: "string"
                  }
                },
                required: ["name", "unit_amount", "quantity", "sku"]
              },
              minItems: 1
            }
          },
          required: ["items"]
        }
      }
    },
    required: ["purchase_units"]
  };
  static #paypalPayoutResponseSchema = {
    type: "object",
    properties: {
      batch_header: {
        type: "object",
        properties: {
          sender_batch_header: {
            type: "object",
            properties: {
              sender_batch_id: { type: "string" },
              email_subject: { type: "string" },
              email_message: { type: "string" },
            }
          },
          payout_batch_id: { type: "string" },
          batch_status: { type: "string" },
        },
        required: ["sender_batch_header", "payout_batch_id"]
      },
    },
    required: ["batch_header"]
  };

  static _validateUserStudentDetailsSchema = ajv.compile(Validator.#userStudentDetailsSchema);
  static _validateUserCartSchema = ajv.compile(Validator.#userCartSchema);
  static #validateOpenAiFormatterResponseSchema = ajv.compile(Validator.#openAiFormatterResponseSchema);
  static #validatePaypalCaptureOrderResponseSchema = ajv.compile(Validator.#paypalCaptureOrderResponseSchema);
  static #validatePaypalCreateOrderResponseSchema = ajv.compile(Validator.#paypalCreateOrderResponseSchema);
  static #validatePaypalGetOrderResponseSchema = ajv.compile(Validator.#paypalGetOrderResponseSchema);
  static #validatePaypalPayoutResponseSchema = ajv.compile(Validator.#paypalPayoutResponseSchema);

  /**
   * Return array if every element in array matches any of the values in allowedValues.
   * @param array Array of values to validate.
   * @param allowedValues An array of allowed values to match.
   * @return {undefined|Array} Value if valid, undefined if not.
   */
  static _parseArrayOfAllowedValues(array, allowedValues = []) {
    if (Array.isArray(array) && array.every(value => allowedValues.includes(value))) {
      return array;
    }
    return undefined;
  }

  /**
   * Return value as a boolean if valid.
   * @param value Boolean value to validate as a boolean.
   * @return {boolean} Boolean if valid, undefined if not.
   */
  static _parseBoolean(value) {
    if (value === true) {
      return true;
    } else if (value === false) {
      return false;
    }
    return undefined;
  }

  /**
   * Return ISO date string as a string if valid.
   * @param value Value to validate as an ISO date string.
   * @return {string|undefined} String if valid, undefined if not.
   */
  static _parseISODateString(value) {
    if (typeof value === "string") {
      try {
        Date.parse(value);
        return value;
      } catch (error) {
        return undefined;
      }
    }
    return undefined;
  }

  /**
   * Return value as JSON if it is a valid json string.
   * @param value Value to validate as a json string.
   * @return {undefined|[]} JSON if valid, undefined if not.
   */
  static _parseJsonString(value) {
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch (error) {
        return undefined;
      }
    }
    return undefined;
  }

  /**
   * Return value if it matches any of the values in allowedValues.
   * @param value Value to validate.
   * @param allowedValues An array of allowed values to match.
   * @return {undefined|any} Value if valid, undefined if not.
   */
  static _parseAllowedValues(value, allowedValues = []) {
    if (allowedValues.includes(value)) {
      return value;
    }
    return undefined;
  }

  /**
   * Return array if it is not empty.
   * @param array Array to validate as a non-empty array.
   * @param maxlength The largest length the array can be.
   * @return {undefined|Array} Array if valid, undefined if not.
   */
  static _parseNonEmptyArray(array, maxlength = undefined) {
    if (Array.isArray(array) && array.length !== 0) {
      if (maxlength) {
        return array.slice(0, maxlength);
      } else {
        return array;
      }
    }
    return undefined;
  }

  /**
   * Return value as a trimmed string if it is a non-empty string.
   * @param value Value to validate as a non-empty string.
   * @param maxlength The length the string should be truncate to.
   * @return {undefined|string} String if valid, undefined if not.
   */
  static _parseNonEmptyStringTrimmed(value, maxlength = undefined) {
    const nonEmptyRegex = /^(?!\s*$).+/;
    if (typeof value === "string" && nonEmptyRegex.test(value)) {
      return value.trim().substring(0, maxlength);
    }
    return undefined;
  }

  /**
   * Return value as a number.
   * @param value Value to validate as a number.
   * @param min The smallest value the number can be.
   * @param max The largest value the number can be.
   * @return {undefined|number} Number if valid, undefined if not.
   */
  static _parseNumber(value, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY) {
    if (typeof value === "number") {
      return Number(value) >= min && Number(value) <= max ? Number(value) : undefined;
    }
    return undefined;
  }

  /**
   * Parse OpenAI formatter response.
   * @param formatterResponse The response to parse.
   * @return {Promise<{isValid}|{review}|{rating}|{}>} The parsed response.
   */
  static parseOpenAiFormatterResponse(formatterResponse) {
    let parsedResponse = {};

    let responseObject;
    try {
      responseObject = JSON.parse(formatterResponse);
    } catch (error) {
      throw new Error("Invalid JSON response from OpenAI formatter assistant.");
    }

    if (!Validator.#validateOpenAiFormatterResponseSchema(responseObject)) {
      throw new Error("Invalid response from OpenAI formatter assistant.");
    }

    if (responseObject?.isAccepted) {
      parsedResponse.isAccepted = responseObject?.isAccepted;
      parsedResponse.rating = Validator._parseStarRating(responseObject?.rating);
      parsedResponse.review = Validator._parseNonEmptyStringTrimmed(responseObject?.review);

      if (!(parsedResponse.rating && parsedResponse.review)) {
        throw new Error("Bad response from OpenAI formatter assistant.");
      }
    } else {
      parsedResponse.isAccepted = responseObject?.isAccepted;
      parsedResponse.flaggedSections = Validator._parseNonEmptyArray(responseObject?.flaggedSections);
      parsedResponse.feedback = Validator._parseNonEmptyStringTrimmed(responseObject?.feedback);

      if (!(parsedResponse.flaggedSections && parsedResponse.feedback)) {
        throw new Error("Bad response from OpenAI formatter assistant.");
      }
    }

    return parsedResponse;
  }

  /**
   * Parse PayPal capture order API response.
   * @param response The response to parse.
   * @return {Promise<>} The parsed response.
   */
  static parsePaypalCaptureOrderResponse(response) {
    let responseObject;
    try {
      responseObject = JSON.parse(response);
    } catch (error) {
      throw new Error("Invalid JSON response from PayPal capture order API.");
    }

    if (!Validator.#validatePaypalCaptureOrderResponseSchema(responseObject)) {
      throw new Error("Invalid response from PayPal capture order API.");
    }

    return responseObject;
  }

  /**
   * Parse PayPal create order API response.
   * @param response The response to parse.
   * @return {Promise<>} The parsed response.
   */
  static parsePaypalCreateOrderResponse(response) {
    let responseObject;
    try {
      responseObject = JSON.parse(response);
    } catch (error) {
      throw new Error("Invalid JSON response from PayPal create order API.");
    }

    if (!Validator.#validatePaypalCreateOrderResponseSchema(responseObject)) {
      throw new Error("Invalid response from PayPal create order API.");
    }

    return responseObject;
  }

  /**
   * Parse PayPal get order API response.
   * @param response The response to parse.
   * @return {Promise<>} The parsed response.
   */
  static parsePaypalGetOrderResponse(response) {
    let responseObject;
    try {
      responseObject = JSON.parse(response);
    } catch (error) {
      throw new Error("Invalid JSON response from PayPal get order API.");
    }

    if (!Validator.#validatePaypalGetOrderResponseSchema(responseObject)) {
      throw new Error("Invalid response from PayPal get order API.");
    }

    return responseObject;
  }

  /**
   * Parse PayPal payout API response.
   * @param responseObject The response to parse.
   * @return {Promise<>} The parsed response.
   */
  static parsePaypalPayoutResponse(responseObject) {
    if (!Validator.#validatePaypalPayoutResponseSchema(responseObject)) {
      throw new Error("Invalid response from PayPal payout API.");
    }

    return responseObject;
  }

  /**
   * Return value if it is a number with only up to 2 decimal places.
   * @param value Value to validate as a price.
   * @return {undefined|number} Number if valid, undefined if not.
   */
  static _parsePrice(value) {
    if (typeof value === "number") {
      const price = Math.round(Number(value) * 100) / 100;

      if (value === price) {
        return price;
      }
    }
    return undefined;
  }

  /**
   * Parse schoolId by checking that the id exists in database.
   * @param schoolId  The field to parse.
   * @return {Promise<undefined>}
   */
  static async _parseSchoolId(schoolId) {
    let parsedSchoolId = undefined;

    if (schoolId != null) {
      // If schoolId doesn't exist in database, make param undefined.
      try {
        const schools = await School.findManyByIds([schoolId]);
        parsedSchoolId =
          schools.length > 0 ? schoolId : undefined;

      } catch (error) {
        parsedSchoolId = undefined;
      }
    } else if (schoolId === null) {
      parsedSchoolId = null;
    }

    return parsedSchoolId;
  }

  /**
   * Return string as a number if it is equal to 1,2,3,4 or 5.
   * @param rating Rating to validate as a rating number out of 5.
   * @return {undefined|number} Number if valid, undefined if not.
   */
  static _parseStarRating(rating) {
    if (typeof rating === "number") {
      return [1,2,3,4,5].includes(Number(rating)) ? Number(rating) : undefined;
    }
    return undefined;
  }

  /**
   * Return value as a trimmed string if it is a string.
   * @param value Value to validate as a string.
   * @param maxlength The length the string should be truncate to.
   * @return {undefined|string} String if valid, undefined if not.
   */
  static _parseStringTrimmed(value, maxlength = undefined) {
    if (typeof value === "string") {
      return value.trim().substring(0, maxlength);
    }
    return undefined;
  }

  /**
   * Parse subjectIds array by checking that id's exist in database.
   * @param subjectIds The field to parse.
   * @param maxLength The maximum length of array to return (default 20).
   * @return {Promise<string[]|undefined>}
   */
  static async _parseSubjectIds(subjectIds, maxLength = 20) {
    let parsedSubjectIds = undefined;

    if (Array.isArray(subjectIds) && subjectIds.length === 0) {
      parsedSubjectIds = [];
    } else if (Array.isArray(subjectIds) && subjectIds.length > 0) {
      // Remove subjectIds from subjectIds params that don't exist in database.
      try {
        // Remove duplicate items.
        const uniqueSubjectIds = [...new Set(subjectIds)];

        const subjects = (await Subject.findManyByIds(uniqueSubjectIds));

        // Only include subjects in the database and set a max limit.
        parsedSubjectIds =
          uniqueSubjectIds.filter(subjectId =>
            subjects.some(fetchedSubject => subjectId === fetchedSubject._id)).slice(0, maxLength);

      } catch (error) {
        parsedSubjectIds = undefined;
      }
    }

    return parsedSubjectIds;
  }

  /**
   * Parse userCart array by checking that id's exist in database.
   * @param userCart The field to parse.
   * @param uid The uid of the logged-in user.
   * @return {Promise<*[]>}
   */
  static async _parseUserCart(userCart, uid) {
    let parsedCart = undefined;

    function isDuplicateCartItem(object1, object2) {
      if (!object1 || !object2) return false; // Ensure both objects are valid.

      return (
        (object1._index?.toLowerCase() === object2._index?.toLowerCase()) &&
        (object1._id?.toLowerCase() === object2._id?.toLowerCase())
      )
    }

    if (userCart?.length === 0) {
      parsedCart = [];
    } else if (userCart?.length > 0) {
      // Remove cartItems from userCart params that don't exist in database.
      try {
        // Create a list of ids to search for in each index.
        let noteIdsToSearch = [];
        // Remove duplicate items.
        userCart = userCart.filter((cartItem, idx, array) =>
          // Return only first element of a duplicate item.
          array.findIndex(otherCartItem => isDuplicateCartItem(cartItem, otherCartItem)) === idx
        );

        for (const cartItem of userCart) {
          switch (cartItem._index) {
            case (Note.indexName):
              noteIdsToSearch.push(cartItem._id);
              break;
          }
        }

        // Start MongoDB transaction.
        const session = await startSession();
        try {
          await session.withTransaction(async () => {
            let noteItems = [];
            // Add fetched notes to matchedItems.
            if (noteIdsToSearch.length > 0) {
              noteItems = (await Note.findManyByIds(noteIdsToSearch, session))
                // Status must be listed and user must not be seller.
                .filter((note) => note.status === Note.NoteStatus.LISTED && note.sellerUid !== uid)
                .map((note) => ({ _index: note._index, _id: note._id  })); // Convert to item format.

              // Get already purchased notes by this user.
              const notePurchases = (await Purchase.findManyByItems(noteItems, uid, undefined,
                session, { refund: true }));

              // Build array of purchase refunds.
              const purchaseRefunds = notePurchases.map((purchase) => purchase.refund)
                .filter((refund) => refund != null); // Filter out undefined/null values.

              // Filter out already purchased notes with at least one unrefunded purchase.
              const noteIdsToRemove = [];
              for (const noteItem of noteItems) {
                const itemPurchaseIds = notePurchases.filter((notePurchase) =>
                  notePurchase.item._id === noteItem._id).map((itemPurchase) => itemPurchase._id);
                // Get all refunds for this item.
                const itemRefunds = purchaseRefunds.filter((refund) => itemPurchaseIds.includes(refund.purchaseId));

                // Add noteIds that have at least one unrefunded purchase to noteIdsToRemove.
                if (itemPurchaseIds.length > itemRefunds.length) {
                  noteIdsToRemove.push(noteItem._id);
                }
              }
              noteItems = noteItems.filter((noteItem) => !noteIdsToRemove.includes(noteItem._id)); // Remove note.
            }

            // A list of matched items from all indexes in a cartItem format.
            const matchedItems = [...noteItems];

            // Set a max limit of 50 cartItems.
            parsedCart = matchedItems.slice(0, 50);
          }, mongoDbTransactionOptions);
        } finally {
          session.endSession();
        }
      } catch (error) {
        parsedCart = undefined;
      }
    }

    return parsedCart;
  }

  /**
   * Return username as a string if it includes only letters, numbers, underscores, dashes, or full stops.
   * @param string String to validate as containing username.
   * @return {undefined|string} String if valid, undefined if not.
   */
  static _parseUsername(string) {
    const usernameRegex = /^[a-z0-9._-]{3,36}$/;
    if (typeof string === "string" && usernameRegex.test(string)) {
      return string;
    }
    return undefined;
  }

  /**
   * Parse User field studentDetails by checking that id's exist in database.
   * @param studentDetails The field to pass.
   * @return {Promise<*>}
   */
  static async _parseUserStudentDetails(studentDetails) {
    let parsedStudentDetails = {};

    parsedStudentDetails.isActive = studentDetails.isActive !== false;

    parsedStudentDetails.school = [User.Visibility.PUBLIC, User.Visibility.PRIVATE].includes(studentDetails?.school?.visibility) &&
      await Validator._parseSchoolId(studentDetails?.school?.schoolId) !== undefined ? studentDetails.school : undefined;

    parsedStudentDetails.subjects = [User.Visibility.PUBLIC, User.Visibility.PRIVATE].includes(studentDetails?.subjects?.visibility) &&
    await Validator._parseSubjectIds(studentDetails?.subjects?.subjectIds, 6) ?
      studentDetails.subjects : undefined;

    return parsedStudentDetails;
  }
}

module.exports = Validator;
