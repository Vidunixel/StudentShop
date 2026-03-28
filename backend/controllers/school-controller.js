const SchoolValidator = require("../validators/SchoolValidator");
const School = require("../models/School");

/************************************************************************************************
 * Controllers
 * **********************************************************************************************/

const getSchools = async (req, res) => {
  let parsedParams;
  try {
    parsedParams = SchoolValidator.parseGetSchoolsRequestParams(req.query);

    // Fetch existing schools.
    const schools = await School.findManyByQuerySearch(parsedParams.searchQuery);

    // Filter attributes of each school.
    const filteredSchools = schools.map(school => School.filterAttributesForPublic(school));

    res.status(200).json({ schools: filteredSchools });
  } catch (error) {
    // Set statusCode based on error code.
    let statusCode;
    switch (error?.cause?.code) {
      default:
        console.error(error);
        statusCode = 500;
    }
    res.status(statusCode).json({ code: error?.cause?.code || "UNKNOWN" }); // Send error message.
  }
}

module.exports = { getSchools }
