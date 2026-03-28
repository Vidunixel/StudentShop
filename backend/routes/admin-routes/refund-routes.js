const express = require('express');
const router = express.Router();
const {authenticateUser, verifyEmailVerified, verifyAdminOrStaff, retrieveUser} = require("../../services/AuthenticationService");
const refundController = require("../../controllers/admin-controllers/refund-controller");

router.get("/", authenticateUser, verifyEmailVerified, verifyAdminOrStaff,
  (req, res) => {
  // If id is provided serve single purchase, else serve list of purchases.
  if (req.query.id) {
    refundController.getRefund(req, res);
  } else {
    refundController.getRefunds(req, res);
  }
});
router.put("/update", authenticateUser, verifyEmailVerified, verifyAdminOrStaff, refundController.updateRefund);

module.exports = router;
