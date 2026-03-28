const mongoose = require("mongoose");
const {Client} = require("@elastic/elasticsearch");
const {readFileSync} = require("node:fs");

const Environment = {
  PRODUCTION: "production",
  SANDBOX: "sandbox",
}

// Export ElasticSearch client.
const client = new Client({
  node: "https://localhost:9200",
  auth: {
    username: process.env.ELASTIC_USER,
    password: process.env.ELASTIC_PASSWORD
  },
  tls: {
    ca: readFileSync(process.env.ELASTIC_CA_PATH),
    rejectUnauthorized: true
  }
});

// Export mongooseToJson conversion function.
const mongooseToJson = (documents) => {
  for (let i = 0; i < documents.length; i++) {
    // If document was fetched without lean(), convert to standard object.
    if (documents[i] instanceof mongoose.Document) {
      documents[i] = documents[i].toObject();
    }
  }
  // Stringify and convert back to JSON to concert ObjectId's to strings.
  documents = JSON.parse(JSON.stringify(documents));
  return documents;
}

// Export elasticSearchToJson conversion function.
const elasticSearchToJson = (response) => {
  return response.hits.hits.map((hit) => ({
    _index: hit._index,
    _id: hit._id,
    _score: hit._score,
    sort: hit.sort,
    ...hit._source,
    dateCreated: new Date(hit._source.dateCreated),
    dateUpdated: new Date(hit._source.dateUpdated)
  }));
}

module.exports = { client, mongooseToJson, elasticSearchToJson, Environment }