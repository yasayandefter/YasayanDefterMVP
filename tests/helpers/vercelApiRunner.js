"use strict";

const app = require("../../api/index");
const server = app.listen(Number(process.env.PORT), "127.0.0.1", () => {
  if (process.send) process.send({ ready: true });
});

process.on("SIGTERM", () => server.close());
process.on("message", message => {
  if (message === "close") server.close(() => { if (process.connected) process.disconnect(); });
});
