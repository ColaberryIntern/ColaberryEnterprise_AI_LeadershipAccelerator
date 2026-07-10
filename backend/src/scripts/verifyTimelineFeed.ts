/**
 * Standalone verification of the Timeline feed — bypasses the full HTTP boot.
 * Imports only the timeline service + models, so it proves the engine composes
 * the Classroom feed correctly regardless of unrelated app-startup issues.
 *   npx ts-node src/scripts/verifyTimelineFeed.ts <enrollmentId>
 */
import { initProgress, getFeed } from '../services/timeline/timelineService';

async function main(): Promise<void> {
  const enrollmentId = process.argv[2];
  if (!enrollmentId) { console.error('usage: verifyTimelineFeed <enrollmentId>'); process.exit(1); }

  const init = await initProgress(enrollmentId);
  const feed = await getFeed(enrollmentId);

  const byBucket: Record<string, number> = {};
  for (const c of feed.cards) byBucket[c.bucket] = (byBucket[c.bucket] || 0) + 1;

  console.log('=== TIMELINE FEED VERIFICATION ===');
  console.log('progress init:', JSON.stringify(init));
  console.log('cohort_id    :', feed.cohort_id);
  console.log('total cards  :', feed.cards.length);
  console.log('by bucket    :', JSON.stringify(byBucket));
  console.log('sample cards :');
  for (const c of feed.cards.slice(0, 6)) {
    console.log(`  [${c.bucket}] ${c.student_label} — "${c.title}"  xp=${JSON.stringify(c.points)} status=${c.status}`);
  }
  process.exit(0);
}

main().catch((e) => { console.error('verify failed:', e); process.exit(1); });
