const Validator = require("./Validator");

class ReviewValidator extends Validator {

  /**
   * Parse and return parameters for requests requiring only a review id.
   * @param params The parameters to parse.
   * @return {{id}|{}} The parsed parameters.
   */
  static parseReviewIdRequestParams(params) {
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
   * Parse and return parameters for addReview requests.
   * @param params The parameters to parse.
   * @return {{id}|{}} The parsed parameters.
   */
  static parseAddReviewRequestParams(params) {
    let parsedParams = {};
    parsedParams.rating = super._parseStarRating(params?.rating);
    parsedParams.review = super._parseNonEmptyStringTrimmed(params?.review);
    parsedParams.item = {
      _index: super._parseNonEmptyStringTrimmed(params?.item?._index),
      _id: super._parseNonEmptyStringTrimmed(params?.item?._id)
    };

    if (parsedParams.rating == null || parsedParams.review == null || parsedParams.item._index == null ||
      parsedParams.item._id == null) {
      throw new Error("Invalid parameters for addReview.", { cause: { code: "INVALID_PARAMETERS" } });
    }

    return parsedParams;
  }

  /**
   * Parse and return parameters for getItemReviews requests.
   * @param params The parameters to parse.
   * @return {{id}|{}} The parsed parameters.
   */
  static parseGetItemReviewsRequestParams(params) {
    let parsedParams = {};
    parsedParams.item = super._parseJsonString(params?.item);

    parsedParams.sortBy = super._parseNonEmptyStringTrimmed(params?.sortBy);
    parsedParams.nextPage = super._parseJsonString(params?.nextPage);
    parsedParams.pitId = super._parseNonEmptyStringTrimmed(params?.pitId);

    // If item is undefined or invalid format, raise error.
    if (!parsedParams.item) {
      throw new Error("Invalid item provided.", { cause: { code: "INVALID_PARAMETERS" } });
    }

    return parsedParams;
  }

  /**
   * Parse and return parameters for getUserItemReview requests.
   * @param params The parameters to parse.
   * @return {{id}|{}} The parsed parameters.
   */
  static parseGetItemUserReviewRequestParams(params) {
    let parsedParams = {};
    parsedParams.item = super._parseJsonString(params?.item);

    // If item is undefined or invalid format, raise error.
    if (!parsedParams.item) {
      throw new Error("Invalid item provided.", { cause: { code: "INVALID_PARAMETERS" } });
    }

    return parsedParams;
  }

  /**
   * Parse and return parameters for updateReview requests.
   * @param params The parameters to parse.
   * @return {{id}|{}} The parsed parameters.
   */
  static parseUpdateReviewRequestParams(params) {
    let parsedParams = {
      fields: {}
    };

    parsedParams.id = super._parseNonEmptyStringTrimmed(params?.id);

    parsedParams.fields.rating = super._parseStarRating(params?.fields?.rating);
    parsedParams.fields.review = super._parseNonEmptyStringTrimmed(params?.fields?.review);

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
   * Parse and return parameters for getItemReviews admin requests.
   * @param params The parameters to parse.
   * @return {{id}|{}} The parsed parameters.
   */
  static parseGetItemReviewsAdminRequestParams(params) {
    let parsedParams = {};
    parsedParams.item = super._parseJsonString(params?.item);

    parsedParams.sortBy = super._parseNonEmptyStringTrimmed(params?.sortBy);
    parsedParams.nextPage = super._parseJsonString(params?.nextPage);
    parsedParams.pitId = super._parseNonEmptyStringTrimmed(params?.pitId);

    // If item is undefined or invalid format, raise error.
    if (!parsedParams.item) {
      throw new Error("Invalid item provided.", { cause: { code: "INVALID_PARAMETERS" } });
    }

    return parsedParams;
  }

  /**
   * Parse and return parameters for getReviews admin requests.
   * @param params The parameters to parse.
   * @return {Promise<{}>}
   */
  static parseGetReviewsAdminRequestParams(params) {
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
        rating: super._parseStarRating(filters?.rating),
        isAi: super._parseBoolean(filters?.isAi),
      };
    }

    return parsedParams;
  }
}

module.exports = ReviewValidator;