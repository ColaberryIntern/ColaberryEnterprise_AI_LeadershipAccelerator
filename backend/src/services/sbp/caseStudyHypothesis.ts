import { remainingAngles } from './projectDiscoveryCall';
import { groupOf } from './intakeReview';
import type { UnderstandingItem } from '../delivery/projectUnderstanding';
import type { BuildPlan } from './planContract';

/**
 * caseStudyHypothesis — what a case study COULD say, before anything has
 * happened. PURE.
 *
 * ## It is a projection, not a record
 *
 * The brief asks for an "unpublished, internal case-study hypothesis or linked
 * draft foundation, not a published case study". The lightest honest form of
 * that is a PROJECTION computed from the truth revision on demand, rather than
 * a persisted copy that drifts the moment a student corrects a fact. A
 * hypothesis that is recomputed from truth cannot disagree with truth; one that
 * is stored can, and the stored one is the one somebody will read.
 *
 * So there is no table. There is no row. There is nothing to publish, because
 * there is nothing that persists to be published. The Phase 4 approval chose
 * this over a `case_studies` row precisely so the case-study library does not
 * fill with hypotheses that the publish gate then has to guard.
 *
 * ## What it refuses to say
 *
 * Every field is populated only from what the student's confirmed truth
 * supports. The brief lists what an interview must NOT produce, and each of
 * those is a field this module does not have:
 *
 *   achieved results     the project has not run
 *   testimonials         nobody has said anything about it yet
 *   production usage     it is not in production
 *   business impact      nothing has been measured
 *
 * They are not empty fields waiting to be filled. They are absent from the
 * type, so a consumer cannot render an achieved-results block over a
 * placeholder and call it a case study.
 *
 * ## Maturity is a constant
 *
 * `story_hypothesis`, always. The brief's ladder runs hypothesis, build record,
 * capability demonstration, operational result, impact case study - and an
 * interview can produce only the first rung. Later rungs are earned by
 * evidence this module never sees, so it cannot be argued into promoting one.
 */

export const HYPOTHESIS_MATURITY = 'story_hypothesis' as const;

/** The full ladder, for consumers that render where a project sits on it. */
export const CASE_STUDY_MATURITIES = [
  'story_hypothesis',
  'build_record',
  'capability_demonstration',
  'operational_result',
  'impact_case_study',
] as const;
export type CaseStudyMaturity = (typeof CASE_STUDY_MATURITIES)[number];

export interface CaseStudyHypothesis {
  readonly maturity: typeof HYPOTHESIS_MATURITY;
  /** The truth revision this was projected from, so a reader can tell it is current. */
  readonly truthRevision: number | null;

  /** Who this is for, in the student's words. Null when they have not said. */
  readonly beneficiary: string | null;
  /** The situation before, as they described it. */
  readonly beforeState: string | null;
  /** What goes wrong today, or costs something. */
  readonly stakes: string | null;
  /** What it would be like after. */
  readonly intendedTransformation: string | null;
  /** The capability the plan intends to build. From the plan, not the interview. */
  readonly plannedCapability: string | null;
  /** How they would show it working. */
  readonly demonstrationScenario: string | null;

  /** What "good" means to them. The seed of a measurement plan, not the plan. */
  readonly successDefinition: string | null;
  /** Baselines the student actually stated. */
  readonly knownBaselines: readonly string[];
  /** Angles still unanswered, in the reader's language, so the gaps are visible. */
  readonly unknowns: readonly string[];

  /** Only ever what they said. Never inferred from a lead record or a brand. */
  readonly publicationPreference: 'undecided';

  /** What this hypothesis cannot yet claim, stated so nobody has to infer it. */
  readonly limitations: readonly string[];
}

/** First item in a dimension, in the student's own words, or null. */
function said(items: readonly UnderstandingItem[], dimension: UnderstandingItem['dimension']): string | null {
  // Confirmed statements outrank merely-heard ones; inferences never appear
  // here at all. A hypothesis built on a guess is a guess wearing a heading.
  const candidates = items
    .filter((i) => i.dimension === dimension && typeof i.value === 'string' && i.value.trim())
    .filter((i) => groupOf(i) !== 'inferences');
  const confirmed = candidates.find((i) => groupOf(i) === 'confirmed');
  return (confirmed ?? candidates[0])?.value.trim() ?? null;
}

/** Plain-language reasons a hypothesis cannot yet claim more than it does. */
const UNKNOWN_IN_PLAIN_WORDS: Readonly<Record<string, string>> = {
  'THE MEASURE': 'no baseline was stated, so nothing can be measured against it',
  'THE OPERATOR': 'who will actually use this is not recorded',
  'THE JOB': 'the one-sentence purpose is not written down',
  'THE GUARDRAIL': 'what a person checks before it acts is not settled',
  'THE TOOLS': 'the systems it must work with are not settled',
  'TRIGGER AND RHYTHM': 'how often this happens is unknown, so scale cannot be described',
  'THE STANDOUT AND THE CUT': 'no demonstration moment has been described',
  'THE JUDGEMENT': 'the decision being handed over has not been described',
  'WHEN IT IS NOT SURE': 'its behaviour under uncertainty is undecided',
  'EARNING AUTONOMY': 'what would let it run unsupervised is unstated',
};

export interface HypothesisInput {
  readonly items: readonly UnderstandingItem[];
  readonly truthRevision?: number | null;
  readonly plan?: Pick<BuildPlan, 'descriptor' | 'requirements'> | null;
}

export function buildCaseStudyHypothesis(input: HypothesisInput): CaseStudyHypothesis {
  const items = input.items;
  const unknownAngles = remainingAngles(items);

  const successDefinition = said(items, 'success_definition');

  // The plan's own one-line descriptor is the honest statement of planned
  // capability: it is what the pipeline committed to build, not what the
  // student hoped for. Absent a plan, there is no planned capability yet.
  const plannedCapability = input.plan?.descriptor?.trim() || null;

  const limitations: string[] = [
    'This is a hypothesis. Nothing here has been built, run, measured or used.',
  ];
  if (!successDefinition) {
    limitations.push('No definition of success was given, so no outcome can be claimed later without one.');
  }
  for (const angle of unknownAngles) {
    const reason = UNKNOWN_IN_PLAIN_WORDS[angle];
    if (reason) limitations.push(reason);
  }

  return {
    maturity: HYPOTHESIS_MATURITY,
    truthRevision: input.truthRevision ?? null,

    beneficiary: said(items, 'actors'),
    beforeState: said(items, 'current_workflow'),
    stakes: said(items, 'pain_points'),
    intendedTransformation: said(items, 'desired_outcome'),
    plannedCapability,
    demonstrationScenario: said(items, 'outputs'),

    successDefinition,
    knownBaselines: successDefinition ? [successDefinition] : [],
    unknowns: unknownAngles.map((a) => UNKNOWN_IN_PLAIN_WORDS[a]).filter((s): s is string => Boolean(s)),

    // 'undecided' is the only value an interview can produce. A preference to
    // be named or anonymous is a consent decision a person records deliberately,
    // and the brief is explicit that it is never inferred.
    publicationPreference: 'undecided',

    limitations,
  };
}

/**
 * How much of a case study this could become, as a fraction of the fields a
 * story needs. Advisory, for a readiness surface. It is not a quality score
 * and it never gates anything: a project with every field filled is still a
 * hypothesis until something has actually happened.
 */
export function hypothesisCoverage(h: CaseStudyHypothesis): { filled: number; total: number } {
  const fields = [
    h.beneficiary, h.beforeState, h.stakes, h.intendedTransformation,
    h.plannedCapability, h.demonstrationScenario, h.successDefinition,
  ];
  return { filled: fields.filter((f) => f !== null).length, total: fields.length };
}
