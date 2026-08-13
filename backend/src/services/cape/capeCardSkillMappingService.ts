/**
 * capeCardSkillMappingService — stamps a card's RESOLVED skill mapping (design doc §7)
 * onto its own `timeline_cards` row at publish time. Called from a `TimelineCard`
 * model-level `afterCreate`/`afterUpdate` hook (see `models/TimelineCard.ts`), which
 * covers EVERY path that can produce a `visibility:'published'` card — not just
 * `timelineAdminService.createCard`/`updateCard` (plan-audit cycle 1 caught that the
 * Composer's publish flow is not the repo's only publish path; the Intelligence
 * Pipeline's `intelPipeline.ts`/`aiNewsIngestionService.ts` and a few seed/one-off
 * scripts call `TimelineCard.create()` directly).
 *
 * NON-FATAL by design (Failure-First Design, same contract as
 * `capeTimelineEvidenceBridge.ts`): a stamp failure never blocks the card
 * create/update it's attached to.
 *
 * Recursion safety: the stamp write goes through the STATIC `TimelineCard.update(...)`
 * (a bulk update, which only fires `beforeBulkUpdate`/`afterBulkUpdate` — hooks this
 * model does NOT register), never through an instance `.save()`/`.update()` call,
 * which would re-trigger the very `afterUpdate` instance hook that invoked this
 * function and recurse forever.
 */
import { resolveSkillMapping } from './capeCurriculumSkillMapService';

export interface StampableCard {
  id: string;
  type: string;
  week: number | null;
  visibility: string;
}

/**
 * Resolves and stamps a card's mapping if (and only if) it is currently published.
 * A draft/scheduled/archived card is left untouched (nulls, until it is later
 * published). Safe to call repeatedly — each call fully re-resolves and re-writes the
 * 5 stamp columns, which is correct: if the card's type/week changed, the resolution
 * legitimately changes too. This never touches `student_skill_evidence` (the ledger
 * has its own idempotency-key discipline, entirely separate from this cache stamp).
 */
export async function stampIfPublished(card: StampableCard): Promise<void> {
  if (card.visibility !== 'published') return;
  try {
    const resolved = await resolveSkillMapping({ cardId: card.id, typeSlug: card.type, weekNumber: card.week });
    // Lazy import avoids a static circular dependency with models/TimelineCard.ts,
    // which imports this module's `stampIfPublished` for its own hooks.
    const { default: TimelineCard } = await import('../../models/TimelineCard');
    await TimelineCard.update(
      {
        skill_mapping: resolved.contract,
        skill_mapping_source: resolved.source,
        skill_mapping_map_id: resolved.map_id,
        skill_mapping_version: resolved.version,
        skill_mapping_resolved_at: new Date(),
      },
      { where: { id: card.id } }, // static bulk update — does NOT fire instance afterUpdate again
    );
  } catch (err: any) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'backend',
      event: 'cape_card_skill_mapping_stamp_failed',
      error_class: err?.name || 'Error',
      outcome: 'failure',
      context: { card_id: card.id, card_type: card.type, week: card.week, message: err?.message },
    }));
  }
}
