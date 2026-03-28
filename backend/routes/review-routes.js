const express = require('express');
const reviewController = require('../controllers/review-controller');
const { authenticateUser, retrieveUser } = require("../services/AuthenticationService");
const router = express.Router();

router.get("/item", retrieveUser, reviewController.getItemReviews);
router.get("/item/user", authenticateUser, reviewController.getItemUserReview);
router.post("/add", authenticateUser, reviewController.addReview);
router.put("/update", authenticateUser, reviewController.updateReview);
router.delete("/delete", authenticateUser, reviewController.deleteReview);

module.exports = router;
