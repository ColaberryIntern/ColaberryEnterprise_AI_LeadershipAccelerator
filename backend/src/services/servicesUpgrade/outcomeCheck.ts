/**
 * SV0.2 - outcome extraction and the verbatim guard. Every number that reaches the catalog (and later the Gov AI
 * prompt and proposals) must appear, character for character, in the source whitepaper. This is the rule that stops
 * a "20-40% reduction" drifting into "40% reduction" somewhere between extraction and a proposal.
 */
const NUMBER_RE = /\$?\d[\d,]*(?:\.\d+)?(?:\s?(?:-|–|to)\s?\$?\d[\d,]*(?:\.\d+)?)?\s?(?:%|percent\b|x\b|×|million\b|billion\b|M\b|K\b)?/g;

/** Numbers worth citing: percentages, money, multipliers, or ranges. Bare years and list counters are ignored. */
export function extractNumbers(sentence: string): string[] {
  const out: string[] = [];
  for (const m of sentence.match(NUMBER_RE) || []) {
    const v = m.trim();
    const meaningful = /%|percent|\$|x$|×|million|billion|M$|K$/.test(v) || /\d\s?(-|–|to)\s?\d/.test(v);
    if (!meaningful) continue;
    if (/^(19|20)\d\d$/.test(v)) continue;
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

export const normalizeSpace = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Split into sentences on terminal punctuation; keeps it simple and deterministic. */
export function sentences(text: string): string[] {
  return normalizeSpace(text).split(/(?<=[.!?])\s+(?=[A-Z$0-9"])/).map((s) => s.trim()).filter((s) => s.length > 0);
}

/** Outcome sentences = sentences carrying at least one meaningful number. */
export function extractOutcomeSentences(text: string): { text: string; numbers: string[] }[] {
  return sentences(text)
    .map((s) => ({ text: s.slice(0, 400), numbers: extractNumbers(s) }))
    .filter((o) => o.numbers.length > 0);
}

/** Returns the numbers that do NOT appear verbatim (whitespace-normalized) in the source text. Empty = verified. */
export function verifyOutcomesVerbatim(outcomes: { numbers: string[] }[], sourceText: string): string[] {
  const hay = normalizeSpace(sourceText);
  const missing: string[] = [];
  for (const o of outcomes) for (const n of o.numbers) if (!hay.includes(normalizeSpace(n))) missing.push(n);
  return missing;
}
