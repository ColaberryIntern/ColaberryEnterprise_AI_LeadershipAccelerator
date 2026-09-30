/**
 * Wire the two confirmed Anthropic Skilljar course links into Week 1 session
 * materials for all cohorts that have a session_number=2 record.
 *
 * Background: Week 1 Intensive 1 (Claude Code Foundations + Architect Workspace
 * setup) maps to Claude Code 101 and Claude Code in Action on Anthropic Skilljar.
 * The URLs were confirmed 2026-06-18 from the BC ticket for this task. This script
 * populates materials_json on the lab session (session_number=2) so the links appear
 * as clickable items in the portal's Materials section.
 *
 * Idempotent: checks for existing entries by title before appending. Safe to re-run.
 *
 * Run (on VPS inside backend container):
 *   docker exec accelerator-backend node dist/scripts/wireWeek1AnthropicCourses.js
 *
 * Or locally with ts-node:
 *   npx ts-node src/scripts/wireWeek1AnthropicCourses.ts
 */

import path from 'path';
import { config } from 'dotenv';
config({ path: path.resolve(__dirname, '../../../.env.dev') });

import { connectDatabase } from '../config/database';
import '../models';
import LiveSession from '../models/LiveSession';
import { computeMaterialsUpdate, CourseMaterial } from './lib/anthropicCourseMaterials';

const ANTHROPIC_COURSES: CourseMaterial[] = [
  {
    title: 'Claude Code 101 (Anthropic Skilljar)',
    type: 'reading',
    url: 'https://anthropic.skilljar.com/claude-code-101',
  },
  {
    title: 'Claude Code in Action (Anthropic Skilljar)',
    type: 'reading',
    url: 'https://anthropic.skilljar.com/claude-code-in-action',
  },
];

async function run(): Promise<void> {
  await connectDatabase();

  const sessions = await LiveSession.findAll({ where: { session_number: 2 } });

  if (sessions.length === 0) {
    console.log('[wireWeek1AnthropicCourses] No session_number=2 records found. Nothing to update.');
    process.exit(0);
  }

  console.log(`[wireWeek1AnthropicCourses] Found ${sessions.length} Week 1 lab session(s).`);

  for (const session of sessions) {
    const { toAdd, next } = computeMaterialsUpdate(session.materials_json, ANTHROPIC_COURSES);

    if (toAdd.length === 0) {
      console.log(`  [SKIP] Session ${session.id} (cohort ${session.cohort_id}) — all course links already present.`);
      continue;
    }

    await session.update({ materials_json: next });
    console.log(`  [UPDATED] Session ${session.id} (cohort ${session.cohort_id}) — prepended: ${toAdd.map((c) => c.title).join(', ')}`);
  }

  console.log('[wireWeek1AnthropicCourses] done.');
  process.exit(0);
}

run().catch((err) => {
  console.error('[wireWeek1AnthropicCourses] FATAL:', err.message);
  process.exit(1);
});
