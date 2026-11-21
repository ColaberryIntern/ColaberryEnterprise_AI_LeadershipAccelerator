/**
 * Career Prep v27, CP6.1 (kit F2): the job-search inbox's address rules and its health. PURE: no I/O, no clock of its
 * own (`now` is passed in), so every threshold is unit-tested. Times are compared as UTC instants (milliseconds), so a
 * daylight-saving change in Central time can never stretch or shrink a window.
 *
 * ADDRESS: Gmail only (the forwarding steps are Gmail's), trimmed and lowercased; `googlemail.com` is the same mailbox
 * as `gmail.com`, so it is stored as `gmail.com`.
 *
 * HEALTH, first match wins:
 *   setup      no address yet, or forwarding not verified yet
 *   broken     the latest daily test was sent more than 10 minutes ago and has not arrived
 *   quiet      nothing has arrived for more than 3 days
 *   untested   verified, but no test has been sent yet and nothing has arrived
 *   healthy    otherwise
 */
export const QUIET_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
export const BROKEN_AFTER_MS = 10 * 60 * 1000;

export type AddressCheck = { ok: true; address: string } | { ok: false; reason: 'empty' | 'not_gmail' | 'invalid' };

const LOCAL = /^[a-z0-9](?:[a-z0-9.+_-]{0,62}[a-z0-9])?$/;

export function normalizeJobSearchAddress(raw: string): AddressCheck {
  const v = String(raw ?? '').trim().toLowerCase();
  if (!v) return { ok: false, reason: 'empty' };
  const at = v.lastIndexOf('@');
  if (at <= 0 || at !== v.indexOf('@')) return { ok: false, reason: 'invalid' };
  const local = v.slice(0, at);
  const domain = v.slice(at + 1);
  if (domain !== 'gmail.com' && domain !== 'googlemail.com') return { ok: false, reason: 'not_gmail' };
  if (!LOCAL.test(local) || local.includes('..')) return { ok: false, reason: 'invalid' };
  return { ok: true, address: `${local}@gmail.com` };
}

export type InboxHealth = 'setup' | 'broken' | 'quiet' | 'untested' | 'healthy';
export interface InboxFacts {
  address: string | null;
  verifiedAt: Date | null;
  lastReceivedAt: Date | null;
  lastTestAt: Date | null;
  /** How long the latest test took to arrive; null while it has not arrived. */
  lastTestMs: number | null;
}

export function inboxHealth(f: InboxFacts, now: Date): InboxHealth {
  if (!f.address || !f.verifiedAt) return 'setup';
  const t = now.getTime();
  if (f.lastTestAt && f.lastTestMs === null && t - f.lastTestAt.getTime() > BROKEN_AFTER_MS) return 'broken';
  if (f.lastReceivedAt && t - f.lastReceivedAt.getTime() > QUIET_AFTER_MS) return 'quiet';
  if (!f.lastTestAt && !f.lastReceivedAt) return 'untested';
  return 'healthy';
}

/** The words the student and the desk see for each state. */
export const HEALTH_LABEL: Record<InboxHealth, string> = {
  setup: 'Not set up yet',
  broken: 'Forwarding broken',
  quiet: 'Quiet',
  untested: 'Not tested',
  healthy: 'Forwarding healthy',
};
