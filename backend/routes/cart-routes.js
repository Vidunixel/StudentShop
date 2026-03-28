const express = require('express');
const cartController = require('../controllers/cart-controller');
const router = express.Router();
const {authenticateUser, retrieveUser} = require("../services/AuthenticationService");

router.get("/", authenticateUser, cartController.getCart);
router.put("/update", authenticateUser, cartController.updateCart);

module.exports = router;
