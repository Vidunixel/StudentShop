const express = require('express');
const router = express.Router();
const {authenticateUser, verifyEmailVerified, verifyAdminOrStaff, retrieveUser} = require("../../services/AuthenticationService");
const transactionController = require("../../controllers/admin-controllers/transaction-controller");

router.get("/", authenticateUser, verifyEmailVerified, verifyAdminOrStaff,
  (req, res) => {
  // If id is provided serve single transaction, else serve list of transactions.
  if (req.query.id) {
    transactionController.getTransaction(req, res);
  } else {
    transactionController.getTransactions(req, res);
  }
});
router.get("/user", authenticateUser, verifyEmailVerified, verifyAdminOrStaff, transactionController.getUserTransactions);
router.put("/sale/update", authenticateUser, verifyEmailVerified, verifyAdminOrStaff, transactionController.updateSaleTransaction);

module.exports = router;
