import type { PromoSlot } from './briefCalendar';

/**
 * The brief writer's prompt (WL4.4). It writes the promotion copy for one Weekly Live from the chosen
 * topic and the session plan; code fills every date, time and link. The rules mirror briefIssues().
 */
export const BRIEF_WRITER_SYSTEM = `You write the promotion copy for one live online class taught by Ali Muwwakkil for Colaberry Training, for Jackie, who runs the event page and social posts.
Viewers are working professionals aged 35 to 60, most without a coding background.
Write in plain, warm, concrete language. Say what they will watch being built and what they leave with.
- eventName: the class title (short). fullTitle: "<title>: <what gets built>", at most 140 characters.
- summary: at most 140 characters, for the Eventbrite summary.
- description: 3 to 6 short paragraphs: a scene that creates tension, why it matters this week, what we build (put the list in bullets), what they leave with, and "No coding background needed. Bring your phone: scan the QR code on screen to check in, follow along and ask questions live."
- bullets: 2 to 5 lines, each "Name: what it does".
- whoFor and whatToBring: one or two sentences each. whatToBring names one thing from their own job.
- tags: 6 to 12 short tags.
- thumbnails: exactly 4 concepts, each with a different theme (night, clock, event, dawn). bigWord is 1 to 2 words (at most 16 characters), accent is an optional second word shown in red, line is the question or promise under it, name is the concept's short name, why says why it works in one sentence, bestFor is where to use it (event page, Short cover, weekend posts, LinkedIn).
- posts: one per slot id given below, written for that day (lean on a holiday when the slot names one). Use [Eventbrite link] where the link goes; the time is 6:30 PM Central.
Rules: no statistics, percentages, dollar amounts or numbers of two or more digits in eventName, fullTitle or any thumbnail field; never mention price or that anything costs nothing; never say guarantee; never suggest a partnership with Anthropic, Claude or any company; no earnings claims; no student or attendee names; no en or em dashes; American spelling.`;

export interface BriefWriterInput {
  title: string; airLabel: string; week: number; weekTheme: string; spin: string | null; promise: string | null;
  hooks: string[]; parody: string | null; slots: PromoSlot[];
}

export function briefWriterPrompt(i: BriefWriterInput, problems: string[] = []): string {
  const lines = [
    `Class: ${JSON.stringify(i.title)}, ${i.airLabel}, 6:30 PM Central, live on Zoom. Curriculum Week ${i.week}: ${i.weekTheme}.`,
    i.promise ? `What the class delivers: ${i.promise}` : '',
    i.spin ? `The angle: ${i.spin}` : '',
    i.hooks.length ? `Hooks Ali likes: ${i.hooks.map((h) => JSON.stringify(h)).join(' | ')}` : '',
    i.parody ? `A parody skit Piyush may post before class (original characters): ${i.parody}` : '',
    `Post slots (write one post for each id):\n${i.slots.filter((s) => s.who === 'Jackie').map((s) => `- ${s.id} (${s.when}${s.holiday ? `, ${s.holiday}` : ''}): ${s.task}`).join('\n')}`,
  ];
  if (problems.length) lines.push(`Your last answer was rejected. Fix every one of these and return the whole answer again:\n${problems.slice(0, 30).map((p) => `- ${p}`).join('\n')}`);
  return lines.filter(Boolean).join('\n\n');
}
