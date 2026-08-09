/**
 * seedSelfStudyWeek1 — apply the hand-authored Week 1 Self Study reading
 * (SELF_STUDY_WEEK1) to the canonical program's `warmup` card and LOCK it.
 *
 * Why this exists: Ram's 2026-08-06 self-study review (Basecamp todos 10174075841 /
 * 10174137603) found Week 1 unusable for anyone who had not sat the live class — no
 * install instructions anywhere, and Part 2's four setup steps were diagram labels
 * with no instructions behind them. The corrected copy adds Part 0 (install Claude
 * Code + VS Code from zero) and rewrites Part 2 into real commands.
 *
 * Only title/summary/body_html are replaced; the card's other content keys
 * (questions, completion, reflection, github_task, discussion_prompt,
 * evaluation_criteria) are preserved by `authorCard` — this script authors the
 * reading, it does not own the card's assessment wiring.
 *
 * Idempotent (see `authorCard`): re-running with unchanged copy writes nothing, so
 * content_at does not churn. Safe to run on every deploy.
 *
 * Run inside the backend container:
 *   node dist/scripts/seedSelfStudyWeek1.js            # apply
 *   node dist/scripts/seedSelfStudyWeek1.js --dry-run  # report only, no write
 *   node dist/scripts/seedSelfStudyWeek1.js --program=<uuid>
 */
import { sequelize } from '../config/database';
import { authorCard, AuthorCardResult } from './lib/authorTimelineCard';
import { SELF_STUDY_WEEK1 } from '../data/selfStudyWeek1';

const DEFAULT_PROGRAM = '92b98a72-8681-4f04-8ba1-16a18334cd0b';

function argValue(flag: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.split('=').slice(1).join('=') : undefined;
}

export async function seedSelfStudyWeek1(
  programId: string = DEFAULT_PROGRAM,
  dryRun = false,
): Promise<AuthorCardResult> {
  // The "Self Study" curriculum type IS the slug `warmup` — never rename it; existing
  // timeline_cards.type, component_versions and analytics all key on `warmup`.
  return authorCard({
    label: 'Week 1 Self Study',
    week: 1,
    type: 'warmup',
    content: SELF_STUDY_WEEK1,
  }, programId, dryRun);
}

if (require.main === module) {
  const programId = argValue('--program') || DEFAULT_PROGRAM;
  const dryRun = process.argv.includes('--dry-run');
  seedSelfStudyWeek1(programId, dryRun)
    .then(async (r) => {
      console.log(`[seedSelfStudyWeek1] ${JSON.stringify(r)}`);
      await sequelize.close();
      process.exit(r.reason === 'not-found' ? 1 : 0);
    })
    .catch(async (e) => {
      console.error('[seedSelfStudyWeek1] ERROR ' + (e && e.message ? e.message : e));
      try { await sequelize.close(); } catch { /* already closed */ }
      process.exit(1);
    });
}

export default seedSelfStudyWeek1;
