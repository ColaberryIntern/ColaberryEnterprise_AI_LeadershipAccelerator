/**
 * Reese's first-login welcome — the one proactive message every student gets.
 *
 * Reese introduces themselves as admissions and opens the door to questions.
 * That is the whole scope: no nudging, no campaign, no follow-up.
 *
 * FOUR DESIGN DECISIONS WORTH KNOWING, because each of them is a place this
 * could have gone wrong:
 *
 * 1. THE MESSAGE IS DETERMINISTIC, NOT GENERATED. Every other Reese send runs
 *    through an LLM. This one does not. It is the first thing a student ever
 *    hears from Colaberry, it is identical for everyone, and a generated
 *    greeting buys nothing while risking a bad first impression, a latency
 *    spike on the login path, and a per-student cost for a fixed string.
 *
 * 2. IT IS NOT GATED ON THE PILOT COHORT. reeseEligibilityService gates
 *    AUTONOMOUS OUTREACH — Reese deciding on its own to chase a student about
 *    inactivity. A welcome is a different act: the student just arrived, and
 *    saying hello to someone who walked through the door is not outreach. Ali
 *    asked for every student, deliberately. REESE_WELCOME_ENABLED=false is the
 *    kill switch if that judgement turns out wrong.
 *
 * 3. THE LEDGER ROW IS CLAIMED BEFORE THE SEND, not written after it. The
 *    unique index on enrollment_id is what makes "exactly once, ever" true
 *    under concurrent logins (two tabs, phone and laptop). Insert-first means
 *    the loser of that race is rejected by the database before it can send a
 *    second greeting. Writing the row afterwards would leave a window where
 *    both requests send.
 *
 * 4. IT CAN NEVER BREAK A LOGIN. Every path returns a result object; nothing
 *    throws. A student must be able to get into the portal even if Reese's
 *    identity is unseeded, the DM room fails to open, or the database is
 *    having a bad day.
 */
import ReeseWelcome from '../../models/ReeseWelcome';
import Enrollment from '../../models/Enrollment';
import { getReeseEnrollmentId } from './reeseIdentitySeed';

export type WelcomeOutcome =
  | 'sent'
  | 'already_welcomed'
  | 'disabled'
  | 'reese_not_seeded'
  | 'is_reese'
  | 'enrollment_not_found'
  | 'send_failed';

export interface WelcomeResult {
  outcome: WelcomeOutcome;
  roomId?: string;
  messageId?: string;
}

/** Kill switch. Read per call, so flipping it takes effect without a restart. */
function enabled(): boolean {
  return String(process.env.REESE_WELCOME_ENABLED ?? 'true').toLowerCase() !== 'false';
}

/**
 * PURE — the greeting itself.
 *
 * Written to Reese's locked voice rules (brief, peer not parent, no mascot
 * energy, openly AI, always a doable next step) and to Ali's brief: say they
 * are with admissions, and that questions are welcome.
 *
 * `firstName` may be empty; the greeting reads correctly either way rather
 * than addressing someone as "there" or printing a blank.
 */
export function welcomeMessage(firstName: string): string {
  const name = (firstName || '').trim();
  const opener = name ? `Hi ${name} — I'm Reese` : "Hi — I'm Reese";
  return (
    `${opener}, with admissions here at Colaberry.\n\n` +
    'If anything about your enrollment, your cohort dates, or where to start ' +
    "isn't clear, ask me right here and I'll get you an answer.\n\n" +
    "I'm AI-operated, and this thread stays open — there's no wrong time to " +
    'message, and no question too small. Welcome in.'
  );
}

/** PURE — first name from a full name, or '' when unknown. */
export function firstNameOf(fullName: string | null | undefined): string {
  return (fullName || '').trim().split(/\s+/)[0] || '';
}

/**
 * Send the welcome if this student has never been welcomed before.
 *
 * Safe to call on EVERY login: the second and every later call short-circuits
 * on `already_welcomed`. Callers should fire this without awaiting it — the
 * login response must not wait on a DM round trip.
 */
export async function maybeSendWelcome(enrollmentId: string): Promise<WelcomeResult> {
  try {
    if (!enabled()) return { outcome: 'disabled' };

    // Reese must never welcome Reese. Cheap identity check first, before any
    // write — the same guard reeseReplyService relies on to make a self-loop
    // structurally impossible rather than merely unlikely.
    const reeseEnrollmentId = await getReeseEnrollmentId();
    if (!reeseEnrollmentId) return { outcome: 'reese_not_seeded' };
    if (reeseEnrollmentId === enrollmentId) return { outcome: 'is_reese' };

    // Fast path: skip the write attempt for the overwhelming majority of
    // logins, which are repeat logins by already-welcomed students.
    const existing = await ReeseWelcome.findOne({ where: { enrollment_id: enrollmentId } });
    if (existing) return { outcome: 'already_welcomed' };

    const enrollment = await Enrollment.findByPk(enrollmentId, { attributes: ['full_name'] });
    if (!enrollment) return { outcome: 'enrollment_not_found' };

    // CLAIM the greeting before sending it. A unique-constraint rejection here
    // means a concurrent login won the race and is already sending — this call
    // must then stay silent rather than produce a second hello.
    let claim: ReeseWelcome;
    try {
      claim = await ReeseWelcome.create({ enrollment_id: enrollmentId, outcome: 'sent' });
    } catch {
      return { outcome: 'already_welcomed' };
    }

    try {
      const { initiateDm } = await import('./reeseInitiateDmService');
      const { roomId, messageId } = await initiateDm(
        enrollmentId,
        welcomeMessage(firstNameOf((enrollment as any).full_name)),
      );
      await claim.update({ room_id: roomId, message_id: messageId }).catch(() => {});
      return { outcome: 'sent', roomId, messageId };
    } catch (e: any) {
      // The claim stays. A student who hit a transient send failure is better
      // off with no greeting than with one that arrives days late, out of
      // context, on some unrelated login — and the row records what happened
      // so it is visible rather than indistinguishable from "never eligible".
      await claim.update({ outcome: 'failed', detail: String(e?.message || e).slice(0, 500) }).catch(() => {});
      console.warn(JSON.stringify({
        level: 'warn', service: 'reese_welcome', event: 'welcome_send_failed',
        enrollment_id: enrollmentId, error_class: e?.name || 'Error', message: String(e?.message || e),
      }));
      return { outcome: 'send_failed' };
    }
  } catch (e: any) {
    // Nothing above may take down a login.
    console.warn(JSON.stringify({
      level: 'warn', service: 'reese_welcome', event: 'welcome_failed',
      enrollment_id: enrollmentId, error_class: e?.name || 'Error', message: String(e?.message || e),
    }));
    return { outcome: 'send_failed' };
  }
}
