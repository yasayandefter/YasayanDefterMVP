"use strict";

module.exports = {
  name: "students",
  // Phase 1 interface only. JSON and PostgreSQL implementations arrive in later phases.
  async findById() { throw new Error("STUDENT_REPOSITORY_NOT_IMPLEMENTED"); },
  async listForClassroom() { throw new Error("STUDENT_REPOSITORY_NOT_IMPLEMENTED"); }
};
