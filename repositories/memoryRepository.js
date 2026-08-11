"use strict";

module.exports = {
  name: "memory",
  async findByTopic() { throw new Error("MEMORY_REPOSITORY_NOT_IMPLEMENTED"); },
  async upsert() { throw new Error("MEMORY_REPOSITORY_NOT_IMPLEMENTED"); }
};
