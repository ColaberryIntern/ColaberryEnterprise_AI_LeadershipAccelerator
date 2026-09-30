/**
 * Explorer send-time fact guard — the third enforcement point of the April-14
 * rule (plan §11.4). EPIC 5.
 *
 * THE OTHER TWO CANNOT CATCH THIS ONE. The copy lint reads seeded definition
 * files, and the system prompt is an instruction to a generator. Neither
 * constrains what the model actually writes at runtime. This does: it reads the
 * GENERATED text and rejects any date, price or seat count that is not among
 * the facts resolved for this learner.
 *
 * The distinction that makes it work: a date is not banned, an UNGROUNDED date
 * is. If the Explorer context resolved the cohort start as "November 3" then
 * the model may say "November 3". If it says "November 10", nothing resolved
 * that, and it was invented — which is exactly the failure mode a fluent
 * generator produces most confidently.
 *
 * PURE, AND FAILS CLOSED ON AN EMPTY FACT SET. If no facts were resolved, every
 * date and price in the copy is ungrounded by definition, so all of them are
 * rejected. That is the correct reading: "we resolved nothing" must never be
 * treated as "anything goes". It is the same fail-closed posture the
 * contactability service takes, and the opposite of the mistake made in
 * `resolveContentPageAccess`, which fails OPEN and once marked all 153
 * Explorers CONVERTED.
 */

/**
 * The facts that were actually resolved for this learner, normalised to the
 * strings a message might plausibly contain.
 *
 * Strings rather than typed values on purpose: the guard compares against what
 * the model WROTE, and a cohort starting on 2026-11-03 can legitimately be
 * written "November 3", "Nov 3" or "3 November". The resolver is responsible
 * for supplying every surface form it considers acceptable; the guard does not
 * invent formats, because guessing which renderings are equivalent is how a
 * guard starts approving things nobody sanctioned.
 */
export interface ExplorerFactSet {
  /** Every acceptable rendering of every resolved date. */
  dates: readonly string[];
  /** Every acceptable rendering of every resolved price. */
  prices: readonly string[];
  /** Every acceptable rendering of any resolved seat count. */
  seats: readonly string[];
}

export const EMPTY_FACT_SET: ExplorerFactSet = { dates: [], prices: [], seats: [] };

/** What the guard found and could not ground. */
export interface UngroundedFact {
  kind: 'date' | 'price' | 'seat count';
  /** The exact text as it appeared in the generated message. */
  text: string;
}

const DATE = /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?\b|\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/gi;

const PRICE = /\$\s?\d[\d,]*(?:\.\d{2})?|\b\d[\d,]*\s?(?:dollars|usd)\b/gi;

const SEATS = /\b\d+\s+(?:seats?|spots?|places?)\b/gi;

/**
 * Compare loosely enough to survive formatting, strictly enough to stay a guard.
 *
 * Case and internal whitespace are normalised, and an ordinal suffix is dropped
 * so "November 3rd" matches a resolved "November 3". Nothing else is
 * normalised — in particular no attempt is made to parse and re-compare dates,
 * because a guard that reasons about equivalence is a guard that can be argued
 * into approving something.
 */
function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/(\d+)(?:st|nd|rd|th)\b/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function isGrounded(found: string, allowed: readonly string[]): boolean {
  const needle = normalise(found);
  return allowed.some((a) => normalise(a) === needle);
}

function scan(
  content: string,
  pattern: RegExp,
  kind: UngroundedFact['kind'],
  allowed: readonly string[],
): UngroundedFact[] {
  const out: UngroundedFact[] = [];
  const seen = new Set<string>();
  // A fresh regex per scan: these are /g, and a shared lastIndex across calls
  // makes results depend on call order — the kind of bug that shows up as an
  // intermittently passing guard.
  const re = new RegExp(pattern.source, pattern.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const text = m[0].trim();
    const key = normalise(text);
    if (seen.has(key)) continue;
    seen.add(key);
    if (!isGrounded(text, allowed)) out.push({ kind, text });
  }
  return out;
}

/**
 * Every date, price or seat count in `content` that the resolved facts do not
 * support. Empty means the copy is grounded.
 */
export function findUngroundedFacts(
  content: string,
  facts: ExplorerFactSet = EMPTY_FACT_SET,
): UngroundedFact[] {
  return [
    ...scan(content, DATE, 'date', facts.dates),
    ...scan(content, PRICE, 'price', facts.prices),
    ...scan(content, SEATS, 'seat count', facts.seats),
  ];
}

/**
 * Validator-shaped wrapper: human-readable issue strings.
 *
 * Each names the offending text, because "message contains an ungrounded date"
 * sends whoever is debugging back to diff the copy against the context by hand.
 */
export function explorerFactIssues(content: string, facts?: ExplorerFactSet): string[] {
  return findUngroundedFacts(content, facts).map(
    (f) =>
      `Explorer copy states a ${f.kind} not present in the resolved context: "${f.text}" ` +
      `(plan §11.4 — it must come from a resolved fact, or not be stated)`,
  );
}
