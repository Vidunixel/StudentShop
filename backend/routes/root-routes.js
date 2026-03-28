const express = require('express');
const sitemapController = require('../controllers/sitemap-controller');
const router = express.Router();

router.get("/sitemap.xml", sitemapController.getSitemapIndex);
router.get("/root-sitemap.xml", sitemapController.getRootSitemap);
router.get("/notes/sitemap.xml", sitemapController.getNotesSitemap);
router.get("/users/sitemap.xml", sitemapController.getUsersSitemap);

module.exports = router;
