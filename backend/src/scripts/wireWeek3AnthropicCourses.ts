/**
 * Wire the confirmed Anthropic Skilljar course link into Week 3 session
 * materials for all cohorts that have a session_number=4 record.
 *
 * Background: Week 3 Intensive 1 (Claude API + Business Workflow Assistant)
 * maps to Building with the Claude API on Anthropic Skilljar. The URL was
 * confirmed 2026-06-19 from BC ticket #9984355649. This script populates
 * materials_json on the Week 3 lab session (session_number=4) so the link
 * appears as a clickable item in the portal's Materials section.
 *
 * Idempotent: checks for existing entries by title before appending. Safe to re-run.
 *
 * Run (on VPS inside backend container):
 *   docker exec accelerator-backend node dist/scripts/wireWeek3AnthropicCourses.js
 *
 * Or locally with ts-node:
 *   npx ts-node src/scripts/wireWeek3AnthropicCourses.ts
 */

import path from 'path';
import { config } from 'dotenv';
config({ path: path.resolve(__dirname, '../../../.env.dev') });

import { connectDatabase } from '../config/database';
import '../models';
import LiveSession from '../models/LiveSession';

const ANTHROPIC_COURSES: Array<{ title: string; type: string; url: string }> = [
  {
    title: 'Building with the Claude API (Anthropic Skilljar)',
    type: 'reading',
    url: 'https://anthropic.skilljar.com/claude-with-the-anthropic-api',
  },
];

async function run(): Promise<void> {
  await connectDatabase();

  const sessions = await LiveSession.findAll({ where: { session_number: 4 } });

  if (sessions.length === 0) {
    console.log('[wireWeek3AnthropicCourses] No session_number=4 records found. Nothing to update.');
    process.exit(0);
  }

  console.log(`[wireWeek3AnthropicCourses] Found ${sessions.length} Week 3 session(s).`);

  for (const session of sessions) {
    const existing: Array<{ title: string; type: string; url: string }> = Array.isArray(session.materials_json)
      ? (session.materials_json as Array<{ title: string; type: string; url: string }>)
      : [];

    const existingTitles = new Set(existing.map((m) => m.title));
    const toAdd = ANTHROPIC_COURSES.filter((c) => !existingTitles.has(c.title));

    if (toAdd.length === 0) {
      console.log(`  [SKIP] Session ${session.id} (cohort ${session.cohort_id}) — course link already present.`);
      continue;
    }

    await session.update({ materials_json: [...toAdd, ...existing] });
    console.log(`  [UPDATED] Session ${session.id} (cohort ${session.cohort_id}) — prepended: ${toAdd.map((c) => c.title).join(', ')}`);
  }

  console.log('[wireWeek3AnthropicCourses] done.');
  process.exit(0);
}

run().catch((err) => {
  console.error('[wireWeek3AnthropicCourses] FATAL:', err.message);
  process.exit(1);
});
