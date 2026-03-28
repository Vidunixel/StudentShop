const express = require('express');
const router = express.Router();
const {authenticateUser, verifyEmailVerified, verifyAdminOrStaff, retrieveUser} = require("../../services/AuthenticationService");
const noteController = require("../../controllers/admin-controllers/note-controller");

router.get("/", authenticateUser, verifyEmailVerified, verifyAdminOrStaff,
  (req, res) => {
  // If id is provided serve single note, else serve list of notes.
  if (req.query.id) {
    noteController.getNote(req, res);
  } else {
    noteController.getNotes(req, res);
  }
});
router.get("/view", authenticateUser, verifyEmailVerified, verifyAdminOrStaff, noteController.viewNote);
router.put("/update", authenticateUser, verifyEmailVerified, verifyAdminOrStaff, noteController.updateNote);
router.delete("/delete", authenticateUser, verifyEmailVerified, verifyAdminOrStaff, noteController.deleteNote);

module.exports = router;
