/**
 * testModeAlarm — tell somebody that test mode is on, through a channel test mode
 * cannot swallow.
 *
 * THE HOLE THIS CLOSES. On 2026-10-16 `test_mode_enabled` was left true for 29 hours
 * and every outbound email went to one mailbox: 579 messages, including 35 portal
 * access links belonging to 10 people who simply could not log in. `testModeWindow`
 * now caps that at 4 hours. But nothing ever ANNOUNCED it, and that is a separate
 * defect: the system-health and cron-failure alerts that should have reported it were
 * themselves redirected into the same mailbox. It was found only because a student
 * wrote in. The kill-switch incident two days earlier had the identical shape.
 *
 * So the one rule here: THE ALARM MUST NOT USE THE CHANNEL IT IS REPORTING ON. The
 * alarm is sent with `neverRedirect: true`, the exemption built for credential-bearing
 * mail, which short-circuits `resolveEmailRecipient` BEFORE `resolveTestRedirect` is
 * ever consulted. That also means the alarm cannot recurse into the path that raised it.
 *
 * WHERE IT FIRES FROM, and why not a cron. The obvious home is a scheduled check, but
 * an audit on 2026-10-22 found 23 agents that are enabled, carry a cron string and have
 * never executed once, so a new scheduled job is not a safe place to put a safety
 * mechanism. This fires from the redirect path itself: the moment test mode actually
 * rewrites a recipient is the moment it is provably live, and that code is, by
 * definition, running.
 *
 * EDGE-TRIGGERED, NOT LEVEL-TRIGGERED. A check of the form "test mode is on, send an
 * alert" notifies on every single email forever, which trains people to filter the
 * alarm — this repo has been bitten by exactly that threshold mistake before. The
 * trigger is therefore the ACTIVATION, identified by the settings row's `updated_at`:
 * one alarm per time the flag is switched on, no matter how many thousands of emails
 * follow. Switching it off and on again is a new activation and alarms again, because
 * the timestamp moves.
 */

/** Where the last-alarmed marker is kept, so the dedup survives a restart. */
export const ALARM_SETTING_KEY = 'test_mode_alarm_sent_for';

/**
 * The idempotency key for one activation: the settings row's `updated_at`, normalized.
 * Returns null when there is no usable timestamp, which deliberately disables the
 * alarm rather than firing it — see `shouldAlarm`.
 */
export function alarmMarker(enabledAt: Date | string | null | undefined): string | null {
  if (enabledAt === null || enabledAt === undefined) return null;
  const ms = enabledAt instanceof Date ? enabledAt.getTime() : Date.parse(String(enabledAt));
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/**
 * Should this activation raise an alarm?
 *
 * No usable timestamp means NO alarm. That looks like the unsafe choice and is the
 * safe one: without a timestamp there is no key to dedup on, so every email would
 * alarm, which is the level-triggered failure this module exists to avoid. A flood of
 * alarms is not a louder warning, it is a filtered one.
 */
export function shouldAlarm(
  enabledAt: Date | string | null | undefined,
  lastAlarmedFor: string | null | undefined,
): boolean {
  const marker = alarmMarker(enabledAt);
  if (marker === null) return false;
  return marker !== (lastAlarmedFor ?? null);
}

export interface AlarmMessage { subject: string; html: string; text: string }

/**
 * What the alarm says. It leads with the consequence rather than the flag name,
 * because the reader is being interrupted and may not know what test mode does: it
 * does not pause mail, it REWRITES the recipient, so everything looks delivered.
 */
export function buildAlarmMessage(input: {
  enabledAt: Date | string | null;
  sink: string;
  maxAgeHours: number;
  enabledBy?: string | null;
}): AlarmMessage {
  const when = alarmMarker(input.enabledAt) ?? 'an unknown time';
  const who = input.enabledBy || 'nobody recorded';
  const lines = [
    'Test mode is ON in production, so outbound email is not going to the people it is addressed to.',
    `Every message is being rewritten to ${input.sink}. Nothing fails and nothing looks wrong: the app reports every send as delivered.`,
    `Switched on at ${when}, by ${who}.`,
    `It will stop being honoured by itself after ${input.maxAgeHours} hours, after which mail goes to real recipients again even if the flag is still set.`,
    'If this was not deliberate, set test_mode_enabled to false now.',
  ];
  return {
    subject: 'Test mode is ON: outbound email is being redirected',
    text: lines.join('\n\n'),
    html: lines.map((l) => `<p>${l}</p>`).join('\n'),
  };
}

/** The I/O this needs, injected so the decision can be tested without a database. */
export interface AlarmDeps {
  getLastAlarmedFor(): Promise<string | null>;
  recordAlarmed(marker: string): Promise<void>;
  send(message: AlarmMessage): Promise<void>;
}

/**
 * Raise one alarm for this activation, or do nothing.
 *
 * ORDER IS DELIBERATE: the marker is recorded BEFORE the send. If the send were first,
 * a failure between send and record would re-alarm on the next email and keep doing so,
 * turning one warning into the flood described above. Recording first means a failed
 * send is a missed alarm rather than an unbounded one, and the structured log still
 * carries the event. Never throws: this runs on the outbound email path, and a broken
 * alarm must not be able to stop mail.
 */
export async function maybeRaiseTestModeAlarm(
  enabledAt: Date | string | null,
  sink: string,
  maxAgeHours: number,
  deps: AlarmDeps,
  enabledBy?: string | null,
): Promise<boolean> {
  try {
    const marker = alarmMarker(enabledAt);
    if (marker === null) return false;
    const last = await deps.getLastAlarmedFor();
    if (!shouldAlarm(enabledAt, last)) return false;
    await deps.recordAlarmed(marker);
    await deps.send(buildAlarmMessage({ enabledAt, sink, maxAgeHours, enabledBy }));
    return true;
  } catch {
    return false;
  }
}
