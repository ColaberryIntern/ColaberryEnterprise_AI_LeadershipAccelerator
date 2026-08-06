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
 * Only title/summary/body_html are replaced. The card's other content keys
 * (questions, completion, reflection, github_task, discussion_prompt,
 * evaluation_criteria) are PRESERVED — this script authors the reading, it does not
 * own the card's assessment wiring.
 *
 * Idempotent: re-running with unchanged copy detects a match and makes no write, so
 * content_at does not churn and `metadata.locked` stays true either way. Safe to run
 * on every deploy.
 *
 * Run inside the backend container:
 *   node dist/scripts/seedSelfStudyWeek1.js            # apply
 *   node dist/scripts/seedSelfStudyWeek1.js --dry-run  # report only, no write
 *   node dist/scripts/seedSelfStudyWeek1.js --program=<uuid>
 */
import { sequelize } from '../config/database';
import TimelineCard from '../models/TimelineCard';
import { SELF_STUDY_WEEK1 } from '../data/selfStudyWeek1';

const DEFAULT_PROGRAM = '92b98a72-8681-4f04-8ba1-16a18334cd0b';
const WEEK = 1;
const TYPE = 'warmup';   // the "Self Study" curriculum type IS slug `warmup` — never rename

export interface SeedResult {
  card_id: string | null;
  changed: boolean;
  reason: 'applied' | 'already-current' | 'not-found' | 'dry-run';
}

function argValue(flag: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.split('=').slice(1).join('=') : undefined;
}

export async function seedSelfStudyWeek1(
  programId: string = DEFAULT_PROGRAM,
  dryRun = false,
): Promise<SeedResult> {
  const cards = await TimelineCard.findAll({
    where: { program_id: programId, week: WEEK, type: TYPE },
    order: [['order', 'ASC'], ['created_at', 'ASC']],
  });

  if (!cards.length) {
    console.error(`[seedSelfStudyWeek1] no ${TYPE} card on program ${programId} week ${WEEK} — nothing applied`);
    return { card_id: null, changed: false, reason: 'not-found' };
  }
  if (cards.length > 1) {
    // Duplicates are a known historical hazard on this program; author the first and
    // name the rest so an operator can decide, rather than silently picking one.
    console.warn(`[seedSelfStudyWeek1] ${cards.length} ${TYPE} cards found — authoring the first, leaving the rest untouched: ${cards.slice(1).map((c) => c.id).join(', ')}`);
  }

  const card: any = cards[0];
  const meta: Record<string, unknown> = card.metadata && typeof card.metadata === 'object'
    ? { ...(card.metadata as Record<string, unknown>) }
    : {};
  const prior = (meta.content && typeof meta.content === 'object' ? meta.content : {}) as Record<string, unknown>;

  const isCurrent = prior.title === SELF_STUDY_WEEK1.title
    && prior.summary === SELF_STUDY_WEEK1.summary
    && prior.body_html === SELF_STUDY_WEEK1.body_html
    && meta.locked === true;
  if (isCurrent) {
    console.log(`[seedSelfStudyWeek1] card ${card.id} already current (${SELF_STUDY_WEEK1.body_html.length} chars, locked) — no write`);
    return { card_id: card.id, changed: false, reason: 'already-current' };
  }

  if (dryRun) {
    console.log(`[seedSelfStudyWeek1] DRY RUN — would author card ${card.id}: ${String(prior.body_html || '').length} -> ${SELF_STUDY_WEEK1.body_html.length} chars, lock=true`);
    return { card_id: card.id, changed: false, reason: 'dry-run' };
  }

  await card.update({
    metadata: {
      ...meta,
      content: {
        ...prior,                              // keep questions/completion/github_task/etc.
        title: SELF_STUDY_WEEK1.title,
        summary: SELF_STUDY_WEEK1.summary,
        body_html: SELF_STUDY_WEEK1.body_html,
      },
      content_at: new Date().toISOString(),
      locked: true,                            // ensureFreshContent must never overwrite this
      authored: true,
    },
  } as any);

  console.log(`[seedSelfStudyWeek1] authored + locked card ${card.id} (${SELF_STUDY_WEEK1.body_html.length} chars)`);
  return { card_id: card.id, changed: true, reason: 'applied' };
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
