"use strict";

const learningProfile = require("../brain/learningProfile");
const teacherProfile = require("../brain/teacherProfile");

async function progress(studentId, repositories) {
  const records = await repositories.memory.getProgressSource(studentId);
  const profile = learningProfile.buildProfile(records);
  return { profile, recommendations: learningProfile.buildRecommendations(profile, records) };
}

async function teacherSummary(studentId, repositories) {
  const source = await progress(studentId, repositories);
  return teacherProfile.buildTeacherSummary(source.profile, source.recommendations);
}

async function classroomSummary(classroomId, repositories) {
  return repositories.classrooms.getSummarySourceData(classroomId);
}

async function saveResearch(studentId, input, repositories) {
  return repositories.memory.upsertTopic({ ...input, studentId });
}

module.exports = { progress, teacherSummary, classroomSummary, saveResearch };
