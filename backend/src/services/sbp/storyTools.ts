/**
 * storyTools — mark any API a story names that the student never did.
 *
 * ## Why
 *
 * The release-story prompt has said since ShiftFill v5 "Never invent an API,
 * portal or system the inputs do not name", and since v6 not to name a system
 * for data whose home is unstated. That is guidance, and ShiftFill v10
 * (2026-11-23) broke it: STORY-005 said "Use Google Maps API for commute
 * distance" and listed "Commute distance API fails" as a failure path, though
 * the student named only Gmail, Slack, Google Sheets and Twilio SMS. A student
 * following that task signs up for a paid service nobody asked for.
 *
 * ## What it does
 *
 * Finds "<name> API" in a story's text and checks the word before "API"
 * against the words of the plan's CONSTRAINT requirements (where the tools
 * the student named live). Each one not found gets ONE note appended to the
 * story's `task_guidance`, telling the student to ask before using it.
 *
 * It annotates; it never rewrites or deletes. The model's sentence may be
 * right (the owner may already pay for the service), and only the owner knows,
 * so the task asks.
 *
 * With no CONSTRAINT requirements there is nothing to check against, and
 * nothing is marked.
 *
 * PURE. Stories it does not change come back as the same objects.
 */
import type { PlanRequirement, PlanStory } from './planContract';

/** Words that stand before "API" without naming one ("if the API fails"). */
const NOT_A_NAME = new Set([
  'the', 'a', 'an', 'any', 'this', 'that', 'its', 'their', 'each', 'our', 'your',
  'via', 'through', 'using', 'use', 'with', 'from', 'to', 'if', 'when',
]);

// Spaces only, never a newline: failure paths are joined one per line, and v10's
// "…is incomplete\nCommute distance API fails" must not read as "incomplete Commute distance".
const API = /((?:[\w'’-]+[ \t]+){1,3})APIs?\b/g;

/** Lowercase word with possessives and plural "s" trimmed, so "Sheets" meets "sheet". */
function key(w: string): string {
  return w.toLowerCase().replace(/['’]s?$/, '').replace(/s$/, '');
}

/** The "<name> API" phrases in `text` whose name is not a tool the requirements name. */
export function unnamedApis(text: string, namedWords: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(API)) {
    const words = m[1].trim().split(/\s+/);
    const last = words[words.length - 1];
    if (NOT_A_NAME.has(last.toLowerCase()) || namedWords.has(key(last))) continue;
    // Drop leading words that only introduce the name ("Use Google Maps" → "Google Maps").
    let i = 0;
    while (i < words.length - 1 && NOT_A_NAME.has(words[i].toLowerCase())) i += 1;
    const phrase = `${words.slice(i).join(' ')} API`;
    if (!out.includes(phrase)) out.push(phrase);
  }
  return out;
}

/** The note added to a story's task guidance. Stable text, so a re-run can see it is already there. */
export function unnamedApiNote(phrases: string[]): string {
  const list = phrases.map((p) => `"${p}"`).join(', ');
  return `Ask before building: ${list} ${phrases.length === 1 ? 'is' : 'are'} not among the tools this project names. Check with the project owner whether to use ${phrases.length === 1 ? 'it' : 'them'} or where that data already lives.`;
}

export function markUnnamedApis(stories: readonly PlanStory[], requirements: readonly PlanRequirement[]): PlanStory[] {
  const constraints = requirements.filter((r) => r.kind === 'CONSTRAINT');
  if (!constraints.length) return [...stories];
  const named = new Set(constraints.flatMap((r) => r.statement.split(/[^\w'’-]+/)).filter(Boolean).map(key));
  return stories.map((s) => {
    const text = [s.title, s.narrative, ...(s.acceptance ?? []), ...(s.failure_paths ?? []), s.task_guidance ?? ''].join('\n');
    const phrases = unnamedApis(text, named);
    if (!phrases.length) return s;
    const note = unnamedApiNote(phrases);
    const guidance = s.task_guidance ?? '';
    if (guidance.includes(note)) return s;
    return { ...s, task_guidance: guidance ? `${guidance} ${note}` : note };
  });
}
