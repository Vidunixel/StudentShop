const express = require('express');
const transactionController = require('../controllers/transaction-controller');
const router = express.Router();
const {authenticateUser, retrieveUser} = require("../services/AuthenticationService");

router.get("/user", authenticateUser, transactionController.getUserTransactions);

module.exports = router;
