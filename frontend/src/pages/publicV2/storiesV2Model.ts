import { BUILT_BY_LABELS } from '../../config/caseStudySurfaces';
import type { CaseStudyFilterState } from '../../services/caseStudyApi';
import type {
  CaseStudyFilterGroup,
  CaseStudyFilterOption,
} from '../../components/caseStudy/CaseStudyFilters';
import type {
  CaseStudyLedgerCounts,
  PublicCaseStudyFacet,
  PublicCaseStudyListResponse,
  PublicCaseStudySummary,
  PublicCaseStudyTaxonomyFacets,
  PublicVerificationClass,
} from '../../services/caseStudyPublicTypes';

/**
 * storiesV2Model - the decisions `/stories` makes that are not rendering.
 *
 * WHY IT IS A SEPARATE MODULE. Three of the index's acceptance criteria are
 * rules rather than markup - which records are hidden unless asked for, which of
 * two empty sentences is the truthful one, and which facet groups exist at all.
 * A rule buried inside a component is only testable by rendering the component
 * and reading its output, which is how a subtle change to "hidden by default"
 * ends up asserted by a string match on a page. Here they are pure functions
 * with no React and no I/O, so the suite can state each rule directly.
 *
 * WHY IT IS NOT IN `components/caseStudy/`. That directory is a closed set:
 * `caseStudyStyleContract.test.ts` asserts its exact ten filenames, so a
 * non-component module added there would fail a test belonging to another task.
 * This is page-local logic, so it lives beside the page.
 */

/* --------------------------------------------------------- page contents --- */

/** Loading, failed and populated. Empty is a shape of populated, decided below. */
export type IndexState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly data: PublicCaseStudyListResponse }
  | { readonly status: 'failed'; readonly message: string };

/**
 * The masthead before the first response, and if the request fails.
 *
 * The SERVER owns this copy: `surface.hero` arrives on every response and is
 * used the moment it does. This is pre-flight text for the one surface that has
 * a page, kept identical to what the enterprise profile sends so the swap-in is
 * invisible. It contains no count, no client name and no outcome, so it cannot
 * assert anything the API has not confirmed.
 */
/**
 * BYTE-IDENTICAL to `enterprise` in
 * `backend/src/services/caseStudy/caseStudySurfaceProfiles.ts`, and pinned to it
 * by a test that reads that file — not by this comment.
 *
 * It drifted once already. The eyebrow separator was `/` here and `·` there, and
 * the description said "project delivery records" against the server's
 * "Refactored project records" — so a real visitor watched the eyebrow and one
 * clause of the lede change the moment the first response landed, while a
 * comment two lines up claimed the swap was invisible. Same shape as the
 * `var(--space-7)` bug this page fixed: correct in review, wrong on screen.
 */
export const MASTHEAD_FALLBACK = Object.freeze({
  eyebrow: 'Enterprise · shipped work',
  title: 'What we shipped, and who built it.',
  description:
    'Every published project is assembled from repository evidence, Refactored project '
    + 'records, and approved verification. The proof behind a number matters as much as '
    + 'the number.',
});

/** Facet groups collapse below this width: section 22's progressive disclosure. */
export const WIDE_VIEWPORT = '(min-width: 64rem)';

/**
 * What the `aria-live` result count says, in each of the four states.
 *
 * Every figure is read off the response. "Loading" and "failed" say so rather
 * than reporting a count of zero, which would be a false statement about the
 * library dressed up as a number.
 */
export function countSentence(state: IndexState): string {
  if (state.status === 'loading') return 'Loading published projects.';
  if (state.status === 'failed') return 'No result count: these project records did not load.';
  const { items, total } = state.data;
  if (total === 0) return 'No published projects to show.';
  if (items.length === total) {
    return `Showing ${total} published ${total === 1 ? 'project' : 'projects'}.`;
  }
  return `Showing ${items.length} of ${total} published projects.`;
}

/* --------------------------------------------------- verification classes --- */

/**
 * The three classes the public API can send, as a runtime list.
 *
 * `PublicVerificationClass` is a type and erases at build time, so a value-level
 * list is unavoidable. It is pinned two ways rather than trusted: the label map
 * below is a `Record<PublicVerificationClass, string>`, which will not compile
 * if a class is added to the union and not to the map, and the suite asserts
 * this array and that map have the same members. Mirrors
 * `PUBLIC_VERIFICATION_CLASSES` in `backend/src/types/caseStudyPublic.ts`.
 */
export const PUBLIC_VERIFICATION_CLASSES: readonly PublicVerificationClass[] = Object.freeze([
  'verified',
  'anonymized',
  'illustrative',
]);

/**
 * How each class is spelled in a facet menu.
 *
 * The same words `<EvidenceBadge>` prints, because a filter that says one thing
 * and a badge that says another describes two different libraries. The map is
 * private to `Claim.tsx` and cannot be imported, so the suite renders the badge
 * and asserts these strings appear in it - a checked mirror rather than a second
 * vocabulary.
 */
export const VERIFICATION_CLASS_LABELS: Readonly<Record<PublicVerificationClass, string>> =
  Object.freeze({
    verified: 'Verified',
    anonymized: 'Anonymized',
    illustrative: 'Illustrative demo',
  });

/**
 * Hidden unless a reader explicitly asks (spec section 14).
 *
 * `pending` is absent because it CANNOT be expressed: the public union has three
 * members and the API returns a 400 for `verification=pending`, so a figure
 * awaiting confirmation has no representation to leak through. `illustrative` is
 * the class that can reach this page, and an illustration sitting unlabelled
 * among verified outcomes is the exact failure the proof standard exists to
 * prevent - so it is excluded from the default request rather than merely
 * badged.
 */
export const HIDDEN_VERIFICATION_CLASSES: readonly PublicVerificationClass[] =
  Object.freeze(['illustrative']);

/** What an unfiltered visit actually asks the server for. Derived, not typed. */
export const DEFAULT_VISIBLE_VERIFICATION_CLASSES: readonly PublicVerificationClass[] =
  Object.freeze(
    PUBLIC_VERIFICATION_CLASSES.filter((cls) => !HIDDEN_VERIFICATION_CLASSES.includes(cls)),
  );

/**
 * The filters actually sent, given the filters the URL carries.
 *
 * The default is applied to the REQUEST and never written back into the URL, so
 * `hasActiveCaseStudyFilters()` keeps answering the question it was built for -
 * "has the reader narrowed this?" - which is what tells a filtered-empty result
 * apart from an empty library. Writing the default into the URL would make
 * every visit look filtered and collapse the two empty states into one.
 *
 * An explicit `verification` in the URL wins outright, including one that asks
 * for illustrative records: hidden by default is a default, not a prohibition.
 */
export function withDefaultVerification(state: CaseStudyFilterState): CaseStudyFilterState {
  if (state.verification.length > 0) return state;
  return { ...state, verification: DEFAULT_VISIBLE_VERIFICATION_CLASSES };
}

/** True when the reader has opted into a class that is otherwise withheld. */
export function showsHiddenVerificationClasses(state: CaseStudyFilterState): boolean {
  return state.verification.some((cls) => HIDDEN_VERIFICATION_CLASSES.includes(cls));
}

/**
 * How many published records the default is withholding right now.
 *
 * Counted off the taxonomy, which the server derives from what is published, so
 * the page can disclose the exclusion without asserting a number nobody
 * computed. Zero means nothing is being withheld and the notice is not shown.
 */
export function hiddenVerificationCount(facets: PublicCaseStudyTaxonomyFacets | null): number {
  if (!facets) return 0;
  return facets.verificationClasses
    .filter((facet) => HIDDEN_VERIFICATION_CLASSES.includes(facet.slug))
    .reduce((total, facet) => total + facet.count, 0);
}

/* ------------------------------------------------------------ empty state --- */

export type StoriesEmptyState = 'filtered' | 'library' | null;

/**
 * WHICH TRUTHFUL SENTENCE, OR NEITHER (spec section 22).
 *
 * The discriminator is the LEDGER, not the filter state. `ledger` is computed
 * from every record visible on the surface before any query narrows it, so
 * `projects === 0` is the only fact that means "nothing is published here".
 * Deciding from the filter state instead would call an empty library "no match"
 * whenever a reader happened to have a facet ticked, and - worse - would call a
 * result emptied by the default verification exclusion an empty library, since
 * the reader set no filter at all.
 *
 * The four states this page can be in are loading, failed, empty and populated.
 * Only the last two reach this function; a failed load must never arrive here,
 * because "we could not load them" and "there are none" are different sentences
 * and collapsing them is what the admin leads page shipped.
 */
export function emptyStateFor(
  items: readonly PublicCaseStudySummary[],
  ledger: CaseStudyLedgerCounts,
): StoriesEmptyState {
  if (items.length > 0) return null;
  return ledger.projects > 0 ? 'filtered' : 'library';
}

/* ---------------------------------------------------------- facet groups --- */

const toOptions = (facets: readonly PublicCaseStudyFacet[]): CaseStudyFilterOption[] =>
  facets.map((facet) => ({
    value: facet.slug,
    // The server sends the slug as the label and says so: display copy belongs
    // to the renderer. For an open vocabulary the slug IS the reader's word.
    label: facet.label.length > 0 ? facet.label : facet.slug,
    count: facet.count,
  }));

/**
 * The six facet groups, in the order spec section 22 lists them.
 *
 * Every group is built from the taxonomy the server derived from published
 * records, so a facet that matches nothing is never offered and an empty library
 * produces no menu at all. `CaseStudyFilters` drops any group with no options
 * and renders nothing when all of them are empty, which is why this function
 * does not filter: an empty array is a legitimate answer that the component
 * already handles.
 *
 * The two CLOSED vocabularies - built by, verification - are the only ones with
 * label maps, because they are the only ones whose values are enum members
 * rather than the reader's own words.
 */
export function filterGroupsFrom(
  facets: PublicCaseStudyTaxonomyFacets | null,
): CaseStudyFilterGroup[] {
  if (!facets) return [];
  return [
    { field: 'stack', legend: 'Stack', options: toOptions(facets.stack) },
    { field: 'capability', legend: 'Capability', options: toOptions(facets.capabilities) },
    { field: 'industry', legend: 'Industry', options: toOptions(facets.industries) },
    { field: 'program', legend: 'Program', options: toOptions(facets.programs) },
    {
      field: 'builtBy',
      legend: 'Built by',
      options: facets.builtBy.map((facet) => ({
        value: facet.slug,
        label: BUILT_BY_LABELS[facet.slug],
        count: facet.count,
      })),
    },
    {
      field: 'verification',
      legend: 'Verification',
      options: facets.verificationClasses.map((facet) => ({
        value: facet.slug,
        label: VERIFICATION_CLASS_LABELS[facet.slug],
        count: facet.count,
      })),
    },
  ];
}
