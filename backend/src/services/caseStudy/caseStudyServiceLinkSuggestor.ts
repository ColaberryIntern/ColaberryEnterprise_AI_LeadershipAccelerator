/**
 * caseStudyServiceLinkSuggestor — PURE, deterministic "which services does this case study evidence?".
 *
 * No LLM, no DB, no IO. It takes one case study's signals plus the service catalog and returns a ranked,
 * explainable list of SUGGESTIONS. It writes nothing and gates nothing: a suggestion is a proposal for a human to
 * confirm, never a claim that the record proves the service. That distinction is the whole point of the feature,
 * because a confirmed link is quotable as past performance in a government bid and an unreviewed keyword match is
 * not.
 *
 * REUSES `factory/serviceMatcher` rather than growing a second matching scheme. The overlap machinery there is
 * already deterministic, already tested, and already the house answer to "rank this catalog against some text".
 *
 * WHAT IT DELIBERATELY DOES NOT REUSE, and why this module exists at all rather than calling the matcher directly:
 *
 *   THE MATCHER'S STRENGTH BANDING IS CALIBRATED TO A SIGNAL CASE STUDIES DO NOT HAVE. Its dominant term is NAICS
 *   code overlap, weighted 10, and `strength: 'strong'` means "scored at least 10", i.e. effectively "matched a
 *   NAICS code". `service_offerings` carries `naics_codes_json`; `case_studies` carries no NAICS column anywhere in
 *   the schema. So for a case study that term is always zero, 'strong' is unreachable, and every real match would
 *   be labelled 'weak' or 'moderate' no matter how well it actually matched. A band that cannot be reached is not a
 *   band, and a label that cannot say "strong" would quietly teach a reviewer to distrust good matches.
 *
 * So this module re-bands strength against the signals that DO exist here: whether the service's category matched,
 * and how many of its keywords appeared in the record's text. `expectedScore()` is exported so a test can assert
 * the NAICS term really is inert rather than take this comment's word for it.
 */
import { matchServicesToOpportunity, MatcherServiceInput, ServiceMatch } from '../factory/serviceMatcher';

/** The matchable text a case study carries. Mirrors the `case_studies` columns that hold prose or labels. */
export interface CaseStudyLinkSignals {
  title?: string | null;
  canonicalSummary?: string | null;
  industry?: string | null;
  primaryCapability?: string | null;
  programKey?: string | null;
}

export type SuggestionStrength = 'strong' | 'moderate' | 'weak';

export interface ServiceLinkSuggestion {
  serviceOfferingId: string;
  serviceName: string;
  category: string | null;
  /** Ordering signal, persisted to `case_study_service_links.match_score`. Category counts 3, each keyword 1. */
  matchScore: number;
  strength: SuggestionStrength;
  /** Names the exact overlap, so a reviewer can check the suggestion instead of trusting it. */
  rationale: string;
  matchedKeywords: string[];
  categoryMatched: boolean;
}

/** Weights, restated here because this module asserts they are the ONLY live terms for a case study. */
export const W_CATEGORY = 3;
export const W_KEYWORD = 1;

// NO MINIMUM-SCORE THRESHOLD HERE, on purpose. The obvious `if (score < 1) continue` would be dead code: the
// matcher already drops every service that scored zero, and with the NAICS term omitted its score is arithmetically
// identical to this module's, so a second threshold could never reject a row the matcher let through. A dead
// threshold is worse than none, because the next person tunes it and nothing moves.

/** A capability label matching AND corroborating vocabulary is the best this data can honestly support. */
const STRONG_KEYWORDS_WITH_CATEGORY = 2;
/** Vocabulary alone, with no category agreement, has to be substantial before it means anything. */
const MODERATE_KEYWORDS_ALONE = 3;

/**
 * What a case study's score must be, given the overlap found. Exported ONLY so a test can prove the NAICS term is
 * inert for case studies: if the matcher ever starts contributing a term this module does not know about, the
 * score stops matching and the test fails rather than the drift going unnoticed.
 */
export function expectedScore(categoryMatched: boolean, matchedKeywordCount: number): number {
  return (categoryMatched ? W_CATEGORY : 0) + matchedKeywordCount * W_KEYWORD;
}

function band(categoryMatched: boolean, keywordCount: number): SuggestionStrength {
  if (categoryMatched && keywordCount >= STRONG_KEYWORDS_WITH_CATEGORY) return 'strong';
  if (categoryMatched || keywordCount >= MODERATE_KEYWORDS_ALONE) return 'moderate';
  return 'weak';
}

function rationaleFor(match: ServiceMatch, categoryLabel: string | null): string {
  const parts: string[] = [];
  if (match.categoryMatched && categoryLabel) parts.push(`capability "${categoryLabel}"`);
  if (match.matchedKeywords.length) parts.push(`wording: ${match.matchedKeywords.join(', ')}`);
  if (!parts.length) return 'Possible overlap. Nothing specific matched, so treat this as a prompt to look.';
  return `Overlaps on ${parts.join('; ')}. Suggested only, not confirmed.`;
}

/**
 * Rank the catalog against one case study. Returns only positive-scoring services, strongest first, name-tiebroken.
 *
 * Totality: never throws. A missing signal, a malformed keyword array, or an empty catalog yields an empty list,
 * because proposing nothing is the correct output when nothing overlapped.
 */
export function suggestServicesForCaseStudy(
  signals: CaseStudyLinkSignals | null | undefined,
  services: MatcherServiceInput[] | null | undefined,
  opts?: { max?: number },
): ServiceLinkSuggestion[] {
  const s = signals || {};
  const matches = matchServicesToOpportunity(
    {
      // The service catalog's `category` is capability-shaped ("AI Enablement", "Data Engineering"), so the
      // record's capability is what it is compared against for whole-word category agreement.
      category: s.primaryCapability ?? null,
      title: s.title ?? null,
      summary: s.canonicalSummary ?? null,
      // Industry and program are labels rather than a capability claim, so they feed keyword matching only.
      requirements: [s.industry ?? null, s.programKey ?? null],
      // Omitted on purpose: `case_studies` has no NAICS column. See this module's header.
      naics: null,
    },
    services,
    { max: opts?.max ?? 6 },
  );

  const out: ServiceLinkSuggestion[] = [];
  for (const m of matches) {
    const matchScore = expectedScore(m.categoryMatched, m.matchedKeywords.length);
    out.push({
      serviceOfferingId: m.id,
      serviceName: m.name,
      category: m.category,
      matchScore,
      strength: band(m.categoryMatched, m.matchedKeywords.length),
      rationale: rationaleFor(m, m.category),
      matchedKeywords: m.matchedKeywords,
      categoryMatched: m.categoryMatched,
    });
  }
  // Re-sort on THIS module's score: the matcher ordered by its own, and the two coincide only while the NAICS term
  // stays inert. Sorting here means a future matcher change cannot silently reorder a reviewer's queue.
  out.sort((a, b) => b.matchScore - a.matchScore || a.serviceName.localeCompare(b.serviceName));
  return out;
}

export default suggestServicesForCaseStudy;
