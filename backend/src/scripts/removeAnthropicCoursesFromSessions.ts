/**
 * Remove all Anthropic Skilljar course entries from materials_json on
 * session_number=2 and session_number=3 (all cohorts).
 *
 * Background: wireWeek1/2AnthropicCourses.ts wired Skilljar course cards
 * to the portal session detail page. These belong in the curriculum_course_links
 * table (curriculum page CTAs), not as session materials on the sessions page.
 *
 * Idempotent: if no skilljar.com entries are present, the session is untouched.
 *
 * Run locally:
 *   npx ts-node backend/src/scripts/removeAnthropicCoursesFromSessions.ts
 */

import path from 'path';
import { config } from 'dotenv';
config({ path: path.resolve(__dirname, '../../../.env.dev') });

import { connectDatabase } from '../config/database';
import '../models';
import LiveSession from '../models/LiveSession';

const TARGET_SESSIONS = [2, 3];

async function run(): Promise<void> {
  await connectDatabase();

  for (const sessionNumber of TARGET_SESSIONS) {
    const sessions = await LiveSession.findAll({ where: { session_number: sessionNumber } });

    if (sessions.length === 0) {
      console.log(`[removeAnthropicCourses] No session_number=${sessionNumber} records found.`);
      continue;
    }

    console.log(`[removeAnthropicCourses] session_number=${sessionNumber}: ${sessions.length} record(s).`);

    for (const session of sessions) {
      const existing: Array<{ title: string; type: string; url?: string }> =
        Array.isArray(session.materials_json) ? session.materials_json : [];

      const filtered = existing.filter((m) => !m.url?.includes('skilljar.com'));
      const removed = existing.length - filtered.length;

      if (removed === 0) {
        console.log(`  [SKIP] Session ${session.id} — no skilljar.com entries found.`);
        continue;
      }

      const removedTitles = existing
        .filter((m) => m.url?.includes('skilljar.com'))
        .map((m) => m.title);

      await session.update({ materials_json: filtered });
      console.log(`  [REMOVED] Session ${session.id} — removed ${removed}: ${removedTitles.join(', ')}`);
    }
  }

  console.log('[removeAnthropicCourses] done.');
  process.exit(0);
}

run().catch((err) => {
  console.error('[removeAnthropicCourses] FATAL:', err.message);
  process.exit(1);
});
