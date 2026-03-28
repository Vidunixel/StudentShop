const ReviewValidator = require("../validators/ReviewValidator");
const Purchase = require("../models/Purchase");
const Review = require("../models/Review");
const Note = require("../models/Note");
const QueueLockService = require("../services/QueueLockService");
const RatingCalculator = require("../services/RatingCalculator");

/************************************************************************************************
 * Controllers
 * **********************************************************************************************/

const getItemReviews = async (req, res) => {
  let parsedParams;
  try {
    const uid = req?.user?.uid; // Extract the user's unique ID.
    parsedParams = ReviewValidator.parseGetItemReviewsRequestParams(req.query);

    // Get id reference for the current state of the index if pitId is not already provided.
    if (!parsedParams.pitId) {
      parsedParams.pitId = await Review.getPointInTime();
    }

    const pageSize = 25;
    // Get reviews matching the item.
    let reviews = await Review.findManyByItemSearch(parsedParams.item,
      uid, parsedParams.sortBy, parsedParams.nextPage, parsedParams.pitId, pageSize,
      { user: true });
    const isLoadMoreEnabled = reviews.length === pageSize;

    // Filter out private review details for public or owner.
    reviews = reviews.map(review => {
      let filteredReview;
      if (!review.userUid || !uid || review.userUid !== uid) {
        filteredReview = Review.filterAttributesForPublic(review);
      } else {
        filteredReview = Review.filterAttributesForOwner(review);
      }
      return filteredReview;
    });

    // Add aiReview to the front of reviews array.
    let aiReviews = (await Review.findOneAiReviewByItem(parsedParams.item));
    if (aiReviews.length > 0) {
      reviews.unshift(aiReviews[0]);
    }

    res.status(200).json({ pitId: parsedParams.pitId, reviews: reviews, isLoadMoreEnabled });
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

const getItemUserReview = async (req, res) => {
  let parsedParams;
  try {
    const { uid } = req.user; // Extract the user's attributes.
    parsedParams = ReviewValidator.parseGetItemUserReviewRequestParams(req.query);

    // Get user review details matching the _index and _id.
    const reviews = await Review.findOneByItemAndUid(parsedParams.item, uid);

    let filteredReview;
    if (reviews.length > 0) {
      const review = reviews[0];
      filteredReview = Review.filterAttributesForOwner(review);
    }

    res.status(200).json({ review: filteredReview });
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

const addReview = async (req, res) => {
  let parsedParams;
  try {
    const { uid } = req.user; // Extract the user's attributes.
    parsedParams = ReviewValidator.parseAddReviewRequestParams(req.body);
    parsedParams.userUid = uid;

    // Lock requests with the same uid and item._id to run synchronously.
    await new QueueLockService(QueueLockService.ControllerQueue.reviewControllerQueue).processJob(
      { uidAndItemId: `${uid}:${parsedParams.item._id}` }, async (session) => {
        // Check if a review has already been written by this user.
        const reviewsByUserUid = await Review.findOneByItemAndUid(parsedParams.item, uid, session);
        if (reviewsByUserUid.length > 0) {
          throw new Error("Review by user already exists.",
            {cause: {code: "REVIEW_ALREADY_EXISTS"}});
        }

        let purchases;
        switch (parsedParams.item._index) {
          case (Note.indexName):
            // Lock requests with the same item id to run synchronously.
            await new QueueLockService(QueueLockService.ControllerQueue.noteControllerQueue).processJob({ id: parsedParams.item._id },
              async () => {
                // Check if item has been purchased by the user.
                purchases = await Purchase.findManyByItems([parsedParams.item], uid, undefined, session);
                if (purchases.length === 0) {
                  throw new Error("User has not purchased this item.",
                    {cause: {code: "ACCESS_FORBIDDEN"}});
                }

                const notes = await Note.findManyByIds([parsedParams.item._id], session);

                if (notes.length === 0) {
                  throw new Error("Note id does not exist.",
                    {cause: {code: "INVALID_PARAMETERS"}});
                }

                const note = notes[0];

                // Increase the rating and ratingCount on item.
                await Note.updateOneById(note._id,
                  RatingCalculator.addRating(parsedParams.rating, note.ratingCount), session);
              });
            break;
          default:
            throw new Error("Item index does not exist.",
              {cause: {code: "INVALID_PARAMETERS"}});
        }

        // Create and save review.
        const reviewDoc = new Review(parsedParams);
        const review = await reviewDoc.save(session);

        // Send saved review.
        res.status(200).json({ review: Review.filterAttributesForOwner(review) });
      }, { createTransaction: true });
  } catch (error) {
    // Set statusCode based on error code.
    let statusCode;
    switch (error?.cause?.code) {
      case "INVALID_PARAMETERS":
        statusCode = 400;
        break;
      case "ACCESS_FORBIDDEN":
        statusCode = 403;
        break;
      case "REVIEW_ALREADY_EXISTS":
        statusCode = 409;
        break;
      default:
        console.error(error);
        statusCode = 500;
    }
    res.status(statusCode).json({ code: error?.cause?.code || "UNKNOWN" }); // Send error message.
  }
}

const updateReview = async (req, res) => {
  let parsedParams;
  try {
    const { uid } = req.user; // Extract the user's attributes.
    parsedParams = ReviewValidator.parseUpdateReviewRequestParams(req.body);
    parsedParams.userUid = uid;

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

        if (review.userUid !== uid) {
          throw new Error("User does not have permission to update review.",
            { cause: { code: "ACCESS_FORBIDDEN" } });
        }

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

                // Only update note doc if rating is provided and is not equal to the user's current rating.
                if (parsedParams?.fields?.rating && parsedParams.fields.rating !== review.rating) {
                  // Update the rating and ratingCount on item.
                  await Note.updateOneById(note._id,
                    RatingCalculator.updateRating(parsedParams.fields.rating, review.rating, note.ratingCount),
                    session);
                }
              });
            break;
          default:
            throw new Error("Item index does not exist.");
        }

        await Review.updateOneById(review._id, parsedParams.fields, session); // Update review.
        res.status(200).json({ status: "updated" });
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

const deleteReview = async (req, res) => {
  let parsedParams;
  try {
    const { uid } = req.user; // Extract the user's attributes.
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

        if (review.userUid !== uid) {
          throw new Error("User does not have permission to delete review.",
            { cause: { code: "ACCESS_FORBIDDEN" } });
        }

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

module.exports = { getItemReviews, getItemUserReview, addReview, updateReview, deleteReview }
