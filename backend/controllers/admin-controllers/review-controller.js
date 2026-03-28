const ReviewValidator = require("../../validators/ReviewValidator");
const Review = require("../../models/Review");
const QueueLockService = require("../../services/QueueLockService");
const RatingCalculator = require("../../services/RatingCalculator");
const Note = require("../../models/Note");

const getReviews = async (req, res) => {
  let parsedParams;
  try {
    const { accountType } = req.user; // Extract the user's accountType (ADMIN or STAFF).
    parsedParams = ReviewValidator.parseGetReviewsAdminRequestParams(req.query);

    // Get id reference for the current state of the index if pitId is not already provided.
    if (!parsedParams.pitId) {
      parsedParams.pitId = await Review.getPointInTime();
    }

    const pageSize = 50;
    // Fetch existing reviews.
    const reviews = await Review.findManyByQueryAdminSearch(parsedParams.searchQuery, parsedParams.filters,
      parsedParams.sortBy, parsedParams.nextPage, parsedParams.pitId, pageSize,
      { all: true });
    const isLoadMoreEnabled = reviews.length === pageSize;

    res.status(200).json({ pitId: parsedParams.pitId, reviews, isLoadMoreEnabled: isLoadMoreEnabled });
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

const getItemReviews = async (req, res) => {
  let parsedParams;
  try {
    const { accountType } = req.user; // Extract the user's accountType (ADMIN or STAFF).
    parsedParams = ReviewValidator.parseGetItemReviewsAdminRequestParams(req.query);

    // Get id reference for the current state of the index if pitId is not already provided.
    if (!parsedParams.pitId) {
      parsedParams.pitId = await Review.getPointInTime();
    }

    const pageSize = 50;
    // Get reviews matching the item.
    let reviews = await Review.findManyByItemSearch(parsedParams.item,
      undefined, parsedParams.sortBy, parsedParams.nextPage, parsedParams.pitId, pageSize,
      { user: true });
    const isLoadMoreEnabled = reviews.length === pageSize;

    // Add aiReview to the front of reviews array.
    let aiReviews = (await Review.findOneAiReviewByItem(parsedParams.item));
    if (aiReviews.length > 0) {
      reviews.unshift(aiReviews[0]);
    }

    res.status(200).json({ pitId: parsedParams.pitId, reviews: reviews, isLoadMoreEnabled: isLoadMoreEnabled });
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

const getReview = async (req, res) => {
  let parsedParams;
  try {
    const { accountType } = req.user; // Extract the user's accountType (ADMIN or STAFF).
    parsedParams = ReviewValidator.parseReviewIdRequestParams(req.query);

    // Get review.
    const reviews = await Review.findManyByIds([parsedParams.id], undefined,
      { all: true });

    // Throw error if user doesn't exist.
    if (reviews.length === 0) {
      throw new Error("Provided id could not be found.",
        {cause: {code: "INVALID_ID"}});
    }

    const review = reviews[0];

    // Send review.
    res.status(200).json({ review });
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

const deleteReview = async (req, res) => {
  let parsedParams;
  try {
    const { accountType } = req.user; // Extract the user's accountType (ADMIN or STAFF).
    parsedParams = ReviewValidator.parseReviewIdRequestParams(req.query);

    // Lock requests with the same id to run synchronously.
    await new QueueLockService(QueueLockService.ControllerQueue.reviewControllerQueue).processJob({ id: parsedParams.id },
      async (session) => {
        // Get reviews matching the _id.
        const reviews = await Review.findManyByIds([parsedParams.id], session);

        // Raise error if response contains no results.
        if (reviews.length === 0) {
          throw new Error("Provided review could not be found.",
            { cause: { code: "INVALID_ID" } });
        }

        const review = reviews[0];

        switch (review.item._index) {
          case (Note.indexName):
            // Lock requests with the same item id to run synchronously.
            await new QueueLockService(QueueLockService.ControllerQueue.noteControllerQueue).processJob({ id: review.item._id },
              async () => {
                const notes = await Note.findManyByIds([review.item._id], session);

                if (notes.length === 0) {
                  throw new Error("Note id does not exist.");
                }

                const note = notes[0];

                // Update the rating and ratingCount on item.
                await Note.updateOneById(note._id,
                  RatingCalculator.deleteRating(review.rating, note.ratingCount), session);
              });
            break;
          default:
            throw new Error("Item index does not exist.");
        }

        await Review.deleteOneById(review._id, session); // Delete document.
        res.status(200).json({ status: "deleted" });
      }, { createTransaction: true });
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

module.exports = { getReviews, getItemReviews, getReview, deleteReview }