const express = require('express');
const withdrawalController = require('../controllers/withdrawal-controller');
const router = express.Router();
const {authenticateUser, retrieveUser} = require("../services/AuthenticationService");

router.post("/withdraw", authenticateUser, withdrawalController.withdrawBalance);

module.exports = router;
