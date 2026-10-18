/**
 * testModeWindow — test mode expires on its own.
 *
 * WHAT HAPPENED, so this is not re-litigated later. On 2026-10-16 at 6:58 AM
 * CDT someone set `test_mode_enabled = true` in production and did not set it
 * back. Test mode does not suppress mail, it REWRITES the recipient to
 * `test_email`, so for the next 29 hours every outbound email went to one
 * mailbox instead of the person it was addressed to: 579 messages, of which
 * 492 were Community Digests and 35 were portal access links belonging to 10
 * different people, who were simply unable to log in and had no way to know
 * why. The app reported success for every one of them.
 *
 * 29 hours is this episode only, measured from the settings row. Redirected
 * mail also exists from 14 October, two days before that timestamp, so there
 * was at least one earlier episode that someone did switch back off. The flag
 * being forgotten is therefore the normal case rather than a one-off.
 *
 * Nothing caught it. The system-health and cron-failure alerts that would have
 * reported it were themselves redirected into the same mailbox, which is the
 * same shape as the kill-switch incident two days earlier: a global flag, left
 * on, that suppresses its own alarm. It was found only because a student
 * emailed to say he could not log in.
 *
 * THE FIX IS A CLOCK, NOT A RULE ABOUT PEOPLE. Test mode is a debugging aid and
 * a debugging session is measured in minutes. Rather than trusting whoever
 * turned it on to turn it back off, the flag is treated as stale once it has
 * been on longer than a working session, and a stale flag is simply not
 * honoured. Had this existed, the incident would have lasted four hours instead
 * of twenty-nine, and would have ended by itself before the overnight digest
 * run that accounts for 492 of the 579 misdelivered messages.
 *
 * The age is taken from `system_settings.updated_at` on the `test_mode_enabled`
 * row, which `setSetting` already maintains. No new setting, nothing extra to
 * remember to write, and nothing that can drift out of step with the flag it
 * describes.
 */

/**
 * How long test mode is honoured after it is switched on.
 *
 * Four hours: long enough for any real debugging session, short enough that a
 * flag left on at the end of a working day is dead before the overnight digest
 * run, which is what turned one person's mistake into 492 misdelivered emails.
 */
export const TEST_MODE_MAX_AGE_HOURS = 4;

const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * Whether test mode has been on long enough to be treated as forgotten.
 *
 * An unknown age counts as expired. The alternative is to honour a redirect
 * whose age cannot be established, and the failure mode of this flag is mail
 * going to the wrong person, so the safe direction is clearly to stop
 * redirecting. A flag genuinely wanted on is one click away from being on
 * again, with a fresh timestamp.
 */
export function isTestModeExpired(
  enabledAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (enabledAt === null || enabledAt === undefined) return true;
  const at = enabledAt instanceof Date ? enabledAt : new Date(enabledAt);
  const ms = at.getTime();
  if (!Number.isFinite(ms)) return true;

  // A timestamp in the future cannot be aged, and would otherwise pin test mode
  // on indefinitely through clock skew or a hand-edited row. Treated as expired
  // for the same reason as an unknown one.
  const age = now.getTime() - ms;
  if (age < 0) return true;

  return age > TEST_MODE_MAX_AGE_HOURS * MS_PER_HOUR;
}

/**
 * How long test mode has been on, for log lines. Null when it cannot be told.
 */
export function testModeAgeHours(
  enabledAt: Date | string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (enabledAt === null || enabledAt === undefined) return null;
  const at = enabledAt instanceof Date ? enabledAt : new Date(enabledAt);
  if (!Number.isFinite(at.getTime())) return null;
  return Math.round(((now.getTime() - at.getTime()) / MS_PER_HOUR) * 10) / 10;
}
