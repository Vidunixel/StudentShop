const express = require('express');
const subjectController = require('../../controllers/admin-controllers/subject-controller');
const router = express.Router();
const { authenticateUser, verifyEmailVerified, retrieveUser, verifyAdminOrStaff} = require("../../services/AuthenticationService");

router.get("/", authenticateUser, verifyEmailVerified, verifyAdminOrStaff, (req, res) => {
  // If id is provided serve single review, else serve list of reviews.
  if (req.query.id) {
    subjectController.getSubject(req, res);
  } else {
    subjectController.getSubjects(req, res);
  }
});
router.post("/add", authenticateUser, verifyEmailVerified, verifyAdminOrStaff, subjectController.addSubject);
router.delete("/delete", authenticateUser, verifyEmailVerified, verifyAdminOrStaff, subjectController.deleteSubject);
router.put("/update", authenticateUser, verifyEmailVerified, verifyAdminOrStaff, subjectController.updateSubject);

module.exports = router;
