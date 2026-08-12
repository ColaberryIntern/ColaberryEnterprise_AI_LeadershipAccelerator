/**
 * generatedContentRetention — the shared "use it for a while, then discard, then
 * make it reusable again" rule for every LLM-generated content card.
 *
 * The content strategy (keeps LLM cost + feed footprint bounded across ALL
 * generators, without special-casing any of them):
 *   1. Each generator materializes at most ~1-2 fresh card/day (grab one, add it
 *      to the library) — enforced per-generator (AI News: AI_NEWS_MAX_PER_RUN=3).
 *   2. A generated card lives for RETENTION_DAYS (default 18, was 30 before the
 *      2026-08-10 content-supply fix), then is archived OUT of the feed here.
 *      getFeed only returns visibility='published' (timelineService), so
 *      flipping visibility -> 'archived' is the discard. The 30 -> 18 change:
 *      even with the reset mechanism below working correctly, a small FIXED
 *      library (e.g. ~38-80 items after the 2026-08-10 catalog-growth pass) at
 *      2/day still takes ~19-40 days to first exhaust — under a 30-day window
 *      that leaves an unavoidable gap where the type goes completely silent
 *      between "list exhausted" and "oldest card finally ages out." 18 days
 *      closes that gap for every curated list without materially affecting the
 *      deep-pool live-feed sources (hundreds of never-shown items; they won't
 *      approach exhaustion for months regardless of retention length).
 *   3. Archiving the card also resets the source `intel_items.card_id` (the
 *      row's materialization pointer, see intelPipeline.ts materializeIntelCard)
 *      back to NULL. This is what makes the library a rotation instead of a
 *      one-shot: intelPipeline only materializes items where `card_id IS NULL`,
 *      so an item whose card just aged out becomes eligible to be re-carded on a
 *      future run. Sources with an effectively unlimited stream of fresh guids
 *      (AI News Flash, research digests) never notice this — they always have
 *      untouched items to draw from first. Sources with a small FIXED library
 *      (claude_code_technique, ai_tool_of_the_day, ai_quote_of_the_day) NEED this
 *      reset, or every item gets carded exactly once and the pipeline goes
 *      permanently quiet once the list is exhausted — which is the bug this
 *      reset closes. Applying it universally (every `_pipeline` source, not just
 *      the curated ones) keeps the rule simple and consistent.
 *
 * The one convention that makes this generic: every LLM content generator stamps
 * `metadata.source = '<type>_pipeline'` on the cards it creates (e.g.
 * `ai_news_flash_pipeline`). This function prunes anything ending in `_pipeline`.
 * Hand-authored SAMPLE cards use `source = 'intel_sample_seed'` — the evergreen
 * baseline — and are NEVER pruned. Idempotent + safe to re-run: archiving an
 * already-archived card is a no-op (the `visibility = 'published'` guard), and
 * resetting an already-NULL `card_id` is a no-op too. The archive + reset run in
 * one transaction so a partial failure can never leave a card archived with its
 * intel_items row still pointing at it (or vice versa).
 */
import { sequelize } from '../../config/database';

export const RETENTION_DAYS = Number(process.env.GENERATED_CONTENT_RETENTION_DAYS || 18);

/**
 * Archive generated (`*_pipeline`) content cards older than `days` out of the
 * feed, and reset the `intel_items.card_id` pointer for each one so the
 * underlying library item is eligible for re-materialization into a fresh card
 * on a future pipeline run. Returns how many cards were archived this run.
 */
export async function pruneGeneratedContent(days = RETENTION_DAYS): Promise<{ archived: number }> {
  const archived = await sequelize.transaction(async (t) => {
    const [rows] = (await sequelize.query(
      `UPDATE timeline_cards
          SET visibility = 'archived', updated_at = NOW()
        WHERE visibility = 'published'
          AND metadata->>'source' ~ '_pipeline$'
          AND created_at < NOW() - make_interval(days => :days)
        RETURNING id`,
      { replacements: { days }, transaction: t },
    )) as unknown as [Array<{ id: string }>, unknown];

    const archivedIds = (rows ?? []).map((r) => r.id);

    if (archivedIds.length) {
      // Reset the materialization pointer on every intel_items row that fed one
      // of the cards we just archived, so those (pipeline, guid) items become
      // eligible for `card_id IS NULL` re-materialization again. Already-NULL
      // rows simply fail to match — safe to re-run.
      await sequelize.query(
        `UPDATE intel_items SET card_id = NULL WHERE card_id IN (:ids)`,
        { replacements: { ids: archivedIds }, transaction: t },
      );
    }

    return archivedIds.length;
  });

  if (archived) console.log(`[contentRetention] archived ${archived} generated card(s) older than ${days}d and reset their intel_items.card_id for reuse`);
  return { archived };
}
