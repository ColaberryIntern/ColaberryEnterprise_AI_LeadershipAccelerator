/**
 * The one place that knows how a Governor decision names a content gap.
 *
 * ── WHY THIS IS ITS OWN MODULE ──────────────────────────────────────────────
 *
 * Two surfaces read these gaps: the Why drilldown, which shows a learner's gap,
 * and the Content tab, which counts them. The first version put the parser in
 * `explorerWhyService` and had the Content service import it from there — which
 * worked, and dragged the whole models barrel into a service that touches no
 * model. With no `DATABASE_URL` the model layer never initialises, so the
 * Content suite died on `sequelize.define` of undefined before running a single
 * test. Under CI's ignore-list config that is a suite that goes red for a reason
 * unrelated to what it tests, and the natural next move is to exclude it.
 *
 * The alternative — a second copy of the rule — is worse. This session already
 * watched three readers of one corrupt column drift apart until they disagreed
 * with each other in production.
 *
 * So: one implementation, zero dependencies.
 */

/** The marker the Governor writes into `reason` when it could not resolve content. */
export const GAP_MARKER = 'asset gaps:';

/**
 * The separator between reason segments. THE SPACES ARE LOAD-BEARING.
 *
 * `runGovernor.ts` joins segments with `' | '`, while a gap token built by
 * `resolveContentAssets.ts` joins its own stage list with a bare `'|'`:
 *
 *   no_asset_for_purpose:lesson_recommendation:learning|deciding
 *
 * Splitting on a bare `'|'` therefore cuts a multi-stage gap in half and returns
 * only the first fragment — silently NARROWING a gap, on the two surfaces built
 * to report gaps faithfully. Splitting on `' | '` keeps the token intact and
 * still separates segments correctly.
 *
 * Reading to end-of-string instead would be wrong for a different reason:
 * `campaignGap` is appended AFTER the asset-gaps segment, so the remainder of
 * the string is not guaranteed to be gaps.
 *
 * No production row exercises this today — every `stageTags` entry in
 * `assetPurposeMap.ts` is single-element, so 0 of 612 rows carry an inner pipe.
 * But `stageTags` is typed `ExplorerStageTag[]`, so a second tag is a config
 * change rather than a code change, and this would fail quietly.
 */
export const SEGMENT_SEPARATOR = ' | ';

/**
 * Pull the named gaps out of a decision's reason. The inverse of the Governor's
 * writer, which emits `asset gaps: ${gaps.join(', ')}` as one segment.
 *
 * Returns `[]` when the decision named no gap, which is the common case: 141 of
 * 153 decisions on 2026-09-02.
 */
export function namedGaps(reason: string): string[] {
  for (const segment of reason.split(SEGMENT_SEPARATOR)) {
    const trimmed = segment.trim();
    if (trimmed.toLowerCase().startsWith(GAP_MARKER)) {
      return trimmed
        .slice(GAP_MARKER.length)
        .split(',')
        .map((g) => g.trim())
        .filter(Boolean);
    }
  }
  return [];
}
