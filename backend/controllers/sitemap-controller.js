/************************************************************************************************
 * Controllers
 * **********************************************************************************************/
const Note = require("../models/Note");
const User = require("../models/User");

const getSitemapIndex = async (req, res) => {
  try {
    const hostname = "https://studentshop.com.au";
    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>
        <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <sitemap>
            <loc>${hostname}/root-sitemap.xml</loc>
            <lastmod>2025-12-11</lastmod>
          </sitemap>
          <sitemap>
            <loc>${hostname}/notes/sitemap.xml</loc>
            <lastmod>2025-12-11</lastmod>
          </sitemap>
          <sitemap>
            <loc>${hostname}/users/sitemap.xml</loc>
            <lastmod>2025-12-11</lastmod>
          </sitemap>
        </sitemapindex>`;

    // Send xml.
    res.type("application/xml").send(xml);
  } catch (error) {
    // Set statusCode based on error code.
    let statusCode;
    switch (error?.cause?.code) {
      default:
        console.error(error);
        statusCode = 500;
    }
    res.status(statusCode).json({ code: error?.cause?.code || "UNKNOWN" }); // Send error message.
  }
}

const getRootSitemap = async (req, res) => {
  try {
    const hostname = "https://studentshop.com.au";
    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url>
            <loc>${hostname}</loc>
            <lastmod>2025-12-11</lastmod>
          </url>
          <url>
            <loc>${hostname}/notes</loc>
            <lastmod>2025-12-11</lastmod>
          </url>
          <url>
            <loc>${hostname}/collection</loc>
            <lastmod>2025-12-11</lastmod>
          </url>
          <url>
            <loc>${hostname}/help</loc>
            <lastmod>2025-12-11</lastmod>
          </url>
          <url>
            <loc>${hostname}/refund-policy</loc>
            <lastmod>2025-12-11</lastmod>
          </url>
          <url>
            <loc>${hostname}/terms-of-service</loc>
            <lastmod>2025-12-11</lastmod>
          </url>
          <url>
            <loc>${hostname}/privacy-policy</loc>
            <lastmod>2025-12-11</lastmod>
          </url>
          <url>
            <loc>${hostname}/account/profile</loc>
            <lastmod>2025-12-11</lastmod>
          </url>
          <url>
            <loc>${hostname}/account/earnings</loc>
            <lastmod>2025-12-11</lastmod>
          </url>
          <url>
            <loc>${hostname}/account/purchases</loc>
            <lastmod>2025-12-11</lastmod>
          </url>
          <url>
            <loc>${hostname}/account/listings</loc>
            <lastmod>2025-12-11</lastmod>
          </url>
          <url>
            <loc>${hostname}/sell</loc>
            <lastmod>2025-12-19</lastmod>
          </url>
          <url>
            <loc>${hostname}/sell/vce</loc>
            <lastmod>2025-12-19</lastmod>
          </url>
          <url>
            <loc>${hostname}/sell/hsc</loc>
            <lastmod>2025-12-19</lastmod>
          </url>
          <url>
            <loc>${hostname}/sell/wace</loc>
            <lastmod>2025-12-19</lastmod>
          </url>
          <url>
            <loc>${hostname}/sell/qce</loc>
            <lastmod>2025-12-19</lastmod>
          </url>
          <url>
            <loc>${hostname}/sell/sace</loc>
            <lastmod>2025-12-19</lastmod>
          </url>
          <url>
            <loc>${hostname}/sell/tce</loc>
            <lastmod>2025-12-19</lastmod>
          </url>
          <url>
            <loc>${hostname}/buy</loc>
            <lastmod>2025-12-19</lastmod>
          </url>
          <url>
            <loc>${hostname}/buy/vce</loc>
            <lastmod>2025-12-19</lastmod>
          </url>
          <url>
            <loc>${hostname}/buy/hsc</loc>
            <lastmod>2025-12-19</lastmod>
          </url>
          <url>
            <loc>${hostname}/buy/wace</loc>
            <lastmod>2025-12-19</lastmod>
          </url>
          <url>
            <loc>${hostname}/buy/qce</loc>
            <lastmod>2025-12-19</lastmod>
          </url>
          <url>
            <loc>${hostname}/buy/sace</loc>
            <lastmod>2025-12-19</lastmod>
          </url>
          <url>
            <loc>${hostname}/buy/tce</loc>
            <lastmod>2025-12-19</lastmod>
          </url>
        </urlset>`;

    // Send xml.
    res.type("application/xml").send(xml);
  } catch (error) {
    // Set statusCode based on error code.
    let statusCode;
    switch (error?.cause?.code) {
      default:
        console.error(error);
        statusCode = 500;
    }
    res.status(statusCode).json({ code: error?.cause?.code || "UNKNOWN" }); // Send error message.
  }
}

const getNotesSitemap = async (req, res) => {
  try {
    const url = "https://studentshop.com.au/notes";
    const notes = await Note.findMany(Note.NoteStatus.LISTED);

    const urls = notes.map(note => {
      const id = encodeURIComponent(String(note._id));
      const lastModified = note.dateUpdated ? new Date(note.dateUpdated).toISOString() :
        undefined;

      return `
        <url>
          <loc>${url}/${id}</loc>
          ${ lastModified ? `<lastmod>${ lastModified }</lastmod>` : ""}
        </url>
      `;
    }).join("");

    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          ${urls}
        </urlset>`;

    // Send xml.
    res.type("application/xml").send(xml);
  } catch (error) {
    // Set statusCode based on error code.
    let statusCode;
    switch (error?.cause?.code) {
      default:
        console.error(error);
        statusCode = 500;
    }
    res.status(statusCode).json({ code: error?.cause?.code || "UNKNOWN" }); // Send error message.
  }
}

const getUsersSitemap = async (req, res) => {
  try {
    const url = "https://studentshop.com.au/users";
    const users = await User.findMany();

    const urls = users.map(user => {
      const username = encodeURIComponent(String(user.username));
      const lastModified = user.dateUpdated ? new Date(user.dateUpdated).toISOString() :
        undefined;

      return `
        <url>
          <loc>${url}/${username}</loc>
          ${ lastModified ? `<lastmod>${ lastModified }</lastmod>` : ""}
        </url>
      `;
    }).join("");

    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          ${urls}
        </urlset>`;

    // Send xml.
    res.type("application/xml").send(xml);
  } catch (error) {
    // Set statusCode based on error code.
    let statusCode;
    switch (error?.cause?.code) {
      default:
        console.error(error);
        statusCode = 500;
    }
    res.status(statusCode).json({ code: error?.cause?.code || "UNKNOWN" }); // Send error message.
  }
}

module.exports = { getSitemapIndex, getRootSitemap, getNotesSitemap, getUsersSitemap };