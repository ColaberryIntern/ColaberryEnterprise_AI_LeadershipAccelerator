/**
 * Reese's introductions — the proactive messages every person gets once.
 *
 * There are TWO, because there are two distinct moments worth marking and a
 * person passing through both deserves to hear from Reese at each:
 *
 *   'account'  — they now have a login on the platform.
 *   'student'  — they have joined a real class.
 *
 * Someone who signs up and later enrols therefore receives two intros, in that
 * order. Someone who only ever browses on a free account receives one.
 *
 * FIVE DESIGN DECISIONS WORTH KNOWING, because each is a place this could have
 * gone wrong:
 *
 * 1. BOTH MESSAGES LEAD WITH MENTOR. Reese's locked persona is the student's
 *    AI Systems Architect mentor, and that is what the intros say. Admissions
 *    is mentioned in the account intro only as something Reese can also help
 *    with, so a new arrival with a billing or cohort question knows to ask —
 *    without the greeting contradicting the persona a student meets later.
 *
 * 2. THE MESSAGES ARE DETERMINISTIC, NOT GENERATED. Every other Reese send
 *    runs through an LLM. These do not. They are the first thing a person ever
 *    hears from Colaberry, identical for everyone, and generating them buys
 *    nothing while risking a bad first impression, latency on the login path,
 *    and a per-person cost for a fixed string.
 *
 * 3. NOT GATED ON THE PILOT COHORT. reeseEligibilityService gates AUTONOMOUS
 *    OUTREACH — Reese deciding on its own to chase someone about inactivity.
 *    Greeting someone who just walked through the door is a different act, and
 *    Ali asked for everyone. REESE_WELCOME_ENABLED=false is the kill switch.
 *
 * 4. THE LEDGER ROW IS CLAIMED BEFORE THE SEND. The unique index on
 *    (enrollment_id, kind) is what makes "each intro exactly once, ever" true
 *    under concurrent logins (two tabs, phone and laptop). Insert-first means
 *    the loser of that race is rejected by the database before it can send a
 *    duplicate. Writing the row afterwards would leave a window where both
 *    requests send.
 *
 * 5. NOTHING HERE CAN BREAK A LOGIN. Every path returns a result object;
 *    nothing throws. A person must reach the portal even if Reese's identity
 *    is unseeded, the DM room fails to open, or the database is unwell.
 */
import ReeseWelcome, { type ReeseWelcomeKind } from '../../models/ReeseWelcome';
import Enrollment from '../../models/Enrollment';
import Cohort from '../../models/Cohort';
import { getReeseEnrollmentId } from './reeseIdentitySeed';

export type WelcomeOutcome =
  | 'sent'
  | 'already_sent'
  | 'not_applicable'
  | 'disabled'
  | 'reese_not_seeded'
  | 'is_reese'
  | 'enrollment_not_found'
  | 'send_failed';

export interface WelcomeResult {
  kind: ReeseWelcomeKind;
  outcome: WelcomeOutcome;
  roomId?: string;
  messageId?: string;
}

/** Kill switch. Read per call, so flipping it takes effect without a restart. */
function enabled(): boolean {
  return String(process.env.REESE_WELCOME_ENABLED ?? 'true').toLowerCase() !== 'false';
}

/** PURE — first name from a full name, or '' when unknown. */
export function firstNameOf(fullName: string | null | undefined): string {
  return (fullName || '').trim().split(/\s+/)[0] || '';
}

function opener(firstName: string): string {
  const name = (firstName || '').trim();
  return name ? `Hi ${name} — I'm Reese` : "Hi — I'm Reese";
}

/**
 * PURE — the intro for a brand-new account.
 *
 * Leads with mentor. Admissions appears as a second, practical line: someone
 * who just made an account is far more likely to have a "what is this / what
 * does it cost / which class" question than an architecture one, and they
 * should know Reese can take it.
 */
export function accountWelcomeMessage(firstName: string): string {
  return (
    `${opener(firstName)}, your AI Systems Architect mentor at Colaberry.\n\n` +
    'This thread is yours. Ask me anything as you look around — what to try ' +
    "first, whether a class is the right fit, how enrolment and admissions " +
    'work, or anything technical you get stuck on.\n\n' +
    "I'm AI-operated, and I'm here whenever you need — just reply. Have a " +
    'look around, and tell me what you are trying to build.'
  );
}

/**
 * PURE — the intro for someone who has just joined a real class.
 *
 * A different message, not a louder version of the first: by now they know
 * what the platform is, so this one is about the class and the work.
 */
export function studentWelcomeMessage(firstName: string, cohortName: string | null): string {
  const cohort = (cohortName || '').trim();
  const line = cohort ? `You're in — ${cohort}.` : "You're in.";
  return (
    `${opener(firstName)} again, and now properly: ${line}\n\n` +
    "I'm your mentor for the whole build, not just one lesson — I keep the " +
    'thread, so you never have to re-explain your project to me.\n\n' +
    'Bring me the thing you are stuck on, however small. A screenshot of an ' +
    "error works too — paste it straight in and I'll read it. First move: " +
    'open Classroom and start the next card.'
  );
}

/** Deliberately internal: the two builders are the public surface. */
function messageFor(kind: ReeseWelcomeKind, firstName: string, cohortName: string | null): string {
  return kind === 'student' ? studentWelcomeMessage(firstName, cohortName) : accountWelcomeMessage(firstName);
}

/**
 * PURE — is this cohort a real class, as opposed to the Explorer/prospect/demo
 * bucket or a private business workspace? Mirrors portalEnrollmentService's own
 * `isRealClassCohort`; duplicated rather than exported from there because that
 * module is a portal read-model and this is a messaging decision — coupling the
 * two would mean a change to one silently retargets the other.
 */
export function isRealClassCohort(cohort: { name?: string | null; cohort_type?: string | null } | null): boolean {
  if (!cohort) return false;
  const name = String(cohort.name || '').toLowerCase();
  if (/explorer|prospect|demo|open house|waitlist/.test(name)) return false;
  return String(cohort.cohort_type ?? '').toLowerCase() !== 'business';
}

/** Send one intro if it has never been sent. Never throws. */
async function sendOnce(
  enrollmentId: string,
  kind: ReeseWelcomeKind,
  firstName: string,
  cohortName: string | null,
): Promise<WelcomeResult> {
  // Fast path: skip the write attempt for the overwhelming majority of calls,
  // which are repeat logins by people already introduced.
  const existing = await ReeseWelcome.findOne({ where: { enrollment_id: enrollmentId, kind } });
  if (existing) return { kind, outcome: 'already_sent' };

  // CLAIM the intro before sending it. A unique-constraint rejection here
  // means a concurrent request won the race and is already sending — this call
  // must then stay silent rather than produce a second hello.
  let claim: ReeseWelcome;
  try {
    claim = await ReeseWelcome.create({ enrollment_id: enrollmentId, kind, outcome: 'sent' });
  } catch {
    return { kind, outcome: 'already_sent' };
  }

  try {
    const { initiateDm } = await import('./reeseInitiateDmService');
    const { roomId, messageId } = await initiateDm(enrollmentId, messageFor(kind, firstName, cohortName));
    await claim.update({ room_id: roomId, message_id: messageId }).catch(() => {});
    return { kind, outcome: 'sent', roomId, messageId };
  } catch (e: any) {
    // The claim stays. Someone who hit a transient failure is better off with
    // no intro than with one arriving days later on an unrelated login — and
    // the row records what happened, so a failure is visible rather than
    // indistinguishable from "never applicable".
    await claim.update({ outcome: 'failed', detail: String(e?.message || e).slice(0, 500) }).catch(() => {});
    console.warn(JSON.stringify({
      level: 'warn', service: 'reese_welcome', event: 'welcome_send_failed',
      enrollment_id: enrollmentId, kind, error_class: e?.name || 'Error', message: String(e?.message || e),
    }));
    return { kind, outcome: 'send_failed' };
  }
}

/**
 * Evaluate BOTH intros for one person and send whichever are due.
 *
 * Safe to call on every login and on every cohort change: each intro
 * short-circuits once sent. Callers should fire this without awaiting — the
 * login response must not wait on a DM round trip.
 *
 * Evaluating state rather than reacting only to events is deliberate: it means
 * someone who enrols through ANY path (self-serve cohort pick, an admin
 * setting them up, a payment webhook) still gets the student intro on their
 * next login, without every one of those paths having to remember to call us.
 */
export async function maybeSendWelcomes(enrollmentId: string): Promise<WelcomeResult[]> {
  try {
    if (!enabled()) return [{ kind: 'account', outcome: 'disabled' }];

    // Reese must never introduce Reese to Reese. Cheap identity check first,
    // before any write — the same guard reeseReplyService relies on to make a
    // self-loop structurally impossible rather than merely unlikely.
    const reeseEnrollmentId = await getReeseEnrollmentId();
    if (!reeseEnrollmentId) return [{ kind: 'account', outcome: 'reese_not_seeded' }];
    if (reeseEnrollmentId === enrollmentId) return [{ kind: 'account', outcome: 'is_reese' }];

    const enrollment: any = await Enrollment.findByPk(enrollmentId, {
      attributes: ['full_name', 'tier', 'cohort_id'],
    });
    if (!enrollment) return [{ kind: 'account', outcome: 'enrollment_not_found' }];

    const firstName = firstNameOf(enrollment.full_name);

    // Is this person a student yet? Either their tier says so, or they hold a
    // real class cohort. Both are checked because the two are set by different
    // paths and neither alone is reliable.
    const cohort: any = enrollment.cohort_id ? await Cohort.findByPk(enrollment.cohort_id) : null;
    const inRealClass = isRealClassCohort(cohort);
    const isStudent = enrollment.tier === 'member' || inRealClass;
    const cohortName = inRealClass ? (cohort?.name ?? null) : null;

    const results: WelcomeResult[] = [];
    // Account intro always comes first, so a person who arrives already
    // enrolled still meets Reese in the intended order.
    results.push(await sendOnce(enrollmentId, 'account', firstName, null));
    if (isStudent) {
      results.push(await sendOnce(enrollmentId, 'student', firstName, cohortName));
    } else {
      results.push({ kind: 'student', outcome: 'not_applicable' });
    }
    return results;
  } catch (e: any) {
    // Nothing above may take down a login.
    console.warn(JSON.stringify({
      level: 'warn', service: 'reese_welcome', event: 'welcome_failed',
      enrollment_id: enrollmentId, error_class: e?.name || 'Error', message: String(e?.message || e),
    }));
    return [{ kind: 'account', outcome: 'send_failed' }];
  }
}
