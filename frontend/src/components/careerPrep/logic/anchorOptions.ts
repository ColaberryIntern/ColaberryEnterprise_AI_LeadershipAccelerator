import type { OptionCard } from '../OptionCards';
import type { InterviewType, PrepDashboard, PrepInterview } from '../careerPrepApi';
import { interviewWhen } from './careerPrepCopy';

/**
 * Career Prep v27 (CP3.3): the anchor cards (kit P4.3) and the "what your data says" block.
 * Pure. Real interviews come first, soonest first, each with its readiness bar when one exists;
 * then "Add an interview" and "Create one for me". Every insight line is built from a metric that
 * exists; with no data there is no insight block at all.
 */
export const ADD_ID = 'add';
export const CREATE_ID = 'create';

export const TYPE_CARDS: ReadonlyArray<{ type: InterviewType; title: string; line: string }> = [
  { type: 'recruiter', title: 'Recruiter screen', line: 'About 15 minutes: who you are and why this role.' },
  { type: 'hiring_manager', title: 'Hiring manager', line: 'About 30 minutes: your work and the results you got.' },
  { type: 'technical', title: 'Technical', line: 'About 30 minutes: how you build and explain AI systems.' },
  { type: 'behavioral', title: 'Behavioral', line: 'About 20 minutes: stories about how you work with people.' },
];

const SOURCE_WORDS: Record<string, string> = { video: 'your videos', phone_mock: 'phone mocks', real_interview: 'real interviews', training: 'training', project: 'projects' };
const sourceWords = (keys: string[]) => keys.map((k) => SOURCE_WORDS[k] ?? k).join(', ');

export function anchorCards(interviews: PrepInterview[]): OptionCard[] {
  const real = interviews
    .filter((i) => i.source !== 'practice' && i.startsAt)
    .sort((a, b) => Date.parse(a.startsAt as string) - Date.parse(b.startsAt as string))
    .map((i): OptionCard => ({
      id: i.id, icon: 'calendar-event-line', title: `${i.company} · ${i.role}`,
      line: `${interviewWhen(i.startsAt as string)} · ${i.source === 'real' ? 'A real interview' : 'Added by you'}`,
      ...(i.readiness !== undefined ? { bar: { value: i.readiness, target: i.target } } : {}),
    }));
  // Practice interviews and added ones with no date, after the dated ones, so "Change" can pick them again.
  const undated = interviews.filter((i) => i.source === 'practice' || !i.startsAt).map((i): OptionCard => ({
    id: i.id, icon: 'calendar-line', title: `${i.company} · ${i.role}`, line: i.source === 'practice' ? 'Practice · made by Cora' : 'Added by you · no date yet',
    ...(i.readiness !== undefined ? { bar: { value: i.readiness, target: i.target } } : {}),
  }));
  return [
    ...real,
    ...undated,
    { id: ADD_ID, icon: 'add-circle-line', title: 'Add an interview', line: 'Paste the job description or the invite. I will build your prep from it.' },
    { id: CREATE_ID, icon: 'magic-line', title: 'Create one for me', line: 'No interview yet? I will set up a realistic practice one for the job you want.' },
  ];
}

export function typeCards(): OptionCard[] {
  return TYPE_CARDS.map((t) => ({ id: `type:${t.type}`, icon: 'question-answer-line', title: t.title, line: t.line }));
}

/** Up to 4 lines, each from a real metric: readiness vs ready-at, the two weakest skills, the biggest gain. */
export function insightLines(d: PrepDashboard): string[] {
  const lines: string[] = [];
  if (d.readiness) lines.push(`Readiness ${d.readiness.value}${d.readiness.target !== undefined ? `, ready at ${d.readiness.target}` : ''}.`);
  const scored = d.skills.filter((s) => s.score !== undefined);
  for (const s of scored.slice(0, 2)) lines.push(`${s.label}: ${s.score}, your lowest so far (from ${sourceWords(s.sources)}).`);
  const gain = scored.filter((s) => (s.change30 ?? 0) > 0).sort((a, b) => (b.change30 as number) - (a.change30 as number))[0];
  if (gain) lines.push(`${gain.label} is up ${gain.change30} in 30 days.`);
  return lines.slice(0, 4);
}
