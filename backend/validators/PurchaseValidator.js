const Validator = require("./Validator");
const Purchase = require("../models/Purchase");
const Refund = require("../models/Refund");

class PurchaseValidator extends Validator {

  /**
   * Parse and return parameters for requests requiring only a purchase id.
   * @param params The parameters to parse.
   * @returns {{id}|{}} The parsed parameters.
   */
  static parsePurchaseIdRequestParams(params) {
    let parsedParams = {};
    parsedParams.id = super._parseNonEmptyStringTrimmed(params?.id);

    // If id is undefined or invalid format, raise error.
    if (parsedParams.id == null) {
      throw new Error("Invalid id provided.", { cause: { code: "INVALID_ID" } });
    }

    return parsedParams;
  }

  /************************************************************************************************
   * Standard Requests
   * **********************************************************************************************/

  /**
   * Parse and return parameters for capturePurchase requests.
   * @param params The parameters to parse.
   * @return {Promise<{}>}
   */
  static parseCapturePurchaseParams(params) {
    let parsedParams = {};

    parsedParams.orderId = super._parseNonEmptyStringTrimmed(params?.orderId);

    if (parsedParams.orderId == null) {
      throw new Error("Invalid parameters for capturePurchase.", { cause: { code: "INVALID_PARAMETERS" } });
    }
    return parsedParams;
  }

  /**
   * Parse and return parameters for createPurchase requests.
   * @param params The parameters to parse.
   * @param uid The uid of the logged-in user.
   * @return {Promise<{}>}
   */
  static async parseCreatePurchaseRequestParams(params, uid) {
    let parsedParams = {};

    parsedParams.cart = super._validateUserCartSchema(params?.cart) ?
      await super._parseUserCart(params?.cart, uid) : undefined;
    parsedParams.paymentMethod = super._parseAllowedValues(params?.paymentMethod, Object.values(Purchase.PaymentMethod));

    if (parsedParams.cart == null || parsedParams.cart.length === 0 || parsedParams.paymentMethod == null) {
      throw new Error("Invalid parameters for createPurchase.", { cause: { code: "INVALID_PARAMETERS" } });
    }

    return parsedParams;
  }

  /**
   * Parse and return parameters for refundPurchase requests.
   * @param params The parameters to parse.
   * @returns {{id,sample}|{}} The parsed parameters.
   */
  static parseRefundPurchaseRequestParams(params) {
    let parsedParams = {};
    parsedParams.reasonType = super._parseAllowedValues(params?.reasonType, Object.values(Refund.RefundReason));
    parsedParams.reasonDescription = super._parseNonEmptyStringTrimmed(params?.reasonDescription);
    parsedParams.id = super._parseNonEmptyStringTrimmed(params?.id);

    if (parsedParams.id == null || parsedParams.reasonType == null || parsedParams.reasonDescription == null) {
      throw new Error("Invalid parameters for refundPurchase.", { cause: { code: "INVALID_PARAMETERS" } });
    }

    return parsedParams;
  }

  /**
   * Parse and return parameters for getUserPurchases requests.
   * @param params The parameters to parse.
   * @returns {{}}
   */
  static parseGetUserPurchasesRequestParams(params) {
    let parsedParams = {};

    // Main params.
    parsedParams.searchQuery = super._parseNonEmptyStringTrimmed(params?.searchQuery);
    parsedParams.sortBy = super._parseNonEmptyStringTrimmed(params?.sortBy);
    parsedParams.nextPage = super._parseJsonString(params?.nextPage);
    parsedParams.pitId = super._parseNonEmptyStringTrimmed(params?.pitId);

    return parsedParams;
  }

  /************************************************************************************************
   * Admin Requests
   * **********************************************************************************************/

  /**
   * Parse and return parameters for getPurchases admin requests.
   * @param params The parameters to parse.
   * @return {Promise<{}>}
   */
  static parseGetPurchasesAdminRequestParams(params) {
    let parsedParams = {};

    // Main params.
    parsedParams.searchQuery = super._parseNonEmptyStringTrimmed(params?.searchQuery);
    parsedParams.sortBy = super._parseNonEmptyStringTrimmed(params?.sortBy);
    parsedParams.nextPage = super._parseJsonString(params?.nextPage);
    parsedParams.pitId = super._parseNonEmptyStringTrimmed(params?.pitId);

    // Filter params.
    const filters = super._parseJsonString(params?.filters);
    if (filters) {
      parsedParams.filters = {
        _id: super._parseNonEmptyStringTrimmed(filters?._id),
        userUid: super._parseNonEmptyStringTrimmed(filters?.userUid),
        sellerUid: super._parseNonEmptyStringTrimmed(filters?.sellerUid),
        orderId: super._parseNonEmptyStringTrimmed(filters?.orderId),
        status: super._parseNonEmptyStringTrimmed(filters?.status),
        paymentMethod: super._parseNonEmptyStringTrimmed(filters?.paymentMethod)
      };
    }

    return parsedParams;
  }

  /**
   * Parse and return parameters for getUserPurchases admin requests.
   * @param params The parameters to parse.
   * @returns {{uid}|{}}
   */
  static parseGetUserPurchasesAdminRequestParams(params) {
    let parsedParams = {};

    parsedParams.uid = super._parseNonEmptyStringTrimmed(params?.uid);

    // Main params.
    parsedParams.searchQuery = super._parseNonEmptyStringTrimmed(params?.searchQuery);
    parsedParams.sortBy = super._parseNonEmptyStringTrimmed(params?.sortBy);
    parsedParams.nextPage = super._parseJsonString(params?.nextPage);
    parsedParams.pitId = super._parseNonEmptyStringTrimmed(params?.pitId);

    // If uid is undefined or invalid format, raise error.
    if (parsedParams.uid == null) {
      throw new Error("Invalid uid provided.", { cause: { code: "INVALID_UID" } });
    }

    return parsedParams;
  }
}

module.exports = PurchaseValidator;