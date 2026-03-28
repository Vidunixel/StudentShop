const Note = require("../../models/Note");
const NoteValidator = require("../../validators/NoteValidator");
const {r2, socketIo} = require("../../server");
const {GetObjectCommand, DeleteObjectCommand} = require("@aws-sdk/client-s3");
const QueueLockService = require("../../services/QueueLockService");
const Purchase = require("../../models/Purchase");
const Review = require("../../models/Review");
const {Environment} = require("../../models/common");

const notesBucketName = process.env.ENVIRONMENT === Environment.PRODUCTION ? "private-notes" : "dev-private-notes";
const noteCoversBucketName = process.env.ENVIRONMENT === Environment.PRODUCTION ? "public-note-covers" : "dev-public-note-covers";

/************************************************************************************************
 * Controllers
 * **********************************************************************************************/

const getNotes = async (req, res) => {
  let parsedParams;
  try {
    const { accountType } = req.user; // Extract the user's accountType (ADMIN or STAFF).
    parsedParams = NoteValidator.parseGetNotesAdminRequestParams(req.query);

    // Get id reference for the current state of the index if pitId is not already provided.
    if (!parsedParams.pitId) {
      parsedParams.pitId = await Note.getPointInTime();
    }

    const pageSize = 50;
    // Fetch existing notes.
    const notes = await Note.findManyByQueryAdminSearch(parsedParams.searchQuery, parsedParams.filters,
      parsedParams.sortBy, parsedParams.nextPage, parsedParams.pitId, pageSize,
      { all: true });
    const isLoadMoreEnabled = notes.length === pageSize;

    res.status(200).json({ pitId: parsedParams.pitId, notes: notes, isLoadMoreEnabled: isLoadMoreEnabled });
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

const getNote = async (req, res) => {
  let parsedParams;
  try {
    const { accountType } = req.user; // Extract the user's accountType (ADMIN or STAFF).
    parsedParams = NoteValidator.parseNoteIdRequestParams(req.query);

    // Get note matching the _id.
    const notes = await Note.findManyByIds([parsedParams.id], undefined, { all: true });

    // Raise error if response contains no results, else respond with the first note.
    if (notes.length === 0) {
      throw new Error("Provided note id could not be found.",
        { cause: { code: "INVALID_ID" } });
    }

    const note = notes[0];

    res.status(200).json({ note: note });
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

const updateNote = async (req, res) => {
  let parsedParams;
  try {
    const { accountType } = req.user; // Extract the user's accountType (ADMIN or STAFF).
    parsedParams = NoteValidator.parseUpdateNoteAdminRequestParams(req.body);

    // Lock requests with the same id to run synchronously.
    await new QueueLockService(QueueLockService.ControllerQueue.noteControllerQueue).processJob({ id: parsedParams.id },
      async (session) => {
        // Get notes matching the _id.
        const notes = await Note.findManyByIds([parsedParams.id], session);

        // Raise error if response contains no results.
        if (notes.length === 0) {
          throw new Error("Provided note id could not be found.",
            { cause: { code: "INVALID_ID" } });
        }

        const note = notes[0];

        if (parsedParams.fields.status === Note.NoteStatus.LISTED) {
          // If user is trying to approve listing.
          if ([Note.NoteStatus.PROCESSING_ERROR, Note.NoteStatus.LISTED, Note.NoteStatus.DELISTED,
            Note.NoteStatus.DELETED].includes(note.status)) {
            throw new Error("Note cannot be listed when status is PROCESSING_ERROR, LISTED, DELISTED or " +
              "DELETED.", { cause: { code: "ACTION_UNAVAILABLE" } });
          }
          // Remove rejectReason field if note was previously rejected.
          if (note.rejectReason != null) {
            await Note.removeFieldsById(note._id, ["rejectReason"], session);
          }
        } else if (parsedParams.fields.status === Note.NoteStatus.REJECTED) {
          // If user is trying to reject listing.
          if ([Note.NoteStatus.PROCESSING_ERROR, Note.NoteStatus.REJECTED, Note.NoteStatus.DELETED]
            .includes(note.status)) {
            throw new Error("Note cannot be rejected when status is PROCESSING_ERROR, REJECTED or DELETED.",
              { cause: { code: "ACTION_UNAVAILABLE" } });
          }
        }

        // Update note.
        await Note.updateOneById(note._id, parsedParams.fields, session);
      }, { createTransaction: true });

    res.status(200).json({ status: "updated" });
  } catch (error) {
    // Set statusCode based on error code.
    let statusCode;
    switch (error?.cause?.code) {
      case "INVALID_ID":
      case "INVALID_PARAMETERS":
        statusCode = 400;
        break;
      case "ACTION_UNAVAILABLE":
        statusCode = 409;
        break;
      default:
        console.error(error);
        statusCode = 500;
    }
    res.status(statusCode).json({ code: error?.cause?.code || "UNKNOWN" }); // Send error message.
  }
}

const deleteNote = async (req, res) => {
  let parsedParams;
  try {
    const { accountType } = req.user; // Extract the user's accountType (ADMIN or STAFF).
    parsedParams = await NoteValidator.parseNoteIdRequestParams(req.query);

    // Lock requests with the same id to run synchronously.
    await new QueueLockService(QueueLockService.ControllerQueue.noteControllerQueue).processJob({ id: parsedParams.id },
      async (session) => {
        // Get notes matching the _id.
        const notes = await Note.findManyByIds([parsedParams.id], session);

        // Raise error if response contains no results.
        if (notes.length === 0) {
          throw new Error("Provided note id could not be found.",
            { cause: { code: "INVALID_ID" } });
        }

        const note = notes[0];

        if (note.status === Note.NoteStatus.DELETED) {
          throw new Error("Note is already deleted.",
            { cause: { code: "ACTION_UNAVAILABLE" } });
        }

        // Set isNotePurchasedByOthers to true if note has been purchased by others.
        let isNotePurchasedByOthers = false;
        const purchases = await Purchase.findManyByItems([{ _index: note._index, _id: note._id }],
          undefined, undefined, session);
        if (purchases.length > 0) {
          isNotePurchasedByOthers = true;
        }

        // If note has been accepted by aiAnalysis or isNotePurchasedByOthers is true, soft delete, else hard delete
        if ([Note.NoteStatus.LISTED, Note.NoteStatus.DELISTED].includes(note.status) || isNotePurchasedByOthers) {
          // Soft delete.
          await Note.updateOneById(note._id, {
            status: Note.NoteStatus.DELETED
          }, session);
        } else {
          // Hard delete.
          await Note.deleteOneById(note._id, session); // Delete document.

          // Delete pdf and html notes.
          r2.send(new DeleteObjectCommand({
            Bucket: notesBucketName,
            Key: note.pdfFile + ".pdf"
          })).catch((error) => {
            console.error(error);
          });

          r2.send(new DeleteObjectCommand({
            Bucket: notesBucketName,
            Key: note.pdfFile + ".html"
          })).catch((error) => {
            console.error(error);
          });

          // Delete note cover if it is not default.
          if (note.noteCover !== Note.defaultNoteCover) {
            r2.send(new DeleteObjectCommand({
              Bucket: noteCoversBucketName,
              Key: note.noteCover
            })).catch((error) => {
              console.error(error);
            });
          }
        }

        res.status(200).json({ status: "deleted" });
      }, { createTransaction: true });
  } catch (error) {
    // Set statusCode based on error code.
    let statusCode;
    switch (error?.cause?.code) {
      case "INVALID_ID":
        statusCode = 400;
        break;
      case "ACTION_UNAVAILABLE":
        statusCode = 409;
        break;
      default:
        console.error(error);
        statusCode = 500;
    }
    res.status(statusCode).json({ code: error?.cause?.code || "UNKNOWN" }); // Send error message.
  }
}

const viewNote = async (req, res) => {
  let parsedParams;
  try {
    const { accountType } = req.user; // Extract the user's accountType (ADMIN or STAFF).
    parsedParams = NoteValidator.parseViewNoteAdminRequestParams(req.query);

    // Get note details matching the _id.
    const notes = await Note.findManyByIds([parsedParams.id]);

    // Raise error if response contains no results, else respond with the first note.
    if (notes.length === 0) {
      throw new Error("Provided note id could not be found.",
        { cause: { code: "INVALID_ID" } });
    }

    const note = notes[0];

    // Get note.
    const response = await r2.send(new GetObjectCommand({
      Bucket: notesBucketName,
      Key: note.pdfFile + ".pdf"
    }));

    // Convert stream to buffer.
    const pdfStream = response.Body;
    const chunks = [];
    for await (const chunk of pdfStream) {
      chunks.push(chunk);
    }
    const pdfBuffer = Buffer.concat(chunks);

    // Set headers.
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);

    // Send file.
    res.send(pdfBuffer);
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

module.exports = { getNote, getNotes, viewNote, updateNote, deleteNote }