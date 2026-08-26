import { formatIsoDate } from '../../components/caseStudy/CaseStudyTimeline';
import { BUILT_BY_LABELS, ROADMAP_STATUS_LABELS } from '../../config/caseStudySurfaces';
import type {
  CaseStudySectionKey,
  PublicCaseStudyArchitecture,
  PublicCaseStudyContributor,
  PublicCaseStudyDetail,
  PublicCaseStudyDetailResponse,
  PublicCaseStudyMetric,
  PublicSurfaceView,
} from '../../services/caseStudyPublicTypes';

/**
 * storyDetailV2Model - the decisions `/stories/:slug` makes that are not markup.
 *
 * WHY IT IS A SEPARATE MODULE. Three of this page's acceptance criteria are
 * rules rather than rendering - which sections exist for a record, which figure
 * is complete enough to headline, and what a withheld repository may say. A rule
 * inside a component can only be tested by rendering the component, which is how
 * "hidden unless supported" quietly becomes "hidden unless this fixture is
 * empty". These are pure functions.
 *
 * The fourth rule - when structured data may be emitted - moved to
 * `storySeoModel.ts` when this file reached its 300-line ceiling.
 *
 * WHY IT IS NOT IN `components/caseStudy/`. That directory is a closed set:
 * `caseStudyStyleContract.test.ts` asserts its exact ten filenames, so anything
 * added there fails a test belonging to another task. `storiesV2Model.ts` sits
 * beside its page for the same reason.
 */

/* ---------------------------------------------------------------- state --- */

/**
 * Four states, and NOT-FOUND IS NOT A FAILURE. "This record does not exist" is a
 * final answer with a way back to the index; "we could not load it" is
 * temporary and deserves a retry. Collapsing them is the defect the admin leads
 * page shipped in reverse - a failed fetch rendered as "no rows" against 24,244.
 */
export type DetailState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly data: PublicCaseStudyDetailResponse }
  | { readonly status: 'not-found' }
  | { readonly status: 'failed'; readonly message: string };

/** The V2 not-found treatment for this surface. Exported so the suite quotes it. */
export const NOT_FOUND_HEADING = 'Project record not found';
export const NOT_FOUND_BODY =
  'That project record is not available. It may not be published, or the address may be wrong.';

/* -------------------------------------------------------------- sections --- */

/**
 * Spec section 23's ten sections, in its order. Used only when the server sends
 * none of its own: the surface profile is the authority, and this is the
 * fallback that stops an empty `sectionOrder` rendering an empty page.
 */
export const DEFAULT_SECTION_ORDER: readonly CaseStudySectionKey[] = Object.freeze([
  'hero', 'situation', 'build', 'architecture', 'measurement',
  'roadmap', 'contributors', 'artifacts', 'repositories', 'cta',
] as CaseStudySectionKey[]);

/**
 * The heading each section carries. `hero` holds the `h1` and the CTA brings its
 * own heading from surface data, so those two entries are empty strings.
 */
export const SECTION_HEADINGS: Readonly<Record<CaseStudySectionKey, string>> = Object.freeze({
  hero: '',
  situation: 'The situation',
  build: 'The build',
  architecture: 'What was built',
  measurement: 'The measurement',
  roadmap: 'What happened next',
  contributors: 'Who built it',
  artifacts: 'Artifacts',
  repositories: 'Repositories and provenance',
  cta: '',
});

/**
 * Whether "What was built" has anything to show, across BOTH its renderers:
 * `CaseStudyArchitecture` returns null when its fields are empty, `StoryDiagram`
 * renders on `diagramSource` alone. Drop either clause and the band hides on
 * exactly the records it exists for, every other test still green. `dataStores`
 * counts here for the same reason it counts in the snapshot builder and in the
 * projector: all three must agree, or the field survives one layer and vanishes
 * at the next. */
export function architectureHasContent(architecture: PublicCaseStudyArchitecture | null): boolean {
  if (!architecture) return false;
  const diagram = architecture.diagram;
  return architecture.narrative.length > 0
    || architecture.stack.length > 0
    || architecture.capabilities.length > 0
    || architecture.integrations.length > 0
    || architecture.dataStores.length > 0
    || (diagram?.nodes.length ?? 0) > 0
    || (diagram?.edges.length ?? 0) > 0
    || (architecture.diagramSource ?? '').trim().length > 0;
}

/**
 * Whether the record carries enough for a section to say anything. HIDE RATHER
 * THAN RENDER EMPTY (spec section 23): every branch asks about the DATA, never
 * about a component's return value, so visibility is decided before anything
 * mounts. A heading over a null component is the failure this prevents.
 */
export function isSectionSupported(
  detail: PublicCaseStudyDetail,
  key: CaseStudySectionKey,
): boolean {
  switch (key) {
    case 'hero':
    case 'cta':
      return true;
    case 'situation':
      return !!detail.situation && detail.situation.body.length > 0;
    case 'build':
      return detail.timeline.length > 0;
    case 'architecture':
      return architectureHasContent(detail.architecture);
    case 'measurement':
      return !!detail.measurement
        && (detail.measurement.narrative.length > 0 || detail.measurement.metrics.length > 0);
    case 'roadmap':
      return detail.roadmap.length > 0;
    case 'contributors':
      return detail.contributors.length > 0 || detail.anonymousContributorCount > 0;
    case 'artifacts':
      return detail.artifacts.length > 0;
    case 'repositories':
      return detail.repositories.length > 0 || detail.privateRepositoryCount > 0;
    default:
      return false;
  }
}

/**
 * The sections this record shows, in the order the surface asked for: the
 * surface's own order (or the spec default), minus anything the surface hides,
 * minus anything the record cannot support. A key named twice is emitted once.
 */
export function visibleSections(
  detail: PublicCaseStudyDetail,
  surface: PublicSurfaceView,
): readonly CaseStudySectionKey[] {
  const order = surface.sectionOrder.length > 0 ? surface.sectionOrder : DEFAULT_SECTION_ORDER;
  const hidden = new Set<CaseStudySectionKey>(surface.hiddenSections);
  const seen = new Set<CaseStudySectionKey>();
  const out: CaseStudySectionKey[] = [];
  for (const key of order) {
    if (hidden.has(key) || seen.has(key)) continue;
    seen.add(key);
    if (isSectionSupported(detail, key)) out.push(key);
  }
  return out;
}

/* --------------------------------------------------------------- figures --- */

/**
 * Whether a figure carries the context that makes it readable. Spec section 23:
 * "A high-impact number without evidence context is incomplete." Baseline,
 * sample, methodology and limitations answer "compared with what, over what, by
 * what method, with what caveat". A figure with none of them is an assertion.
 */
export function hasEvidenceContext(metric: PublicCaseStudyMetric): boolean {
  return !!metric.baseline
    || !!metric.sample
    || !!metric.methodology
    || metric.limitations.length > 0;
}

/**
 * The figures allowed to headline the hero. A contextless figure is DROPPED
 * FROM THE HERO, not from the page: it still renders in the measurement section
 * when the record carries it there. What must not happen is the hero printing it
 * at display size with nothing beside it - the shape section 23 calls
 * incomplete, and the shape that made the fabricated case studies persuasive.
 */
export function heroMetricsFor(detail: PublicCaseStudyDetail): readonly PublicCaseStudyMetric[] {
  return detail.heroMetrics.filter(hasEvidenceContext);
}

export interface StoryFact {
  readonly term: string;
  readonly value: string;
}

/** Only the fields the figure actually carries, in reading order. */
export function evidenceContextRows(metric: PublicCaseStudyMetric): readonly StoryFact[] {
  const rows: StoryFact[] = [];
  if (metric.baseline) rows.push({ term: 'Baseline', value: metric.baseline });
  if (metric.unit) rows.push({ term: 'Unit', value: metric.unit });
  if (metric.sample) rows.push({ term: 'Sample', value: metric.sample });
  if (metric.methodology) rows.push({ term: 'Methodology', value: metric.methodology });
  return rows;
}

/* ------------------------------------------------------------ hero facts --- */

/**
 * A published date with no `new Date()` anywhere near it. `new
 * Date('2026-08-01')` parses as UTC midnight, so in any negative-offset
 * timezone `toLocaleDateString()` prints July 31. `formatIsoDate` reads the
 * three fields out of the string instead, which is why it is imported rather
 * than re-implemented; the only work here is trimming the time portion.
 */
export function formatPublishedDate(iso: string): string {
  return formatIsoDate(typeof iso === 'string' ? iso.slice(0, 10) : iso);
}

/**
 * The hero's context strip. Every entry is consent-resolved upstream and every
 * one is omitted when absent, so an unnamed client shows no organisation row
 * rather than an "Undisclosed" placeholder somebody could mistake for a fact.
 */
export function heroFacts(detail: PublicCaseStudyDetail): readonly StoryFact[] {
  const candidates: readonly (readonly [string, string | null])[] = [
    ['Program', detail.programLabel],
    ['Organization', detail.organizationLabel],
    ['Industry', detail.industry],
    ['Capability', detail.primaryCapability],
    ['Duration', detail.engagementDuration],
    ['Status', detail.productionStatus ? ROADMAP_STATUS_LABELS[detail.productionStatus] : null],
    ['Built by', detail.builtBy ? BUILT_BY_LABELS[detail.builtBy] : null],
    ['Published', detail.publishedAt ? formatPublishedDate(detail.publishedAt) : null],
  ];
  return candidates
    .filter((pair): pair is readonly [string, string] => !!pair[1])
    .map(([term, value]) => ({ term, value }));
}

/** How a consenting contributor is named. There is no anonymous variant. */
export function contributorLabel(contributor: PublicCaseStudyContributor): string {
  return contributor.displayMode === 'named' ? contributor.displayName : contributor.role;
}

/* ------------------------------------------------------- withheld counts --- */

/**
 * WHAT THE COUNT MAY CLAIM. The projection withholds a repository when it is not
 * public, OR carries no public-link consent, OR has an unparseable URL - three
 * reasons collapsed into one number. So the sentence says "not linked here",
 * true of all three, rather than "private", true of only one.
 */
export function withheldRepositoryNote(count: number): string | null {
  if (!Number.isFinite(count) || count < 1) return null;
  const n = Math.trunc(count);
  return n === 1
    ? 'One further repository is part of this record and is not linked here.'
    : `${n} further repositories are part of this record and are not linked here.`;
}

/** Contributors who did not consent to be named survive only as this count. */
export function anonymousContributorNote(count: number): string | null {
  if (!Number.isFinite(count) || count < 1) return null;
  const n = Math.trunc(count);
  return n === 1
    ? 'One further contributor is not named here.'
    : `${n} further contributors are not named here.`;
}
