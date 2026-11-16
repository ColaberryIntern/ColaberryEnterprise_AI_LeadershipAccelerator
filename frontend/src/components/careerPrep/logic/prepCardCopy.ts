import type { PrepInterview, PrepSummary } from '../careerPrepApi';
import { interviewWhen } from './careerPrepCopy';

/**
 * Career Prep v27 (CP5.1): the words on the campus home panel's Career Prep card (kit P1 section 1), from
 * ONE pure function. Headline, by rule, first match wins:
 *   1. a dated interview within 7 days      "Get ready for <weekday>'s interview" (weekday in Central)
 *   2. a later dated interview              "Get ready for your <company> interview"
 *   3. only a practice interview            "Keep practicing for <role>"
 *   4. nothing                              "Get ready for your next interview"
 * Rows: dated interviews, soonest first, at most 2, then "+n more" from the server's full count. A readiness
 * the server does not have is left out (no bar), never shown as 0.
 */
export interface PrepCardRow { id: string; title: string; when: string; readiness?: number; target: number; tag: string }
export interface PrepCard { headline: string; rows: PrepCardRow[]; more: number; coraLine: string }

const WEEK_MS = 7 * 86_400_000;
const WEEKDAY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'long' });
const TAG: Record<PrepInterview['source'], string> = { real: 'Real interview', added: 'Added by you', practice: 'Practice' };

function headlineFor(dated: PrepInterview[], next: PrepInterview | undefined, now: Date): string {
  const first = dated[0];
  if (first?.startsAt) {
    const at = new Date(first.startsAt);
    return at.getTime() - now.getTime() <= WEEK_MS ? `Get ready for ${WEEKDAY.format(at)}'s interview` : `Get ready for your ${first.company} interview`;
  }
  if (next?.source === 'practice') return `Keep practicing for ${next.role}`;
  return 'Get ready for your next interview';
}

export function prepCardCopy(s: PrepSummary, now: Date): PrepCard {
  const dated = s.interviews.filter((i) => i.startsAt && Date.parse(i.startsAt) >= now.getTime())
    .sort((a, b) => Date.parse(a.startsAt as string) - Date.parse(b.startsAt as string));
  const rows = dated.slice(0, 2).map((i): PrepCardRow => ({
    id: i.id, title: `${i.company} · ${i.role}`, when: `${interviewWhen(i.startsAt as string)} CT`, target: i.target, tag: TAG[i.source],
    ...(i.readiness !== undefined ? { readiness: i.readiness } : {}),
  }));
  const total = Math.max(s.interviewCount ?? dated.length, dated.length);
  const coraLine = s.sessionMinutes ? `Today's plan: a ${s.sessionMinutes}-minute session with Cora.`
    : dated.length || s.nextInterview ? 'Ask Cora for a plan when you are ready.' : 'Paste a job description to start.';
  return { headline: headlineFor(dated, s.nextInterview, now), rows, more: Math.max(0, total - rows.length), coraLine };
}
