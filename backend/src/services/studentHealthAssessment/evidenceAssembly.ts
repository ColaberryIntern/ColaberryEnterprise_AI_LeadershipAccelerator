import { StudentSuccessSnapshot } from '../studentSuccessSnapshot/types';
import {
  AssembledEvidence, EVIDENCE_CATEGORIES, EvidenceCategory, EvidenceCitation,
  ExcludedEvidence, PositiveMomentumSignal,
} from './types';
import { StudentAssessmentConfidenceBand } from '../../models/StudentAssessment';

/** A real assessment requires knowing who the student is plus at least this
 * many of the 12 relevant categories actually known — below this, the
 * mission's own rule applies verbatim: "insufficient evidence must return
 * unknown; do not manufacture confidence." No LLM call is made below the bar
 * (cost-safe and correct — there is nothing real for it to reason over). */
const MINIMUM_KNOWN_CATEGORIES = 3;

function pct(n: number | null): number {
  return n == null ? 0 : Math.round(n);
}

/** Deterministic, real-value-derived summaries — never LLM-authored, so the
 * evidence text handed to the model (and stored on the row) is always
 * grounded in the actual snapshot value, not a paraphrase the LLM invented. */
function summarizeCategory(category: EvidenceCategory, value: any): string {
  switch (category) {
    case 'attendance':
      return `${value.sessionsPresent}/${value.sessionsHeldSoFar} sessions attended (${pct(value.attendancePct)}%)`;
    case 'timelineProgress':
      return `${value.cardsCompleted}/${value.totalCardsSeen} timeline cards completed; last activity ${value.lastActivityAt ?? 'never'}`;
    case 'assessmentTrend':
      return `${value.evalsPassed}/${value.evalsTaken} evaluations passed, avg ${pct(value.avgEvalPct)}%, trend ${value.trend}` +
        (value.weakCompetencies.length ? `; weak: ${value.weakCompetencies.join(', ')}` : '');
    case 'reflectionCompletion':
      return `${value.count} reflections submitted; last readiness score ${value.lastReadiness ?? 'n/a'}`;
    case 'competencyEvidence':
      return value.domains.length
        ? value.domains.map((d: any) => `${d.domainName} ${Math.round(d.confidence)}%`).join(', ')
        : 'no competency domains recorded';
    case 'projectProgress':
      return `project ${value.name ?? 'none'}, stage ${value.stage ?? 'n/a'}, ${pct(value.requirementsCompletionPct)}% requirements, ${value.verifiedStories}/${value.totalStories} verified stories`;
    case 'certReadiness':
      return `${value.overallState}${value.overallScaled != null ? ` (${Math.round(value.overallScaled)}/100)` : ''}`;
    case 'artifactsEvidence':
      return `${value.totalValidated} validated artifacts`;
    case 'communityActivity':
      return `${value.postCount} posts, ${value.totalLikesReceived} likes, ${value.totalCommentsReceived} comments received`;
    case 'ticketsInterventions':
      return `${value.openCount} open / ${value.totalCount} total support tickets`;
    case 'previousReeseCommunications':
      return `${value.messageCount} messages exchanged with Reese; last ${value.lastMessageAt ?? 'never'}`;
    case 'instructorFeedback':
      return `${value.releasedCount} released feedback items, avg confidence ${value.avgConfidence != null ? Math.round(value.avgConfidence) : 'n/a'}`;
    default:
      return 'known';
  }
}

function confidenceBand(score: number, meetsMinimumBar: boolean): StudentAssessmentConfidenceBand {
  if (!meetsMinimumBar) return 'insufficient_evidence';
  if (score >= 70) return 'high';
  if (score >= 40) return 'moderate';
  return 'low';
}

/** The 5 signals this slice can honestly derive from ONE snapshot, computed
 * only from categories that are genuinely 'known' — never from excluded or
 * quarantined data. See PositiveMomentumSignal's own doc for the 2 signals
 * deliberately not computed yet. */
function derivePositiveMomentum(snapshot: StudentSuccessSnapshot): PositiveMomentumSignal[] {
  const signals: PositiveMomentumSignal[] = [];
  if (snapshot.assessmentTrend.status === 'known' && snapshot.assessmentTrend.value?.trend === 'up') {
    signals.push('improving_assessment_trend');
  }
  if (snapshot.communityActivity.status === 'known' && snapshot.communityActivity.value &&
    (snapshot.communityActivity.value.postCount > 0 || snapshot.communityActivity.value.totalCommentsReceived > 0)) {
    signals.push('peer_contribution');
  }
  if (snapshot.certReadiness.status === 'known' && snapshot.certReadiness.value &&
    (snapshot.certReadiness.value.overallState === 'approaching' || snapshot.certReadiness.value.overallState === 'sustained')) {
    signals.push('certification_readiness_milestone');
  }
  if (snapshot.artifactsEvidence.status === 'known' && (snapshot.artifactsEvidence.value?.totalValidated ?? 0) >= 1) {
    signals.push('portfolio_ready_artifact');
  }
  if (snapshot.projectProgress.status === 'known' && (snapshot.projectProgress.value?.verifiedStories ?? 0) >= 1) {
    signals.push('first_milestone');
  }
  return signals;
}

/**
 * Partitions a StudentSuccessSnapshot into usable ('known') vs excluded
 * evidence, computes a deterministic confidence score/band from real
 * evidence coverage (never an LLM self-reported number — see this module's
 * own header in index.ts for why), and derives the honestly-computable
 * positive momentum signals. Pure function, no I/O beyond the snapshot
 * already passed in.
 */
export function assembleEvidence(snapshot: StudentSuccessSnapshot): AssembledEvidence {
  const usable: EvidenceCitation[] = [];
  const excluded: ExcludedEvidence[] = [];

  for (const category of EVIDENCE_CATEGORIES) {
    const field = snapshot[category];
    if (field.status === 'known' && field.value !== null) {
      usable.push({
        category,
        summary: summarizeCategory(category, field.value),
        sourceSystem: field.sourceSystem,
        sourceRecordIds: field.sourceRecordIds,
        observedAt: field.observedAt ? field.observedAt.toISOString() : null,
      });
    } else {
      excluded.push({ category, status: field.status, reliabilityReason: field.reliabilityReason ?? null });
    }
  }

  const knownCount = usable.length;
  const totalRelevant = EVIDENCE_CATEGORIES.length;
  const meetsMinimumBar = snapshot.identity.status === 'known' && knownCount >= MINIMUM_KNOWN_CATEGORIES;
  const confidenceScore = meetsMinimumBar ? Math.round((knownCount / totalRelevant) * 100) : 0;

  return {
    enrollmentId: snapshot.enrollmentId,
    usable,
    excluded,
    knownCount,
    totalRelevant,
    confidenceScore,
    confidenceBand: confidenceBand(confidenceScore, meetsMinimumBar),
    meetsMinimumBar,
    positiveMomentumSignals: derivePositiveMomentum(snapshot),
  };
}
