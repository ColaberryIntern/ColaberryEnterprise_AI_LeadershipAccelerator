/**
 * capacitySignals — what the delivery factory tracks, and at what resolution.
 * PURE, no I/O.
 *
 * Master plan §Gate 12 asks for eleven capacity signals and then says, in the same
 * section:
 *
 *   > **Do not turn this into employee surveillance.**
 *
 * Those two instructions pull against each other, and the tension is the design problem.
 * Per-person rework rates, attention hours and meeting load **are** surveillance
 * infrastructure once they exist — regardless of anyone's intent. An instruction not to
 * misuse them lives in a document; the people who would misuse them do not read it. So the
 * constraint has to live in the construction.
 *
 * ## Three controls, in order of strength
 *
 * **1. Some signals can never resolve to a person.** `estimated_human_attention_hours` and
 * `meeting_load` are `projectOnly`. They measure how much human time a *body of work*
 * consumes, which is a scheduling fact. Attributed to an individual they become a
 * productivity score with no denominator — the person who spent six hours in review
 * because their project was in crisis looks worse than the one whose project was quiet.
 *
 * **2. Individual resolution requires a stated reason and an audit record.** Not a
 * permission — a *justification*. The difference matters: a permission is granted once and
 * then invisible, whereas a reason is written per lookup and readable afterwards. This is
 * the same discipline `builderAuthority` overrides use.
 *
 * **3. Individual rates need a minimum sample.** A rework rate over two stories is noise,
 * and noise presented as a metric is worse than no metric because it invites a
 * conversation the data cannot support. Gate 11's mentor exceptions already took this line.
 *
 * None of this stops a determined operator with database access. It stops the ordinary
 * path — the dashboard someone builds because the data was sitting there — which is how
 * surveillance actually arrives.
 */

/** The eleven capacity signals from master plan §Gate 12. */
export type CapacitySignal =
  | 'active_projects'
  | 'risk_weighted_projects'
  | 'open_decisions'
  | 'client_backlog'
  | 'story_review_backlog'
  | 'release_gates'
  | 'agent_runs'
  | 'blocked_work'
  | 'estimated_human_attention_hours'
  | 'meeting_load'
  | 'rework';

export const CAPACITY_SIGNALS: readonly CapacitySignal[] = [
  'active_projects',
  'risk_weighted_projects',
  'open_decisions',
  'client_backlog',
  'story_review_backlog',
  'release_gates',
  'agent_runs',
  'blocked_work',
  'estimated_human_attention_hours',
  'meeting_load',
  'rework',
];

/**
 * Resolution at which a signal may be read.
 *
 * `portfolio` is the default view — everything across projects, attributed to none.
 */
export type MetricScope = 'portfolio' | 'project' | 'individual';

export interface SignalPolicy {
  /** What it measures, in one line. */
  meaning: string;
  /**
   * True when this signal must never be attributed to a named person.
   *
   * Reserved for signals that describe the shape of the *work* rather than the output of
   * a *worker*, and which read as a productivity judgement the moment they carry a name.
   */
  projectOnly: boolean;
  /** Minimum sample below which an individual figure is not reportable. */
  minSampleForIndividual: number;
}

export const SIGNAL_POLICY: Record<CapacitySignal, SignalPolicy> = {
  active_projects: {
    meaning: 'Projects currently in flight.',
    projectOnly: false,
    minSampleForIndividual: 1,
  },
  risk_weighted_projects: {
    meaning: 'Active projects weighted by their delivery risk tier.',
    projectOnly: false,
    minSampleForIndividual: 1,
  },
  open_decisions: {
    meaning: 'Decisions recorded but not yet settled.',
    projectOnly: false,
    minSampleForIndividual: 1,
  },
  client_backlog: {
    meaning: 'Client requests and reviews awaiting a response.',
    projectOnly: true,
    minSampleForIndividual: 0,
  },
  story_review_backlog: {
    meaning: 'Stories waiting on human review.',
    projectOnly: false,
    minSampleForIndividual: 1,
  },
  release_gates: {
    meaning: 'Releases waiting on a quality gate or an approval.',
    projectOnly: true,
    minSampleForIndividual: 0,
  },
  agent_runs: {
    meaning: 'Execution runs started, in flight and completed.',
    projectOnly: true,
    minSampleForIndividual: 0,
  },
  blocked_work: {
    meaning: 'Work that cannot proceed without a decision or a dependency.',
    projectOnly: false,
    minSampleForIndividual: 1,
  },
  // The two that become a productivity score the moment they carry a name.
  estimated_human_attention_hours: {
    meaning: 'Human hours a body of work is consuming. A scheduling fact, not an output.',
    projectOnly: true,
    minSampleForIndividual: 0,
  },
  meeting_load: {
    meaning: 'Meeting time a body of work is consuming.',
    projectOnly: true,
    minSampleForIndividual: 0,
  },
  rework: {
    // Individually attributable, because Gate 11's mentor exceptions need it to coach —
    // but only above a sample floor, and only through the justified path below.
    meaning: 'Work returned for rework after review.',
    projectOnly: false,
    minSampleForIndividual: 5,
  },
};

export function isCapacitySignal(value: string): value is CapacitySignal {
  return (CAPACITY_SIGNALS as readonly string[]).includes(value);
}

/** Signals that can never carry a person's name. */
export const PROJECT_ONLY_SIGNALS: readonly CapacitySignal[] = CAPACITY_SIGNALS.filter(
  (s) => SIGNAL_POLICY[s].projectOnly,
);

export interface SignalRequest {
  signal: string;
  scope: MetricScope;
  /** Required for individual scope: why this person, now. Not a permission — a reason. */
  justification?: string | null;
  /** Who is asking. Recorded on the audit entry. */
  requestedByIdentityId?: string | null;
  /** Sample size behind an individual figure. */
  sampleSize?: number;
}

export interface SignalRefusal {
  rule: string;
  detail: string;
}

export type SignalDecision =
  | { allowed: true; signal: CapacitySignal; scope: MetricScope; auditRequired: boolean }
  | { allowed: false; refusals: SignalRefusal[] };

/** A justification has to say something. Ten characters is not a bar, it is a floor. */
const MIN_JUSTIFICATION_LENGTH = 10;

/**
 * Decide whether a signal may be read at the requested resolution.
 *
 * Fails closed, and every refusal explains itself — a metrics system that refuses without
 * saying why gets routed around with a raw SQL query, which is the outcome this is trying
 * to avoid.
 */
export function decideSignalAccess(request: SignalRequest): SignalDecision {
  const refusals: SignalRefusal[] = [];

  if (!isCapacitySignal(request.signal)) {
    return {
      allowed: false,
      refusals: [{ rule: 'unknown_signal', detail: `'${request.signal}' is not a capacity signal.` }],
    };
  }

  const policy = SIGNAL_POLICY[request.signal];

  if (request.scope === 'individual') {
    if (policy.projectOnly) {
      refusals.push({
        rule: 'signal_is_project_only',
        detail:
          `'${request.signal}' measures the work, not the worker. Attributed to a person it ` +
          'becomes a productivity score with no denominator.',
      });
    }

    if (!request.justification || request.justification.trim().length < MIN_JUSTIFICATION_LENGTH) {
      refusals.push({
        rule: 'justification_required',
        detail:
          'Reading a capacity signal for a named person requires a stated reason, recorded ' +
          'per lookup and readable afterwards.',
      });
    }

    if (!request.requestedByIdentityId) {
      refusals.push({
        rule: 'requester_unknown',
        detail: 'An individual lookup must record who asked.',
      });
    }

    const sample = request.sampleSize ?? 0;
    if (!policy.projectOnly && sample < policy.minSampleForIndividual) {
      refusals.push({
        rule: 'sample_too_small',
        detail:
          `'${request.signal}' needs at least ${policy.minSampleForIndividual} data points ` +
          `before an individual figure means anything (have ${sample}). Noise presented as a ` +
          'metric invites a conversation the data cannot support.',
      });
    }
  }

  if (refusals.length > 0) return { allowed: false, refusals };

  return {
    allowed: true,
    signal: request.signal,
    scope: request.scope,
    // Every individual read is audited. Project and portfolio reads are not — auditing
    // ordinary work would make the audit log useless for finding the unusual.
    auditRequired: request.scope === 'individual',
  };
}
