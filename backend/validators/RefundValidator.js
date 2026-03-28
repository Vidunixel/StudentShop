const Validator = require("./Validator");
const Refund = require("../models/Refund");

class RefundValidator extends Validator {

  /**
   * Parse and return parameters for requests requiring only a refund id.
   * @param params The parameters to parse.
   * @returns {{id}|{}} The parsed parameters.
   */
  static parseRefundIdRequestParams(params) {
    let parsedParams = {};
    parsedParams.id = super._parseNonEmptyStringTrimmed(params?.id);

    // If id is undefined or invalid format, raise error.
    if (parsedParams.id == null) {
      throw new Error("Invalid id provided.", { cause: { code: "INVALID_ID" } });
    }

    return parsedParams;
  }

  /************************************************************************************************
   * Admin Requests
   * **********************************************************************************************/

  /**
   * Parse and return parameters for getRefunds admin requests.
   * @param params The parameters to parse.
   * @return {Promise<{}>}
   */
  static parseGetRefundsAdminRequestParams(params) {
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
        purchaseId: super._parseNonEmptyStringTrimmed(filters?.purchaseId),
        reasonType: super._parseNonEmptyStringTrimmed(filters?.reasonType),
        status: super._parseNonEmptyStringTrimmed(filters?.status)
      };
    }

    return parsedParams;
  }

  /**
   * Parse and return parameters for updateRefund admin requests.
   * @param params The parameters to parse.
   * @return {Promise<{}>}
   */
  static parseUpdateRefundAdminRequestParams(params) {
    let parsedParams = {
      fields: {}
    };

    parsedParams.id = super._parseNonEmptyStringTrimmed(params?.id);
    parsedParams.fields.status = super._parseAllowedValues(params?.fields?.status,
      [Refund.RefundStatus.REJECTED, Refund.RefundStatus.COMPLETED]);

    if (parsedParams.id == null) {
      throw new Error("Provided refund id is invalid.",
        { cause: { code: "INVALID_ID" } });
    }

    return parsedParams;
  }
}

module.exports = RefundValidator;