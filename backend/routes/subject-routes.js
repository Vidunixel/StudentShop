const express = require('express');
const subjectController = require('../controllers/subject-controller');
const router = express.Router();

router.get("/", subjectController.getSubjects);

module.exports = router;
