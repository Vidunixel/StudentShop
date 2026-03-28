const SchoolValidator = require("../../validators/SchoolValidator");
const School = require("../../models/School");
const multer = require("multer");
const path = require("path");
const QueueLockService = require("../../services/QueueLockService");

const jsonFileUpload = multer({
  fileFilter: function (req, file, cb) {
    const allowedTypes = /json/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error("Only json files are allowed.",
        { cause: { code: "UNSUPPORTED_FILE_TYPE" } }));
    }
  },
});

/************************************************************************************************
 * Controllers
 * **********************************************************************************************/

const uploadJson = async (req, res, next) => {
  jsonFileUpload.single("jsonFile")(req, res, (err) => {
    if (err) {
      // Set statusCode based on error code.
      let statusCode;
      switch (err?.cause?.code || err?.code) {
        case "UNSUPPORTED_FILE_TYPE":
        case "LIMIT_PART_COUNT":
        case "LIMIT_FILE_SIZE":
        case "LIMIT_FILE_COUNT":
        case "LIMIT_FIELD_KEY":
        case "LIMIT_FIELD_VALUE":
        case "LIMIT_FIELD_COUNT":
        case "LIMIT_UNEXPECTED_FILE":
        case "MISSING_FIELD_NAME":
          statusCode = 400;
          break;
        default:
          console.error(err);
          statusCode = 500;
      }
      res.status(statusCode).json({ code: err?.cause?.code || err?.code || "UNKNOWN" }); // Send error message.
    } else {
      // Call the controller function to handle the rest of the logic.
      next();
    }
  });
}

const getSchool = async (req, res) => {
  let parsedParams;
  try {
    const { accountType } = req.user; // Extract the user's accountType (ADMIN or STAFF).
    parsedParams = SchoolValidator.parseSchoolIdRequestParams(req.query);

    // Get school.
    const schools = await School.findManyByIds([parsedParams.id], undefined,
      { parentCampus: true });

    // Throw error if user doesn't exist.
    if (schools.length === 0) {
      throw new Error("Provided id could not be found.",
        {cause: {code: "INVALID_ID"}});
    }

    const school = schools[0];

    // Send school.
    res.status(200).json({ school });
  } catch (error) {
    // Set statusCode based on error code.
    let statusCode;
    switch (error?.cause?.code) {
      case ("INVALID_ID"):
        statusCode = 400;
        break;
      default:
        console.error(error);
        statusCode = 500;
    }
    res.status(statusCode).json({ code: error?.cause?.code || "UNKNOWN" }); // Send error message.
  }
}

const getSchools = async (req, res) => {
  let parsedParams;
  try {
    parsedParams = SchoolValidator.parseGetSchoolsAdminRequestParams(req.query);

    // Get id reference for the current state of the index if pitId is not already provided.
    if (!parsedParams.pitId) {
      parsedParams.pitId = await School.getPointInTime();
    }

    const pageSize = 50;
    // Fetch existing schools.
    let schools = await School.findManyByQueryAdminSearch(parsedParams.searchQuery, parsedParams.filters,
      parsedParams.sortBy, parsedParams.nextPage, parsedParams.pitId, pageSize);
    const isLoadMoreEnabled = schools.length === pageSize;

    res.status(200).json({ pitId: parsedParams.pitId, schools, isLoadMoreEnabled: isLoadMoreEnabled });
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

const updateSchools = async (req, res) => {
  try {
    const { file } = req;

    let json;
    try {
      json = JSON.parse(file.buffer.toString());
    } catch (error) {
      new Error("JSON file is incorrectly formatted or corrupted.",
        { cause: { code: "MALFORMED_FILE" } });
    }

    if (!Array.isArray(json)) {
      new Error("Invalid JSON structure. Expected an array.",
        { cause: { code: "MALFORMED_FILE" } });
    }

    const acaraIds = []; // All document acaraIds to be saved/updated.
    const documents = []; // All documents to be saved/updated.
    json.forEach((document) => {
      if (document.ACARAId != null && document.SchoolName != null) {
        acaraIds.push(document.ACARAId);
        documents.push({
          acaraId: document.ACARAId,
          name: document.SchoolName,
          schoolType: document.SchoolType,
          sector: document.SchoolSector,
          status: document.OperationalStatus,
          locality: document.AddressList?.[0]?.City,
          region: document.AddressList?.[0]?.StateProvince,
          postcode: document.AddressList?.[0]?.PostalCode,
          coordinates: {
            lat: document.AddressList?.[0]?.GridLocation.Latitude,
            lon: document.AddressList?.[0]?.GridLocation.Longitude
          },
          websiteUrl: document?.SchoolURL,
          campusParentAcaraId: document?.Campus?.ParentSchoolId
        });
      }
    });

    // Lock all requests to run synchronously.
    await new QueueLockService(QueueLockService.ControllerQueue.schoolControllerQueue).processJob(undefined,
      async (session) => {
        // Fetch existing schools.
        const existingSchools = await School.findManyByAcaraIds(acaraIds, session);

        const documentsToSave = [];
        const documentsToUpdate = [];
        documents.forEach((document) => {
          // Get school that might already exist.
          const matchingSchool = existingSchools.find((existingSchool) =>
            existingSchool.acaraId === document.acaraId);

          if (matchingSchool != null) {
            // If school already exists and has changed, push to documentsToUpdate array.
            if (
              matchingSchool.name !== document.name ||
              matchingSchool.schoolType !== document.schoolType ||
              matchingSchool.sector !== document.sector ||
              matchingSchool.status !== document.status ||
              matchingSchool.locality !== document.locality ||
              matchingSchool.region !== document.region ||
              matchingSchool.postcode !== document.postcode ||
              matchingSchool.coordinates.lat !== document.coordinates.lat ||
              matchingSchool.coordinates.lon !== document.coordinates.lon ||
              matchingSchool.websiteUrl !== document.websiteUrl ||
              matchingSchool.campusParentAcaraId !== document.campusParentAcaraId
            ) {
              documentsToUpdate.push(document);
            }
          } else if (document.status === School.SchoolStatus.OPEN) {
            // If school doesn't already exist and is open, push to documentsToSave array.
            documentsToSave.push(document);
          }
        });

        // Save and update the respective documents.
        if (documentsToSave.length) {
          await School.saveMany(documentsToSave, session);
        }
        if (documentsToUpdate.length) {
          await School.bulkUpdateManyByAcaraId(documentsToUpdate, session);
        }
    }, { createTransaction: true });

    res.status(200).json({ status: "updated" });
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

module.exports = { getSchools, getSchool, uploadJson, updateSchools }
