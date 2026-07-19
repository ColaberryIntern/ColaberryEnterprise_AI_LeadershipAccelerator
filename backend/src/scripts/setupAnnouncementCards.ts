/**
 * setupAnnouncementCards — idempotent card data for the Announcement rollout
 * (Session CC-20260719-k4m8). For every week 0-12 of the canonical program:
 * collapse duplicate announcement cards to ONE (keep the lowest-order published
 * card, archive the rest) so a week never shows two kickoffs, and clear any STALE
 * pre-rollout content (content with no section_fingerprint — including the old
 * hand-authored/locked Week 0) so the kept card regenerates live with the current
 * prompt + roster scan on first open.
 *
 * Week 0 now LIVE-GENERATES in the same format as every other week (the prompt has
 * a free-preview branch: "Welcome to Your Free AI Preview" + ecosystem pitch), so
 * it reads from the curriculum like the rest — no hand-authored lock.
 *
 * Idempotent + safe to re-run (archived stays archived; already-regenerated content
 * carries a section_fingerprint and is left untouched). Sends no comms. Targets the
 * canonical program (default below; override with --program=<uuid>).
 *
 * Run inside the backend container:
 *   node dist/scripts/setupAnnouncementCards.js
 *   (dev/preview via ts-node: npx ts-node src/scripts/setupAnnouncementCards.ts)
 */
import TimelineCard from '../models/TimelineCard';

const DEFAULT_PROGRAM = '92b98a72-8681-4f04-8ba1-16a18334cd0b';
const CANONICAL_WEEKS = 12;

function targetProgram(): string {
  const a = process.argv.find((x) => x.startsWith('--program='));
  return a ? a.split('=')[1] : DEFAULT_PROGRAM;
}

/** One announcement per week; clear stale pre-rollout content (incl. the old locked Week 0). */
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

  // Clear only STALE content (no fingerprint — pre-rollout, or the old hand-authored
  // Week 0 lock). New content carries a section_fingerprint and is left alone → idempotent.
  const meta = keep.metadata && typeof keep.metadata === 'object' ? { ...(keep.metadata as Record<string, unknown>) } : {};
  const hasContent = !!meta.content;
  const hasFingerprint = typeof meta.section_fingerprint === 'string';
  if (hasContent && !hasFingerprint) {
    delete meta.content; delete meta.content_at; delete meta.section_fingerprint; delete meta.locked;
    await keep.update({ metadata: meta } as any);
    console.log(`[setupAnnouncement] week ${week}: cleared stale content on ${keep.id} (will regenerate on first open)`);
  }
}

async function main(): Promise<void> {
  const programId = targetProgram();
  console.log(`[setupAnnouncement] program ${programId}`);
  for (let wk = 0; wk <= CANONICAL_WEEKS; wk++) await refreshWeek(programId, wk);
  console.log('[setupAnnouncement] done');
  process.exit(0);
}

main().catch((e) => { console.error('[setupAnnouncement] failed:', e); process.exit(1); });
