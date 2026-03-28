const QueueLockService = require("../../services/QueueLockService");
const SubjectValidator = require("../../validators/SubjectValidator");
const Subject = require("../../models/Subject");
const UserValidator = require("../../validators/UserValidator");
const User = require("../../models/User");
const Cart = require("../../models/Cart");

/************************************************************************************************
 * Controllers
 * **********************************************************************************************/

const getSubject = async (req, res) => {
  let parsedParams;
  try {
    const { accountType } = req.user; // Extract the user's accountType (ADMIN or STAFF).
    parsedParams = SubjectValidator.parseSubjectIdRequestParams(req.query);

    // Get subject.
    const subjects = await Subject.findManyByIds([parsedParams.id], undefined);

    // Throw error if user doesn't exist.
    if (subjects.length === 0) {
      throw new Error("Provided id could not be found.",
        {cause: {code: "INVALID_ID"}});
    }

    const subject = subjects[0];

    // Send subject.
    res.status(200).json({ subject });
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

const getSubjects = async (req, res) => {
  let parsedParams;
  try {
    parsedParams = SubjectValidator.parseGetSubjectsAdminRequestParams(req.query);

    // Get id reference for the current state of the index if pitId is not already provided.
    if (!parsedParams.pitId) {
      parsedParams.pitId = await Subject.getPointInTime();
    }

    const pageSize = 50;
    // Fetch existing subjects.
    let subjects = await Subject.findManyByQueryAdminSearch(parsedParams.searchQuery, parsedParams.filters,
      parsedParams.sortBy, parsedParams.nextPage, parsedParams.pitId, pageSize);
    const isLoadMoreEnabled = subjects.length === pageSize;

    res.status(200).json({ pitId: parsedParams.pitId, subjects, isLoadMoreEnabled: isLoadMoreEnabled });
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

const addSubject = async (req, res) => {
  let parsedParams;
  try {
    const { accountType } = req.user; // Extract the user's accountType (ADMIN or STAFF).
    parsedParams = SubjectValidator.parseAddSubjectAdminRequestParams(req.body);

    // Lock requests with the same name and certificate to run synchronously to avoid duplication.
    await new QueueLockService(QueueLockService.ControllerQueue.subjectControllerQueue).processJob({
      nameAndCertificate: `${parsedParams.name}:${parsedParams.certificate}`
    }, async (session) => {
      // Check if subject already exists before saving.
      const matchingSubjects = await Subject.findOneByNameAndCertificate(parsedParams.name,
        parsedParams.certificate, session);

      if (matchingSubjects.length > 0) {
        throw new Error("Subject already exists.",
          {cause: {code: "SUBJECT_ALREADY_EXISTS"}});
      }

      // Create and save subject.
      const subjectDoc = new Subject(parsedParams);
      const subject = await subjectDoc.save(session);

      // Send saved subject.
      res.status(200).json({ subject });
    }, { createTransaction: true });

  } catch (error) {
    // Set statusCode based on error code.
    let statusCode;
    switch (error?.cause?.code) {
      case "SUBJECT_ALREADY_EXISTS":
      case "INVALID_PARAMETERS":
        statusCode = 400;
        break;
      default:
        console.error(error);
        statusCode = 500;
    }
    res.status(statusCode).json({ code: error?.cause?.code || "UNKNOWN" }); // Send error message.
  }
}

const updateSubject = async (req, res) => {
  let parsedParams;
  try {
    const { accountType, uid } = req.user; // Extract the user's accountType (ADMIN or STAFF).
    parsedParams = SubjectValidator.parseUpdateSubjectAdminRequestParams(req.body);

    const subjects = await Subject.findManyByIds([parsedParams.id]);

    if (!subjects.length) {
      throw new Error("Invalid id provided.",
        {cause: {code: "INVALID_ID"}});
    }
    const subject = subjects[0];

    // Consolidate old and newly updated fields.
    const fields = {
      name: parsedParams?.fields?.name ?? subject.name,
      certificate: parsedParams?.fields?.certificate ?? subject.certificate
    };

    // Lock requests with the same id or (name and certificate) to run synchronously to avoid duplication.
    await new QueueLockService(QueueLockService.ControllerQueue.subjectControllerQueue).processJob({
        id: parsedParams.id,
        nameAndCertificate: `${fields.name}:${fields.certificate}`
      },
      async (session) => {
        // Check if subject already exists before saving.
        const matchingSubjects = await Subject.findOneByNameAndCertificate(fields.name,
          fields.certificate, session);

        if (matchingSubjects.length > 0) {
          throw new Error("Subject already exists.",
            {cause: {code: "SUBJECT_ALREADY_EXISTS"}});
        }

        await Subject.updateOneById(parsedParams.id, parsedParams.fields, session);

        res.status(200).json({ status: "updated" });
      }, { createTransaction: true });
  } catch (error) {
    // Set statusCode based on error code.
    let statusCode;
    switch (error?.cause?.code) {
      case "SUBJECT_ALREADY_EXISTS":
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

const deleteSubject = async (req, res) => {
  let parsedParams;
  try {
    const { accountType } = req.user; // Extract the user's accountType (ADMIN or STAFF).
    parsedParams = SubjectValidator.parseSubjectIdRequestParams(req.query);

    // Lock requests with the same id to run synchronously.
    await new QueueLockService(QueueLockService.ControllerQueue.subjectControllerQueue).processJob({ id: parsedParams.id },
      async (session) => {
      await Subject.deleteOneById(parsedParams.id, session);
    }, { createTransaction: true });

    res.status(200).json({ status: "deleted" });
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

module.exports = { getSubjects, getSubject, addSubject, updateSubject, deleteSubject }
