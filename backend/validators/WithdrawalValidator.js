const Validator = require("./Validator");
const Withdrawal = require("../models/Withdrawal");

class WithdrawalValidator extends Validator {

  /**
   * Parse and return parameters for requests requiring only a note id.
   * @param params The parameters to parse.
   * @returns {{id}|{}} The parsed parameters.
   */
  static parseWithdrawalIdRequestParams(params) {
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
   * Parse and return parameters for withdrawBalance requests.
   * @param params The parameters to parse.
   * @return {Promise<{}>}
   */
  static parseWithdrawBalanceRequestParams(params) {
    let parsedParams = {};

    // Main params.
    parsedParams.amount = super._parsePrice(super._parseNumber(params?.amount, 0.01));
    parsedParams.recipientType = super._parseAllowedValues(params?.recipientType, Object.values(Withdrawal.PaypalRecipientType));
    parsedParams.identifier = super._parseNonEmptyStringTrimmed(params?.identifier);

    if (parsedParams.amount == null || parsedParams.recipientType == null || parsedParams.identifier == null) {
      throw new Error("Invalid parameters for withdrawBalance.", { cause: { code: "INVALID_PARAMETERS" } });
    }

    return parsedParams;
  }

  /************************************************************************************************
   * Admin Requests
   * **********************************************************************************************/

  /**
   * Parse and return parameters for updateWithdrawal admin requests.
   * @param params The parameters to parse.
   * @return {Promise<{}>}
   */
  static parseUpdateWithdrawalAdminRequestParams(params) {
    let parsedParams = {
      fields: {}
    };

    parsedParams.id = super._parseNonEmptyStringTrimmed(params?.id);
    parsedParams.fields.status = super._parseAllowedValues(params?.fields?.status,
      [Withdrawal.WithdrawalStatus.REJECTED, Withdrawal.WithdrawalStatus.COMPLETED]);

    if (parsedParams.id == null) {
      throw new Error("Provided withdrawal id is invalid.",
        { cause: { code: "INVALID_ID" } });
    }

    return parsedParams;
  }

  /**
   * Parse and return parameters for getWithdrawals admin requests.
   * @param params The parameters to parse.
   * @return {Promise<{}>}
   */
  static parseGetWithdrawalsAdminRequestParams(params) {
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
        transactionId: super._parseNonEmptyStringTrimmed(filters?.transactionId),
        recipientType: super._parseNonEmptyStringTrimmed(filters?.recipientType),
        identifier: super._parseNonEmptyStringTrimmed(filters?.identifier),
        status: super._parseNonEmptyStringTrimmed(filters?.status)
      };
    }

    return parsedParams;
  }
}

module.exports = WithdrawalValidator;