const SubjectValidator = require("../validators/SubjectValidator");
const Subject = require("../models/Subject");

/************************************************************************************************
 * Controllers
 * **********************************************************************************************/

const getSubjects = async (req, res) => {
  let parsedParams;
  try {
    parsedParams = SubjectValidator.parseGetSubjectsRequestParams(req.query);

    // Fetch existing subjects.
    const subjects = await Subject.findManyByQuerySearch(parsedParams.searchQuery,
      parsedParams.filters);

    // Filter attributes of each subject.
    const filteredSubjects = subjects.map(subject => Subject.filterAttributesForPublic(subject));

    res.status(200).json({ subjects: filteredSubjects });
  } catch (error) {
    // Set statusCode based on error code.
    let statusCode;
    switch (error?.cause?.code) {
      case "INVALID_ID":
        statusCode = 400;
        break;
      default:
        console.error(error);
        statusCode = 500;
    }
    res.status(statusCode).json({ code: error?.cause?.code || "UNKNOWN" }); // Send error message.
  }
}

module.exports = { getSubjects }
