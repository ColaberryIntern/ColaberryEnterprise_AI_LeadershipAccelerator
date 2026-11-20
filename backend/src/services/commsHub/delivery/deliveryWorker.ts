import { randomUUID } from 'crypto';
import { connectorFor, ConnectorPermanentError, type Connector } from '../connectors';
import type { CommsHubChannel } from '../../../models/CommsHubDraft';
import { quietUntil } from './quietHours';
import { DELIVERIES_PER_TICK, MESSAGES_PER_TICK, nextAttemptAt, SEND_TIMEOUT_MS } from './retryPolicy';
import type { ClaimedDelivery, DeliveryRepo, SendContext, SendOutcome } from './types';

/**
 * The sending worker's decisions (CH7.2). One tick:
 *  1. paused -> nothing at all happens;
 *  2. outside quiet hours, due scheduled messages are started (approval re-checked, delivery rows);
 *  3. due deliveries are claimed and each is sent under its send lock, after re-checking, IN THIS
 *     ORDER: global pause, message status, approval still matches, destination still allowed, quiet
 *     hours. A failure holds (pause, quiet), skips (cancelled, not allowed) or fails it, and says why;
 *  4. each touched message whose deliveries are all done gets its result: sent / partially_failed / failed,
 *     and so does any sending message left without one (a crash after its last send, or no deliveries).
 *
 * Failure handling: a send that throws is retried on the same row and key (retryPolicy.ts: 4 tries,
 * +1/+5/+15 min) unless the channel says the refusal is permanent; a send that hangs past
 * SEND_TIMEOUT_MS counts as a failed attempt (if it later lands, the connector finds it on the retry).
 * A process that dies mid-send leaves the row `sending`; after the lease it is claimed again and the
 * connector returns the work already done instead of repeating it. Nothing here throws out of a tick:
 * each step's error is logged with its class, and the next tick carries on.
 */
export interface WorkerDeps {
  repo: DeliveryRepo;
  connector: (channel: CommsHubChannel) => Connector;
  log: (level: 'info' | 'warn' | 'error', event: string, ctx: Record<string, unknown>) => void;
}

export interface TickResult { paused: boolean; started: number; attempted: number; sent: number; finished: Record<string, string> }

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(`The send took longer than ${ms / 1000} seconds.`), { name: 'TimeoutError' })), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/** The pre-send checks, in the build prompt's order. Returns an outcome to record, or null to send. */
export function preSendCheck(ctx: SendContext, now: Date): SendOutcome | null {
  if (ctx.settings.paused) return { kind: 'hold', until: null, reason: 'paused' };
  if (ctx.messageStatus !== 'sending') return { kind: 'skip', status: 'cancelled', reason: `message is ${ctx.messageStatus}` };
  if (!ctx.approvalMatches) return { kind: 'failed', error: 'approval_changed: the message changed after it was approved' };
  if (!ctx.destinationAllowed) return { kind: 'skip', status: 'skipped', reason: 'destination_not_allowed' };
  const quiet = quietUntil(now, ctx.settings.quietHours);
  if (quiet) return { kind: 'hold', until: quiet, reason: 'quiet_hours' };
  if (!ctx.draft) return { kind: 'failed', error: 'no_draft: there is no draft for this channel' };
  return null;
}

export async function deliverOne(deps: WorkerDeps, d: ClaimedDelivery, now: Date): Promise<SendOutcome | null> {
  return deps.repo.withSendLock(d, now, async (ctx) => {
    const held = preSendCheck(ctx, now);
    if (held) return held;
    try {
      const r = await withTimeout(deps.connector(d.channel).send({
        deliveryId: d.id, messageId: d.message_id, since: d.first_claimed_at,
        destination: { target_type: d.target_type, target_id: d.target_id },
        draft: ctx.draft!, media_urls: d.channel === 'community_post' ? ctx.media_urls : undefined,
      }), SEND_TIMEOUT_MS);
      return { kind: 'sent', provider_message_id: r.provider_message_id, reached: r.reached };
    } catch (err) {
      const e = err as Error & { reason?: string };
      const error = `${e?.name ?? 'Error'}: ${e?.message ?? String(err)}`.slice(0, 2000);
      if (err instanceof ConnectorPermanentError) return { kind: 'failed', error };
      const at = nextAttemptAt(d.attempt, now);
      return at ? { kind: 'retry', at, error } : { kind: 'failed', error };
    }
  });
}

export async function runDeliveryTick(deps: WorkerDeps, now: Date = new Date()): Promise<TickResult> {
  const correlation_id = randomUUID();
  const started0 = Date.now();
  const result: TickResult = { paused: false, started: 0, attempted: 0, sent: 0, finished: {} };
  const settings = await deps.repo.settings();
  if (settings.paused) {
    deps.log('info', 'comms_hub_send_paused', { correlation_id, outcome: 'success' });
    return { ...result, paused: true };
  }

  const touched = new Set<string>();
  if (!quietUntil(now, settings.quietHours)) {
    for (const id of await deps.repo.dueMessageIds(now, MESSAGES_PER_TICK)) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const r = await deps.repo.startMessage(id, now);
        if (r === 'started') { result.started += 1; touched.add(id); }
        if (r === 'approval_changed') deps.log('warn', 'comms_hub_send_approval_changed', { correlation_id, message_id: id, outcome: 'partial' });
      } catch (err) {
        deps.log('error', 'comms_hub_send_start_failed', { correlation_id, message_id: id, outcome: 'failure', error_class: (err as Error)?.name ?? 'UnexpectedError', error: (err as Error)?.message });
      }
    }
  }

  for (const d of await deps.repo.claimDue(now, DELIVERIES_PER_TICK)) {
    touched.add(d.message_id);
    try {
      // eslint-disable-next-line no-await-in-loop
      const out = await deliverOne(deps, d, now);
      if (!out) continue;
      result.attempted += 1;
      if (out.kind === 'sent') result.sent += 1;
      deps.log(out.kind === 'sent' || out.kind === 'hold' ? 'info' : 'warn', `comms_hub_delivery_${out.kind}`, {
        correlation_id, delivery_id: d.id, message_id: d.message_id, channel: d.channel, attempt: d.attempt,
        outcome: out.kind === 'sent' ? 'success' : out.kind === 'hold' ? 'partial' : 'failure',
        ...(out.kind === 'retry' || out.kind === 'failed' ? { error: out.error } : {}),
        ...(out.kind === 'hold' || out.kind === 'skip' ? { reason: out.reason } : {}),
      });
    } catch (err) {
      deps.log('error', 'comms_hub_delivery_crashed', { correlation_id, delivery_id: d.id, outcome: 'failure', error_class: (err as Error)?.name ?? 'UnexpectedError', error: (err as Error)?.message });
    }
  }

  // Also settle any sending message left without a result (a crash after its last send, or no deliveries).
  for (const id of await deps.repo.settledSendingIds(MESSAGES_PER_TICK)) touched.add(id);
  for (const id of touched) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const status = await deps.repo.finishMessage(id, now);
      if (status) result.finished[id] = status;
    } catch (err) {
      deps.log('error', 'comms_hub_send_finish_failed', { correlation_id, message_id: id, outcome: 'failure', error_class: (err as Error)?.name ?? 'UnexpectedError', error: (err as Error)?.message });
    }
  }
  deps.log('info', 'comms_hub_send_tick', { correlation_id, duration_ms: Date.now() - started0, outcome: 'success', started: result.started, attempted: result.attempted, sent: result.sent, finished: Object.keys(result.finished).length });
  return result;
}

export function defaultConnector(channel: CommsHubChannel): Connector { return connectorFor(channel); }
