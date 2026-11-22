import cron from 'node-cron';
import { z } from 'zod';
import { sequelize } from '../../config/database';
import { InboxEventSchema, type InboxEvent } from './inboxEventSchema';
import { acceptInboxEvent, DISPATCH_ERROR } from './inboxEvents';
import { signInboxRequest } from './inboxSignature';

/**
 * Career Prep v27, CP6.2 (kit F3 "Backfill"): after downtime, ask the inbox manager for the events we missed and put them
 * through the SAME idempotent path as a push (acceptInboxEvent), so a backfilled event and a pushed one never double.
 *
 * CONFIG: needs BOTH env INBOX_MANAGER_API_BASE and INBOX_INTEGRATION_SECRET. Either unset (as shipped, E2): nothing is
 * fetched and the hourly schedule is never registered.
 *
 * PROPOSED API (for the CP7 side; the contract records it): GET <base>/api/events?since=<ISO 8601>, signed like our own
 * routes (X-Timestamp, X-Signature over "<ts>.<raw query>"), answering { events: [...] } with every event whose
 * received_at >= since (INCLUSIVE), sorted ASCENDING by received_at, at most 500. A full page that is not oldest-first
 * is a ContractViolation: nothing is stored and the cursor does not move (we could not know what we skipped).
 *
 * CURSOR (inbox_backfill_state.next_since, one row): the `since` of the next pass, taken from the UPSTREAM's clock, never
 * ours, so a skew between the two machines cannot open a gap. After a completed pass it becomes the newest received_at
 * seen (or, for an empty page, the response's Date header) minus a 10-minute overlap: that covers an event the inbox
 * manager commits up to 10 minutes after a newer one (late dead-letter retries, parallel workers). A full page sets it
 * to the newest received_at itself (inclusive, no overlap), so the next pass moves forward. Residual (logged as
 * `inbox_backfill_stalled`, error): more than 500 events with ONE identical received_at cannot be paged by time alone;
 * that needs a tie-break key from the upstream (received_at, message_id) and is named for CP7.
 * It never moves backwards, and moves only when the pass completed. It is NOT the newest stored event: pushes write
 * inbox_events too, so after an outage a resumed push would otherwise move it past the events missed in the outage.
 *
 * STORED: an event counts as stored once its inbox_events row exists, even if its dispatch failed (processed_at stays
 * NULL; the push retry or T15's pass over unprocessed rows finishes it), so one failing event cannot freeze the backfill.
 * A failure to STORE stops the pass there and the cursor does not move.
 *
 * FAILURE: 20 s timeout per attempt; 3 attempts, waiting 2 s then 10 s, on a network error, a timeout, a 429 or a 5xx
 * (never on another 4xx); then `UpstreamUnavailable` is logged and NOTHING is written. A response that is not the agreed
 * shape writes nothing (ContractViolation).
 */
export const BACKFILL_TIMEOUT_MS = 20_000;
export const RETRY_WAITS_MS = [2_000, 10_000] as const;
export const MAX_EVENTS_PER_PASS = 500;
export const CURSOR_OVERLAP_MS = 10 * 60_000;
const FIRST_RUN_DAYS = 14;

export type BackfillResult =
  | { status: 'not_configured' }
  | { status: 'unavailable'; attempts: number; errorClass: string }
  | { status: 'done'; fetched: number; accepted: number; duplicates: number; storedUnprocessed: number; invalid: number; stoppedAt: string | null };

export interface BackfillDeps { fetch?: typeof fetch; sleep?: (ms: number) => Promise<void>; now?: () => Date }

function log(level: 'info' | 'warn' | 'error', event: string, context: Record<string, unknown>, errorClass?: string): void {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'backend', event,
    outcome: level === 'info' ? 'success' : 'failure', ...(errorClass ? { error_class: errorClass } : {}), context });
  if (level === 'error') console.error(line); else if (level === 'warn') console.warn(line); else console.log(line);
}

export const backfillConfigured = (): boolean => Boolean(process.env.INBOX_MANAGER_API_BASE && process.env.INBOX_INTEGRATION_SECRET);

async function readSince(now: Date): Promise<string> {
  const [rows] = await sequelize.query('SELECT next_since FROM inbox_backfill_state WHERE id = 1');
  const at = (rows as Array<{ next_since: Date | string | null }>)[0]?.next_since;
  return (at ? new Date(at) : new Date(now.getTime() - FIRST_RUN_DAYS * 86_400_000)).toISOString(); // first run: a lookback, our clock is fine
}

/** Only after a COMPLETED pass. Never moves backwards. */
async function advanceSince(to: Date): Promise<void> {
  await sequelize.query(
    `INSERT INTO inbox_backfill_state (id, next_since) VALUES (1, :to)
     ON CONFLICT (id) DO UPDATE SET next_since = GREATEST(inbox_backfill_state.next_since, EXCLUDED.next_since), updated_at = NOW()`, { replacements: { to } });
}

export type CursorPlan = { ok: true; next: Date | null; stalled: boolean } | { ok: false; reason: 'not_oldest_first' };

/** PURE: where the next pass starts, from the events in the order the upstream sent them and its Date header. */
export function planNextSince(events: InboxEvent[], fetched: number, since: string, dateHeader: string | null): CursorPlan {
  const times = events.map((e) => Date.parse(e.received_at));
  const full = fetched >= MAX_EVENTS_PER_PASS;
  if (full && times.some((t, i) => i > 0 && t < times[i - 1])) return { ok: false, reason: 'not_oldest_first' };
  const newest = times.length ? Math.max(...times) : null;
  if (full && newest !== null) return { ok: true, next: new Date(newest), stalled: newest <= Date.parse(since) };
  const upstreamNow = newest ?? (dateHeader && !Number.isNaN(Date.parse(dateHeader)) ? Date.parse(dateHeader) : null);
  return { ok: true, next: upstreamNow === null ? null : new Date(upstreamNow - CURSOR_OVERLAP_MS), stalled: false };
}

const Page = z.object({ events: z.array(z.unknown()).max(MAX_EVENTS_PER_PASS) });
type Fetched = { ok: true; events: unknown[]; date: string | null } | { ok: false; attempts: number; errorClass: string };

const retryable = (status: number) => status === 429 || status >= 500;
const hostOf = (base: string) => { try { return new URL(base).host; } catch { return 'invalid'; } };

/** One GET with up to 3 attempts. Never writes. */
async function fetchSince(since: string, deps: Required<BackfillDeps>): Promise<Fetched> {
  const base = String(process.env.INBOX_MANAGER_API_BASE).replace(/\/$/, '');
  const query = `since=${encodeURIComponent(since)}`;
  let errorClass = 'UpstreamUnavailable';
  for (let attempt = 1; attempt <= RETRY_WAITS_MS.length + 1; attempt += 1) {
    const ts = String(Math.floor(deps.now().getTime() / 1000));
    const t0 = Date.now();
    // External boundary: start, end, duration and status of every attempt (host only; never the secret or signature).
    log('info', 'inbox_backfill_request_start', { attempt, host: hostOf(base) });
    try {
      const res = await deps.fetch(`${base}/api/events?${query}`, {
        headers: { 'X-Timestamp': ts, 'X-Signature': signInboxRequest(String(process.env.INBOX_INTEGRATION_SECRET), ts, query), Accept: 'application/json' },
        signal: AbortSignal.timeout(BACKFILL_TIMEOUT_MS) });
      log(res.ok ? 'info' : 'warn', 'inbox_backfill_request_end', { attempt, host: hostOf(base), status: res.status, duration_ms: Date.now() - t0 });
      if (res.ok) {
        const page = Page.safeParse(await res.json().catch(() => null));
        if (!page.success) return { ok: false, attempts: attempt, errorClass: 'ContractViolation' };
        return { ok: true, events: page.data.events, date: res.headers?.get?.('date') ?? null };
      }
      errorClass = res.status === 429 ? 'RateLimitError' : res.status === 401 || res.status === 403 ? 'AuthError' : 'UpstreamUnavailable';
      if (!retryable(res.status)) return { ok: false, attempts: attempt, errorClass };
    } catch (err) {
      errorClass = (err as Error)?.name === 'TimeoutError' ? 'TimeoutError' : 'UpstreamUnavailable';
      log('warn', 'inbox_backfill_request_end', { attempt, host: hostOf(base), status: null, duration_ms: Date.now() - t0 }, errorClass);
    }
    log('warn', 'inbox_backfill_attempt_failed', { attempt }, errorClass);
    if (attempt <= RETRY_WAITS_MS.length) await deps.sleep(RETRY_WAITS_MS[attempt - 1]);
  }
  return { ok: false, attempts: RETRY_WAITS_MS.length + 1, errorClass: 'UpstreamUnavailable' };
}

function validOnly(raw: unknown[]): { valid: InboxEvent[]; invalid: number } {
  const valid: InboxEvent[] = [];
  let invalid = 0;
  for (const r of raw) { const p = InboxEventSchema.safeParse(r); if (p.success) valid.push(p.data); else invalid += 1; }
  return { valid, invalid };
}

type Tally = { accepted: number; duplicates: number; storedUnprocessed: number; stoppedAt: string | null };

/** Oldest first; a dispatch failure still counts as stored; a STORE failure stops the pass. */
async function storeAll(events: InboxEvent[]): Promise<Tally> {
  const t: Tally = { accepted: 0, duplicates: 0, storedUnprocessed: 0, stoppedAt: null };
  for (const ev of [...events].sort((a, b) => Date.parse(a.received_at) - Date.parse(b.received_at))) {
    try { if ((await acceptInboxEvent(ev)).duplicate) t.duplicates += 1; else t.accepted += 1; } catch (err) {
      const name = (err as Error)?.name && (err as Error).name !== 'Error' ? (err as Error).name : 'UpstreamUnavailable';
      if (name === DISPATCH_ERROR) { t.storedUnprocessed += 1; log('warn', 'inbox_backfill_stored_unprocessed', { event_id: ev.event_id }, name); continue; }
      t.stoppedAt = ev.event_id;
      log('warn', 'inbox_backfill_stopped', { event_id: ev.event_id }, name);
      break;
    }
  }
  return t;
}

export async function runInboxBackfill(deps: BackfillDeps = {}): Promise<BackfillResult> {
  if (!backfillConfigured()) return { status: 'not_configured' };
  const d: Required<BackfillDeps> = { fetch: deps.fetch ?? fetch, sleep: deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))), now: deps.now ?? (() => new Date()) };
  const since = await readSince(d.now());
  const got = await fetchSince(since, d);
  if (!got.ok) {
    log('error', 'inbox_backfill_gave_up', { attempts: got.attempts }, got.errorClass);
    return { status: 'unavailable', attempts: got.attempts, errorClass: got.errorClass };
  }
  const { valid, invalid } = validOnly(got.events);
  if (invalid) log('warn', 'inbox_backfill_invalid_events', { count: invalid }, 'ContractViolation');
  const plan = planNextSince(valid, got.events.length, since, got.date);
  if (!plan.ok) {
    log('error', 'inbox_backfill_page_out_of_order', { fetched: got.events.length, fix: 'the inbox manager must sort by received_at ascending' }, 'ContractViolation');
    return { status: 'unavailable', attempts: 1, errorClass: 'ContractViolation' };
  }
  const t = await storeAll(valid);
  // Completed = every valid event fetched has its row. Events not in the agreed shape can never be stored, so they do
  // not hold the cursor back (logged above as ContractViolation for the CP7 side).
  if (!t.stoppedAt && plan.next) await advanceSince(plan.next);
  if (plan.stalled) log('error', 'inbox_backfill_stalled', { fix: 'over 500 events share one received_at: the upstream needs a (received_at, message_id) tie-break' }, 'ContractViolation');
  log('info', 'inbox_backfill_done', { fetched: got.events.length, ...t, invalid, completed: !t.stoppedAt });
  return { status: 'done', fetched: got.events.length, ...t, invalid };
}

let started = false;
/** Hourly, and ONLY when configured (boot/placementBoot.ts SCHEDULERS). Returns whether it registered. */
export function startInboxBackfill(): boolean {
  if (started || !backfillConfigured()) return false;
  started = true;
  cron.schedule('20 * * * *', () => {
    runInboxBackfill().catch((err) => log('warn', 'inbox_backfill_pass_failed', {}, (err as Error)?.name || 'DatabaseError'));
  }, { timezone: 'America/Chicago' });
  return true;
}
