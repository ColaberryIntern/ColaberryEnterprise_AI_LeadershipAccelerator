/**
 * caseStudyContextualFacets - facet counts and the ledger for the CURRENT selection (W26).
 *
 * Ali, 2026-11-18, on /proof: "the numbers don't move with the filters" and "all
 * the filters should be filtered by that selection as well." The taxonomy route
 * counts the whole library, which is right for the header menu and wrong for a
 * filter panel: after choosing Sales, offering every capability in the library
 * (most of which would return nothing) is a menu of dead ends.
 *
 * DISJUNCTIVE COUNTS. Each axis is counted over the records that match every
 * OTHER axis, the standard faceted-search rule. Within one axis the filters are
 * OR (see `matchesCaseStudyFilters`), so counting Department over a set already
 * narrowed to Sales would show only Sales and make adding Operations impossible.
 * Excluding the axis being counted keeps its siblings selectable with honest
 * counts, while every other axis narrows to the selection.
 *
 * PURE and reuses the one engine: the predicate is `matchesCaseStudyFilters`
 * and the counting is `buildCaseStudyTaxonomy`, so these numbers cannot
 * disagree with what the result list returns.
 */

import {
  buildCaseStudyLedger,
  buildCaseStudyTaxonomy,
  matchesCaseStudyFilters,
} from './caseStudyFilterService';
import type { CaseStudyFilterCandidate, CaseStudyLedger } from './caseStudyFilterService';
import type { CaseStudyFilterInput } from '../../types/caseStudyFilters';
import type { PublicCaseStudyTaxonomyFacets } from '../../types/caseStudyPublic';

/** Which filter axis each facet list is counted along. */
const AXIS: Readonly<Record<keyof PublicCaseStudyTaxonomyFacets, keyof CaseStudyFilterInput>> = Object.freeze({
  capabilities: 'capability',
  industries: 'industry',
  departments: 'department',
  stack: 'stack',
  programs: 'program',
  builtBy: 'builtBy',
  verificationClasses: 'verificationClass',
});

const matching = (
  candidates: readonly CaseStudyFilterCandidate[], filters: CaseStudyFilterInput,
): CaseStudyFilterCandidate[] => candidates.filter((c) => matchesCaseStudyFilters(c, filters));

export function buildContextualTaxonomy(
  candidates: readonly CaseStudyFilterCandidate[],
  filters: CaseStudyFilterInput,
): PublicCaseStudyTaxonomyFacets {
  const countAlong = <K extends keyof PublicCaseStudyTaxonomyFacets>(key: K): PublicCaseStudyTaxonomyFacets[K] => {
    const others: CaseStudyFilterInput = { ...filters, [AXIS[key]]: undefined };
    return buildCaseStudyTaxonomy(matching(candidates, others))[key];
  };
  return {
    capabilities: countAlong('capabilities'),
    industries: countAlong('industries'),
    departments: countAlong('departments'),
    stack: countAlong('stack'),
    programs: countAlong('programs'),
    builtBy: countAlong('builtBy'),
    verificationClasses: countAlong('verificationClasses'),
  };
}

/** The masthead figures for exactly what the result list holds, every page of it. */
export function buildMatchLedger(
  candidates: readonly CaseStudyFilterCandidate[],
  filters: CaseStudyFilterInput,
): CaseStudyLedger {
  return buildCaseStudyLedger(matching(candidates, filters));
}
