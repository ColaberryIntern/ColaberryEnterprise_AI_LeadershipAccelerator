/**
 * rfpComplianceRules — DETERMINISTIC detection of three SUBMISSION-MECHANICS obligations that a solicitation can
 * impose and that an intern will not find on the response checklist, because they are stated in the solicitation
 * BODY, not as an answerable requirement:
 *
 *   - separate_cost_file : price/cost must be submitted as a physically separate (often sealed) volume/file.
 *   - redacted_copy      : a redacted (public-records) copy of the proposal must accompany the submission.
 *   - validity_period    : the offer must remain valid/firm for a stated number of days.
 *
 * Missing any of these makes a bid non-responsive just as surely as a missed requirement, so surfacing them turns
 * the checklist from "what to write" into "what will get you thrown out". This complements eliminationRisk.ts
 * (which flags a REQUIREMENT whose own text says missing it rejects the bid) and the T3b pricing-leak check.
 *
 * PURE + TOTAL + ADVISORY: no LLM, no I/O, never throws; garbage in -> []. It FLAGS, it never gates export. Every
 * finding carries the literal solicitation snippet that triggered it (a `quote`), never a paraphrase, so the flag
 * is verifiable against the source — the same never-fabricate rail the extractor holds.
 */

export type RfpComplianceKind = 'separate_cost_file' | 'redacted_copy' | 'validity_period';

export interface RfpComplianceFinding {
  kind: RfpComplianceKind;
  /** The literal solicitation snippet that triggered the rule — verifiable against the source, never paraphrased. */
  quote: string;
  /** validity_period only: the number of days the offer must remain valid, when a count is stated. */
  days?: number;
}

// Price/cost must travel in its own volume/envelope/file. Two shapes: "separate[ly sealed] cost volume", and a
// cost/price noun within a short span of a "separate / under separate cover / sealed separately" cue.
const SEPARATE_COST_RE =
  /\bseparate(?:ly)?\s+(?:sealed\s+)?(?:cost|price|pricing|fee|financial)\s+(?:volume|envelope|file|proposal|submission|attachment|document|sheet|schedule|package|binder|section)\b|\b(?:cost|price|pricing|fee|financial)\s+(?:proposal|volume|information|sheet|schedule|data|submission)\b[^.]{0,70}\b(?:under\s+separate\s+cover|separate(?:ly)?\s+(?:sealed|from|envelope|file|volume|package)|sealed\s+separately|its\s+own\s+(?:envelope|file|volume|binder))\b|\b(?:submit(?:ted)?|provide[d]?|place[d]?|enclose[d]?)\b[^.]{0,45}\b(?:cost|price|pricing|fee)\b[^.]{0,45}\b(?:under\s+separate\s+cover|separate(?:ly)?\s+(?:sealed|envelope|file|volume)|sealed\s+separately)\b/i;

// A redacted / public-records copy. "redact*" in a solicitation is near-always this obligation; require a nearby
// copy/version/submit/public cue so a stray mention is not flagged.
const REDACTED_RE =
  /\bredact\w*\b[^.]{0,60}\b(?:copy|copies|version|proposal|submission|document|public|release|record)\b|\b(?:copy|copies|version|proposal|submission|public|release|record)\b[^.]{0,60}\bredact\w*/i;

// Offer validity: a "remain valid/firm" (or acceptance-period / irrevocable / good-for) cue AND a day count in the
// same window. Requiring BOTH keeps a bare "30 days" (which is usually a deadline, not a validity period) out.
const VALIDITY_CUE_RE =
  /\b(?:remain(?:ing)?\s+(?:valid|firm|in\s+effect|open|binding)|valid(?:ity)?\s+(?:for|period|of)|firm\s+for|held?\s+firm|hold(?:ing)?\s+(?:its|their|the|all)?\s*(?:price|offer|proposal|bid|quote)|(?:offer|bid|proposal|price)\s+acceptance\s+period|acceptance\s+period|irrevocable|good\s+for|open\s+for\s+acceptance)\b/i;
const DAYS_RE = /\b(\d{1,3})\s+(?:calendar|business|working)?\s*days\b/i;

/** First match of `re` in `text`, or null. */
function firstMatch(text: string, re: RegExp): { index: number; length: number } | null {
  const m = re.exec(text);
  return m ? { index: m.index, length: m[0].length } : null;
}

/** A clean, bounded, literal snippet of `text` around [idx, idx+len): expanded to the nearest sentence-ish
 *  boundaries (`. `, `; `, newline), whitespace-collapsed, leading punctuation stripped, capped at 240 chars. */
function snippetAround(text: string, idx: number, len: number): string {
  const before = text.slice(0, idx);
  const startBoundary = Math.max(before.lastIndexOf('. '), before.lastIndexOf('; '), before.lastIndexOf('\n'));
  const start = startBoundary >= 0 ? startBoundary + 1 : 0;
  const after = text.slice(idx + len);
  const ends = [after.indexOf('\n'), after.indexOf('. '), after.indexOf('; ')].filter((n) => n >= 0);
  const end = idx + len + (ends.length ? Math.min(...ends) + 1 : after.length);
  const raw = text.slice(start, end).replace(/\s+/g, ' ').replace(/^[.;:\s]+/, '').trim();
  return raw.length > 240 ? `${raw.slice(0, 237)}...` : raw;
}

/** The validity-period finding: the first day-count whose surrounding snippet also carries a validity cue. */
function detectValidity(text: string): RfpComplianceFinding | null {
  const re = new RegExp(DAYS_RE.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const snippet = snippetAround(text, m.index, m[0].length);
    if (VALIDITY_CUE_RE.test(snippet)) {
      const days = Number.parseInt(m[1], 10);
      return { kind: 'validity_period', quote: snippet, ...(Number.isFinite(days) ? { days } : {}) };
    }
  }
  return null;
}

/**
 * Detect the three submission-mechanics obligations in the solicitation text. Returns at most one finding per kind
 * (these are presence flags), in a stable order. Total: a non-string / empty input yields [].
 */
export function detectRfpComplianceRules(text?: string | null): RfpComplianceFinding[] {
  if (typeof text !== 'string' || text.length === 0) return [];
  const findings: RfpComplianceFinding[] = [];

  const cost = firstMatch(text, SEPARATE_COST_RE);
  if (cost) findings.push({ kind: 'separate_cost_file', quote: snippetAround(text, cost.index, cost.length) });

  const redacted = firstMatch(text, REDACTED_RE);
  if (redacted) findings.push({ kind: 'redacted_copy', quote: snippetAround(text, redacted.index, redacted.length) });

  const validity = detectValidity(text);
  if (validity) findings.push(validity);

  return findings;
}
