import type { CommsHubQuietHours } from '../../../models/CommsHubSettings';
import type { CommsHubChannel } from '../../../models/CommsHubDraft';
import type { CommsHubMessageStatus } from '../../../models/CommsHubMessage';

/**
 * The sending worker's storage contract (CH7.2). The worker's decisions (deliveryWorker.ts) are
 * written against this interface; deliveryRepo.ts is the Postgres implementation (row locks, SKIP
 * LOCKED, advisory locks) and the unit tests use an in-memory one with the same rules.
 */
export interface WorkerSettings { paused: boolean; quietHours: CommsHubQuietHours | null }

/** A delivery this worker claimed: it is `sending`, and `attempt` is this attempt's number. */
export interface ClaimedDelivery {
  id: string;
  message_id: string;
  destination_id: string;
  channel: CommsHubChannel;
  idempotency_key: string;
  /** This attempt's number (1 = first try). Also the claim token: a reclaim by another worker changes it. */
  attempt: number;
  /** The FIRST time this delivery was claimed; the connectors look for earlier work from here. */
  first_claimed_at: Date;
  target_type: string;
  target_id: string;
}

/** What the worker re-reads, under the send lock, right before a send. */
export interface SendContext {
  settings: WorkerSettings;
  messageStatus: CommsHubMessageStatus;
  /** The approval in force still matches the message's drafts, recipients and send time. */
  approvalMatches: boolean;
  /** The destination row still exists, matches its channel, and its cohort (if any) exists. */
  destinationAllowed: boolean;
  draft: { title: string | null; body: string } | null;
  media_urls: string[];
}

export type SendOutcome =
  | { kind: 'sent'; provider_message_id: string; reached: number }
  /** Try again at `at` (the same row, the same idempotency key). */
  | { kind: 'retry'; at: Date; error: string }
  | { kind: 'failed'; error: string }
  /** Not an attempt (paused, quiet hours): back to pending, the attempt is not counted. */
  | { kind: 'hold'; until: Date | null; reason: string }
  /** Never sent: the message is no longer sending (cancelled), or the destination is not allowed. */
  | { kind: 'skip'; status: 'cancelled' | 'skipped'; reason: string };

export type StartResult = 'started' | 'not_due' | 'approval_changed' | 'event_cancelled';

export interface DeliveryRepo {
  settings(): Promise<WorkerSettings>;
  /** Messages that are scheduled and due (send_at NULL = send now). */
  dueMessageIds(now: Date, limit: number): Promise<string[]>;
  /**
   * In one transaction, with the message row locked (skipping one another worker holds): if it is
   * still scheduled and its approval still matches, make one delivery row per destination (or reset a
   * not-sent row to pending, same key) and move it to sending. A mismatched approval is voided.
   */
  startMessage(messageId: string, now: Date): Promise<StartResult>;
  /** Claim due deliveries of sending messages, and ones left sending past the lease (a crash). */
  claimDue(now: Date, limit: number): Promise<ClaimedDelivery[]>;
  /**
   * Hold the send lock (one community post per feed at a time; one message's in-app sends at a
   * time), re-read the context, run `decide`, and record its outcome in the same transaction.
   * Returns null, without calling `decide`, when the delivery is no longer this claim's to send.
   */
  withSendLock(d: ClaimedDelivery, now: Date, decide: (ctx: SendContext) => Promise<SendOutcome>): Promise<SendOutcome | null>;
  /**
   * Sending messages with nothing left pending or sending: ones whose result was never written (the
   * process died between the last send and the result) or that had no deliveries at all.
   */
  settledSendingIds(limit: number): Promise<string[]>;
  /** When none of a sending message's deliveries is pending or sending: its result, else null. */
  finishMessage(messageId: string, now: Date): Promise<CommsHubMessageStatus | null>;
}
