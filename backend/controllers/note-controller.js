const NoteValidator = require("../validators/NoteValidator");
const Note = require("../models/Note");
const NoteProcessingService = require("../services/NoteProcessingService");
const User = require("../models/User");
const Purchase = require("../models/Purchase");
const { GetObjectCommand, DeleteObjectCommand} = require("@aws-sdk/client-s3");
const {r2} = require("../server");
const Review = require("../models/Review");
const QueueLockService = require("../services/QueueLockService");
const RatingCalculator = require("../services/RatingCalculator");
const { Readable } = require("stream");
const crypto = require("crypto");
const { socketIo } = require("../server");
const multer = require("multer");
const path = require("path");
const {Environment} = require("../models/common");

const notesBucketName = process.env.ENVIRONMENT === Environment.PRODUCTION ? "private-notes" : "dev-private-notes";
const noteCoversBucketName = process.env.ENVIRONMENT === Environment.PRODUCTION ? "public-note-covers" : "dev-public-note-covers";

async function emitNoteModifiedSocketEvent(noteId, uid) {
  // Emit modified note document as a "note:modified" event using socket.io.
  try {
    const notes = await Note.findManyByIds([noteId], undefined, { all: true });

    if (notes.length > 0) {
      const note = notes[0];
      socketIo.to(`user_${uid}`).emit("note:modified", note);
    }
  } catch (error) {
    console.error(error);
  }
}

async function handleNoteProcessingError(noteId) {
  try {
    await new QueueLockService(QueueLockService.ControllerQueue.noteControllerQueue).processJob({ id: noteId },
      async (session) => {
        // Fetch note to get latest details.
        const notes = await Note.findManyByIds([noteId], session);

        if (!notes.length) {
          throw new Error("Note no longer exists.",
            {cause: {code: "NOTE_NO_LONGER_EXISTS"}});
        }

        const note = notes[0];

        if (note.status !== Note.NoteStatus.PROCESSING) {
          throw new Error("Note cannot be updated when status is not PROCESSING.",
            { cause: { code: "ACTION_UNAVAILABLE" } });
        }

        // Set status as PROCESSING_ERROR if note failed to process.
        await Note.updateOneById(note._id, { status: Note.NoteStatus.PROCESSING_ERROR }, session);
      }, { createTransaction: true });
  } catch (error) {
    console.error(error);
  }
}

async function conductAiAnalysisAndUpdateNote(noteId, noteProcessingInstance) {
  try {
    // Get OpenAI analysis.
    const aiAnalysis = await noteProcessingInstance.getAiAnalysis();

    await new QueueLockService(QueueLockService.ControllerQueue.noteControllerQueue).processJob({ id: noteId },
      async (session) => {
        // Fetch note to get latest details.
        const notes = await Note.findManyByIds([noteId], session);

        if (!notes.length) {
          throw new Error("Note no longer exists.",
            { cause: { code: "NOTE_NO_LONGER_EXISTS" } });
        }

        const note = notes[0];

        if (note.status !== Note.NoteStatus.PROCESSING) {
          throw new Error("Note cannot be updated when status is not PROCESSING.",
            { cause: { code: "ACTION_UNAVAILABLE" } });
        }

        // Remove rejectReason field if note was previously rejected.
        if (note.rejectReason != null) {
          await Note.removeFieldsById(note._id, ["rejectReason"], session);
        }

        if (aiAnalysis.error) {
          // Set status as PENDING_REVIEW if note failed to get AI review.
          await Note.updateOneById(note._id, { status: Note.NoteStatus.PENDING_REVIEW }, session);
        } else {
          // If OpenAI accepted the listing.
          if (aiAnalysis.isAccepted) {
            // Update the rating and ratingCount on note.
            await Note.updateOneById(noteId,
              RatingCalculator.addRating(aiAnalysis.rating, note.ratingCount), session);

            // Create and save review.
            const reviewDoc = new Review({ rating: aiAnalysis.rating,
              review: aiAnalysis.review,
              item: { _index: Note.indexName, _id: note._id }, isAi: true });
            await reviewDoc.save(session);
          }

          // Update note.
          await Note.updateOneById(note._id, {
            // Set rejectReason & status based on aiAnalysis.isAccepted.
            ...(!aiAnalysis.isAccepted ? {
              rejectReason: { isAi: true, flaggedSections: aiAnalysis.flaggedSections,
                feedback: aiAnalysis.feedback }
            } : {}),
            status: aiAnalysis.isAccepted ? Note.NoteStatus.LISTED : Note.NoteStatus.REJECTED
          }, session);
        }
      }, { createTransaction: true });
  } catch (error) {
    console.error(error);
    throw error;
  }
}

async function batchSetNoteAttributes(notes, uid, isFilterAttributes = true) {
  let filteredNotes = [];
  if (notes.length > 0) {
    // If uid provided, get notes already purchased by this user.
    let noteItems = [];
    let notePurchases = [];
    let purchaseRefunds = [];
    if (uid) {
      noteItems = notes.map(note => ({_index: note._index, _id: note._id})); // Convert to item format.
      notePurchases = (await Purchase.findManyByItems(noteItems, uid, Purchase.PurchaseStatus.PAID,
        undefined, { refund: true }));

      // Build array of notePurchases refunds.
      purchaseRefunds = notePurchases.map((purchase) => purchase.refund)
        .filter((refund) => refund != null); // Filter out undefined/null values.
    }

    // Set user specific attributes of note.
    filteredNotes = notes.map(note => {
      // Filter out private note details for public or owner if isFilterAttributes is true.
      let filteredNote;
      if (isFilterAttributes && (note.sellerUid == null || uid == null || note.sellerUid !== uid)) {
        filteredNote = Note.filterAttributesForPublic(note);
      } else if (isFilterAttributes) {
        filteredNote = Note.filterAttributesForOwner(note);
      } else {
        filteredNote = note;
      }

      // If note is not free and note contains refund acceptedReasons, set isRefundAvailable to true.
      filteredNote.isRefundAvailable = !!(note.price && note.refundPolicy?.acceptedReasons?.length);
      // If note is not free set isDownloadAvailable to true.
      filteredNote.isDownloadAvailable = !!note.price;

      // If uid provided, set purchase/refund related attributes.
      if (uid) {
        let validNotePurchase; // The current unrefunded purchase of a note.
        let isPurchasedAtLeastOnce = false;
        let isRefundedAtLeastOnce = false;
        notePurchases.forEach((notePurchase) => {
          if (notePurchase.item._index === note._index && notePurchase.item._id === note._id) {
            isPurchasedAtLeastOnce = true;
            const isRefunded = purchaseRefunds.some((refund) => refund.purchaseId === notePurchase._id);

            if (isRefunded) {
              isRefundedAtLeastOnce = true;
            } else {
              // Set validNotePurchase (the only purchase that has not been refunded).
              validNotePurchase = notePurchase;
            }
          }
        });

        // Set attributes of a valid note purchase.
        if (validNotePurchase) {
          filteredNote.isOwned = true;
          // If note was not purchased for free, set isDownloadAvailable to true.
          filteredNote.isDownloadAvailable = !!validNotePurchase?.price?.total;

          // Set validNotePurchase as an attribute of note if attributes aren't being filtered.
          if (!isFilterAttributes) {
            filteredNote.validNotePurchase = validNotePurchase;
          }
        }

        if (isPurchasedAtLeastOnce) {
          filteredNote.isPurchased = true;
          if (isRefundedAtLeastOnce) {
            // If note has been previously purchased and also refunded at least once, set 'isRefundAvailable' to false.
            filteredNote.isRefundAvailable = false;
          } else if (validNotePurchase) {
            // If note has been previously purchased and not refunded at all,
            // set 'isRefundAvailable' based on refundExpiryDate and isRefundRestricted.
            const refundExpiryDate = new Date(validNotePurchase.refundProperties?.refundExpiryDate);
            const isRefundRestricted = validNotePurchase.refundProperties?.isRefundRestricted;
            filteredNote.isRefundAvailable = refundExpiryDate ? new Date() <= refundExpiryDate && !isRefundRestricted : false;
          }
        }
      }

      return filteredNote;
    });
  }

  return filteredNotes;
}

const pdfFileUpload = multer({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit.
  fileFilter: function (req, file, cb) {
    const allowedTypes = /pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error("Only pdf files are allowed for notes.",
        { cause: { code: "UNSUPPORTED_FILE_TYPE" } }));
    }
  },
});

/************************************************************************************************
 * Controllers
 * **********************************************************************************************/

const uploadNote = async (req, res, next) => {
  pdfFileUpload.single("pdfFile")(req, res, (err) => {
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

const getNote = async (req, res) => {
  let parsedParams;
  try {
    const uid = req?.user?.uid; // Extract the user's unique ID if logged in.
    parsedParams = NoteValidator.parseNoteIdRequestParams(req.query);

    // Get note matching the _id.
    const notes = await Note.findManyByIds([parsedParams.id], undefined, { all: true });

    // Raise error if response contains no results, else respond with the first note.
    if (notes.length === 0) {
      throw new Error("Provided note id could not be found.",
        { cause: { code: "INVALID_ID" } });
    }

    const note = (await batchSetNoteAttributes(notes, uid))[0];

    if (!note.isOwned && note.status === Note.NoteStatus.DELETED) {
      // If note is not purchased and is deleted, throw error.
      throw new Error("User does not have permission to access note.",
        { cause: { code: "ACCESS_FORBIDDEN" } });
    } else if (!note.isOwned && note.sellerUid !== uid && note.status !== Note.NoteStatus.LISTED) {
      // If note is not listed and is being requested by someone who isn't the seller or an owner, throw error.
      throw new Error("User does not have permission to access note.",
        { cause: { code: "ACCESS_FORBIDDEN" } });
    }

    res.status(200).json({ note: note });
  } catch (error) {
    // Set statusCode based on error code.
    let statusCode;
    switch (error?.cause?.code) {
      case "INVALID_ID":
        statusCode = 400;
        break;
      case "ACCESS_FORBIDDEN":
        statusCode = 403;
        break;
      default:
        console.error(error);
        statusCode = 500;
    }
    res.status(statusCode).json({ code: error?.cause?.code || "UNKNOWN" }); // Send error message.
  }
}

const getSimilarNotes = async (req, res) => {
  let parsedParams;
  try {
    parsedParams = await NoteValidator.parseNoteIdRequestParams(req.query);
    const uid = req?.user?.uid; // Extract the user's unique ID if logged in.

    // Get note matching the _id.
    const notes = await Note.findManyByIds([parsedParams.id], undefined, { all: true });

    // Raise error if response contains no results, else respond with the first note.
    if (notes.length === 0) {
      throw new Error("Provided note id could not be found.",
        { cause: { code: "INVALID_ID" } });
    }

    const note = notes[0];

    // Fetch similar notes.
    let similarNotes = await Note.findManyBySimilaritySearch(note._id, note.title,
      note.subjectIds, undefined, undefined, undefined, { all: true });
    similarNotes = await batchSetNoteAttributes(similarNotes, uid);

    res.status(200).json({ notes: similarNotes });
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
    res.status(statusCode).json({code: error?.cause?.code || "UNKNOWN"}); // Send error message.
  }
}

const getNotes = async (req, res) => {
  let parsedParams;
  try {
    parsedParams = NoteValidator.parseGetNotesRequestParams(req.query);
    const uid = req?.user?.uid; // Extract the user's unique ID if logged in.

    // Get id reference for the current state of the index if pitId is not already provided.
    if (!parsedParams.pitId) {
      parsedParams.pitId = await Note.getPointInTime();
    }

    // Set inception date for if inceptionDate is not already provided.
    if (!parsedParams.inceptionDate) {
      parsedParams.inceptionDate = new Date().toISOString();
    }

    // If user is logged in, get user's subjectIds.
    let userSubjectIds;
    if (uid) {
      try {
        const user = await User.findManyByUids([uid]);

        // Only set userSubjectIds if user is a student, isActive is set to true, and subjectIds exists.
        if (user?.studentDetails?.isActive && user?.studentDetails?.subjectIds) {
          userSubjectIds = user.studentDetails.subjectIds;
        }
      } catch (error) {
        console.error(error);
      }
    }

    const pageSize = 25;
    // Fetch existing notes.
    let notes = await Note.findManyByQuerySearch(parsedParams.searchQuery, parsedParams.filters,
      parsedParams.sortBy, parsedParams.nextPage, parsedParams.pitId, parsedParams.inceptionDate, userSubjectIds,
      pageSize, { all: true });
    const isLoadMoreEnabled = notes.length === pageSize;

    notes = await batchSetNoteAttributes(notes, uid);

    res.status(200).json({ pitId: parsedParams.pitId, inceptionDate: parsedParams.inceptionDate, notes: notes,
      isLoadMoreEnabled: isLoadMoreEnabled});
  } catch (error) {
    // Set statusCode based on error code.
    let statusCode;
    switch (error?.cause?.code) {
      default:
        console.error(error);
        statusCode = 500;
    }
    res.status(statusCode).json({code: error?.cause?.code || "UNKNOWN"}); // Send error message.
  }
}

const addNote = async (req, res) => {
  let parsedParams;
  try {
    const { uid } = req.user; // Extract the user's attributes.
    const { file } = req;

    parsedParams = await NoteValidator.parseAddNoteRequestParams(JSON.parse(req.body?.params));
    parsedParams.sellerUid = uid;

    if (!file) {
      throw new Error("No pdf uploaded.",
        {cause: {code: "FILE_NOT_UPLOADED"}});
    }

    // Hash the pdf file's contents and get notes (which aren't deleted) that contain the same file.
    const fileHash = crypto.createHash("sha256").update(file.buffer).digest("hex");
    const notesWithSameFile = await Note.findOneByFileHash(fileHash, [Note.NoteStatus.DELETED]);

    const isFileRestricted = await NoteProcessingService.isPdfRestricted(file.buffer);

    if (notesWithSameFile.length > 0 || isFileRestricted) {
      throw new Error("Pdf file is either encrypted or has been uploaded before.",
        {cause: {code: "RESTRICTED_FILE"}});
    }

    // Create and save note.
    let noteDoc = new Note({
      ...parsedParams,
      fileHash
    });
    const note = await noteDoc.save();

    const noteProcessingInstance = new NoteProcessingService(parsedParams,
      file.buffer);

    // Process and save pdf.
    noteProcessingInstance.processAndSavePdf().then(async (processedPdfData) => {
      // Update note.
      await new QueueLockService(QueueLockService.ControllerQueue.noteControllerQueue)
        .processJob({uid}, async () => {
          await Note.updateOneById(note._id, {
            pdfFile: processedPdfData.pdfUniqueName,
            noteCover: processedPdfData.noteCoverUniqueName,
            samplePdfProperties: processedPdfData.samplePdfProperties,
            pageCount: processedPdfData.pageCount
          });
        });

      // Emit modified note document as a "note:modified" event using socket.io.
      await emitNoteModifiedSocketEvent(note._id, uid);

      conductAiAnalysisAndUpdateNote(note._id, noteProcessingInstance).then(() => {
        // Emit modified note document as a "note:modified" event using socket.io.
        emitNoteModifiedSocketEvent(note._id, uid);
      });
    }).catch(() => handleNoteProcessingError(note._id));

    // Send saved note.
    res.status(200).json({ note: Note.filterAttributesForOwner(note) });
  } catch (error) {
    // Set statusCode based on error code.
    let statusCode;
    switch (error?.cause?.code) {
      case "INVALID_PARAMETERS":
      case "FILE_NOT_UPLOADED":
        statusCode = 400;
        break;
      case "RESTRICTED_FILE":
        statusCode = 403;
        break;
      default:
        console.error(error);
        statusCode = 500;
    }
    res.status(statusCode).json({ code: error?.cause?.code || "UNKNOWN" }); // Send error message.
  }
}

const downloadNote = async (req, res) => {
  let parsedParams;
  try {
    const uid = req?.user?.uid; // Extract the user's unique ID.
    parsedParams = NoteValidator.parseNoteIdRequestParams(req.query);

    // Get note details matching the _id.
    const notes = await Note.findManyByIds([parsedParams.id]);

    // Raise error if response contains no results, else respond with the first note.
    if (notes.length === 0) {
      throw new Error("Provided note id could not be found.",
        { cause: { code: "INVALID_ID" } });
    }

    const note = (await batchSetNoteAttributes(notes, uid, false))[0];

    // If user is the seller or the item is owned, continue, else raise error.
    if (!(note.sellerUid === uid || (note.isOwned && note.isDownloadAvailable))) {
      throw new Error("User does not have permission to download note.",
        { cause: { code: "ACCESS_FORBIDDEN" } });
    }

    // Add refund restriction if note is owned and refund is available.
    if (note.isOwned && note.isRefundAvailable) {
      await new QueueLockService(QueueLockService.ControllerQueue.purchaseTransactionRefundControllerQueue)
        .processJob({ uid }, async (session) => {
          // Re-fetch note purchase.
          const notePurchases = (await Purchase.findManyByIds([note.validNotePurchase._id], session));

          // Throw error if purchase no longer exists.
          if (notePurchases.length === 0) {
            throw new Error("Note purchase no longer exists.");
          }
          const notePurchase = notePurchases[0];

          if (!notePurchase.refundProperties?.isRefundRestricted) {
            await Purchase.updateOneById(notePurchase._id, {
              refundProperties: {
                ...(notePurchase.refundProperties ?? {}),
                isRefundRestricted: true
              }
            }, session);
          }
        }, { createTransaction: true });
    }

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

    // Format PDF for download.
    const formattedPdfBuffer = await NoteProcessingService.formatForDownload(pdfBuffer, note._id);

    // Convert buffer to Stream.
    const stream = Readable.from(formattedPdfBuffer);

    // Set headers for file download.
    res.setHeader("Content-Disposition", `attachment; filename="${note.pdfFile}.pdf"`);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", formattedPdfBuffer.length);

    // Send file as stream.
    stream.pipe(res);
  } catch (error) {
    // Set statusCode based on error code.
    let statusCode;
    switch (error?.cause?.code) {
      case "INVALID_ID":
        statusCode = 400;
        break;
      case "ACCESS_FORBIDDEN":
        statusCode = 403;
        break;
      default:
        console.error(error);
        statusCode = 500;
    }
    res.status(statusCode).json({ code: error?.cause?.code || "UNKNOWN" }); // Send error message.
  }
}

const getPurchasedNotes = async (req, res) => {
  let parsedParams;
  try {
    const uid = req?.user?.uid; // Extract the user's unique ID.
    parsedParams = NoteValidator.parseGetNotesRequestParams(req.query);

    // Get id reference for the current state of the index if pitId is not already provided.
    if (!parsedParams.pitId) {
      parsedParams.pitId = await Purchase.getPointInTime();
    }

    const pageSize = 25;
    const uniqueNotePurchases = (await Purchase.findManyByUserUidSearch(uid, Note.indexName, true, parsedParams.sortBy,
      parsedParams.nextPage, parsedParams.pitId, pageSize));

    const isLoadMoreEnabled = uniqueNotePurchases.length === pageSize;
    const purchaseIds = uniqueNotePurchases.map(purchase => purchase.item._id);

    // Get notes from purchased item.
    let notes = (await Note.findManyByIds(purchaseIds, undefined, { all: true }));
    // Filter out notes that may have been refunded.
    notes = (await batchSetNoteAttributes(notes, uid)).filter((note) => note.isOwned === true);

    // Sort notes in the order of queried purchases.
    // IndexMap holds the index mapped to the purchase's note _id.
    const indexMap = new Map(uniqueNotePurchases.map((purchase, idx) => [purchase.item._id, idx]));
    notes.sort((firstItem, secondItem) => {
      const firstIndex = indexMap.has(firstItem._id) ? indexMap.get(firstItem._id) : Number.MAX_SAFE_INTEGER;
      const secondIndex = indexMap.has(secondItem._id) ? indexMap.get(secondItem._id) : Number.MAX_SAFE_INTEGER;
      return firstIndex - secondIndex;
    });

    res.status(200).json({ pitId: parsedParams.pitId, notes: notes, isLoadMoreEnabled });
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

const getUserNotes = async (req, res) => {
  let parsedParams;
  try {
    const uid = req?.user?.uid; // Extract the user's unique ID if logged in.
    parsedParams = NoteValidator.parseGetUserNotesRequestParams(req.query);

    // Get id reference for the current state of the index if pitId is not already provided.
    if (!parsedParams.pitId) {
      parsedParams.pitId = await Note.getPointInTime();
    }

    let noteStatuses;
    if (uid && uid === parsedParams.uid) {
      // If seller is requesting their own notes, provide all but deleted ones.
      noteStatuses = [Note.NoteStatus.PROCESSING, Note.NoteStatus.PENDING_REVIEW,
        Note.NoteStatus.PROCESSING_ERROR, Note.NoteStatus.REJECTED, Note.NoteStatus.LISTED, Note.NoteStatus.DELISTED];
    } else {
      // Else, provide only listed notes.
      noteStatuses = [Note.NoteStatus.LISTED];
    }

    const pageSize = 25;
    // Get notes listed by the user.
    let notes = (await Note.findManyBySellerUidSearch(parsedParams.uid, noteStatuses, parsedParams.sortBy, parsedParams.nextPage,
      parsedParams.pitId, pageSize, { all: true }));
    const isLoadMoreEnabled = notes.length === pageSize;

    notes = await batchSetNoteAttributes(notes, uid);

    res.status(200).json({ pitId: parsedParams.pitId, notes: notes, isLoadMoreEnabled });
  } catch (error) {
    // Set statusCode based on error code.
    let statusCode;
    switch (error?.cause?.code) {
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

const updateNote = async (req, res) => {
  async function reEvaluateAiAnalysis(note, uid) {
    try {
      // Consolidate old and newly updated fields.
      const fields = {
        title: parsedParams?.fields?.title ?? note.title,
        description: parsedParams?.fields?.description ?? note.description,
        subjectIds: parsedParams?.fields?.subjectIds ?? note.subjectIds,
        price: parsedParams?.fields?.price ?? note.price
      };

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

      // Note processing instance to pass.
      const noteProcessingInstance = new NoteProcessingService(fields,
        pdfBuffer);

      conductAiAnalysisAndUpdateNote(note._id, noteProcessingInstance).then(() => {
        // Emit modified note document as a "note:modified" event using socket.io.
        emitNoteModifiedSocketEvent(note._id, uid);
      });
    } catch (error) {
      await handleNoteProcessingError(note._id);
    }
  }

  let parsedParams;
  try {
    const uid = req?.user?.uid; // Extract the user's unique ID.
    parsedParams = await NoteValidator.parseUpdateNoteRequestParams(req.body);

    // Lock requests with the same id to run synchronously.
    let note;
    let isReEvaluateAiAnalysis = true;
    await new QueueLockService(QueueLockService.ControllerQueue.noteControllerQueue).processJob({ id: parsedParams.id },
      async (session) => {
        // Get notes matching the _id.
        const notes = await Note.findManyByIds([parsedParams.id], session);

        // Raise error if response contains no results.
        if (notes.length === 0) {
          throw new Error("Provided note id could not be found.",
            { cause: { code: "INVALID_ID" } });
        }

        note = notes[0];

        if (note.sellerUid !== uid) {
          throw new Error("User does not have permission to update note.",
            { cause: { code: "ACCESS_FORBIDDEN" } });
        } else if ([Note.NoteStatus.PROCESSING, Note.NoteStatus.PENDING_REVIEW, Note.NoteStatus.PROCESSING_ERROR,
          Note.NoteStatus.DELETED].includes(note.status)) {
          throw new Error("Note cannot be updated when status is PROCESSING, PENDING_REVIEW, " +
            "PROCESSING_ERROR or DELETED.",
            { cause: { code: "ACTION_UNAVAILABLE" } });
        } else if (Note.NoteStatus.REJECTED &&
          note?.rejectReason?.flaggedSections?.includes(Note.RejectReasonFlaggedSection.NOTE_CONTENT)) {
          // If note was rejected due to an issue with note_content, throw error.
          throw new Error("Note cannot be updated if status is REJECTED due to an issue with NOTE_CONTENT.",
            { cause: { code: "ACTION_UNAVAILABLE" } });
        }

        // Set note status to processing.
        await Note.updateOneById(note._id, { status: Note.NoteStatus.PROCESSING }, session);

        // If title, description, or subjects is being changed, delete old aiReview and re-evaluate aiAnalysis.
        isReEvaluateAiAnalysis = !!(parsedParams?.fields?.title != null || parsedParams?.fields?.description != null ||
          parsedParams?.fields?.subjectIds != null);

        if (isReEvaluateAiAnalysis) {
          // Get oldAiReview if there is one.
          const reviews = await Review.findOneAiReviewByItem({ _index: note._index, _id: note._id }, session);
          const oldAiReview = reviews.length > 0 ? reviews[0] : null;

          // Remove oldAiReview and update note's rating and ratingCount.
          if (oldAiReview) {
            // Update the rating and ratingCount on note.
            await Note.updateOneById(note._id, RatingCalculator.deleteRating(oldAiReview.rating, note.ratingCount), session);
            await Review.deleteOneById(oldAiReview._id, session); // Delete oldAiReview document.
          }
        }

        // Update note.
        await Note.updateOneById(note._id, { ...parsedParams.fields,
          // Set status to what it was before if AI review isn't being conducted.
          ...(!isReEvaluateAiAnalysis ? { status: note.status } : {})
        }, session);
      }, { createTransaction: true });

    // Emit modified note document as a "note:modified" event using socket.io.
    await emitNoteModifiedSocketEvent(note._id, uid);

    // If isReEvaluateAiAnalysis is true, re-evaluate aiAnalysis.
    if (isReEvaluateAiAnalysis) {
      reEvaluateAiAnalysis(note, uid).then();
    }

    res.status(200).json({ status: "updated" });
  } catch (error) {
    // Set statusCode based on error code.
    let statusCode;
    switch (error?.cause?.code) {
      case "INVALID_ID":
        statusCode = 400;
        break;
      case "ACCESS_FORBIDDEN":
        statusCode = 403;
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
    const uid = req?.user?.uid; // Extract the user's unique ID.
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

        if (note.sellerUid !== uid) {
          throw new Error("User does not have permission to delete note.",
            { cause: { code: "ACCESS_FORBIDDEN" } });
        } else if (note.status === Note.NoteStatus.DELETED) {
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

        // Emit empty note document with DELETED status as a "note:modified" event using socket.io.
        socketIo.to(`user_${uid}`).emit("note:modified", { _index: note._index, _id: note._id,
          status: Note.NoteStatus.DELETED });

        res.status(200).json({ status: "deleted" });
      }, { createTransaction: true });
  } catch (error) {
    // Set statusCode based on error code.
    let statusCode;
    switch (error?.cause?.code) {
      case "INVALID_ID":
        statusCode = 400;
        break;
      case "ACCESS_FORBIDDEN":
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

const listNote = async (req, res) => {
  let parsedParams;
  try {
    const uid = req?.user?.uid; // Extract the user's unique ID.
    parsedParams = await NoteValidator.parseNoteIdRequestParams(req.body);

    // Lock requests with the same id to run synchronously.
    await new QueueLockService(QueueLockService.ControllerQueue.noteControllerQueue).processJob({ id: parsedParams.id },
      async () => {
        // Get notes matching the _id.
        const notes = await Note.findManyByIds([parsedParams.id]);

        // Raise error if response contains no results.
        if (notes.length === 0) {
          throw new Error("Provided note id could not be found.",
            { cause: { code: "INVALID_ID" } });
        }

        const note = notes[0];

        if (note.sellerUid !== uid) {
          throw new Error("User does not have permission to update note.",
            { cause: { code: "ACCESS_FORBIDDEN" } });
        }

        if (note.status === Note.NoteStatus.LISTED) {
          await Note.updateOneById(note._id, { status: Note.NoteStatus.DELISTED }); // Delist document.
        } else if (note.status === Note.NoteStatus.DELISTED) {
          await Note.updateOneById(note._id, {status: Note.NoteStatus.LISTED}); // List document.
        } else {
          throw new Error("Current note status is not 'listed' or 'delisted'.",
            { cause: { code: "ACTION_UNAVAILABLE" } });
        }

        // Emit modified note document as a "note:modified" event using socket.io.
        await emitNoteModifiedSocketEvent(note._id, uid);

        res.status(200).json({ status: "updated" });
      });
  } catch (error) {
    // Set statusCode based on error code.
    let statusCode;
    switch (error?.cause?.code) {
      case "INVALID_ID":
        statusCode = 400;
        break;
      case "ACCESS_FORBIDDEN":
        statusCode = 403;
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
    const uid = req?.user?.uid; // Extract the user's unique ID.
    parsedParams = NoteValidator.parseViewNoteRequestParams(req.query);

    // Get note details matching the _id.
    const notes = await Note.findManyByIds([parsedParams.id]);

    // Raise error if response contains no results, else respond with the first note.
    if (notes.length === 0) {
      throw new Error("Provided note id could not be found.",
        { cause: { code: "INVALID_ID" } });
    }

    const note = (await batchSetNoteAttributes(notes, uid, false))[0];

    // If requested note is not sample, verify access.
    if (!parsedParams.sample) {
      if (!uid) {
        throw new Error("User does not have permission to view note.",
          { cause: { code: "ACCESS_FORBIDDEN" } });
      }

      if (!(note.isOwned || note.sellerUid === uid)) {
        throw new Error("User does not have permission to view note.",
          { cause: { code: "ACCESS_FORBIDDEN" } });
      }
    }

    // Get note.
    const response = await r2.send(new GetObjectCommand({
      Bucket: notesBucketName,
      Key: note.pdfFile + ".html"
    }));

    // Convert stream to buffer.
    const htmlStream = response.Body;
    const chunks = [];
    for await (const chunk of htmlStream) {
      chunks.push(chunk);
    }
    let htmlBuffer = Buffer.concat(chunks);

    // Convert to sample if requested.
    if (parsedParams.sample) {
      htmlBuffer = await NoteProcessingService.formatForSample(note.samplePdfProperties, htmlBuffer);
    }

    const encryptedHtmlData = await NoteProcessingService.encryptHtmlForViewing(htmlBuffer);

    // Set headers and cache for 31 days.
    const thirtyOneDaysInSeconds = 2678400;
    const expiryDate = new Date(Date.now() + thirtyOneDaysInSeconds * 1000);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Cache-Control", `public, max-age=${thirtyOneDaysInSeconds}`);
    res.setHeader("Expires", expiryDate.toUTCString());

    // Send encryptedHtmlData.
    res.status(200).send(encryptedHtmlData);
  } catch (error) {
    // Set statusCode based on error code.
    let statusCode;
    switch (error?.cause?.code) {
      case "INVALID_ID":
        statusCode = 400;
        break;
      case "ACCESS_FORBIDDEN":
        statusCode = 403;
        break;
      default:
        console.error(error);
        statusCode = 500;
    }
    res.status(statusCode).json({ code: error?.cause?.code || "UNKNOWN" }); // Send error message.
  }
}

module.exports = { getNote, getNotes, getSimilarNotes, getPurchasedNotes, getUserNotes, updateNote, downloadNote,
  viewNote, deleteNote, listNote, uploadNote, addNote };
