"use strict";

module.exports = {
  name: "sessions",
  async findActive() { throw new Error("SESSION_REPOSITORY_NOT_IMPLEMENTED"); },
  async revoke() { throw new Error("SESSION_REPOSITORY_NOT_IMPLEMENTED"); }
};
