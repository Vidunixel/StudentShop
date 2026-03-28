const express = require('express');
const noteController = require('../controllers/note-controller');
const router = express.Router();
const { authenticateUser, verifyEmailVerified, retrieveUser } = require("../services/AuthenticationService");
const multer = require("multer");
const path = require('path');

router.get("/", retrieveUser, (req, res) => {
  // If id is provided serve single note, else serve list of notes.
  if (req.query.id) {
    noteController.getNote(req, res);
  } else {
    noteController.getNotes(req, res);
  }
});

router.get("/similar", retrieveUser, noteController.getSimilarNotes);
router.get("/purchased", authenticateUser, noteController.getPurchasedNotes);
router.get("/user", retrieveUser, noteController.getUserNotes);
router.put("/update", authenticateUser, noteController.updateNote);
router.get("/download", authenticateUser, noteController.downloadNote);
router.get("/view", retrieveUser, noteController.viewNote);
router.delete("/delete", authenticateUser, noteController.deleteNote);
router.put("/list", authenticateUser, noteController.listNote);
router.post("/add", authenticateUser, verifyEmailVerified, noteController.uploadNote, noteController.addNote);

module.exports = router;
