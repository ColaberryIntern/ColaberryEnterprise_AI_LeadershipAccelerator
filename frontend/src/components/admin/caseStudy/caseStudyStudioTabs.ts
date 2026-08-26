import { CASE_STUDY_CONTROLS } from './caseStudyDesk';
import type { CaseStudyCapability } from './caseStudyDesk';

/**
 * caseStudyStudioTabs — the seven-tab Story Studio, as data.
 *
 * WHAT THIS CHANGES, AND THE DECISION IT REVERSES.
 *
 * `AdminCaseStudyDetailPage.tsx` used to open with: "The whole record is on one
 * page rather than behind tabs, because the decision this screen exists for is
 * a single judgement made across all of it... Splitting that into tabs would
 * let a reviewer approve a record having seen a third of it."
 *
 * That reasoning was correct and the risk it named is real. It is reversed here
 * because the surface has acquired a second job — AUTHORING — and a single
 * scroll of eighteen panels is a bad authoring surface in a different way: the
 * five steps (storyline, sources, analyze, draft, edit) have an order, and a
 * flat page presents them as if they do not.
 *
 * SO THE INVARIANT THE OLD COMMENT PROTECTED IS PRESERVED BY A DIFFERENT
 * MECHANISM, and it is not a convention:
 *
 *   `CaseStudyGateBand` renders the publish gate's refusals ABOVE the tab strip,
 *   on EVERY tab. A reviewer on the Visuals tab sees the same named refusals as
 *   a reviewer on the Publish tab. Approving having seen a third of the record
 *   is still possible in the sense that they did not scroll everything — but
 *   approving without having seen what the gate refuses is not, which is the
 *   half the original comment was actually protecting.
 *
 * `AdminCaseStudies.tabs.test.tsx` proves the band survives on all seven tabs by
 * mutation.
 *
 * THE SECOND JOB OF THIS FILE. `CAPABILITY_TAB` binds every spec §18 capability
 * to the tab that owns it. `AdminCaseStudies.controls.test.tsx` walks
 * `SPEC_18_CAPABILITIES`, and without this map its tests would have to hardcode
 * which tab to click — so the mapping would live in the suite, drift from the
 * product, and the guard would decay into a description of the past. Here, the
 * suite reads the map, and a capability moved between tabs updates one line.
 */

export type CaseStudyStudioTabKey =
  | 'truth' | 'sources' | 'story' | 'visuals' | 'surfaces' | 'preview' | 'publish';

export interface CaseStudyStudioTab {
  readonly key: CaseStudyStudioTabKey;
  readonly label: string;
  /** The question this tab exists to answer, shown under the strip. */
  readonly question: string;
}

/**
 * The order is the order of the work: establish what is TRUE, gather what
 * SOURCES prove it, write the STORY, add the VISUALS, choose the SURFACES, look
 * at the PREVIEW, then PUBLISH. It is not alphabetical and it is not a menu.
 */
export const CASE_STUDY_STUDIO_TABS: readonly CaseStudyStudioTab[] = Object.freeze([
  {
    key: 'truth',
    label: 'TRUTH',
    question: 'What is established about this record, who consented to what, and where did each value come from?',
  },
  {
    key: 'sources',
    label: 'SOURCES',
    question: 'What evidence exists, and what does each source actually prove?',
  },
  {
    key: 'story',
    label: 'STORY',
    question: 'What are we saying, in whose words, and has a human stood behind each sentence?',
  },
  {
    key: 'visuals',
    label: 'VISUALS',
    question: 'What can be shown, and does every number in a picture come from a verified metric?',
  },
  {
    key: 'surfaces',
    label: 'SURFACES',
    question: 'How does this one record read to four different audiences?',
  },
  {
    key: 'preview',
    label: 'PREVIEW',
    question: 'What would a reader actually receive?',
  },
  {
    key: 'publish',
    label: 'PUBLISH',
    question: 'What does the gate refuse, and what happens when it stops refusing?',
  },
]);

export const CASE_STUDY_STUDIO_TAB_KEYS: readonly CaseStudyStudioTabKey[] =
  CASE_STUDY_STUDIO_TABS.map((t) => t.key);

export const DEFAULT_STUDIO_TAB: CaseStudyStudioTabKey = 'truth';

export const studioTabByKey = (key: string): CaseStudyStudioTab =>
  CASE_STUDY_STUDIO_TABS.find((t) => t.key === key) ?? CASE_STUDY_STUDIO_TABS[0];

/**
 * Which tab owns which spec §18 capability.
 *
 * `null` means the capability lives on the LIST page, not the detail page, and
 * therefore belongs to no tab. It is spelled out rather than omitted so that a
 * capability missing from this map is a type error rather than a silent gap —
 * `Record<CaseStudyCapability, ...>` requires every key.
 */
export const CAPABILITY_TAB: Record<CaseStudyCapability, CaseStudyStudioTabKey | null> = {
  // The list page. No tab.
  'dashboard': null,
  'candidate states': null,
  'create from Project': null,
  'create from a repo collection': null,

  // TRUTH — the canonical record and its consent axis.
  'consent': 'truth',
  'contributors': 'truth',
  'inspect provenance': 'truth',

  // SOURCES — what the record is built from.
  'attach repos': 'sources',
  'remove repos': 'sources',
  'assign repo roles': 'sources',
  'sync': 'sources',
  'sync history': 'sources',
  'evidence': 'sources',
  /**
   * The published-vs-draft diff sits on SOURCES rather than PUBLISH, and this
   * is a compromise worth naming rather than hiding.
   *
   * Conceptually it belongs beside the publish controls: it answers "what would
   * change if I published now?". Mechanically it is rendered by
   * `CaseStudySyncPanel`, which also owns `sync history` — one component,
   * two capabilities, and sync history is unambiguously a sources concern.
   * Rendering that panel on both tabs would put duplicate `data-testid`s on one
   * page and break every control lookup; splitting the component is deferred
   * work, not something to do in passing while wiring tabs.
   *
   * So the diff follows its component, and the PUBLISH tab carries a note
   * pointing at it. The map is the truth about where the control IS, never
   * where it ideally belongs — a map that described the intention would send
   * the suite to a tab with no control on it.
   */
  'published-vs-draft diff': 'sources',

  // STORY — the prose and the figures it may state.
  'review/edit narrative': 'story',
  'metrics': 'story',

  // VISUALS — what can be shown.
  'artifacts': 'visuals',

  // PREVIEW — what a reader receives.
  'preview': 'preview',

  // PUBLISH — readiness, the gate, and the four lifecycle acts.
  'readiness gaps': 'publish',
  'approve': 'publish',
  'publish': 'publish',
  'unpublish': 'publish',
  'archive': 'publish',
};

/**
 * The `data-testid` of the tab button that reveals a capability, or null when
 * the capability is not on the detail page. Used by the suite to navigate
 * before asserting, so the §18 guard keeps testing the product rather than a
 * remembered layout.
 */
export const tabTestIdForCapability = (capability: CaseStudyCapability): string | null => {
  const tab = CAPABILITY_TAB[capability];
  return tab ? `cs-studio-tab-${tab}` : null;
};

/** Studio-only controls, kept in the same registry style as `CASE_STUDY_CONTROLS`. */
export const CASE_STUDY_STUDIO_CONTROLS = {
  'storyline': 'cs-storyline',
  'analyze repository': 'cs-analyze-repo',
  'generate story draft': 'cs-generate-draft',
  'promote draft': 'cs-promote-draft',
  'reject draft': 'cs-reject-draft',
  'promote artifact': 'cs-artifact-status',
  'chart': 'cs-chart-save',
  'quote': 'cs-quote-create',
} as const;

export type CaseStudyStudioCapability = keyof typeof CASE_STUDY_STUDIO_CONTROLS;

/**
 * Proved disjoint from `CASE_STUDY_CONTROLS` by the suite. Two registries with
 * a shared id would make one control answer for two capabilities, and the §18
 * guard would go green on a page missing one of them.
 */
export const ALL_STUDIO_TEST_IDS: readonly string[] = [
  ...Object.values(CASE_STUDY_CONTROLS),
  ...Object.values(CASE_STUDY_STUDIO_CONTROLS),
];
