const Validator = require("./Validator");
const User = require("../models/User");

class UserValidator extends Validator {

  /**
   * Parse and return parameters for requests requiring only a user uid.
   * @param params The parameters to parse.
   * @return {{id}|{}} The parsed parameters.
   */
  static parseUserUidRequestParams(params) {
    let parsedParams = {};
    parsedParams.uid = super._parseNonEmptyStringTrimmed(params?.uid);

    // If uid is undefined or invalid format, raise error.
    if (parsedParams.uid == null) {
      throw new Error("Invalid uid provided.", { cause: { code: "INVALID_UID" } });
    }

    return parsedParams;
  }

  /************************************************************************************************
   * Standard Requests
   * **********************************************************************************************/

  /**
   * Parse and return parameters for addUser requests.
   * @param params The parameters to parse.
   * @return {Promise<{username}|{name}|{}>} The parsed parameters.
   */
  static async parseAddUserRequestParams(params) {
    let parsedParams = {};
    parsedParams.name = super._parseNonEmptyStringTrimmed(params?.name, 100);
    parsedParams.username = super._parseUsername(params?.username);
    parsedParams.studentDetails = super._validateUserStudentDetailsSchema(params?.studentDetails) ?
      await super._parseUserStudentDetails(params?.studentDetails) : undefined;

    if (parsedParams.name == null || parsedParams.username == null) {
      throw new Error("Invalid parameters for addUser.",
        {cause: {code: "INVALID_PARAMETERS"}});
    }

    return parsedParams;
  }

  /**
   * Parse and return parameters for getUsernameStatus requests.
   * @param params The parameters to parse.
   * @return {{username}} The parsed parameters.
   */
  static parseGetUsernameStatusRequestParams(params) {
    let parsedParams = {};
    parsedParams.username = super._parseUsername(params?.username);

    if (parsedParams.username == null) {
      throw new Error("Invalid parameters for getUsernameStatus.",
        {cause: {code: "INVALID_PARAMETERS"}});
    }

    return parsedParams;
  }

  /**
   * Parse and return parameters for getProfile requests.
   * @param params The parameters to parse.
   * @return {{username}} The parsed parameters.
   */
  static parseGetProfileRequestParams(params) {
    let parsedParams = {};
    parsedParams.username = super._parseUsername(params?.username);

    if (parsedParams.username == null) {
      throw new Error("Invalid parameters for getProfile.",
        {cause: {code: "INVALID_USERNAME"}});
    }

    return parsedParams;
  }

  /**
   * Parse and return parameters for updateUser requests.
   * @param params The parameters to parse.
   * @return {Promise<{}>}
   */
  static async parseUpdateUserRequestParams(params) {
    let parsedParams = {
      fields: {}
    };
    parsedParams.fields.name = super._parseNonEmptyStringTrimmed(params?.fields?.name, 100);
    parsedParams.fields.username = super._parseUsername(params?.fields?.username);
    parsedParams.fields.bio = super._parseStringTrimmed(params?.fields?.bio, 150);
    parsedParams.fields.studentDetails =
      super._validateUserStudentDetailsSchema(params?.fields?.studentDetails) ?
        await super._parseUserStudentDetails(params?.fields?.studentDetails) : undefined;

    return parsedParams;
  }

  /************************************************************************************************
   * Admin Requests
   * **********************************************************************************************/

  /**
   * Parse and return parameters for getUsers admin requests.
   * @param params The parameters to parse.
   * @return {Promise<{}>}
   */
  static parseGetUsersAdminRequestParams(params) {
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
        uid: super._parseNonEmptyStringTrimmed(filters?.uid),
        accountType: super._parseNonEmptyStringTrimmed(filters?.accountType),
        schoolId: super._parseNonEmptyStringTrimmed(filters?.schoolId),
        subjectIds: super._parseNonEmptyArray(filters?.subjectIds)
      };
    }

    return parsedParams;
  }

  /**
   * Parse and return parameters for updateUser admin requests.
   * @param params The parameters to parse.
   * @return {Promise<{}>}
   */
  static parseUpdateUserAdminRequestParams(params) {
    let parsedParams = {
      fields: {}
    };

    parsedParams.uid = super._parseNonEmptyStringTrimmed(params?.uid);
    parsedParams.fields.accountType = super._parseAllowedValues(params?.fields?.accountType,
      Object.values(User.AccountType));

    // If uid is undefined or invalid format, raise error.
    if (parsedParams.uid == null) {
      throw new Error("Invalid uid provided.", { cause: { code: "INVALID_UID" } });
    }

    return parsedParams;
  }
}

module.exports = UserValidator;