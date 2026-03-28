const Validator = require("./Validator");
const Note = require("../models/Note");

class NoteValidator extends Validator {

  /**
   * Parse and return parameters for requests requiring only a note id.
   * @param params The parameters to parse.
   * @returns {{id}|{}} The parsed parameters.
   */
  static parseNoteIdRequestParams(params) {
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
   * Parse and return parameters for addNote requests.
   * @param params The parameters to parse.
   * @returns {Promise<{price}|{description}|{title}|{}>} The parsed parameters.
   */
  static async parseAddNoteRequestParams(params) {
    let parsedParams = {};
    parsedParams.title = super._parseNonEmptyStringTrimmed(params?.title, 100);
    parsedParams.description = super._parseNonEmptyStringTrimmed(params?.description, 2000);
    parsedParams.subjectIds = await super._parseSubjectIds(params?.subjectIds, 1);
    parsedParams.price = super._parsePrice(super._parseNumber(params?.price, 0, 200));

    if (parsedParams.title == null || parsedParams.description == null || parsedParams.price == null) {
      throw new Error("Invalid parameters for addNote.",
        {cause: {code: "INVALID_PARAMETERS"}});
    }

    return parsedParams;
  }

  /**
   * Parse and return parameters for getNotes requests.
   * @param params The parameters to parse.
   * @returns {Promise<{}>} The parameters to parse.
   */
  static parseGetNotesRequestParams(params) {
    let parsedParams = {};

    // Main params.
    parsedParams.searchQuery = super._parseNonEmptyStringTrimmed(params?.searchQuery);
    parsedParams.sortBy = super._parseNonEmptyStringTrimmed(params?.sortBy);
    parsedParams.nextPage = super._parseJsonString(params?.nextPage);
    parsedParams.pitId = super._parseNonEmptyStringTrimmed(params?.pitId);
    parsedParams.inceptionDate = super._parseISODateString(params?.inceptionDate);

    // Filter params.
    const filters = super._parseJsonString(params?.filters);
    if (filters) {
      parsedParams.filters = {
        subjectIds: super._parseNonEmptyArray(filters?.subjectIds),
        minPrice: super._parsePrice(super._parseNumber(filters?.minPrice, 0, 1000)),
        maxPrice: super._parsePrice(super._parseNumber(filters?.maxPrice, 0, 1000))
      };
    }

    return parsedParams;
  }

  /**
   * Parse and return parameters for getUsersItems requests.
   * @param params The parameters to parse.
   * @return {{uid}} The parsed parameters.
   */
  static parseGetUserNotesRequestParams(params) {
    let parsedParams = {};
    parsedParams.uid = super._parseNonEmptyStringTrimmed(params?.uid);

    parsedParams.sortBy = super._parseNonEmptyStringTrimmed(params?.sortBy);
    parsedParams.nextPage = super._parseJsonString(params?.nextPage);
    parsedParams.pitId = super._parseNonEmptyStringTrimmed(params?.pitId);

    if (parsedParams.uid == null) {
      throw new Error("Invalid parameters for getUsersItems.",
        {cause: {code: "INVALID_PARAMETERS"}});
    }

    return parsedParams;
  }

  /**
   * Parse and return parameters for updateNote requests.
   * @param params The parameters to parse.
   * @return {Promise<{}>}
   */
  static async parseUpdateNoteRequestParams(params) {
    let parsedParams = {
      fields: {}
    };

    parsedParams.id = super._parseNonEmptyStringTrimmed(params?.id);

    parsedParams.fields.title = super._parseNonEmptyStringTrimmed(params?.fields?.title, 100);
    parsedParams.fields.description = super._parseNonEmptyStringTrimmed(params?.fields?.description, 2000);
    parsedParams.fields.price = super._parsePrice(super._parseNumber(params?.fields?.price, 0, 200));
    parsedParams.fields.subjectIds = await super._parseSubjectIds(params?.fields?.subjectIds, 1);

    if (parsedParams.id == null) {
      throw new Error("Provided note id is invalid.",
        { cause: { code: "INVALID_ID" } });
    }

    return parsedParams;
  }

  /**
   * Parse and return parameters for viewNote requests.
   * @param params The parameters to parse.
   * @returns {{id,sample}|{}} The parsed parameters.
   */
  static parseViewNoteRequestParams(params) {
    let parsedParams = {};
    parsedParams.id = super._parseNonEmptyStringTrimmed(params?.id);
    parsedParams.sample = super._parseBoolean(super._parseJsonString(params?.sample));

    // If id is undefined or invalid format, raise error.
    if (parsedParams.id == null) {
      throw new Error("Invalid id provided.", { cause: { code: "INVALID_ID" } });
    }

    return parsedParams;
  }

  /************************************************************************************************
   * Admin Requests
   ************************************************************************************************/

  /**
   * Parse and return parameters for getNotes admin requests.
   * @param params The parameters to parse.
   * @return {Promise<{}>}
   */
  static parseGetNotesAdminRequestParams(params) {
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
        sellerUid: super._parseNonEmptyStringTrimmed(filters?.sellerUid),
        subjectIds: super._parseNonEmptyArray(filters?.subjectIds),
        status: super._parseNonEmptyStringTrimmed(filters?.status),
        minPrice: super._parsePrice(super._parseNumber(filters?.minPrice, 0, 1000)),
        maxPrice: super._parsePrice(super._parseNumber(filters?.maxPrice, 0, 1000)),
      };
    }

    return parsedParams;
  }

  /**
   * Parse and return parameters for updateNote admin requests.
   * @param params The parameters to parse.
   * @return {Promise<{}>}
   */
  static parseUpdateNoteAdminRequestParams(params) {
    let parsedParams = {
      fields: {}
    };

    parsedParams.id = super._parseNonEmptyStringTrimmed(params?.id);
    parsedParams.fields.status = super._parseAllowedValues(params?.fields?.status,
      [Note.NoteStatus.LISTED, Note.NoteStatus.REJECTED]);
    parsedParams.fields.rejectReason =
      parsedParams.fields.status === Note.NoteStatus.REJECTED ? {
        flaggedSections: super._parseArrayOfAllowedValues(params?.fields?.rejectReason?.flaggedSections,
          Object.values(Note.RejectReasonFlaggedSection)),
        feedback: super._parseNonEmptyStringTrimmed(params?.fields?.rejectReason?.feedback)
      } : undefined;

    if (parsedParams.id == null) {
      throw new Error("Provided note id is invalid.",
        { cause: { code: "INVALID_ID" } });
    } else if (parsedParams.fields.status === Note.NoteStatus.REJECTED &&
      (parsedParams.fields.rejectReason.flaggedSections == null || parsedParams.fields.rejectReason.feedback == null)) {
      throw new Error("Invalid parameters for updateNote admin.",
        { cause: { code: "INVALID_PARAMETERS" } });
    }

    return parsedParams;
  }

  /**
   * Parse and return parameters for viewNote admin requests.
   * @param params The parameters to parse.
   * @returns {{id,sample}|{}} The parsed parameters.
   */
  static parseViewNoteAdminRequestParams(params) {
    let parsedParams = {};
    parsedParams.id = super._parseNonEmptyStringTrimmed(params?.id);
    parsedParams.sample = super._parseBoolean(super._parseJsonString(params?.sample));

    // If id is undefined or invalid format, raise error.
    if (parsedParams.id == null) {
      throw new Error("Invalid id provided.", { cause: { code: "INVALID_ID" } });
    }

    return parsedParams;
  }
}

module.exports = NoteValidator;