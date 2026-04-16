const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

exports.health = onRequest((request, response) => {
  logger.info("Functions health check", { structuredData: true });
  response.status(200).send("Royal Fitness Functions OK");
});
