const express = require('express');
const router = express.Router();
const {authenticateUser, verifyEmailVerified, verifyAdminOrStaff, retrieveUser} = require("../../services/AuthenticationService");
const reviewController = require("../../controllers/admin-controllers/review-controller");

router.get("/", authenticateUser, verifyEmailVerified, verifyAdminOrStaff, (req, res) => {
  // If id is provided serve single review, else serve list of reviews.
  if (req.query.id) {
    reviewController.getReview(req, res);
  } else {
    reviewController.getReviews(req, res);
  }
});
router.get("/item", authenticateUser, verifyEmailVerified, verifyAdminOrStaff, reviewController.getItemReviews);
router.delete("/delete", authenticateUser, reviewController.deleteReview);

module.exports = router;
