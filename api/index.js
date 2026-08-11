// The serverless entrypoint is a public, ephemeral deployment unless an
// authenticated access mode was explicitly selected by the operator.
if (!String(process.env.ACCESS_MODE || "").trim()) process.env.ACCESS_MODE = "public-demo";

const app = require("../server");

module.exports = app;
