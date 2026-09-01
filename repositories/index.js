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
    learningActivity: require("./learningActivityRepository"),
    quiz: require("./quizRepository"),
    sessions: require("./sessionRepository"),
    claims: require("./claimRepository"),
    workspacePreferences: require("./workspacePreferencesRepository"),
    noteFilterPresets: require("./noteFilterPresetsRepository"),
    smartCollections: require("./smartCollectionsRepository"),
    mediaAssets: require("./mediaAssetsRepository"),
    intelligenceFeedback: require("./intelligenceFeedbackRepository"),
    homeIntelligence: require("./homeIntelligenceRepository")
  };
}

function jsonRepositories() {
  return { mode: "json", users: null, students: null, classrooms: null, memberships: null, memory: null, learningActivity: null, quiz: null, sessions: null, claims: null, workspacePreferences: null, noteFilterPresets: null, smartCollections: null, mediaAssets: null, intelligenceFeedback: null, homeIntelligence: null };
}

function getRepositories(env = process.env) { return getConfig(env).storageMode === "postgres" ? postgresRepositories() : jsonRepositories(); }

module.exports = { getRepositories, postgresRepositories, jsonRepositories };
