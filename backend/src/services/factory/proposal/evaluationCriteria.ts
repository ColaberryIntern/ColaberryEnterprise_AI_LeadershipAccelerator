/**
 * evaluationCriteria — DETERMINISTIC detection of HOW a solicitation is scored: the basis of award, the weighted
 * evaluation factors (points or percent), and the total points available. A proposal is a points game — most
 * government RFPs score, e.g., 80 points for quality and 20 for price — and an intern who cannot see that weighting
 * spends equal effort everywhere. Surfacing it tells them where the points are, so effort goes where it pays.
 *
 * PURE + TOTAL + ADVISORY: no LLM, no I/O, never throws; garbage in -> null. It INFORMS, it never gates anything.
 * Every piece cites the literal solicitation snippet that produced it (a `quote` / `basisQuote`), never a
 * paraphrase — the same never-fabricate rail the extractor holds. Precise over broad: factor extraction is gated
 * on the text actually having an evaluation section, so a flag means something.
 */

export type AwardBasis = 'lpta' | 'trade_off' | 'best_value' | 'qualifications' | 'low_price';

export interface EvaluationFactor {
  /** The factor name as it appears (e.g. "Technical Approach", "Price"). */
  label: string;
  /** Point value, when the factor is scored in points. */
  points?: number;
  /** Percent weight, when the factor is weighted as a percentage. */
  percent?: number;
  /** The literal snippet that produced this factor — verifiable against the source. */
  quote: string;
}

export interface EvaluationCriteria {
  /** How the award is made, when stated; null if no basis phrase was found. */
  basis: AwardBasis | null;
  /** The literal snippet that named the basis; null when basis is null. */
  basisQuote: string | null;
  /** Total/maximum points available, when stated. */
  totalPoints: number | null;
  /** Weighted evaluation factors, in document order. May be empty. */
  factors: EvaluationFactor[];
}

// Most specific first: "lowest price technically acceptable" must beat the bare "lowest price" (low_price), and an
// explicit trade-off/best-value method beats a generic lowest-price award.
const BASIS_PATTERNS: ReadonlyArray<readonly [AwardBasis, RegExp]> = [
  ['lpta', /\blowest[-\s]price[,\s]+technically\s+acceptable\b|\bLPTA\b/i],
  ['trade_off', /\btrade[-\s]?off\b/i],
  ['best_value', /\bbest[-\s]value\b/i],
  ['qualifications', /\bqualifications[-\s]based\s+(?:selection|evaluation)\b|\bQBS\b/i],
  ['low_price', /\baward(?:ed)?\s+to\s+the\s+lowest\s+(?:responsive\s+(?:and\s+responsible\s+)?)?(?:bidder|price|cost|bid)\b|\blowest\s+responsible\s+(?:and\s+responsive\s+)?(?:bid|bidder)\b|\blowest\s+(?:total\s+)?(?:price|cost)\s+(?:will|shall)\s+be\s+awarded\b/i],
];

// Total/maximum points available. Two shapes: "maximum of 100 points" and "100 points total/possible/available".
const TOTAL_POINTS_RE =
  /\b(?:a\s+)?(?:maximum|total|up\s+to|out\s+of|possible)\s+(?:of\s+)?(\d{2,4})\s+points\b|\b(\d{2,4})\s+(?:total\s+|possible\s+|available\s+)?points\s+(?:total|maximum|possible|available)\b/i;

// A text has a real evaluation section (so factor numbers are weights, not stray figures) when it names one.
const EVAL_SECTION_RE =
  /\b(?:evaluation\s+(?:criteria|factors?|methodology)|basis\s+of\s+award|scoring|points\s+(?:available|possible|will\s+be)|weight(?:ed|ing)|award\s+will\s+be\s+(?:made|based)|proposals?\s+will\s+be\s+(?:evaluated|scored))\b/i;

// A factor line: a Title-ish label, then a separator (punctuation, an open paren, or a table gap of 2+ spaces),
// then a number with a weight unit (points / pts / % / percent). The unit set deliberately EXCLUDES "days",
// "years", "$", so a deadline or a dollar figure is never read as a factor weight.
// The trailing (?![A-Za-z]) — not \b — ends the unit: a word boundary fails after "%" when a ")" follows it
// (two non-word chars), which would drop "Price (30%)". The lookahead still blocks a unit inside a longer word.
const FACTOR_RE =
  /([A-Za-z][A-Za-z0-9 /&,'’()-]{2,48}?)\s*(?:[:.\-–—]{1,}|\(|\s{2,})\s*(\d{1,3})\s*(%|points?|pts?|percent)(?![A-Za-z])/gi;

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

function detectBasis(text: string): { basis: AwardBasis; quote: string } | null {
  for (const [basis, re] of BASIS_PATTERNS) {
    const m = re.exec(text);
    if (m) return { basis, quote: snippetAround(text, m.index, m[0].length) };
  }
  return null;
}

function detectTotalPoints(text: string): number | null {
  const m = TOTAL_POINTS_RE.exec(text);
  if (!m) return null;
  const n = Number.parseInt(m[1] ?? m[2], 10);
  return Number.isFinite(n) ? n : null;
}

function detectFactors(text: string): EvaluationFactor[] {
  if (!EVAL_SECTION_RE.test(text)) return []; // only trust factor numbers inside a real evaluation section
  const out: EvaluationFactor[] = [];
  const seen = new Set<string>();
  const re = new RegExp(FACTOR_RE.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null && out.length < 12) {
    const label = m[1].replace(/\s+/g, ' ').replace(/[\s(.-]+$/, '').trim();
    const value = Number.parseInt(m[2], 10);
    const isPercent = /^(?:%|percent)$/i.test(m[3]);
    if (label.length < 3 || !/[A-Za-z]/.test(label) || !Number.isFinite(value)) continue;
    if (isPercent && (value < 1 || value > 100)) continue;
    if (!isPercent && (value < 1 || value > 1000)) continue;
    const key = `${label.toLowerCase()}|${isPercent ? 'p' : 'n'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      label,
      ...(isPercent ? { percent: value } : { points: value }),
      quote: snippetAround(text, m.index, m[0].length),
    });
  }
  return out;
}

/**
 * Detect the scoring structure of a solicitation. Returns null only when NOTHING was found (no basis, no total,
 * no factors) — so a non-scored or unreadable document yields null rather than an empty shell. Total: a
 * non-string / empty input yields null.
 */
export function detectEvaluationCriteria(text?: string | null): EvaluationCriteria | null {
  if (typeof text !== 'string' || text.length === 0) return null;
  const basis = detectBasis(text);
  const totalPoints = detectTotalPoints(text);
  const factors = detectFactors(text);
  if (!basis && totalPoints === null && factors.length === 0) return null;
  return {
    basis: basis?.basis ?? null,
    basisQuote: basis?.quote ?? null,
    totalPoints,
    factors,
  };
}
