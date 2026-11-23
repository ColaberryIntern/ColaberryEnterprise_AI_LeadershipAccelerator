/**
 * storyTools — mark any API or outside system a story names that the student never did.
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
 * the student named live). Since v11 it also finds outside systems by name
 * ("Consult the approved leave list from the HR system"; see `SYSTEM`). Each
 * story with any gets ONE note appended to its `task_guidance`, telling the
 * student to ask before using them.
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

/**
 * "<name> system | portal | database | platform". Unlike "API", these nouns
 * usually describe the product itself ("the system", "a notification system",
 * "the system's database": hundreds of uses across ShiftFill v6-v11), so a
 * phrase counts only when its name is unmistakably somebody else's: an acronym
 * ("the HR system", v10 and v11), a capitalised word after a lowercase one
 * ("the Dentrix system"), or "… management" ("the leave management system", v6).
 */
const SYSTEM = /((?:[\w'’-]+[ \t]+){1,3})(?:systems?|portals?|databases?|platforms?)\b/gi;

/** Is this the name of an outside system, by the rule above? */
function namesOutsideSystem(words: string[]): boolean {
  return words.some((w, i) => /^[A-Z]{2,}$/.test(w)
    || (i > 0 && /^[A-Z][a-z]/.test(w) && /^[a-z]/.test(words[i - 1]))
    || w.toLowerCase() === 'management');
}

/** Drop leading words that only introduce the name ("Use Google Maps" → "Google Maps"). */
function nameOnly(words: string[]): string[] {
  let i = 0;
  while (i < words.length - 1 && NOT_A_NAME.has(words[i].toLowerCase())) i += 1;
  return words.slice(i);
}

/**
 * The phrases in `text` that name a tool the requirements do not: every
 * "<name> API" (v10), and the outside systems `SYSTEM` describes (v11).
 */
export function unnamedTools(text: string, namedWords: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const add = (phrase: string): void => { if (!out.includes(phrase)) out.push(phrase); };
  for (const m of text.matchAll(API)) {
    const words = m[1].trim().split(/\s+/);
    const last = words[words.length - 1];
    if (NOT_A_NAME.has(last.toLowerCase()) || namedWords.has(key(last))) continue;
    add(`${nameOnly(words).join(' ')} API`);
  }
  for (const m of text.matchAll(SYSTEM)) {
    // Judge on the words as written ("the Dentrix" has its lowercase lead-in), name on the rest.
    const raw = m[1].trim().split(/\s+/);
    const words = nameOnly(raw);
    if (!namesOutsideSystem(raw) || words.some((w) => namedWords.has(key(w)) && /^[A-Z]/.test(w))) continue;
    add(m[0].trim().split(/\s+/).slice(-(words.length + 1)).join(' '));
  }
  return out;
}

/** The note added to a story's task guidance. Stable text, so a re-run can see it is already there. */
export function unnamedToolNote(phrases: string[]): string {
  const list = phrases.map((p) => `"${p}"`).join(', ');
  return `Ask before building: ${list} ${phrases.length === 1 ? 'is' : 'are'} not among the tools this project names. Check with the project owner whether to use ${phrases.length === 1 ? 'it' : 'them'} or where that data already lives.`;
}

export function markUnnamedTools(stories: readonly PlanStory[], requirements: readonly PlanRequirement[]): PlanStory[] {
  const constraints = requirements.filter((r) => r.kind === 'CONSTRAINT');
  if (!constraints.length) return [...stories];
  const named = new Set(constraints.flatMap((r) => r.statement.split(/[^\w'’-]+/)).filter(Boolean).map(key));
  return stories.map((s) => {
    const text = [s.title, s.narrative, ...(s.acceptance ?? []), ...(s.failure_paths ?? []), s.task_guidance ?? ''].join('\n');
    const phrases = unnamedTools(text, named);
    if (!phrases.length) return s;
    const note = unnamedToolNote(phrases);
    const guidance = s.task_guidance ?? '';
    if (guidance.includes(note)) return s;
    return { ...s, task_guidance: guidance ? `${guidance} ${note}` : note };
  });
}
