"use strict";

const { getConfig } = require("../db/config");

function postgresRepositories() {
  return {
    mode: "postgres",
    users: require("./usersRepository"),
    students: require("./studentsRepository"),
    classrooms: require("./classroomsRepository"),
    memberships: require("./membershipRepository"),
    memory: require("./memoryRepository"),
    quiz: require("./quizRepository"),
    sessions: require("./sessionRepository"),
    claims: require("./claimRepository")
  };
}

function jsonRepositories() {
  return { mode: "json", users: null, students: null, classrooms: null, memberships: null, memory: null, quiz: null, sessions: null, claims: null };
}

function getRepositories(env = process.env) { return getConfig(env).storageMode === "postgres" ? postgresRepositories() : jsonRepositories(); }

module.exports = { getRepositories, postgresRepositories, jsonRepositories };
