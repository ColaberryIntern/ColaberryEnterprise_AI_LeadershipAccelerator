/**
 * CH7.5 failure alerts: the store the sender works through (Postgres in alertRepo.ts, in memory in
 * tests) and what one alert says.
 */
export const DASHBOARD = 'dashboard';
export const MAX_ALERT_ATTEMPTS = 3;
/** Wait after try 1, then after try 2. After try 3 the alert is marked failed. */
export const ALERT_RETRY_DELAYS_MS = [60_000, 5 * 60_000];
/** A row left `sending` this long (a crashed worker) is tried again, or failed if its tries are spent. */
export const ALERT_LEASE_MS = 10 * 60_000;
export const ALERT_SEND_TIMEOUT_MS = 30_000;
/** Only failures this recent are alerted: a recipient added today is not mailed about last month. */
export const ALERT_WINDOW_MS = 48 * 3600_000;
export const ALERTS_PER_TICK = 20;

export type FailureState = 'failed' | 'partially_failed';
export interface ClaimedAlert { id: string; state_event_id: string; message_id: string; failure_state: FailureState; recipient: string; attempt: number }
export interface AlertContext { title: string; sent: number; not_sent: number }
export type AlertOutcome = { kind: 'sent' } | { kind: 'retry'; at: Date; error: string } | { kind: 'failed'; error: string };

export interface AlertRepo {
  /** The email addresses in the hub's settings (CH7.4 Safety controls). */
  recipients(): Promise<string[]>;
  /** One row per failure state change since `since` per recipient; existing rows are left alone. Returns how many were new. */
  queue(recipients: string[], since: Date, now: Date): Promise<number>;
  /** Take due rows: pending and due, or `sending` past the lease, counting the try. Spent stale rows are failed. */
  claim(now: Date, limit: number): Promise<ClaimedAlert[]>;
  context(a: ClaimedAlert): Promise<AlertContext | null>;
  /** Record the result, only if the row is still this claim (status sending, same try number). */
  settle(a: ClaimedAlert, out: AlertOutcome, now: Date): Promise<void>;
}

export interface AlertContent { title: string; description: string; severity: number; state: FailureState; message_id: string; state_event_id: string }

export interface AlertSenders {
  /** The admin alerts list, through the existing alert path (alertService.emitAlert). */
  dashboard: (c: AlertContent) => Promise<void>;
  /** One email through the existing alert email (emailService.sendAlertEmail). */
  email: (to: string, c: AlertContent) => Promise<void>;
  /** False when no mail transport is configured: an email then fails instead of being skipped silently. */
  emailReady: () => boolean;
}
