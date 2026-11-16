import type { PrepInterview, PrepSummary } from '../careerPrepApi';

/**
 * Career Prep v27 (CP2.2): the words on the Career Prep floor screen, the door and the side panel,
 * from ONE pure function so they never disagree. NO INVENTED DATA: a stop or a line with no data
 * behind it is left out, never shown as 0. Times are Central.
 */
export interface FloorStop { key: 'readiness' | 'readyAt' | 'streak' | 'thisWeek'; label: string; value: string }
export interface FloorCopy { greeting: string; stops: FloorStop[]; waiting: string[]; doorStatus?: string }

const TZ = 'America/Chicago';

/** "Thursday at 2:00 PM" in Central. */
export function interviewWhen(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long' });
  const time = d.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
  return `${day} at ${time}`;
}

function greetingFor(name: string | undefined, next: PrepInterview | undefined): string {
  const hi = name ? `Hi ${name}.` : 'Hi.';
  if (next?.startsAt) return `${hi} Your ${next.company} interview is ${interviewWhen(next.startsAt)}.`;
  if (next) return `${hi} You are practicing for ${next.role}.`;
  return `${hi} Tell Cora which interview you are preparing for, and she will build your plan.`;
}

export function careerPrepSummary(s: PrepSummary): FloorCopy {
  const { readiness, readyAt, streak, thisWeek } = s.stops;
  const stops: FloorStop[] = [];
  if (readiness !== undefined) stops.push({ key: 'readiness', label: 'Readiness', value: String(readiness) });
  if (readyAt !== undefined) stops.push({ key: 'readyAt', label: 'Ready at', value: String(readyAt) });
  if (streak !== undefined) stops.push({ key: 'streak', label: 'Streak', value: `${streak} ${streak === 1 ? 'day' : 'days'}` });
  if (thisWeek !== undefined) stops.push({ key: 'thisWeek', label: 'This week', value: `${thisWeek} min` });
  const waiting: string[] = [];
  const next = s.nextInterview;
  if (next && next.readiness !== undefined) waiting.push(`Your ${next.company} readiness · ${next.readiness} now · ${next.target} is ready`);
  return { greeting: greetingFor(s.firstName, next), stops, waiting };
}
