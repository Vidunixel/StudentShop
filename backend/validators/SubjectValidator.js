const Validator = require("./Validator");
const Subject = require("../models/Subject");

class SubjectValidator extends Validator {

  /**
   * Parse and return parameters for requests requiring only a subject id.
   * @param params The parameters to parse.
   * @return {{id}|{}} The parsed parameters.
   */
  static parseSubjectIdRequestParams(params) {
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
   * Parse and return parameters for getSubjects requests.
   * @param params The parameters to parse.
   * @return {{}} The parsed parameters.
   */
  static parseGetSubjectsRequestParams(params) {
    let parsedParams = {};
    parsedParams.searchQuery = super._parseNonEmptyStringTrimmed(params?.searchQuery);
    parsedParams.ids = super._parseNonEmptyArray(super._parseJsonString(params?.ids));

    return parsedParams;
  }

  /************************************************************************************************
   * Admin Requests
   * **********************************************************************************************/

  /**
   * Parse and return parameters for addSubject admin requests.
   * @param params The parameters to parse.
   * @return {{}} The parsed parameters.
   */
  static parseAddSubjectAdminRequestParams(params) {
    let parsedParams = {};
    parsedParams.name = super._parseNonEmptyStringTrimmed(params?.name);
    parsedParams.certificate = super._parseAllowedValues(params?.certificate,
      Object.values(Subject.Certificate));

    if (parsedParams.certificate == null || parsedParams.name == null) {
      throw new Error("Invalid parameters for addSubject.",
        {cause: {code: "INVALID_PARAMETERS"}});
    }

    return parsedParams;
  }

  /**
   * Parse and return parameters for getSubjects admin requests.
   * @param params The parameters to parse.
   * @return {{}} The parsed parameters.
   */
  static parseGetSubjectsAdminRequestParams(params) {
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
        _id: super._parseNonEmptyStringTrimmed(filters?._id)
      };
    }

    return parsedParams;
  }

  /**
   * Parse and return parameters for updateSubject admin requests.
   * @param params The parameters to parse.
   * @return {Promise<{}>}
   */
  static parseUpdateSubjectAdminRequestParams(params) {
    let parsedParams = {
      fields: {}
    };

    parsedParams.id = super._parseNonEmptyStringTrimmed(params?.id);
    parsedParams.fields.name = super._parseNonEmptyStringTrimmed(params?.fields?.name);
    parsedParams.fields.certificate = super._parseAllowedValues(params?.fields?.certificate,
      Object.values(Subject.Certificate));

    // If id is undefined or invalid format, raise error.
    if (parsedParams.id == null) {
      throw new Error("Invalid id provided.", { cause: { code: "INVALID_ID" } });
    }

    return parsedParams;
  }
}

module.exports = SubjectValidator;