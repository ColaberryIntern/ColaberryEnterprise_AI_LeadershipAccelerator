import { proposeCandidate, type SignalReading } from './operateSignals';

/**
 * signalIntake — the only way a production signal enters the delivery OS.
 *
 * Gate 14's Operate phase shipped `operateSignals.ts` as pure logic with nowhere to write,
 * so no signal had ever arrived. Its own header says so: *"Nothing built in this workstream
 * is deployed, so every structure here has been exercised only by tests."*
 *
 * ## What this deliberately cannot do
 *
 * It writes one row to `delivery_signal_candidates` and touches nothing else. **No story,
 * no decision, no release, no project field.** Scenario G's observable is an absence — that
 * nothing happened automatically — and the cheapest way to guarantee an absence is to give
 * the code no way to cause the presence.
 *
 * Applying a candidate means a person creating a story through the ordinary gates. That is
 * the control, not a gap to be closed later.
 *
 * ## Refusals come from the pure module, unchanged
 *
 * `proposeCandidate` already refuses an unknown kind, an unknown signal, a summary too
 * thin to act on, and - the interesting one - **a conclusion drawn from telemetry that was
 * never observed.** This does not restate any of that; it persists what survives.
 */

export interface SignalIntakeRefusal {
  ok: false;
  reason: 'refused_by_gate' | 'no_such_project';
  message: string;
  refusals?: Array<{ rule: string; detail: string }>;
}

export interface SignalIntakeResult {
  ok: true;
  candidateId: string;
  status: 'proposed';
  requiresHumanReview: true;
}

/**
 * Record a production signal, and store the candidate it proposes.
 *
 * Returns the refusals verbatim when the gate declines, because *why* a signal did not
 * become a candidate is the more useful half of the answer for whoever is wiring up
 * telemetry.
 */
export async function intakeSignal(input: {
  projectId: string;
  kind: string;
  signal: string;
  summary: string;
  evidence: SignalReading;
  aboutMissingTelemetry?: boolean;
  actorIdentityId?: string | null;
  models: any;
}): Promise<SignalIntakeResult | SignalIntakeRefusal> {
  const { models } = input;

  const project = await models.DeliveryProject.findOne({ where: { id: input.projectId } });
  if (!project) {
    return { ok: false, reason: 'no_such_project', message: 'No such delivery project.' };
  }

  const decision = proposeCandidate({
    kind: input.kind,
    signal: input.signal,
    summary: input.summary,
    evidence: input.evidence,
    aboutMissingTelemetry: input.aboutMissingTelemetry,
  });

  if (!decision.created) {
    // Nothing is written. A refused candidate that left a row behind would turn the gate
    // into a formality: the row is what a person reviews, so writing one anyway means the
    // refusal changed nothing that matters.
    return {
      ok: false,
      reason: 'refused_by_gate',
      message: 'The signal did not justify a candidate.',
      refusals: decision.refusals,
    };
  }

  const row = await models.DeliverySignalCandidate.create({
    delivery_project_id: input.projectId,
    kind: decision.candidate.kind,
    signal: decision.candidate.signal,
    summary: decision.candidate.summary,
    evidence: decision.candidate.evidence as unknown as Record<string, unknown>,
    // Taken from the candidate rather than hardcoded. Both are literal types in the pure
    // module, so if either ever gains a second value this keeps agreeing with it.
    status: decision.candidate.status,
    requires_human_review: decision.candidate.requiresHumanReview,
    about_missing_telemetry: input.aboutMissingTelemetry === true,
    created_by_identity_id: input.actorIdentityId ?? null,
  });

  return {
    ok: true,
    candidateId: row.id,
    status: 'proposed',
    requiresHumanReview: true,
  };
}

/** The candidates raised for a project, newest first. */
export async function candidatesForProject(input: {
  projectId: string;
  models: any;
}): Promise<Array<Record<string, unknown>>> {
  const rows = await input.models.DeliverySignalCandidate.findAll({
    where: { delivery_project_id: input.projectId },
    order: [['created_at', 'DESC']],
  });
  return rows.map((r: any) => ({
    id: r.id,
    kind: r.kind,
    signal: r.signal,
    summary: r.summary,
    evidence: r.evidence,
    status: r.status,
    requiresHumanReview: r.requires_human_review,
    aboutMissingTelemetry: r.about_missing_telemetry,
    createdAt: r.created_at,
  }));
}
