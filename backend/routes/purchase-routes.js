const express = require('express');
const purchaseController = require('../controllers/purchase-controller');
const router = express.Router();
const {authenticateUser, verifyEmailVerified} = require("../services/AuthenticationService");

// Run purchaseController.addPurchase on /create if order is free, else run on /capture.
router.post("/create", authenticateUser, verifyEmailVerified, purchaseController.createPurchase, purchaseController.addPurchase);
router.post("/capture", authenticateUser, verifyEmailVerified, purchaseController.capturePurchase, purchaseController.addPurchase);

router.get("/user", authenticateUser, purchaseController.getUserPurchases);
router.post("/refund", authenticateUser, purchaseController.refundPurchase);

module.exports = router;
