/**
 * eliminationRisk — a DETERMINISTIC flag on a proposal requirement whose own text says that missing it REJECTS the
 * bid (non-responsive / disqualified / material failure / pass-fail). It turns the submittal checklist from "what
 * to answer" into "what you CANNOT miss", which is the difference between a list an intern can work and a list that
 * quietly loses the bid.
 *
 * PURE + TOTAL: no LLM, never throws; garbage in -> false. Advisory: it FLAGS, it never gates export. Deliberately
 * precise over broad (it keys on the rejection CONSEQUENCE, not every "mandatory"), so a flag means something.
 */

// Keyed on the rejection consequence, word-boundary anchored. `disqualif\w*` / `qualif\w*` use \w* (not a trailing
// \b stem) so they match the inflected forms — "disqualify"/"disqualified" — not just the bare stem.
const ELIMINATION_RE = /\b(?:shall|will|must|may)\s+be\s+rejected\b|\bnon[-\s]?responsive\b|\bdisqualif\w*|\bmaterial\s+failure\s+to\s+comply\b|\bgrounds?\s+for\s+(?:rejection|disqualif\w*)\b|\b(?:will|shall)\s+not\s+be\s+considered\b|\bpass[\s/-]?fail\b|\bcause\s+for\s+rejection\b|\bfailure\s+to\s+(?:comply|submit|meet|include)\b[^.]{0,80}\b(?:reject|non[-\s]?responsive|disqualif)/i;

/**
 * True when the requirement's text (or its section heading) carries elimination/rejection language — a "miss this
 * and the bid is rejected" obligation. Total: a non-string / empty input yields false.
 */
export function isEliminationRisk(input: { text?: string | null; section?: string | null }): boolean {
  return ELIMINATION_RE.test(`${input?.section ?? ''}\n${input?.text ?? ''}`);
}
