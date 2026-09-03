import { ExplorerJourneyDecision, ExplorerJourneyProfile } from '../../models';
import type { ExplorerActionType } from '../../types/explorerGrowth';
import { namedGaps } from './explorerGapParsing';
import type {
  ExplorerWhy,
  ExplorerWhyAbsent,
  ExplorerWhyContent,
  ExplorerWhyDrift,
  ExplorerWhyFound,
  ExplorerWhyOutcome,
  ExplorerWhyScores,
} from './explorerWhyTypes';

// Re-exported so consumers import the payload contract from the service that
// produces it, rather than having to know it lives in a sibling file.
export type {
  ExplorerWhy,
  ExplorerWhyAbsent,
  ExplorerWhyContent,
  ExplorerWhyDrift,
  ExplorerWhyFound,
  ExplorerWhyOutcome,
  ExplorerWhyScores,
} from './explorerWhyTypes';

/**
 * The "Why?" drilldown — the centrepiece of the Command Center.
 *
 * For one learner on one day: what was decided, and **why was everything else
 * not decided**. The second half is the whole point. A payload that returns the
 * winner alone answers "what happened", looks complete, and quietly fails to
 * answer the question the page is named after.
 *
 * ── NOTHING IS RECOMPUTED ───────────────────────────────────────────────────
 *
 * Every field is READ from `explorer_journey_decisions` and
 * `explorer_journey_profiles`. No scorer, state machine or governor is invoked.
 *
 * That is a correctness requirement, not a performance one. Re-running the
 * scorer would answer "what would we decide about this learner now", a different
 * question that diverges from "what did we decide, and why" the moment any score
 * moves. A nightly recompute moves scores constantly, so the two answers
 * disagree most of the time — and the recomputed one would look more
 * authoritative while being wrong about the past.
 *
 * The decision row carries the scores AS AT the decision. The profile carries
 * them as at the last recompute. Both are returned, separately labelled, with an
 * explicit `drift` block.
 */

type DecisionRow = InstanceType<typeof ExplorerJourneyDecision>;
type ProfileRow = InstanceType<typeof ExplorerJourneyProfile>;

/** Actions expected to carry content. A WAIT carrying none is not a gap. */
const ACTIONS_EXPECTING_CONTENT: ReadonlySet<ExplorerActionType> = new Set<ExplorerActionType>([
  'SEND_EMAIL',
  'SEND_SMS',
  'SHOW_IN_APP_NUDGE',
  'RECOMMEND_LESSON',
  'INVITE_TO_EVENT',
]);

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Whole days between a past instant and now. Null when there is nothing to measure from. */
function daysSince(value: Date | string | null | undefined, now: number): number | null {
  const iso = toIso(value);
  if (!iso) return null;
  const diff = now - new Date(iso).getTime();
  return diff < 0 ? 0 : Math.floor(diff / 86_400_000);
}

function sameScores(a: ExplorerWhyScores, b: ExplorerWhyScores): boolean {
  return a.e_score === b.e_score && a.i_score === b.i_score && a.f_score === b.f_score;
}


/** Scores in the payload's shape. Works for a decision row or a profile row alike. */
function projectScores(src: DecisionRow | ProfileRow): ExplorerWhyScores {
  return {
    e_score: src.e_score ?? null,
    i_score: src.i_score ?? null,
    f_score: src.f_score ?? null,
    primary_state: src.primary_state ?? null,
    overlays: src.overlays ?? [],
  };
}

function buildOutcome(decision: DecisionRow): ExplorerWhyOutcome {
  return {
    selected_action: decision.selected_action ?? null,
    selected_campaign_id: decision.selected_campaign_id ?? null,
    selected_sequence_step: decision.selected_sequence_step ?? null,
    channel: decision.channel ?? null,
    reason: decision.reason,
    executed: Boolean(decision.executed),
    scheduled_email_id: decision.scheduled_email_id ?? null,
    outcome: decision.outcome ?? null,
    outcome_at: toIso(decision.outcome_at),
    ai_involved: Boolean(decision.ai_involved),
    ai_rationale: decision.ai_rationale ?? null,
  };
}

function buildContent(decision: DecisionRow): ExplorerWhyContent {
  const assets = (decision.selected_content_assets ?? []) as Record<string, unknown>[];
  const action = decision.selected_action ?? null;
  const gaps = namedGaps(decision.reason);
  const expectsContent = action !== null && ACTIONS_EXPECTING_CONTENT.has(action);

  let gap: string | null = null;
  if (gaps.length > 0) {
    gap = `The Governor reported ${gaps.length === 1 ? 'gap' : 'gaps'}: ${gaps.join(', ')}.`;
  } else if (expectsContent && assets.length === 0) {
    gap =
      `No content asset was resolved for a ${action} decision, and the Governor named no gap. ` +
      'The action was selected but carries nothing to send or show.';
  }

  return { assets, named_gaps: gaps, gap };
}

function buildDrift(
  atDecision: ExplorerWhyScores,
  now: ExplorerWhyScores | null,
  profile: ProfileRow | null,
): ExplorerWhyDrift {
  return {
    scores_changed: now ? !sameScores(atDecision, now) : false,
    state_changed: now ? atDecision.primary_state !== now.primary_state : false,
    profile_computed_at: toIso(profile?.scores_computed_at),
  };
}

/**
 * A stated absence. The four branches are genuinely different answers and a
 * reader needs to be told which one they are looking at — an empty object tells
 * them nothing and reads as a bug.
 */
function buildAbsence(
  enrollmentId: string,
  date: string | undefined,
  profile: ProfileRow | null,
  latest: DecisionRow | null,
): ExplorerWhyAbsent {
  const learnerExists = Boolean(profile) || Boolean(latest);
  const nearest = latest ? String(latest.decision_date) : null;

  let reason: string;
  if (!learnerExists) {
    reason = 'No Explorer journey profile or decision exists for this enrollment id.';
  } else if (date && nearest) {
    reason = `No decision was recorded on ${date}. The most recent decision for this learner is ${nearest}.`;
  } else if (date) {
    reason = `No decision was recorded on ${date}, and this learner has no decisions on any date.`;
  } else {
    reason = 'This learner has a profile but no decision has ever been recorded for them.';
  }

  return {
    found: false,
    enrollment_id: enrollmentId,
    decision_date: date ?? null,
    reason,
    nearest_decision_date: nearest,
    learner_exists: learnerExists,
  };
}

/** The present-decision payload. Pure assembly — every value is already loaded. */
function buildFound(
  enrollmentId: string,
  decision: DecisionRow,
  profile: ProfileRow | null,
  now: number,
): ExplorerWhyFound {
  const scoresAtDecision = projectScores(decision);
  const scoresNow = profile ? projectScores(profile) : null;

  return {
    found: true,
    enrollment_id: enrollmentId,
    decision_id: decision.id,
    decision_date: String(decision.decision_date),
    mode: decision.mode,
    ruleset_version: decision.ruleset_version,
    holdout_group: decision.holdout_group ?? null,
    experiment_key: decision.experiment_key ?? null,
    outcome: buildOutcome(decision),
    scores_at_decision: scoresAtDecision,
    candidates: decision.candidate_actions ?? [],
    // Returned in full, never truncated. A "top 3 reasons" view would recreate
    // precisely the omission this payload exists to prevent.
    suppressed: decision.suppressed_actions ?? [],
    triggering_signals: (decision.triggering_signals ?? []) as Record<string, unknown>[],
    deferred_actions: (decision.deferred_actions ?? []) as Record<string, unknown>[],
    content: buildContent(decision),
    contactability: profile?.contactability ?? null,
    affinities: profile?.affinities ?? [],
    scores_now: scoresNow,
    days_in_state: daysSince(profile?.state_entered_at, now),
    days_since_last_activity: profile?.days_since_last_activity ?? null,
    drift: buildDrift(scoresAtDecision, scoresNow, profile),
  };
}

/**
 * The Why for one DECISION, addressed by its own id.
 *
 * `/decisions/:id` is keyed on the decision, not the learner — a learner has one
 * decision per day and the Decisions tab links to a specific row. Resolving the
 * learner first and then re-finding the decision by date would return a
 * different row than the one clicked whenever a caller passed a stale link.
 *
 * Returns null for an unknown id so the controller answers 404. The absence
 * shape used elsewhere carries an `enrollment_id`, which is not knowable here.
 */
export async function getExplorerWhyByDecision(
  decisionId: string,
  now: number = Date.now(),
): Promise<ExplorerWhyFound | null> {
  const decision = await ExplorerJourneyDecision.findOne({ where: { id: decisionId } });
  if (!decision) return null;

  const profile = await ExplorerJourneyProfile.findOne({
    where: { enrollment_id: decision.enrollment_id },
  });
  return buildFound(decision.enrollment_id, decision, profile, now);
}

/**
 * Assemble the Why for one learner.
 *
 * @param enrollmentId validated upstream by T001's schema — this service does no
 *   input validation of its own, so it must not be called with a raw string.
 * @param date `YYYY-MM-DD`. Omitted means "the most recent decision", which is
 *   what a reader opening a drilldown almost always wants. A date that IS given
 *   is honoured exactly: if nothing was decided that day, that is an answer, and
 *   silently sliding to a neighbouring day would misattribute a decision.
 */
export async function getExplorerWhy(
  enrollmentId: string,
  date?: string,
  now: number = Date.now(),
): Promise<ExplorerWhy> {
  const where = date
    ? { enrollment_id: enrollmentId, decision_date: date }
    : { enrollment_id: enrollmentId };

  const [decision, profile] = await Promise.all([
    ExplorerJourneyDecision.findOne({ where, order: [['decision_date', 'DESC']] }),
    ExplorerJourneyProfile.findOne({ where: { enrollment_id: enrollmentId } }),
  ]);

  if (decision) return buildFound(enrollmentId, decision, profile, now);

  // Only reached when there is nothing to show. The extra lookup exists solely
  // to tell the reader WHICH kind of nothing they are looking at.
  const latest = date
    ? await ExplorerJourneyDecision.findOne({
        where: { enrollment_id: enrollmentId },
        order: [['decision_date', 'DESC']],
      })
    : null;
  return buildAbsence(enrollmentId, date, profile, latest);
}
