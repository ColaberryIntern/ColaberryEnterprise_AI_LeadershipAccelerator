/**
 * Delivery progress on an APPROVED tool request: started building, handed over.
 *
 * Agent Tools Phase 3. Ali asked that a request be tracked "until it is built out and handed
 * over". Phase 2 ended at approval and said so in as many words — its derived sentence read
 * "Approved to build. Not yet tracked through to handover, which Phase 3 adds." This module is
 * that phase, and it replaces that sentence rather than leaving a promise in the UI.
 *
 * ## It cannot approve anything, and cannot route around approval
 *
 * A build event may only be recorded against a request whose governance status is already
 * `approved`. That is refused by name here, so this table can never become a way to mark
 * something delivered that nobody allowed. Nothing in this file writes a status, a verb, a
 * grant, or `tools_granted`.
 *
 * ## Why handover is terminal
 *
 * Once a request is handed over it is finished, and a later "started building" would make the
 * sequence unreadable. A correction after handover is a new request, not a new event on a
 * closed one.
 */
import AgentDomainChangeRequest from '../../models/AgentDomainChangeRequest';
import AgentDomainToolRequestBuildEvent from '../../models/AgentDomainToolRequestBuildEvent';
import type { ToolRequestBuildEventName } from '../../models/AgentDomainToolRequestBuildEvent';

/** Long enough to name what was handed over and link it; short enough to read in a list. */
export const BUILD_NOTE_MAX = 1000;

export interface BuildEventView {
  id: string;
  event: ToolRequestBuildEventName;
  actor_identity: string;
  occurred_at: string;
  note: string | null;
}

/** Refused by name, so the caller gets a sentence rather than a constraint violation. */
export class BuildEventRefusedError extends Error {
  readonly rule: string;
  constructor(rule: string, message: string) {
    super(message);
    this.name = 'BuildEventRefusedError';
    this.rule = rule;
  }
}

const iso = (d: Date | string): string => new Date(d).toISOString();

const toView = (r: unknown): BuildEventView => {
  const x = r as {
    id: string; event: ToolRequestBuildEventName; actor_identity: string;
    occurred_at: Date; note: string | null;
  };
  return {
    id: x.id,
    event: x.event,
    actor_identity: x.actor_identity,
    occurred_at: iso(x.occurred_at),
    note: x.note ?? null,
  };
};

/** Every milestone on one request, oldest first. */
export async function listBuildEvents(changeRequestId: string): Promise<BuildEventView[]> {
  const rows = await AgentDomainToolRequestBuildEvent.findAll({
    where: { change_request_id: changeRequestId },
    order: [['occurred_at', 'ASC']],
  });
  return rows.map(toView);
}

export interface RecordBuildEventArgs {
  changeRequestId: string;
  event: ToolRequestBuildEventName;
  actorIdentity: string;
  note?: string | null;
}

/**
 * Records one milestone.
 *
 * Every refusal is named, matching the conventions of `agentToolGrantContract` and the Phase 2
 * message contract, so a caller can show which rule stopped them instead of a 500.
 */
export async function recordBuildEvent(args: RecordBuildEventArgs): Promise<BuildEventView> {
  const actor = (args.actorIdentity ?? '').trim();
  const note = (args.note ?? '').trim();

  if (!actor) {
    throw new BuildEventRefusedError('actor_missing', 'A build event must say who recorded it.');
  }
  if (args.event !== 'started_build' && args.event !== 'handed_over') {
    throw new BuildEventRefusedError(
      'event_unknown',
      `"${args.event}" is not a build event. The two are started_build and handed_over.`,
    );
  }
  if (note.length > BUILD_NOTE_MAX) {
    throw new BuildEventRefusedError(
      'note_too_long',
      `A note is at most ${BUILD_NOTE_MAX} characters; this one is ${note.length}.`,
    );
  }

  const parent = await AgentDomainChangeRequest.findByPk(args.changeRequestId);
  if (!parent) {
    throw new BuildEventRefusedError(
      'request_not_found',
      'That request does not exist, so there is nothing to build.',
    );
  }

  const status = (parent as unknown as { status?: string }).status ?? 'submitted';
  if (status !== 'approved') {
    // The rule that keeps this table from routing around approval.
    throw new BuildEventRefusedError(
      'not_approved',
      `This request is "${status}". Only an approved request can be built or handed over.`,
    );
  }

  const existing = await listBuildEvents(args.changeRequestId);
  if (existing.some((e) => e.event === 'handed_over')) {
    throw new BuildEventRefusedError(
      'already_handed_over',
      'This request was already handed over. A change after handover is a new request.',
    );
  }
  if (args.event === 'started_build' && existing.some((e) => e.event === 'started_build')) {
    throw new BuildEventRefusedError(
      'already_started',
      'This request is already marked as being built.',
    );
  }

  const created = await AgentDomainToolRequestBuildEvent.create({
    change_request_id: args.changeRequestId,
    event: args.event,
    actor_identity: actor,
    occurred_at: new Date(),
    note: note || null,
  });

  return toView(created);
}

/**
 * Where an approved request stands in DELIVERY, as one sentence.
 *
 * Derived from the events rather than stored, so it cannot drift from them. Phase 2's version of
 * this said approval was "not yet tracked through to handover"; that is no longer true, and this
 * replaces it.
 */
export function describeDelivery(events: BuildEventView[]): string {
  const handover = events.find((e) => e.event === 'handed_over');
  if (handover) {
    const day = handover.occurred_at.slice(0, 10);
    return handover.note
      ? `Handed over on ${day} by ${handover.actor_identity}: ${handover.note}`
      : `Handed over on ${day} by ${handover.actor_identity}.`;
  }

  const started = events.find((e) => e.event === 'started_build');
  if (started) {
    const day = started.occurred_at.slice(0, 10);
    return started.note
      ? `Being built since ${day} by ${started.actor_identity}: ${started.note}`
      : `Being built since ${day} by ${started.actor_identity}. Not handed over yet.`;
  }

  return 'Approved to build. Nobody has started it yet.';
}
