/**
 * setupAnnouncementCards — one-time, idempotent card data for the Announcement
 * type rollout (Session CC-20260719-k4m8):
 *   • Week 0: LOCK the announcement card with the approved hand-authored
 *     "Welcome to Your Free AI Preview" content (ANNOUNCEMENT_WEEK0) so it never
 *     auto-regenerates or drifts. Also fixes its title casing.
 *   • Weeks 1-12: collapse duplicate announcement cards to ONE per week (keep the
 *     lowest-order published card, archive the rest) so a week never shows two
 *     kickoffs, and clear any STALE pre-rollout content (content with no
 *     section_fingerprint) so the kept card regenerates live with the new prompt
 *     and roster scan on first open.
 *
 * Idempotent + safe to re-run (archived stays archived; already-regenerated
 * content carries a section_fingerprint and is left untouched). Sends no comms.
 * Targets the canonical program (default below; override with --program=<uuid>).
 *
 * Run inside the backend container:
 *   node dist/scripts/setupAnnouncementCards.js
 *   (dev/preview via ts-node: npx ts-node src/scripts/setupAnnouncementCards.ts)
 */
import TimelineCard from '../models/TimelineCard';
import { ANNOUNCEMENT_WEEK0 } from '../data/announcementWeek0';

const DEFAULT_PROGRAM = '92b98a72-8681-4f04-8ba1-16a18334cd0b';
const CANONICAL_WEEKS = 12;

function targetProgram(): string {
  const a = process.argv.find((x) => x.startsWith('--program='));
  return a ? a.split('=')[1] : DEFAULT_PROGRAM;
}

/** Week 0: lock the hand-authored free-preview welcome; archive any duplicates. */
async function lockWeek0(programId: string): Promise<void> {
  const cards = await TimelineCard.findAll({
    where: { program_id: programId, week: 0, type: 'announcement' },
    order: [['order', 'ASC'], ['created_at', 'ASC']],
  });
  if (!cards.length) { console.log('[setupAnnouncement] week 0: no announcement card found — skipped'); return; }
  const [keep, ...extra] = cards;
  const meta = keep.metadata && typeof keep.metadata === 'object' ? (keep.metadata as Record<string, unknown>) : {};
  await keep.update({
    title: ANNOUNCEMENT_WEEK0.title,
    metadata: {
      ...meta,
      content: {
        title: ANNOUNCEMENT_WEEK0.title,
        summary: ANNOUNCEMENT_WEEK0.summary,
        body_html: ANNOUNCEMENT_WEEK0.body_html,
        questions: ANNOUNCEMENT_WEEK0.questions,
        reflection: ANNOUNCEMENT_WEEK0.reflection,
      },
      content_at: new Date().toISOString(),
      locked: true,
    },
  } as any);
  console.log(`[setupAnnouncement] week 0: LOCKED "${ANNOUNCEMENT_WEEK0.title}" on card ${keep.id}`);
  for (const c of extra) {
    await c.update({ visibility: 'archived' } as any);
    console.log(`[setupAnnouncement] week 0: archived duplicate ${c.id} ("${c.title}")`);
  }
}

/** Weeks 1-N: one announcement per week; clear stale pre-rollout content. */
async function refreshWeek(programId: string, week: number): Promise<void> {
  const cards = await TimelineCard.findAll({
    where: { program_id: programId, week, type: 'announcement', visibility: 'published' },
    order: [['order', 'ASC'], ['created_at', 'ASC']],
  });
  if (!cards.length) return;
  const [keep, ...extra] = cards;

  for (const c of extra) {
    await c.update({ visibility: 'archived' } as any);
    console.log(`[setupAnnouncement] week ${week}: archived duplicate announcement ${c.id} ("${c.title}")`);
  }

  // Clear only STALE content (generated before this rollout, so no fingerprint).
  // New content carries a section_fingerprint and is left alone → idempotent.
  const meta = keep.metadata && typeof keep.metadata === 'object' ? { ...(keep.metadata as Record<string, unknown>) } : {};
  const hasContent = !!meta.content;
  const hasFingerprint = typeof meta.section_fingerprint === 'string';
  if (hasContent && !hasFingerprint) {
    delete meta.content; delete meta.content_at; delete meta.section_fingerprint; delete meta.locked;
    await keep.update({ metadata: meta } as any);
    console.log(`[setupAnnouncement] week ${week}: cleared stale pre-rollout content on ${keep.id} (will regenerate on first open)`);
  }
}

async function main(): Promise<void> {
  const programId = targetProgram();
  console.log(`[setupAnnouncement] program ${programId}`);
  await lockWeek0(programId);
  for (let wk = 1; wk <= CANONICAL_WEEKS; wk++) await refreshWeek(programId, wk);
  console.log('[setupAnnouncement] done');
  process.exit(0);
}

main().catch((e) => { console.error('[setupAnnouncement] failed:', e); process.exit(1); });
