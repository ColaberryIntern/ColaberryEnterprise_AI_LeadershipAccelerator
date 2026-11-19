/**
 * openHouseFlashCredit — the pure rules of the Open House flash offer (50% off
 * the annual membership for everyone signed in, until a deadline). No I/O, so
 * accountCreditService can filter expired flash credits without importing the
 * service that grants them. See openHouseFlashDiscountService for the flow.
 */
export const FLASH_REASON = 'open_house_flash_annual';
export const FLASH_CENTS = 89400; // 50% of the $1,788 annual year
/** A checkout begun before the deadline may settle a little after it. */
export const FLASH_SETTLE_GRACE_MS = 2 * 60 * 60 * 1000;
/** The longest window the host can open, so a typo cannot open it for a year. */
export const FLASH_MAX_WINDOW_MS = 36 * 60 * 60 * 1000;

/** The idempotency key, carrying the deadline (epoch seconds). One per (session, email). */
export function flashSourceId(deadlineMs: number, sessionId: string, email: string): string {
  return `OHFLASH-${Math.floor(deadlineMs / 1000)}-${sessionId.replace(/-/g, '').slice(0, 12)}-${email.trim().toLowerCase()}`;
}

/** The deadline a flash credit's source id carries, or null if it is not one. */
export function flashDeadlineMs(sourceEventId: string | null | undefined): number | null {
  const m = /^OHFLASH-(\d{9,11})-/.exec(String(sourceEventId || ''));
  return m ? Number(m[1]) * 1000 : null;
}

/** Whether a credit row is a flash credit past its deadline (+ grace). Other credits never expire here. */
export function isFlashCreditExpired(reason: string | null | undefined, sourceEventId: string | null | undefined, nowMs: number, graceMs = 0): boolean {
  if (reason !== FLASH_REASON) return false;
  const d = flashDeadlineMs(sourceEventId);
  return d == null ? true : nowMs > d + graceMs;
}

/** Validate the host's requested deadline: a real time, in the future, at most 36 hours out. */
export function validateFlashDeadline(deadlineIso: unknown, nowMs: number): { ok: true; deadlineMs: number } | { ok: false; error: string } {
  const ms = typeof deadlineIso === 'string' ? Date.parse(deadlineIso) : NaN;
  if (!Number.isFinite(ms)) return { ok: false, error: 'deadline must be an ISO date-time' };
  if (ms <= nowMs) return { ok: false, error: 'deadline is in the past' };
  if (ms - nowMs > FLASH_MAX_WINDOW_MS) return { ok: false, error: 'deadline is more than 36 hours away' };
  return { ok: true, deadlineMs: ms };
}
