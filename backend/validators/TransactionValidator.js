const Validator = require("./Validator");
const Transaction = require("../models/Transaction");

class TransactionValidator extends Validator {

  /**
   * Parse and return parameters for requests requiring only a note id.
   * @param params The parameters to parse.
   * @returns {{id}|{}} The parsed parameters.
   */
  static parseTransactionIdRequestParams(params) {
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
   * Parse and return parameters for getUserTransactions requests.
   * @param params The parameters to parse.
   * @return {Promise<{}>}
   */
  static parseGetUserTransactionsRequestParams(params) {
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
   * Parse and return parameters for updateSaleTransaction admin requests.
   * @param params The parameters to parse.
   * @return {Promise<{}>}
   */
  static parseUpdateSaleTransactionAdminRequestParams(params) {
    let parsedParams = {
      fields: {}
    };

    parsedParams.id = super._parseNonEmptyStringTrimmed(params?.id);
    parsedParams.fields.status = super._parseAllowedValues(params?.fields?.status,
      [Transaction.TransactionStatus.PENDING, Transaction.TransactionStatus.REJECTED]);

    if (parsedParams.id == null) {
      throw new Error("Provided transaction id is invalid.",
        { cause: { code: "INVALID_ID" } });
    }

    return parsedParams;
  }

  /**
   * Parse and return parameters for getTransactions admin requests.
   * @param params The parameters to parse.
   * @return {Promise<{}>}
   */
  static parseGetTransactionsAdminRequestParams(params) {
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
        transactionType: super._parseNonEmptyStringTrimmed(filters?.transactionType),
        purchaseId: super._parseNonEmptyStringTrimmed(filters?.purchaseId),
        status: super._parseNonEmptyStringTrimmed(filters?.status)
      };
    }

    return parsedParams;
  }

  /**
   * Parse and return parameters for getUserTransactions admin requests.
   * @param params The parameters to parse.
   * @return {Promise<{}>}
   */
  static parseGetUserTransactionsAdminRequestParams(params) {
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

module.exports = TransactionValidator;