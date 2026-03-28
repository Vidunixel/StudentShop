const Validator = require("./Validator");

class SchoolValidator extends Validator {

  /**
   * Parse and return parameters for requests requiring only a school id.
   * @param params The parameters to parse.
   * @return {{id}|{}} The parsed parameters.
   */
  static parseSchoolIdRequestParams(params) {
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
   * Parse and return parameters for getSchools requests.
   * @param params The parameters to parse.
   * @return {{}} The parsed parameters.
   */
  static parseGetSchoolsRequestParams(params) {
    let parsedParams = {};
    parsedParams.searchQuery = super._parseNonEmptyStringTrimmed(params?.searchQuery);

    return parsedParams;
  }

  /************************************************************************************************
   * Admin Requests
   * **********************************************************************************************/

  /**
   * Parse and return parameters for getSchools admin requests.
   * @param params The parameters to parse.
   * @return {{}} The parsed parameters.
   */
  static parseGetSchoolsAdminRequestParams(params) {
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
        acaraId: super._parseNonEmptyStringTrimmed(filters?.acaraId),
        schoolType: super._parseNonEmptyStringTrimmed(filters?.schoolType),
        sector: super._parseNonEmptyStringTrimmed(filters?.sector),
        status: super._parseNonEmptyStringTrimmed(filters?.status),
        campusParentAcaraId: super._parseNonEmptyStringTrimmed(filters?.campusParentAcaraId),
        parentCampusOnly: super._parseBoolean(filters?.parentCampusOnly)
      };
    }

    return parsedParams;
  }
}

module.exports = SchoolValidator;