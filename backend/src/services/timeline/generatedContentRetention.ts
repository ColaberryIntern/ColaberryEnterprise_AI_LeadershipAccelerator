/**
 * generatedContentRetention — the shared "use it for a month, then discard" rule
 * for every LLM-generated content card.
 *
 * The content strategy (keeps LLM cost + feed footprint bounded across ALL
 * generators, without special-casing any of them):
 *   1. Each generator materializes at most ~1 fresh card/day (grab one, add it to
 *      the library) — enforced per-generator (AI News: AI_NEWS_MAX_PER_RUN=1).
 *   2. A generated card lives for RETENTION_DAYS (default 30), then is archived
 *      OUT of the feed here. getFeed only returns visibility='published'
 *      (timelineService), so flipping visibility -> 'archived' is the discard.
 *
 * The one convention that makes this generic: every LLM content generator stamps
 * `metadata.source = '<type>_pipeline'` on the cards it creates (e.g.
 * `ai_news_flash_pipeline`). This function prunes anything ending in `_pipeline`.
 * Hand-authored SAMPLE cards use `source = 'intel_sample_seed'` — the evergreen
 * baseline — and are NEVER pruned. Idempotent + safe to re-run (archiving an
 * already-archived card is a no-op).
 */
import { sequelize } from '../../config/database';

export const RETENTION_DAYS = Number(process.env.GENERATED_CONTENT_RETENTION_DAYS || 30);

/**
 * Archive generated (`*_pipeline`) content cards older than `days` out of the
 * feed. Returns how many were archived this run.
 */
export async function pruneGeneratedContent(days = RETENTION_DAYS): Promise<{ archived: number }> {
  const [, meta] = await sequelize.query(
    `UPDATE timeline_cards
        SET visibility = 'archived', updated_at = NOW()
      WHERE visibility = 'published'
        AND metadata->>'source' ~ '_pipeline$'
        AND created_at < NOW() - make_interval(days => :days)`,
    { replacements: { days } },
  );
  const archived = (meta as any)?.rowCount ?? 0;
  if (archived) console.log(`[contentRetention] archived ${archived} generated card(s) older than ${days}d`);
  return { archived };
}
