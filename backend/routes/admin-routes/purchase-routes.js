const express = require('express');
const router = express.Router();
const {authenticateUser, verifyEmailVerified, verifyAdminOrStaff, retrieveUser} = require("../../services/AuthenticationService");
const purchaseController = require("../../controllers/admin-controllers/purchase-controller");

router.get("/", authenticateUser, verifyEmailVerified, verifyAdminOrStaff,
  (req, res) => {
  // If id is provided serve single purchase, else serve list of purchases.
  if (req.query.id) {
    purchaseController.getPurchase(req, res);
  } else {
    purchaseController.getPurchases(req, res);
  }
});
router.get("/user", authenticateUser, verifyEmailVerified, verifyAdminOrStaff, purchaseController.getUserPurchases);

module.exports = router;
