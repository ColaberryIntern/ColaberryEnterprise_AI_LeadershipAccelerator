/**
 * openHouseFlashDiscountService — the Open House "everybody wins" offer.
 *
 * Ali, 2026-11-19: the third scholarship draw lands on EVERYBODY. Every person
 * signed in to the Open House when the host makes that draw gets 50% off the
 * annual membership, and it lasts until a deadline the host sets (11:59 PM CT
 * that night). The discount has to be real in the app, not just on a slide.
 *
 * How it works, with no schema change:
 *  1. The deck calls activateFlashDiscount() on that draw. It stores
 *     `flashDiscount` on the session's kit_config_json: the deadline, the
 *     amount, and the moment of activation. Only guests who joined at or before
 *     that moment qualify ("give them one last time to scan in").
 *  2. When a member opens their subscription page or starts a checkout,
 *     ensureFlashCredit() matches their email (or enrollment) to a qualifying
 *     guest of a session whose offer is still open, and grants an annual-only
 *     account credit worth 50% of the year. The existing checkout applies it.
 *  3. The deadline is encoded in the credit's source_event_id, so after it
 *     passes, the credit stops being offered (isFlashCreditExpired), with a
 *     short grace so a checkout started before midnight still settles.
 *
 * Guards: no stacking with an unused Open House scholarship or 2026 alumni
 * credit (that would make
 * the year cost almost nothing); never for someone who already has an active
 * annual membership; idempotent per (session, email).
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { Enrollment } from '../models';
import { grantCredit } from './accountCreditService';
import { formatDisplayName } from './sessionPresenceService';
import { FLASH_REASON, FLASH_CENTS, flashSourceId, validateFlashDeadline } from './openHouseFlashCredit';
import { ALUMNI_REASON } from './alumniDiscountRules';

export interface FlashConfig { deadline: string; cents: number; activated_at: string }

/**
 * Turn the offer on for a session (the EVERYBODY draw). Idempotent: a repeat
 * call keeps the FIRST activation time, so a double click cannot widen the
 * roster, and reports how many signed-in guests qualify.
 */
export async function activateFlashDiscount(sessionId: string, deadlineIso: unknown, nowMs: number = Date.now()):
  Promise<{ ok: true; flash: FlashConfig; qualifying: number } | { ok: false; status: number; error: string }> {
  const rows = await sequelize.query<{ title: string; flash: FlashConfig | null }>(
    `SELECT title, kit_config_json->'flashDiscount' AS flash FROM live_sessions WHERE id = :sid`,
    { replacements: { sid: sessionId }, type: QueryTypes.SELECT },
  );
  if (!rows.length) return { ok: false, status: 404, error: 'session not found' };
  if (!/open house/i.test(String(rows[0].title || ''))) return { ok: false, status: 409, error: 'not an Open House session' };

  let flash = rows[0].flash;
  if (!flash) {
    const v = validateFlashDeadline(deadlineIso, nowMs);
    if (!v.ok) return { ok: false, status: 400, error: v.error };
    flash = { deadline: new Date(v.deadlineMs).toISOString(), cents: FLASH_CENTS, activated_at: new Date(nowMs).toISOString() };
    await sequelize.query(
      `UPDATE live_sessions SET kit_config_json = jsonb_set(COALESCE(kit_config_json, CAST('{}' AS jsonb)), '{flashDiscount}', CAST(:flash AS jsonb), true) WHERE id = :sid`,
      { replacements: { sid: sessionId, flash: JSON.stringify(flash) } },
    );
  }
  const [{ n }] = await sequelize.query<{ n: string }>(
    `SELECT CAST(count(*) AS text) AS n FROM session_guests WHERE session_id = :sid AND created_at <= CAST(:at AS timestamptz)`,
    { replacements: { sid: sessionId, at: flash.activated_at }, type: QueryTypes.SELECT },
  );
  return { ok: true, flash, qualifying: Number(n) };
}

/**
 * Grant the flash credit to this enrollment if they qualify and the offer is
 * open. Best-effort: callers wrap it so a failure never blocks a checkout.
 * Returns whether a NEW credit was granted.
 */
export async function ensureFlashCredit(enrollmentId: string, nowMs: number = Date.now()): Promise<boolean> {
  const enrollment = await Enrollment.findByPk(enrollmentId, { attributes: ['id', 'email'] });
  const email = String((enrollment as any)?.email || '').trim().toLowerCase();
  if (!enrollment || !email) return false;

  const hits = await sequelize.query<{ session_id: string; flash: FlashConfig }>(
    `SELECT g.session_id, s.kit_config_json->'flashDiscount' AS flash
       FROM session_guests g JOIN live_sessions s ON s.id = g.session_id
      WHERE (g.email_lower = :email OR g.enrollment_id = :eid)
        AND s.kit_config_json->'flashDiscount' IS NOT NULL
        AND CAST(s.kit_config_json->'flashDiscount'->>'deadline' AS timestamptz) > CAST(:now AS timestamptz)
        AND g.created_at <= CAST(s.kit_config_json->'flashDiscount'->>'activated_at' AS timestamptz)
      ORDER BY g.created_at ASC LIMIT 1`,
    { replacements: { email, eid: enrollmentId, now: new Date(nowMs).toISOString() }, type: QueryTypes.SELECT },
  );
  if (!hits.length) return false;
  const { session_id, flash } = hits[0];

  // No stacking with an unused scholarship or an earlier flash credit, and no
  // discount for someone who already holds an active annual membership.
  const blockers = await sequelize.query<{ n: string }>(
    `SELECT (SELECT count(*) FROM account_credits c
               WHERE c.enrollment_id = :eid AND c.status = 'available'
                 AND c.reason IN ('open_house_scholarship_annual', :flashReason, :alumniReason))
          + (SELECT count(*) FROM subscriptions s
               WHERE s.enrollment_id = :eid AND s.status = 'active' AND s.plan = 'annual') AS n`,
    { replacements: { eid: enrollmentId, flashReason: FLASH_REASON, alumniReason: ALUMNI_REASON }, type: QueryTypes.SELECT },
  );
  if (Number(blockers[0]?.n || 0) > 0) return false;

  const { granted } = await grantCredit({
    enrollmentId,
    amountCents: Number(flash.cents) || FLASH_CENTS,
    reason: FLASH_REASON,
    sourceEventId: flashSourceId(Date.parse(flash.deadline), session_id, email),
    grantedBy: 'open-house-flash',
    note: `Open House offer: 50% off the annual membership, signed in to session ${session_id}, valid until ${flash.deadline}`,
  });
  return granted;
}

/** Recently paid memberships, for the deck's "just enrolled" pop-up. First name + last initial only. */
export async function recentEnrollments(sinceMs: number): Promise<Array<{ id: string; display_name: string; plan: string; at: string }>> {
  const rows = await sequelize.query<{ id: string; full_name: string | null; plan: string; at: string }>(
    `SELECT s.id, e.full_name, s.plan, s.updated_at AS at
       FROM subscriptions s JOIN enrollments e ON e.id = s.enrollment_id
      WHERE s.status = 'active' AND s.plan IN ('annual', 'monthly')
        AND s.updated_at >= CAST(:since AS timestamptz)
      ORDER BY s.updated_at ASC LIMIT 100`,
    { replacements: { since: new Date(sinceMs).toISOString() }, type: QueryTypes.SELECT },
  );
  return rows.map((r) => ({ id: r.id, display_name: formatDisplayName(r.full_name), plan: r.plan, at: new Date(r.at).toISOString() }));
}

