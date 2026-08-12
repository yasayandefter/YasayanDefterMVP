"use strict";

const learningProfile = require("../brain/learningProfile");
const teacherProfile = require("../brain/teacherProfile");
const db = require("../db");

async function progress(studentId, repositories) {
  const [records, activity] = await Promise.all([repositories.memory.getProgressSource(studentId), repositories.learningActivity.getMetrics(studentId)]);
  const memoryProfile = learningProfile.buildProfile(records);
  const totals = activity.totals || {};
  const level = learningProfile.calculateLevel(totals.totalXP);
  const profile = { ...memoryProfile, ...level, researchedTopics: Number(totals.researchedTopics || 0), completedQuizzes: Number(totals.completedQuizzes || 0) };
  profile.brainScore = learningProfile.calculateBrainScore(profile);
  return { profile: { ...profile, streak: activity.streak, weeklyGoal: activity.weeklyGoal }, recommendations: learningProfile.buildRecommendations(profile, records) };
}

async function teacherSummary(studentId, repositories) {
  const source = await progress(studentId, repositories);
  return teacherProfile.buildTeacherSummary(source.profile, source.recommendations);
}

async function classroomSummary(classroomId, repositories) {
  return repositories.classrooms.getSummarySourceData(classroomId);
}

async function saveResearch(studentId, input, repositories) {
  return db.withTransaction(async client => {
    const memory = await repositories.memory.upsertTopic({ ...input, studentId }, client);
    await repositories.learningActivity.recordResearch({ id: input.activityId, studentId, topic: input.topic }, client);
    return memory;
  });
}

module.exports = { progress, teacherSummary, classroomSummary, saveResearch };
