/**
 * Career Prep v27 (CP3.4): what the student asked for, decided BEFORE any model call (kit P4.8).
 * Plan or suggest -> plan cards; work on / weak / improve -> the weakest skills; 10 minutes / quick ->
 * a short session; add an interview -> the add form; dashboard / progress -> Your progress; the
 * getting-hired words -> their sheet. Anything else goes to Cora (POST /cora). Order matters: "add an
 * interview" is an add, not "my interviews".
 */
export type Sheet = 'interviews' | 'inbox' | 'offers' | 'applications' | 'resume';
export type Intent =
  | { kind: 'plan' } | { kind: 'weak' } | { kind: 'quick' } | { kind: 'add' } | { kind: 'progress' }
  | { kind: 'sheet'; sheet: Sheet } | { kind: 'free'; text: string };

const RULES: ReadonlyArray<[RegExp, (t: string) => Intent]> = [
  [/\badd\b[^.?!]*\binterview\b/i, () => ({ kind: 'add' })],
  [/\b(suggest|plan)\b/i, () => ({ kind: 'plan' })],
  [/\b(10|ten)\s*min|\bquick\b/i, () => ({ kind: 'quick' })],
  [/\b(work on|weak|weakest|improve)\b/i, () => ({ kind: 'weak' })],
  [/\b(dashboard|progress)\b/i, () => ({ kind: 'progress' })],
  [/\boffers?\b/i, () => ({ kind: 'sheet', sheet: 'offers' })],
  [/\binbox\b/i, () => ({ kind: 'sheet', sheet: 'inbox' })],
  [/\bapplications?\b/i, () => ({ kind: 'sheet', sheet: 'applications' })],
  // No trailing \b: in JavaScript \b is ASCII-only, so it never matches after "é".
  [/\br[eé]sum[eé](?![a-z])/i, () => ({ kind: 'sheet', sheet: 'resume' })],
  [/\b(my|show|see)\b[^.?!]*\binterviews\b/i, () => ({ kind: 'sheet', sheet: 'interviews' })],
];

export function routeAsk(text: string): Intent {
  const t = text.trim();
  for (const [re, make] of RULES) if (re.test(t)) return make(t);
  return { kind: 'free', text: t };
}
