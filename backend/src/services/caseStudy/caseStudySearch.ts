import type { PublicCaseStudySummary } from '../../types/caseStudyPublic';

/**
 * Free-text search over the published records.
 *
 * IT SEARCHES THE PROJECTION, NEVER THE SNAPSHOT, AND THAT IS THE WHOLE POINT.
 *
 * A record may name its organization, anonymise it ("a Fortune 500 insurer"), or
 * hide it. `projectPublicSummary` resolves that consent BEFORE this function sees
 * anything, so the haystack is exactly the words already printed on the card.
 *
 * Searching the raw snapshot instead would leak. Type a real client name that
 * consent had replaced with a descriptor, watch the record appear, and the
 * anonymisation is undone by anyone patient enough to guess - without a single
 * name ever being rendered. A search index built from private text is a
 * disclosure channel wearing a feature's clothes. The property this file
 * guarantees is narrow and worth stating plainly: YOU CAN ONLY FIND A RECORD BY
 * TEXT A READER CAN ALREADY SEE.
 *
 * EVERY TERM MUST MATCH, not any. Typing more words narrows rather than widens,
 * which is what a reader filtering a short editorial library expects; `any`
 * turns a two-word query into a bigger result set than a one-word query and
 * reads as broken.
 */

/** Fields a reader can see on a card. Nothing here is consent-sensitive. */
function haystackOf(summary: PublicCaseStudySummary): string {
  return [
    summary.title,
    summary.standfirst ?? '',
    summary.organizationLabel ?? '',
    summary.industry ?? '',
    summary.primaryCapability ?? '',
    summary.programLabel ?? '',
    ...summary.capabilities,
    ...summary.stack,
    ...summary.deliverables,
  ].join(' ');
}

/**
 * Lowercase, strip accents, and treat every non-alphanumeric run as a space.
 *
 * The last part matters more than it looks. Taxonomy slugs are hyphenated
 * (`governed-ai-remediation`, `human-in-the-loop-approval-queue`) while a reader
 * types words. Without this, searching "remediation" misses a record whose only
 * mention of it is inside a slug, and the search looks broken on the very
 * vocabulary the filter sidebar is built from.
 */
export function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    // Combining marks, written as escapes on purpose: the literal range is a run
    // of invisible characters in the source that a later edit would silently break.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** The query split into terms. Empty means "no search was asked for". */
export function searchTerms(query: string | null | undefined): string[] {
  if (typeof query !== 'string') return [];
  const normalized = normalizeForSearch(query);
  if (!normalized) return [];
  return normalized.split(' ').filter(Boolean);
}

/**
 * True when every term appears in the record's visible text.
 *
 * Substring rather than whole-word: a reader typing "audit" should reach
 * "auditability", and typing "typescript" should reach it inside a stack list.
 * The cost is that "act" matches "action", which on a library of tens of
 * editorial records is a smaller problem than a search that finds nothing.
 */
export function matchesSearch(
  summary: PublicCaseStudySummary,
  terms: readonly string[],
): boolean {
  if (terms.length === 0) return true;
  const haystack = normalizeForSearch(haystackOf(summary));
  return terms.every((term) => haystack.includes(term));
}

export default matchesSearch;
