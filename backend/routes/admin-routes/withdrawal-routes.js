const express = require('express');
const router = express.Router();
const {authenticateUser, verifyEmailVerified, verifyAdminOrStaff, retrieveUser} = require("../../services/AuthenticationService");
const withdrawalController = require("../../controllers/admin-controllers/withdrawal-controller");

router.get("/", authenticateUser, verifyEmailVerified, verifyAdminOrStaff,
  (req, res) => {
  // If id is provided serve single withdrawal, else serve list of withdrawals.
  if (req.query.id) {
    withdrawalController.getWithdrawal(req, res);
  } else {
    withdrawalController.getWithdrawals(req, res);
  }
});
router.put("/update", authenticateUser, verifyEmailVerified, verifyAdminOrStaff, withdrawalController.updateWithdrawal);

module.exports = router;
