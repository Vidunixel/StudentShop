const express = require('express');
const schoolController = require('../controllers/school-controller');
const router = express.Router();

router.get("/", schoolController.getSchools);

module.exports = router;
