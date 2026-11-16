import type { OptionCard } from '../OptionCards';
import type { PrepInterview, PrepSkill } from '../careerPrepApi';

/**
 * Career Prep v27 (CP4.1): the plan cards Cora offers once an interview is chosen (kit P4.4). The first
 * is Recommended. Card ids carry what the server needs: plan:days, plan:tonight, plan:full, plan:custom,
 * then min:10|20|45 and focus:<skill> for "Build my own". The plan itself is always built by the server.
 */
const TZ = 'America/Chicago';
const centralDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

/** Whole Central days from today until the interview date (0 = today). */
export function daysUntil(startsAt: string, now = new Date()): number {
  return Math.round((Date.parse(`${centralDate(new Date(startsAt))}T12:00:00Z`) - Date.parse(`${centralDate(now)}T12:00:00Z`)) / 86_400_000);
}

export function planCards(iv: PrepInterview, now = new Date()): OptionCard[] {
  const d = iv.startsAt ? daysUntil(iv.startsAt, now) : null;
  const first: OptionCard = iv.source === 'practice' || d === null
    ? { id: 'plan:days', icon: 'calendar-check-line', title: 'A 4-day practice plan', line: 'One short session a day, about 20 minutes, on your weakest skills.', badge: 'Recommended' }
    : d <= 0
      ? { id: 'plan:tonight', icon: 'flashlight-line', title: 'Today: one focused session', line: 'Your interview is today. 15 minutes on your weakest answer.', badge: 'Recommended' }
      : { id: 'plan:days', icon: 'calendar-check-line', title: `${d} ${d === 1 ? 'day' : 'days'} to the interview`, line: 'One short session a day, about 20 minutes, ending with a full rehearsal.', badge: 'Recommended' };
  const rest: OptionCard[] = [
    { id: 'plan:tonight', icon: 'flashlight-line', title: 'Tonight only: fix your weakest answer', line: 'One session, 15 minutes.' },
    { id: 'plan:full', icon: 'user-voice-line', title: 'Full rehearsal', line: 'A 30-minute mock with Cora as the hiring manager, then a critique.' },
    { id: 'plan:custom', icon: 'settings-4-line', title: 'Build my own', line: 'Pick the time and the skill.' },
  ];
  return [first, ...rest.filter((c) => c.id !== first.id)];
}

export function minuteCards(): OptionCard[] {
  return [10, 20, 45].map((m) => ({ id: `min:${m}`, icon: 'timer-line', title: `${m} minutes`, line: m === 10 ? 'A quick one.' : m === 20 ? 'The usual session.' : 'A long session with a pressure round.' }));
}

export function focusCards(skills: PrepSkill[]): OptionCard[] {
  return skills.filter((s) => s.score !== undefined).slice(0, 5)
    .map((s) => ({ id: `focus:${s.key}`, icon: 'focus-2-line', title: s.label, line: `${s.score} now`, bar: { value: s.score as number } }));
}
