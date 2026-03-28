const express = require('express');
const schoolController = require('../../controllers/admin-controllers/school-controller');
const router = express.Router();
const { authenticateUser, verifyEmailVerified, retrieveUser, verifyAdminOrStaff} = require("../../services/AuthenticationService");

router.get("/", authenticateUser, verifyEmailVerified, verifyAdminOrStaff, (req, res) => {
  // If id is provided serve single review, else serve list of reviews.
  if (req.query.id) {
    schoolController.getSchool(req, res);
  } else {
    schoolController.getSchools(req, res);
  }
});
router.put("/update", authenticateUser, verifyEmailVerified, verifyAdminOrStaff,
  schoolController.uploadJson, schoolController.updateSchools);

module.exports = router;
