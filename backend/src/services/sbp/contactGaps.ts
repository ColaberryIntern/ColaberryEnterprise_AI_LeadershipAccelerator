/**
 * contactGaps — an approval rule for contacting someone, with no step that contacts them.
 *
 * ## Why
 *
 * The ShiftFill scope ranks hygienists, then says "Then our two temp agencies." Four
 * words, continuing the ranking list. Extraction and the completeness audit dropped
 * that step in v7, v9 and v12 and kept it in v6, v8, v10 and v11, even after the
 * checklist named fallbacks explicitly (2026-11-23). Every dropped run kept the
 * approval rule ("Dana must approve any message sent to a temp agency"), so the plan
 * guarded a message nothing in it ever sends.
 *
 * That shape is checkable in code even though the dropped sentence is not: a SAFE
 * requirement that gates a message to some party, and no other requirement that
 * mentions the party at all. `uncontactedParties` finds it; `contactGapFocus` is the
 * one extra instruction the audit then gets, naming the party. The audit's normal
 * rules still apply, so anything it adds quotes the student's own words, checked in
 * code. If the source never says to contact the party, the audit adds nothing and
 * the plan is left as it was.
 *
 * PURE. No I/O.
 */
import type { PlanRequirement } from './planContract';

export interface ContactGap {
  /** The SAFE requirement that gates contacting the party. */
  guard: string;
  /** The party, as the guard names it ("temp agency"). */
  party: string;
}

/**
 * "message(s) / text(s) / email(s) / offer(s) [sent] to [a|an|the|any] <party>", the
 * party running to the next clause. Every guard ShiftFill v8-v12 wrote has this shape.
 */
const GATED = /\b(?:messages?|texts?|emails?|offers?|requests?)\s+(?:sent\s+)?to\s+(?:a|an|the|any|our)?\s*([a-z][a-z' -]{2,40}?)(?=\s+(?:before|for|without|unless|until|by|and)\b|[.,;:]|$)/i;

/** "agencies" and "agency" are one word here; so are "texts" and "text". */
function stem(w: string): string {
  return w.toLowerCase().replace(/ies$/, 'y').replace(/(?<=[^s])s$/, '');
}

const FILLER = new Set(['a', 'an', 'the', 'any', 'our', 'two', 'their', 'its', 'of']);

function partyWords(party: string): string[] {
  return party.split(/\s+/).filter((w) => w && !FILLER.has(w.toLowerCase())).map(stem);
}

/** Does `statement` mention every word of the party, in any order? */
function mentions(statement: string, words: string[]): boolean {
  const have = new Set(statement.split(/[^A-Za-z']+/).filter(Boolean).map(stem));
  return words.every((w) => have.has(w));
}

/** Guards on contacting a party that no other requirement mentions. One entry per party. */
export function uncontactedParties(requirements: readonly PlanRequirement[]): ContactGap[] {
  const out: ContactGap[] = [];
  for (const g of requirements.filter((r) => r.kind === 'SAFE')) {
    const m = GATED.exec(g.statement);
    if (!m) continue;
    const party = m[1].trim().toLowerCase();
    const words = partyWords(party);
    if (!words.length || out.some((o) => partyWords(o.party).join(' ') === words.join(' '))) continue;
    const contacted = requirements.some((r) => r !== g && r.kind !== 'SAFE' && r.kind !== 'CONSTRAINT' && mentions(r.statement, words));
    if (!contacted) out.push({ guard: g.id, party });
  }
  return out;
}

/** The extra audit instruction for the gaps found. Empty when there are none. */
export function contactGapFocus(gaps: readonly ContactGap[]): string {
  if (!gaps.length) return '';
  return [
    'FOCUS FOR THIS ROUND. These requirements guard contacting someone, and no requirement ever',
    'contacts them. Read the source for the step that does: who it contacts, when, and in what order',
    '(often a short sentence after a list, such as "Then our two temp agencies."). If the source has',
    'it, report it as a missing FUNC requirement with its exact words. If it does not, report nothing.',
    ...gaps.map((g) => `- ${g.guard} guards contacting "${g.party}".`),
  ].join('\n');
}
