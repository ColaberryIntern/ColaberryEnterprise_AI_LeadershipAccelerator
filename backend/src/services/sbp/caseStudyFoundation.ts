import {
  CASE_STUDY_MATURITIES,
  buildCaseStudyHypothesis,
  hypothesisCoverage,
  type CaseStudyHypothesis,
  type CaseStudyMaturity,
} from './caseStudyHypothesis';
import { DIMENSION_HEADING, groupOf } from './intakeReview';
import type { StoryEnrichmentRow } from './storyEnrichmentLedger';
import type { UnderstandingItem } from '../delivery/projectUnderstanding';
import type { BuildPlan } from './planContract';

/**
 * caseStudyFoundation - everything a case study could be built from, kept in
 * four sections that cannot be confused for one another. PURE.
 *
 * ## The four sections, and why they are four
 *
 *   hypothesis               what the student SAID, before anything happened
 *   buildEvidence            what the stories SHOWED: repo_evidence facts and
 *                            the ledger of what each story reported
 *   demonstrationEvidence    what a story pointed at as "watch it work": a
 *                            test, a file, a URL. Pointers, not results
 *   outcomeEvidence          what was MEASURED in use. Empty, by construction,
 *                            until approved measurement definitions exist
 *
 * A case study that blurs these is how "the tests pass" becomes "the client
 * saved 40%". Each section carries its own provenance and the reader is told
 * what it is looking at.
 *
 * ## Maturity is computed, never stored
 *
 * The rung a project sits on is a function of the evidence it has, recomputed
 * on every read, so nothing can promote a project by editing a column.
 *
 *   story_hypothesis          the default; an interview happened
 *   build_record              at least one story has been verified from the
 *                             repo, or at least one enrichment merged
 *   capability_demonstration  a verified story pointed at a demonstration
 *   operational_result        UNREACHABLE here: needs an outcome measured
 *                             through an approved measurement definition
 *   impact_case_study         UNREACHABLE here: needs a client-confirmed
 *                             business impact on top of that
 *
 * The last two rungs are not "not yet implemented"; they are not reachable
 * from a build alone, and the publish gate refuses anything below
 * operational_result. That is the line between a build record and a case
 * study, and it is drawn in code rather than in an editor's judgement.
 */

export interface BuildFact {
  readonly dimension: string;
  readonly label: string;
  readonly value: string;
  /** The file, commit or test the story named. */
  readonly evidence: string;
}

export interface StoryRecord {
  readonly storyId: string;
  readonly outcome: string;
  readonly mergedRevision: number | null;
  readonly sourceCommitSha: string | null;
  readonly added: number;
  readonly questions: number;
  readonly refused: number;
  readonly reportedAt: string;
}

export interface DemonstrationRef {
  readonly storyId: string;
  readonly kind: string;
  readonly ref: string;
  readonly note: string | null;
  readonly reportedAt: string;
}

export interface CaseStudyFoundation {
  readonly maturity: CaseStudyMaturity;
  readonly ladder: readonly CaseStudyMaturity[];
  /** Why the project sits where it does, and what the next rung needs. */
  readonly maturityReason: string;
  readonly nextRungNeeds: string | null;
  readonly truthRevision: number | null;

  readonly hypothesis: CaseStudyHypothesis;
  readonly hypothesisCoverage: { filled: number; total: number };

  readonly buildEvidence: {
    readonly facts: readonly BuildFact[];
    readonly stories: readonly StoryRecord[];
    readonly verifiedStories: number;
  };
  readonly demonstrationEvidence: readonly DemonstrationRef[];
  readonly outcomeEvidence: {
    readonly items: readonly never[];
    readonly why: string;
    /** Measurement events the stories reported, held unmerged. */
    readonly heldMeasurementEvents: number;
  };

  /** Questions the stories raised that a person has not settled. */
  readonly openQuestions: number;
  readonly publicationPreference: 'undecided';
  readonly publishable: false;
  readonly limitations: readonly string[];
}

export interface FoundationInput {
  readonly items: readonly UnderstandingItem[];
  readonly truthRevision?: number | null;
  readonly plan?: Pick<BuildPlan, 'descriptor' | 'requirements'> | null;
  readonly enrichments: readonly StoryEnrichmentRow[];
  /** Stories the platform verified from the repo, by count. */
  readonly verifiedStories: number;
}

const OUTCOME_WHY = 'No approved measurement definitions exist, so nothing measured in use can be recorded as an outcome yet.';

export const rungIndex = (m: CaseStudyMaturity): number => CASE_STUDY_MATURITIES.indexOf(m);

export function computeMaturity(input: {
  verifiedStories: number;
  mergedEnrichments: number;
  demonstrations: number;
}): { maturity: CaseStudyMaturity; reason: string; nextRungNeeds: string | null } {
  const built = input.verifiedStories > 0 || input.mergedEnrichments > 0;
  if (!built) {
    return {
      maturity: 'story_hypothesis',
      reason: 'No story has been verified and no story has reported what it built.',
      nextRungNeeds: 'A story verified from the repo, or a story that reports what it built.',
    };
  }
  if (input.verifiedStories > 0 && input.demonstrations > 0) {
    return {
      maturity: 'capability_demonstration',
      reason: `${input.verifiedStories} verified ${input.verifiedStories === 1 ? 'story' : 'stories'} and ${input.demonstrations} demonstration ${input.demonstrations === 1 ? 'reference' : 'references'}.`,
      nextRungNeeds: 'An outcome measured in real use through an approved measurement definition. Not reachable from a build alone.',
    };
  }
  return {
    maturity: 'build_record',
    reason: input.verifiedStories > 0
      ? `${input.verifiedStories} verified ${input.verifiedStories === 1 ? 'story' : 'stories'}, no demonstration reference yet.`
      : `${input.mergedEnrichments} ${input.mergedEnrichments === 1 ? 'story has' : 'stories have'} reported what they built; none verified yet.`,
    nextRungNeeds: input.verifiedStories > 0
      ? 'A story that points at a demonstration: a test, a file or a URL where the capability can be watched working.'
      : 'A story verified from the repo.',
  };
}

export function buildCaseStudyFoundation(input: FoundationInput): CaseStudyFoundation {
  const items = input.items.filter((i) => typeof i.value === 'string' && i.value.trim());

  const facts: BuildFact[] = items
    .filter((i) => i.provenance === 'repo_evidence' && i.classification !== 'QUESTION')
    .map((i) => ({
      dimension: i.dimension,
      label: DIMENSION_HEADING[i.dimension] ?? i.dimension,
      value: i.value.trim(),
      evidence: i.source_quote ?? '',
    }));

  const stories: StoryRecord[] = input.enrichments.map((r) => ({
    storyId: r.storyId,
    outcome: r.outcome,
    mergedRevision: r.mergedRevision,
    sourceCommitSha: r.sourceCommitSha,
    added: r.counts.added ?? 0,
    questions: r.counts.questions ?? 0,
    refused: r.counts.refused ?? 0,
    reportedAt: r.createdAt,
  }));

  // Demonstration references are kept only from events that were actually
  // applied (merged or no_op). A refused or replayed event's pointers are the
  // same pointers a counted event already carried, or pointers nobody vouched for.
  const demonstrations: DemonstrationRef[] = input.enrichments
    .filter((r) => r.outcome === 'merged' || r.outcome === 'no_op')
    .flatMap((r) => (r.event.demonstrationEvidence ?? []).map((d) => ({
      storyId: r.storyId,
      kind: d.kind,
      ref: d.ref,
      note: d.note ?? null,
      reportedAt: r.createdAt,
    })));

  const heldMeasurementEvents = input.enrichments
    .filter((r) => r.outcome === 'merged' || r.outcome === 'no_op')
    .reduce((n, r) => n + (r.event.measurementEvents ?? []).length, 0);

  const mergedEnrichments = input.enrichments.filter((r) => r.outcome === 'merged').length;
  const { maturity, reason, nextRungNeeds } = computeMaturity({
    verifiedStories: input.verifiedStories,
    mergedEnrichments,
    demonstrations: demonstrations.length,
  });

  const openQuestions = items.filter((i) => groupOf(i) === 'openQuestions').length;

  const hypothesis = buildCaseStudyHypothesis({
    items, truthRevision: input.truthRevision ?? null, plan: input.plan ?? null,
  });

  const limitations: string[] = [
    ...hypothesis.limitations,
    OUTCOME_WHY,
  ];
  if (openQuestions > 0) {
    limitations.push(`${openQuestions} ${openQuestions === 1 ? 'question a story raised is' : 'questions stories raised are'} still unsettled; the truth disagrees with itself until a person decides.`);
  }
  if (heldMeasurementEvents > 0) {
    limitations.push(`${heldMeasurementEvents} measurement ${heldMeasurementEvents === 1 ? 'event is' : 'events are'} held unmerged: recorded by a story, not an approved measurement.`);
  }

  return {
    maturity,
    ladder: CASE_STUDY_MATURITIES,
    maturityReason: reason,
    nextRungNeeds,
    truthRevision: input.truthRevision ?? null,
    hypothesis,
    hypothesisCoverage: hypothesisCoverage(hypothesis),
    buildEvidence: { facts, stories, verifiedStories: input.verifiedStories },
    demonstrationEvidence: demonstrations,
    outcomeEvidence: { items: [], why: OUTCOME_WHY, heldMeasurementEvents },
    openQuestions,
    publicationPreference: 'undecided',
    publishable: false,
    limitations,
  };
}

/** The two numbers the publish gate needs, and nothing it does not. */
export interface CaseStudyFoundationSummary {
  readonly maturity: CaseStudyMaturity;
  readonly openQuestions: number;
}

export const summarise = (f: CaseStudyFoundation): CaseStudyFoundationSummary => ({
  maturity: f.maturity, openQuestions: f.openQuestions,
});
