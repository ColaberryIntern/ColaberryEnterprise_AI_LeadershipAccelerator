import type { PrepRecap } from '../careerPrepApi';
import type { OptionCard } from '../OptionCards';

/**
 * Career Prep v27 (CP4.5): the words around a finished session (shot L3-6). Every number here comes from
 * the server's recap, which is computed from the rows the session wrote; a number the recap does not have
 * is not mentioned. Times are Central.
 */
const CT = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' });
const CT_HOUR = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hourCycle: 'h23' });

/** "6:00 PM" in Central for an instant. */
export const centralTime = (iso: string | Date): string => CT.format(new Date(iso));

/** "Remind me tonight at 6:00 PM" is offered only before 6:00 PM Central. */
export const tonightOffered = (now: Date): boolean => Number(CT_HOUR.format(now)) % 24 < 18;

const moved = (before: number | undefined, after: number) => (before === undefined ? `${after}` : `${before} → ${after}`);

/** Cora's recap message: the readiness move, the skill that moved most, what was saved. */
export function recapText(r: PrepRecap): string {
  const parts = [`Session ${r.status === 'finished' ? 'done' : 'ended'}${r.firstName ? `, ${r.firstName}` : ''}.`];
  if (r.readiness) parts.push(`Readiness${r.readiness.company ? ` for ${r.readiness.company}` : ''}: ${moved(r.readiness.before, r.readiness.after)}.`);
  const top = [...r.skills].sort((a, b) => Math.abs(b.after - (b.before ?? b.after)) - Math.abs(a.after - (a.before ?? a.after)))[0];
  if (top) parts.push(`"${top.label}" ${top.before === undefined ? `starts at ${top.after}` : `moved ${moved(top.before, top.after)}`}.`);
  if (r.pending) parts.push(stillScoring(r.pending));
  else if (!top) parts.push('No answer was scored this time, so your numbers did not change.');
  parts.push(`I have added today's ${r.minutes} ${r.minutes === 1 ? 'minute' : 'minutes'} to your dashboard.`);
  return parts.join(' ');
}

/** Answers still being scored when the session ended: said plainly, never counted as "nothing changed". */
export const stillScoring = (n: number): string => `${n === 1 ? 'One answer is' : `${n} answers are`} still being scored; ${n === 1 ? 'it' : 'they'} will show on Your progress in a minute or two.`;

/** The cards under the recap: dashboard, a reminder for the same time tomorrow, another session. */
export function recapCards(startedAt: string): OptionCard[] {
  return [
    { id: 'tab:progress', icon: 'bar-chart-box-line', title: 'See my dashboard', line: 'Everything, updated' },
    { id: 'remind:tomorrow', icon: 'notification-3-line', title: 'Same time tomorrow', line: `${centralTime(startedAt)} CT, in the app and by email` },
    { id: 'offer', icon: 'restart-line', title: 'Another session', line: 'Pick a plan' },
  ];
}

export const REMIND_TONIGHT: OptionCard = { id: 'remind:tonight', icon: 'notification-3-line', title: 'Remind me tonight at 6:00 PM', line: 'Central time, in the app and by email' };

/** What Cora says once a reminder is set. */
export function reminderSetText(sendAt: string, status = 'pending'): string {
  if (status === 'pending') return `Done. I will remind you at ${centralTime(sendAt)} Central, here and by email.`;
  if (status === 'sent') return `I already sent that reminder at ${centralTime(sendAt)} Central. Pick the other time if you want one more.`;
  return 'That reminder did not go out, and I will not send it late. Pick the other time instead.';
}
