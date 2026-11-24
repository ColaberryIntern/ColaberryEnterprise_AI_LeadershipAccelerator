import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { env } from '../../config/env';
import { normalizePhone } from '../../utils/phone';

/**
 * THE LAST BRAKE ON EVERY OUTBOUND AI CALL (OH1, Ali 2026-11-17: "triple check all the
 * security mechanisms and make sure they are in place" before calls are turned on).
 *
 * `ENABLE_VOICE_CALLS` is ONE switch for the whole platform. Turning it on for the Open
 * House campaign also turns on every other path that reaches `triggerVoiceCall`, and an
 * audit of those paths (12 callers) found that each guards itself differently and some
 * not at all: one dialed cold leads with no consent check, and two dial a number a
 * stranger types into a public form or chat. So, whatever path a call comes from, this
 * runs inside `triggerVoiceCall` immediately before the dial:
 *
 *   1. CALL HOURS. No call outside 10:00 AM - 8:00 PM Central. That is 11 AM - 9 PM Eastern
 *      and 8 AM - 6 PM Pacific: inside the TCPA 8 AM - 9 PM (called party's local time)
 *      rule for every continental US time zone, whichever one the person is in.
 *   2. PER-NUMBER CAP. At most 2 dials to the same number in 24 hours, across ALL paths.
 *      Bounds a webhook retry, a loop, or a stranger making Maya call someone repeatedly.
 *   3. FAIL CLOSED. If the dial record cannot be read, the call is not placed.
 *
 * Our own alert numbers (ADMIN_ALERT_PHONE, system setting executive_phone_number) are
 * exempt: they are staff phones and some alerts are deliberately after hours.
 *
 * Consent stays where it is (each caller's evaluateSend / consent gate). This brake does
 * not replace it; it bounds the damage when a caller forgets it.
 */

export const DIAL_WINDOW = { tz: 'America/Chicago', startMinute: 10 * 60, endMinute: 20 * 60 };
export const MAX_DIALS_PER_NUMBER_PER_DAY = 2;

/** Minutes past midnight in `tz` for `now`. */
function minuteOfDay(now: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

/** True inside the call window (10:00 AM to 8:00 PM Central). */
export function withinDialHours(now: Date = new Date()): boolean {
  const m = minuteOfDay(now, DIAL_WINDOW.tz);
  return m >= DIAL_WINDOW.startMinute && m < DIAL_WINDOW.endMinute;
}

/** Pure: the verdict from the facts. */
export function dialVerdict(input: { exempt: boolean; inHours: boolean; dialsLast24h: number | null }):
  { ok: true } | { ok: false; reason: 'outside_call_hours' | 'number_dialed_recently' | 'dial_guard_unavailable' } {
  if (input.exempt) return { ok: true };
  if (!input.inHours) return { ok: false, reason: 'outside_call_hours' };
  if (input.dialsLast24h == null) return { ok: false, reason: 'dial_guard_unavailable' };
  if (input.dialsLast24h >= MAX_DIALS_PER_NUMBER_PER_DAY) return { ok: false, reason: 'number_dialed_recently' };
  return { ok: true };
}

let ensured: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS voice_dial_log (
          id          BIGSERIAL PRIMARY KEY,
          phone       VARCHAR(20)  NOT NULL,
          call_type   VARCHAR(40),
          call_id     VARCHAR(80),
          created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        )`);
      await sequelize.query(`CREATE INDEX IF NOT EXISTS voice_dial_log_phone_time ON voice_dial_log(phone, created_at)`);
    })().catch((err) => { ensured = null; throw err; });
  }
  return ensured;
}

async function exemptNumbers(): Promise<Set<string>> {
  const out = new Set<string>();
  const add = (p: unknown) => { const n = normalizePhone(String(p || '')); if (n) out.add(n); };
  add(env.adminAlertPhone);
  try {
    const { getSetting } = await import('../settingsService');
    add(await getSetting('executive_phone_number'));
  } catch { /* the env number is still exempt */ }
  return out;
}

/** Is this (normalized) number one of our own staff alert phones? Shared with the gateway facade (VS1.6). */
export async function isStaffAlertNumber(phone: string): Promise<boolean> {
  return (await exemptNumbers()).has(phone);
}

/** May we dial this (already normalized, E.164) number right now? */
export async function checkDialGuard(phone: string, now: Date = new Date()): Promise<{ ok: true } | { ok: false; reason: string }> {
  const exempt = (await exemptNumbers()).has(phone);
  if (exempt) return { ok: true };
  let dials: number | null = null;
  try {
    await ensureTable();
    const rows = await sequelize.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM voice_dial_log WHERE phone = :p AND created_at > NOW() - INTERVAL '24 hours'`,
      { replacements: { p: phone }, type: QueryTypes.SELECT },
    );
    dials = Number(rows[0]?.n ?? 0);
  } catch (err: any) {
    console.error('[VoiceDialGuard] dial record unavailable, refusing to dial:', err?.message);
  }
  return dialVerdict({ exempt: false, inHours: withinDialHours(now), dialsLast24h: dials });
}

/** Record a dial that Synthflow accepted. Never throws (the call is already placed). */
export async function recordDial(phone: string, callType: string, callId: string | null): Promise<void> {
  try {
    await ensureTable();
    await sequelize.query(
      `INSERT INTO voice_dial_log (phone, call_type, call_id) VALUES (:p, :t, :c)`,
      { replacements: { p: phone, t: callType, c: callId } },
    );
  } catch (err: any) {
    console.error('[VoiceDialGuard] could not record dial:', err?.message);
  }
}
