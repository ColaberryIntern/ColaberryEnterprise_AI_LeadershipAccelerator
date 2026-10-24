/**
 * C8.6 — which revenue hypotheses are gaining evidence, and which are dying.
 *
 * READS REAL FUNNEL DATA, NOT MANUAL ENTRY, which is an acceptance criterion and not a
 * preference. Every count comes from `getFunnelSnapshot` (C8.4), so a hypothesis cannot
 * be kept alive by somebody typing a number into a field.
 *
 * That has a consequence worth stating rather than hiding: C8.4 established that several
 * funnel stages have no source at all, and that account attribution needs a deploy that
 * has not happened. Where the evidence for a hypothesis is UNCOUNTABLE, this service
 * says so instead of reporting zero. A hypothesis is not dying because we cannot see it,
 * and reporting an unmeasured stage as zero evidence is how a live bet gets killed by an
 * instrumentation gap.
 *
 * ALI KILLS HYPOTHESES, NOT THIS SERVICE. C8.6 puts that decision with him explicitly.
 * The job here is to make a dying one impossible to miss and to state the tripwire it
 * tripped, with the date.
 */
import { getFunnelSnapshot, StageCount } from './funnelStageService';
import {
  REVENUE_HYPOTHESES,
  RevenueHypothesis,
  FunnelStageKey,
  KillTripwire,
} from './hypothesisRegister';

export type HypothesisVerdict =
  | 'confirmed'       // the required evidence exists
  | 'in_flight'       // not there yet, but something upstream could still become it
  | 'no_evidence'     // nothing at the target and nothing upstream: the pipe is empty
  | 'past_deadline'   // the target date has gone and the evidence never arrived
  | 'uncountable';    // the funnel cannot measure this yet, so no verdict is honest

export interface TripwireStatus extends KillTripwire {
  /** Has this date arrived? */
  due: boolean;
  /** Evidence at its stage, or null when that stage is uncountable. */
  observed: number | null;
  /** True only when the date has arrived AND the threshold was not met. */
  tripped: boolean;
}

export interface HypothesisHealth {
  key: string;
  label: string;
  whoPays: string;
  evidenceRequired: string;
  killCondition: string;
  target: RevenueHypothesis['target'];
  verdict: HypothesisVerdict;
  /** Evidence at the target stage; null when that stage is uncountable. */
  evidence: number | null;
  /** Total across the precursor stages; null when none of them is countable. */
  inFlight: number | null;
  daysRemaining: number;
  tripwires: TripwireStatus[];
  /** One sentence a reader can act on. */
  note: string;
}

export interface HypothesisHealthReport {
  asOf: string;
  hypotheses: HypothesisHealth[];
  summary: Record<HypothesisVerdict, number>;
  /** Carried from the funnel so a reader knows why a stage reads uncountable. */
  caveats: string[];
}

const DAY = 24 * 60 * 60 * 1000;

/** Whole days from `now` to an ISO date. Negative once the date has passed. */
export function daysUntil(iso: string, now: Date): number {
  const then = Date.parse(`${iso}T23:59:59Z`);
  return Math.ceil((then - now.getTime()) / DAY);
}

/**
 * Evidence at a stage, or null when the funnel cannot count it.
 *
 * `accountsReached` is cumulative, which is the right reading here: a hypothesis needing
 * three contracts is satisfied by three accounts that REACHED contract, whether or not
 * they have since gone further.
 */
function evidenceAt(stages: StageCount[], key: FunnelStageKey): number | null {
  const s = stages.find((x) => x.key === key);
  return s ? s.accountsReached : null;
}

function verdictFor(
  h: RevenueHypothesis,
  evidence: number | null,
  inFlight: number | null,
  daysRemaining: number,
): HypothesisVerdict {
  // Uncountable beats everything: without a measurement there is no honest verdict,
  // and "no evidence" would read as a finding when it is a blind spot.
  if (evidence === null) return 'uncountable';
  if (evidence >= h.target.count) return 'confirmed';
  if (daysRemaining < 0) return 'past_deadline';
  if ((inFlight ?? 0) > 0) return 'in_flight';
  return 'no_evidence';
}

function noteFor(
  h: RevenueHypothesis, v: HypothesisVerdict, evidence: number | null,
  inFlight: number | null, daysRemaining: number, tripped: TripwireStatus[],
): string {
  if (v === 'uncountable') {
    return `The funnel cannot count ${h.target.stage.replace(/_/g, ' ')} yet, so this `
      + 'hypothesis has no verdict. That is a gap in instrumentation, not evidence '
      + 'against the bet.';
  }
  if (v === 'confirmed') {
    return `${evidence} of ${h.target.count} required, with ${daysRemaining} days to `
      + 'spare. The bet is carrying its own weight.';
  }
  if (v === 'past_deadline') {
    return `The deadline passed with ${evidence} of ${h.target.count}. The kill condition `
      + 'is met; retiring it is Ali’s call.';
  }
  if (tripped.length) {
    return `A dated tripwire has fired: on ${tripped[0].on} this needed `
      + `${tripped[0].survivesIf}, and had ${tripped[0].observed}. `
      + `${daysRemaining} days remain to the deadline.`;
  }
  if (v === 'no_evidence') {
    return `Nothing at the target and nothing upstream that could become it, with `
      + `${daysRemaining} days left. The pipe is empty rather than slow.`;
  }
  return `${evidence} of ${h.target.count}, with ${inFlight} upstream that could still `
    + `become evidence and ${daysRemaining} days remaining.`;
}

/** Hypothesis health, computed from the funnel. */
export async function getHypothesisHealth(now: Date = new Date()): Promise<HypothesisHealthReport> {
  const funnel = await getFunnelSnapshot();

  const hypotheses: HypothesisHealth[] = REVENUE_HYPOTHESES.map((h) => {
    const evidence = evidenceAt(funnel.stages, h.target.stage);

    const precursorCounts = h.precursors
      .map((p) => evidenceAt(funnel.stages, p))
      .filter((n): n is number => n !== null);
    const inFlight = precursorCounts.length
      ? precursorCounts.reduce((a, b) => Math.max(a, b), 0)
      : null;

    const daysRemaining = daysUntil(h.target.by, now);

    const tripwires: TripwireStatus[] = h.tripwires.map((t) => {
      const observed = evidenceAt(funnel.stages, t.stage);
      const due = daysUntil(t.on, now) < 0;
      return {
        ...t,
        due,
        observed,
        // A tripwire cannot trip on a stage we cannot measure. Treating an unmeasured
        // stage as a failed threshold would kill hypotheses for the instrumentation's
        // shortcomings rather than for the business's.
        tripped: due && observed !== null && observed < t.atLeast,
      };
    });

    const verdict = verdictFor(h, evidence, inFlight, daysRemaining);
    const tripped = tripwires.filter((t) => t.tripped);

    return {
      key: h.key,
      label: h.label,
      whoPays: h.whoPays,
      evidenceRequired: h.evidenceRequired,
      killCondition: h.killCondition,
      target: h.target,
      verdict,
      evidence,
      inFlight,
      daysRemaining,
      tripwires,
      note: noteFor(h, verdict, evidence, inFlight, daysRemaining, tripped),
    };
  });

  const summary = hypotheses.reduce((acc, h) => {
    acc[h.verdict] = (acc[h.verdict] ?? 0) + 1;
    return acc;
  }, {} as Record<HypothesisVerdict, number>);

  return { asOf: now.toISOString(), hypotheses, summary, caveats: funnel.caveats };
}
