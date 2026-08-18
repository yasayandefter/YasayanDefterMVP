"use strict";

const db = require("../db");
const workspace = require("../auth/workspace");

async function findByUserId(userId, client = db) {
  const result = await client.query("SELECT selected_areas, primary_area, onboarding_completed FROM user_workspace_preferences WHERE user_id = $1", [userId]);
  if (!result.rows[0]) return null;
  const row = result.rows[0];
  return workspace.fromStorage({ selectedAreas: row.selected_areas, primaryArea: row.primary_area, onboardingCompleted: row.onboarding_completed });
}

async function upsert(userId, value, client = db) {
  const normalized = workspace.normalize(value);
  const result = await client.query("INSERT INTO user_workspace_preferences (user_id, selected_areas, primary_area, onboarding_completed) VALUES ($1, $2::text[], $3, $4) ON CONFLICT (user_id) DO UPDATE SET selected_areas = EXCLUDED.selected_areas, primary_area = EXCLUDED.primary_area, onboarding_completed = EXCLUDED.onboarding_completed, updated_at = NOW() RETURNING selected_areas, primary_area, onboarding_completed", [userId, normalized.selectedAreas, normalized.primaryArea, normalized.onboardingCompleted]);
  const row = result.rows[0];
  return { selectedAreas: row.selected_areas, primaryArea: row.primary_area, onboardingCompleted: row.onboarding_completed };
}

module.exports = { name: "workspacePreferences", findByUserId, upsert };
