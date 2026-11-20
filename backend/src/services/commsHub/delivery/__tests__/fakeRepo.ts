import type { CommsHubMessageStatus } from '../../../../models/CommsHubMessage';
import { resultOf } from '../resultOf';
import { MAX_ATTEMPTS, SENDING_LEASE_MS } from '../retryPolicy';
import type { ClaimedDelivery, DeliveryRepo, SendContext, SendOutcome, StartResult, WorkerSettings } from '../types';

/**
 * An in-memory DeliveryRepo with the Postgres implementation's rules (CH7.2 tests):
 *  - a claim is atomic and takes only pending-and-due rows (or `sending` past the lease), stamping
 *    first_claimed_at once and counting the attempt (the attempt number is the claim token);
 *  - withSendLock serializes per lock key (one post per feed, one message's in-app sends) and re-checks
 *    that the row is still this claim's before deciding, then records the outcome before releasing.
 * Concurrency in these tests is real interleaving on the event loop (two ticks awaited together).
 */
export interface FakeMessage { id: string; status: CommsHubMessageStatus; send_at: Date | null; approvalMatches: boolean; voided?: boolean }
export interface FakeDestination { id: string; message_id: string; channel: 'community_post' | 'in_app'; target_type: string; target_id: string; allowed: boolean }
export interface FakeDelivery {
  id: string; message_id: string; destination_id: string; channel: 'community_post' | 'in_app'; idempotency_key: string;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled' | 'skipped'; attempt_count: number; next_attempt_at: Date | null;
  claimed_at: Date | null; updated_at: Date; provider_message_id: string | null; error: string | null;
}

export class FakeRepo implements DeliveryRepo {
  settingsRow: WorkerSettings = { paused: false, quietHours: null };
  messages = new Map<string, FakeMessage>();
  destinations: FakeDestination[] = [];
  deliveries: FakeDelivery[] = [];
  drafts = new Map<string, { title: string | null; body: string }>();
  /** Flip settings between the claim and the send (to test the re-check inside the lock). */
  beforeDecide: (() => void) | null = null;
  private locks = new Map<string, Promise<void>>();

  async settings(): Promise<WorkerSettings> { return { ...this.settingsRow }; }

  async dueMessageIds(now: Date): Promise<string[]> {
    return [...this.messages.values()].filter((m) => m.status === 'scheduled' && (!m.send_at || m.send_at <= now)).map((m) => m.id);
  }

  async startMessage(id: string, now: Date): Promise<StartResult> {
    const m = this.messages.get(id);
    if (!m || m.status !== 'scheduled' || (m.send_at && m.send_at > now)) return 'not_due';
    if (!m.approvalMatches) { m.status = 'needs_approval'; m.voided = true; return 'approval_changed'; }
    for (const dest of this.destinations.filter((x) => x.message_id === id)) {
      const row = this.deliveries.find((x) => x.message_id === id && x.destination_id === dest.id);
      if (!row) {
        this.deliveries.push({ id: `dl-${dest.id}`, message_id: id, destination_id: dest.id, channel: dest.channel, idempotency_key: `comms_hub:${id}:${dest.id}`, status: 'pending', attempt_count: 0, next_attempt_at: null, claimed_at: null, updated_at: now, provider_message_id: null, error: null });
      } else if (['failed', 'skipped', 'cancelled'].includes(row.status)) {
        Object.assign(row, { status: 'pending', attempt_count: 0, next_attempt_at: null, error: null });
      }
    }
    m.status = 'sending';
    return 'started';
  }

  async claimDue(now: Date, limit: number): Promise<ClaimedDelivery[]> {
    const stale = now.getTime() - SENDING_LEASE_MS;
    const out: ClaimedDelivery[] = [];
    for (const d of this.deliveries) {
      if (d.status === 'sending' && d.updated_at.getTime() < stale && d.attempt_count >= MAX_ATTEMPTS) {
        Object.assign(d, { status: 'failed', next_attempt_at: null, updated_at: now, error: `lease_expired: the send did not finish after ${d.attempt_count} tries` });
      }
    }
    for (const d of this.deliveries) {
      if (out.length >= limit) break;
      if (this.messages.get(d.message_id)?.status !== 'sending') continue;
      const due = (d.status === 'pending' && (!d.next_attempt_at || d.next_attempt_at <= now)) || (d.status === 'sending' && d.updated_at.getTime() < stale);
      if (!due) continue;
      d.status = 'sending'; d.claimed_at = d.claimed_at ?? now; d.attempt_count += 1; d.updated_at = now;
      const dest = this.destinations.find((x) => x.id === d.destination_id)!;
      out.push({ id: d.id, message_id: d.message_id, destination_id: d.destination_id, channel: d.channel, idempotency_key: d.idempotency_key, attempt: d.attempt_count, first_claimed_at: d.claimed_at, target_type: dest.target_type, target_id: dest.target_id });
    }
    return out;
  }

  async withSendLock(d: ClaimedDelivery, now: Date, decide: (ctx: SendContext) => Promise<SendOutcome>): Promise<SendOutcome | null> {
    const key = d.channel === 'community_post' ? `post:${d.target_id}` : `in_app:${d.message_id}`;
    const prev = this.locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>((r) => { release = r; });
    this.locks.set(key, prev.then(() => mine));
    await prev;
    try {
      const row = this.deliveries.find((x) => x.id === d.id);
      if (!row || row.status !== 'sending' || row.attempt_count !== d.attempt) return null;
      this.beforeDecide?.();
      const m = this.messages.get(d.message_id)!;
      const dest = this.destinations.find((x) => x.id === d.destination_id);
      const out = await decide({
        settings: { ...this.settingsRow }, messageStatus: m.status, approvalMatches: m.approvalMatches,
        destinationAllowed: !!dest?.allowed, draft: this.drafts.get(`${d.message_id}:${d.channel}`) ?? null,
        media_urls: d.channel === 'community_post' ? ['https://enterprise.example/api/comms-hub/thumbnails/e1/3x1.png?v=t1'] : [],
      });
      if (out.kind === 'sent') Object.assign(row, { status: 'sent', provider_message_id: out.provider_message_id, error: null, next_attempt_at: null });
      if (out.kind === 'retry') Object.assign(row, { status: 'pending', next_attempt_at: out.at, error: out.error });
      if (out.kind === 'failed') Object.assign(row, { status: 'failed', next_attempt_at: null, error: out.error });
      if (out.kind === 'hold') Object.assign(row, { status: 'pending', next_attempt_at: out.until, attempt_count: Math.max(0, row.attempt_count - 1), error: `held: ${out.reason}` });
      if (out.kind === 'skip') Object.assign(row, { status: out.status, error: out.reason });
      return out;
    } finally {
      release();
    }
  }

  async settledSendingIds(): Promise<string[]> {
    return [...this.messages.values()].filter((m) => m.status === 'sending'
      && !this.deliveries.some((d) => d.message_id === m.id && (d.status === 'pending' || d.status === 'sending'))).map((m) => m.id);
  }

  async finishMessage(id: string): Promise<CommsHubMessageStatus | null> {
    const m = this.messages.get(id);
    if (!m || m.status !== 'sending') return null;
    const r = resultOf(this.deliveries.filter((x) => x.message_id === id).map((x) => x.status));
    if (r) m.status = r;
    return r;
  }
}
