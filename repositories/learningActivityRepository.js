"use strict";

const crypto = require("node:crypto");
const db = require("../db");
const { mapDatabaseError } = require("./errors");

const TIME_ZONE = "Europe/Istanbul";
const WEEKLY_TARGET = 5;

function owner(value) {
  return value && typeof value === "object" && value.kind === "user"
    ? { column: "owner_user_id", id: value.id, studentId: null, userId: value.id }
    : { column: "student_id", id: value, studentId: value, userId: null };
}

function requestId(value) {
  const id = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id : crypto.randomUUID();
}

async function recordResearch({ id, studentId, topic, completedAt }, client = db) {
  const scope = owner(studentId);
  try {
    const result = await client.query("INSERT INTO research_activity_events (id, student_id, owner_user_id, topic, completed_at) VALUES ($1,$2,$3,$4,COALESCE($5::timestamptz,NOW())) ON CONFLICT (id) DO NOTHING RETURNING id, completed_at", [requestId(id), scope.studentId, scope.userId, String(topic || "").slice(0, 240), completedAt || null]);
    return { recorded: result.rowCount === 1, id: result.rows[0]?.id || null };
  } catch (error) { throw mapDatabaseError(error, "LEARNING_ACTIVITY_WRITE_FAILED"); }
}

async function getMetrics(studentId, now = null, client = db) {
  const scope = owner(studentId);
  const researchWhere = scope.userId ? "owner_user_id = $1" : "student_id = $1";
  const quizWhere = scope.userId ? "owner_user_id = $1" : "student_id = $1";
  try {
    const result = await client.query(`
      WITH bounds AS (
        SELECT (COALESCE($2::timestamptz, NOW()) AT TIME ZONE '${TIME_ZONE}')::date AS today,
               date_trunc('week', COALESCE($2::timestamptz, NOW()) AT TIME ZONE '${TIME_ZONE}')::date AS week_start,
               COALESCE($2::timestamptz, NOW()) AS metric_now
      ), activity_days AS (
        SELECT DISTINCT (completed_at AT TIME ZONE '${TIME_ZONE}')::date AS activity_date
        FROM research_activity_events, bounds WHERE ${researchWhere} AND completed_at <= bounds.metric_now
        UNION
        SELECT DISTINCT (completed_at AT TIME ZONE '${TIME_ZONE}')::date AS activity_date
        FROM quiz_attempts, bounds WHERE ${quizWhere} AND status = 'COMPLETED' AND completed_at IS NOT NULL AND completed_at <= bounds.metric_now
      ), anchor AS (
        SELECT CASE WHEN EXISTS (SELECT 1 FROM activity_days, bounds WHERE activity_date = today) THEN today
                    WHEN EXISTS (SELECT 1 FROM activity_days, bounds WHERE activity_date = today - 1) THEN today - 1 END AS anchor_date
        FROM bounds
      ), ranked AS (
        SELECT activity_date, row_number() OVER (ORDER BY activity_date DESC) AS position
        FROM activity_days, anchor WHERE anchor_date IS NOT NULL AND activity_date <= anchor_date
      )
      SELECT COALESCE((SELECT count(*) FROM ranked, anchor WHERE activity_date = anchor_date - (position::int - 1)), 0)::int AS current_streak,
             EXISTS (SELECT 1 FROM activity_days, bounds WHERE activity_date = today) AS active_today,
             (SELECT max(activity_date)::text FROM activity_days) AS last_active_date,
             (SELECT count(*)::int FROM research_activity_events, bounds WHERE ${researchWhere} AND completed_at >= week_start AT TIME ZONE '${TIME_ZONE}' AND completed_at <= bounds.metric_now) AS weekly_completed,
             (SELECT count(*)::int FROM research_activity_events, bounds WHERE ${researchWhere} AND completed_at <= bounds.metric_now) AS research_total,
             (SELECT count(*)::int FROM quiz_attempts, bounds WHERE ${quizWhere} AND status = 'COMPLETED' AND completed_at IS NOT NULL AND completed_at <= bounds.metric_now) AS completed_quizzes,
             (SELECT COALESCE(sum(amount),0)::int FROM xp_events WHERE ${quizWhere}) AS quiz_xp,
             (SELECT week_start::text FROM bounds) AS week_start,
             (SELECT (week_start + 7)::text FROM bounds) AS week_end
    `, [scope.id, now === null || now === undefined ? null : (now instanceof Date ? now.toISOString() : new Date(now).toISOString())]);
    const row = result.rows[0] || {};
    const completed = Number(row.weekly_completed || 0);
    return {
      streak: { current: Number(row.current_streak || 0), activeToday: Boolean(row.active_today), lastActiveDate: row.last_active_date || null },
      weeklyGoal: { target: WEEKLY_TARGET, completed, remaining: Math.max(0, WEEKLY_TARGET - completed), achieved: completed >= WEEKLY_TARGET, weekStart: row.week_start, weekEnd: row.week_end },
      totals: { researchedTopics: Number(row.research_total || 0), completedQuizzes: Number(row.completed_quizzes || 0), totalXP: Number(row.research_total || 0) * 10 + Number(row.quiz_xp || 0) }
    };
  } catch (error) { throw mapDatabaseError(error, "LEARNING_ACTIVITY_READ_FAILED"); }
}

module.exports = { name: "learningActivity", TIME_ZONE, WEEKLY_TARGET, owner, requestId, recordResearch, getMetrics };
