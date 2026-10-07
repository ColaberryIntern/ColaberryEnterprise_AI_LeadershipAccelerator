/**
 * Does every number in a generated deck come from something the student actually said?
 *
 * WHY THIS EXISTS. The assembled prompt is built from the project tree: titles,
 * statuses, an organisation name. It contains NO figures. So a percentage, a dollar
 * amount or a "3x faster" in the generated deck did not come from the student — the
 * model produced it to fill a slide that asked for a metric. A learner then presents
 * an invented number to an employer, having never typed it.
 *
 * The repo already holds this line for marketing copy: every on-screen claim must
 * trace to a verifiable source, and a stat that cannot be verified is OMITTED rather
 * than softened. This is the same rule applied to a student's deck.
 *
 * FLAGGED, NOT SILENTLY DELETED. The deck is still shown. Removing numbers from
 * someone's slides without telling them is its own kind of lying, and a figure the
 * student knows to be true but never typed here is a real case. They are told which
 * figures are unsupported and asked to confirm or cut them.
 *
 * WHAT IS DELIBERATELY NOT A CLAIM. A guard that flags everything is a guard nobody
 * reads. Slide numbers, agenda timings, years, ordinals and anything inside markup
 * are excluded, because none of them is a claim about the student's system.
 *
 * Pure. No database, no network — so the rule is testable in one place and the same
 * function can run before a deck is stored and again before it is shown.
 */

/** A number the deck asserts about the work. */
export interface MetricClaim {
  /** As it appears in the deck, e.g. "42%", "$1,200", "3x". */
  text: string;
  /** Digits only, for comparison: "42", "1200", "3". */
  normalized: string;
  /** Enough surrounding words for a human to judge it. */
  context: string;
}

/** Markup is not prose: `width="640"` and `#3366ff` are not claims. */
function visibleText(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // Tags, attributes and all — everything between < and > goes.
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Digits of a figure, so "$1,200" and "1200" compare equal. */
export function normalizeNumber(raw: string): string {
  const digits = raw.replace(/[^0-9.]/g, '').replace(/\.0+$/, '');
  return digits.replace(/^0+(?=\d)/, '');
}

/**
 * Figures that assert something: percentages, money, multipliers, and bare numbers
 * carrying a unit or a scale word.
 *
 * A bare integer on its own is NOT matched. "Slide 3", "Q4", "2026" and "step 2" are
 * numbers in a deck that claim nothing, and flagging them trains the reader to ignore
 * the whole panel.
 */
const CLAIM_PATTERNS: RegExp[] = [
  /\b\d[\d,]*(?:\.\d+)?\s?%/g,                                   // 42%, 3.5 %
  /(?:\$|USD\s?|£|€)\s?\d[\d,]*(?:\.\d+)?\s?(?:k|m|bn|billion|million|thousand)?\b/gi,
  /\b\d[\d,]*(?:\.\d+)?\s?x\b/gi,                                // 3x, 2.5x
  /\b\d[\d,]*(?:\.\d+)?\s?(?:hours?|hrs?|minutes?|mins?|days?|weeks?|months?|years?)\b(?!\s*(?:ago|old))/gi,
  /\b\d[\d,]*(?:\.\d+)?\s?(?:users?|customers?|orders?|requests?|tickets?|records?|rows?|calls?|deliveries|shipments?)\b/gi,
  /\b\d[\d,]*(?:\.\d+)?\s?(?:million|billion|thousand|k\b)/gi,
];

/**
 * There is deliberately NO year exclusion here.
 *
 * A bare "2019" is already not a claim, because no pattern above matches a bare
 * integer - it needs a %, a currency, an x, or a unit. So a year filter could only
 * ever fire on a year WITH a unit, and "2026 users" is exactly the kind of figure
 * this guard exists to catch. An earlier version had one; it was dead for the case it
 * was written for and harmful for the case it actually hit. Found by a mutation that
 * removed it and broke no test.
 */

/** Words that make a nearby number a position rather than a measurement. */
const STRUCTURAL_CONTEXT = /\b(?:slide|step|section|page|part|chapter|q[1-4]|agenda|minute mark)\b/i;

function contextAround(text: string, index: number, length: number): string {
  const from = Math.max(0, index - 60);
  const to = Math.min(text.length, index + length + 60);
  return text.slice(from, to).trim();
}

/**
 * Every figure the deck asserts, de-duplicated by the number itself.
 *
 * Exported so the same extraction can be shown to a student and asserted in a test —
 * a guard whose extraction nobody can see is a guard nobody can check.
 */
export function extractMetricClaims(html: string): MetricClaim[] {
  const text = visibleText(html);
  const found = new Map<string, MetricClaim>();

  for (const pattern of CLAIM_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    // eslint-disable-next-line no-cond-assign
    while ((m = pattern.exec(text)) !== null) {
      const raw = m[0].trim();
      const normalized = normalizeNumber(raw);
      if (!normalized) continue;
      const context = contextAround(text, m.index, raw.length);
      if (STRUCTURAL_CONTEXT.test(context.slice(0, 70))) continue;
      if (!found.has(normalized)) found.set(normalized, { text: raw, normalized, context });
    }
  }
  return [...found.values()];
}

/**
 * Is this figure present in anything the student supplied?
 *
 * Compared on the NUMBER, not the formatting: a student who wrote "1,200 deliveries"
 * supports a deck that says "$1200" badly, but they did supply the figure, and
 * flagging it would be a false positive on a guard that only works if it is trusted.
 * Unit mismatches are a review problem, not a fabrication problem.
 */
export function isSupported(claim: MetricClaim, sources: string[]): boolean {
  const target = claim.normalized;
  if (!target) return false;
  for (const s of sources) {
    if (!s) continue;
    const text = visibleText(s);
    const numbers = text.match(/\d[\d,]*(?:\.\d+)?/g) || [];
    if (numbers.some((n) => normalizeNumber(n) === target)) return true;
  }
  return false;
}

export interface GroundingReport {
  /** Every figure the deck asserts. */
  claims: MetricClaim[];
  /** The ones that appear in nothing the student supplied. */
  unsupported: MetricClaim[];
  /** True when there is nothing to answer for. */
  clean: boolean;
}

/**
 * Check a generated deck against everything the student actually wrote.
 *
 * `sources` is their own material — the narrative, the project description, task
 * titles, submitted evidence. NOT the prompt's instructions: the template text itself
 * contains example figures, and grounding a deck against the example that asked for a
 * number would make every fabrication look supported.
 */
export function checkGrounding(html: string, sources: string[]): GroundingReport {
  const claims = extractMetricClaims(html || '');
  const unsupported = claims.filter((c) => !isSupported(c, sources));
  return { claims, unsupported, clean: unsupported.length === 0 };
}

/** What a student is told, in words, about one unsupported figure. */
export function describeUnsupported(claim: MetricClaim): string {
  return `“${claim.text}” does not appear in anything you wrote. Confirm it from your own data or take it out before you present.`;
}
