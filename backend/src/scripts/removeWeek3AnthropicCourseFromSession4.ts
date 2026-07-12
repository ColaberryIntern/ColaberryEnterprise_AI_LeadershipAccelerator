/**
 * Remove the "Building with the Claude API (Anthropic Skilljar)" entry from
 * materials_json on all session_number=4 records (all cohorts).
 *
 * Background: wireWeek3AnthropicCourses.ts wired this Skilljar course to
 * session_number=4 ("Refinement & Executive Positioning"), but that session is
 * executive presentation content — not the right home. The course belongs in
 * the curriculum under M4 (The 3-Agent System & Controlled Build), not as a
 * session material on the portal sessions page.
 *
 * Idempotent: if the entry is already absent, the session is left unchanged.
 * Safe to re-run.
 *
 * Run locally:
 *   npx ts-node backend/src/scripts/removeWeek3AnthropicCourseFromSession4.ts
 */

import path from 'path';
import { config } from 'dotenv';
config({ path: path.resolve(__dirname, '../../../.env.dev') });

import { connectDatabase } from '../config/database';
import '../models';
import LiveSession from '../models/LiveSession';

const TITLE_TO_REMOVE = 'Building with the Claude API (Anthropic Skilljar)';

async function run(): Promise<void> {
  await connectDatabase();

  const sessions = await LiveSession.findAll({ where: { session_number: 4 } });

  if (sessions.length === 0) {
    console.log('[removeWeek3] No session_number=4 records found. Nothing to do.');
    process.exit(0);
  }

  console.log(`[removeWeek3] Found ${sessions.length} session(s) with session_number=4.`);

  for (const session of sessions) {
    const existing: Array<{ title: string; type: string; url?: string }> =
      Array.isArray(session.materials_json) ? session.materials_json : [];

    const before = existing.length;
    const filtered = existing.filter((m) => m.title !== TITLE_TO_REMOVE);
    const removed = before - filtered.length;

    if (removed === 0) {
      console.log(`  [SKIP] Session ${session.id} (cohort ${session.cohort_id}) — entry not present.`);
      continue;
    }

    await session.update({ materials_json: filtered });
    console.log(`  [REMOVED] Session ${session.id} (cohort ${session.cohort_id}) — removed ${removed} entry.`);
  }

  console.log('[removeWeek3] done.');
  process.exit(0);
}

run().catch((err) => {
  console.error('[removeWeek3] FATAL:', err.message);
  process.exit(1);
});
