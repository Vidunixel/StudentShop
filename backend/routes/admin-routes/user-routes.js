const express = require('express');
const router = express.Router();
const {authenticateUser, verifyEmailVerified, verifyAdminOrStaff, retrieveUser} = require("../../services/AuthenticationService");
const userController = require("../../controllers/admin-controllers/user-controller");

router.get("/", authenticateUser, verifyEmailVerified, verifyAdminOrStaff,
  (req, res) => {
  // If uid is provided serve single user, else serve list of users.
  if (req.query.uid) {
    userController.getUser(req, res);
  } else {
    userController.getUsers(req, res);
  }
});
router.put("/update", authenticateUser, verifyEmailVerified, verifyAdminOrStaff, userController.updateUser);

module.exports = router;
