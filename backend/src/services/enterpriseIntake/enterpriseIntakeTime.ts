/**
 * enterpriseIntakeTime - how the v2 intake says a time. Pure and dependency-free, so the
 * research, reminder and brief modules can share it without pulling in the calendar stack.
 * Ali works in Central time; every client-facing and internal time is shown in Central.
 */
export const TZ = 'America/Chicago';

/** "Monday, November 23 at 9:00 AM Central": how every email and invite says the meeting time. */
export const meetingWhen = (d: Date): string =>
  `${d.toLocaleString('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })} Central`;
