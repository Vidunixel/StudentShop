const express = require('express');
const userController = require('../controllers/user-controller');
const router = express.Router();
const {authenticateUser, retrieveUser} = require("../services/AuthenticationService");

router.get("/", authenticateUser, userController.getUser);
router.get("/profiles", retrieveUser, userController.getProfile);
router.get("/profiles/sales", retrieveUser, userController.getProfilesBySales);
router.get("/username-status", userController.getUsernameStatus);
router.post("/add", authenticateUser, userController.addUser);
router.put("/update", authenticateUser, userController.updateUser);
router.put("/update/profile-photo", authenticateUser, userController.uploadProfilePic,
  userController.updateProfilePic);

module.exports = router;
