/**
 * cardCompletenessGate — decide, STRUCTURALLY, whether a model-generated card is
 * a finished card or a fragment, before anything is persisted.
 *
 * WHY THIS EXISTS
 * `finish_reason` is necessary and not sufficient. Regenerating three truncated
 * cards on 2026-08-19, the model was observed writing `<li>Click on the "` and
 * then derailing into a loop of thousands of whitespace characters. SOMETIMES
 * that burns the token ceiling and reports `finish_reason: "length"`. SOMETIMES
 * it closes the JSON tidily and reports `finish_reason: "stop"` with the prose
 * plainly unfinished — one repair came back clean-stop at 265 tokens still ending
 * mid-sentence at "Go to the ". The three cards that shipped truncated all had
 * PARSEABLE content, which means they were the clean-stop variant: exactly the
 * case a stop-reason gate does not catch.
 *
 * So a card must also be checked SHAPE-WISE before it is treated as finished.
 * The derail is not caused by PII redaction, the instrumented client or the
 * blueprint block — an uninstrumented client on a bare prompt derails identically
 * — so the check belongs at the persist boundary, not in any one prompt.
 *
 * ================= WHAT THIS GATE CANNOT CATCH =================
 * It proves a card is WELL-FORMED. It does not prove the card is GOOD.
 *   - It cannot catch a hallucination. One rejected candidate cited "this week's
 *     Anthropic course" when the Week 4 blueprint states no such course exists.
 *     That is structurally perfect prose. Catching it needs a blueprint-grounded
 *     fact check, which is a different gate; a structural rule that tried would
 *     be a false-positive machine.
 *   - It cannot catch wrong-but-plausible figures, stale dates, or a card that
 *     answers the wrong question.
 *   - It cannot catch prose that is finished but bad — thin, off-tone, or
 *     duplicating another card.
 *   - It cannot catch a mid-sentence stop that happens to land on a content word
 *     and closes all its tags ("...the model returns a score"). The dangling-prose
 *     rule below is deliberately narrow (function words only) because a broad
 *     "no terminal punctuation" rule is known to be wrong here: an audit of all
 *     977 timeline cards found 363 raw hits on that signal of which 360 were
 *     false positives (card footers like "Confidence: High", "View Repository").
 *   - It cannot catch a card that is complete but renders badly in a given band.
 *
 * FALSE-POSITIVE DISCIPLINE
 * Every rule here was chosen to be high-precision on real card bodies:
 *   - Unbalanced HTML flags only UNCLOSED OPENS, never extra closes. In that same
 *     977-card audit, 27 of 29 "unbalanced HTML" hits were an EXTRA closing tag,
 *     not a missing one, so an extra close is recorded for logging and is not a
 *     failure.
 *   - Optional-close elements (<li>, <p>, <td>...) are treated as auto-closed,
 *     because HTML says they are and cards legitimately omit their end tags.
 *   - The "ends mid-markup" rule is just "the trimmed body ends with '>'", which
 *     every well-formed fragment satisfies and every truncation observed so far
 *     violates.
 *
 * CONTRACT
 *   checkCardCompleteness(content, opts) -> { ok, failures, warnings }
 *     Pure. Never throws. `failures` are stable machine-readable codes, safe to
 *     log and to assert on.
 *   assertCardComplete(content, opts) throws a classified Error when !ok.
 */

/** Elements with no end tag. Never pushed onto the balance stack. */
const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr',
]);

/**
 * Elements whose end tag HTML makes optional. A card that writes
 * `<ul><li>one<li>two</ul>` is well-formed, so leaving one of these on the stack
 * is never, on its own, evidence of truncation. Their PARENT (ul/ol/table) is
 * not optional, which is what actually catches `<ol><li>Go to the `.
 */
const OPTIONAL_CLOSE_ELEMENTS = new Set([
  'li', 'p', 'td', 'th', 'tr', 'thead', 'tbody', 'tfoot', 'option', 'optgroup',
  'dt', 'dd', 'colgroup', 'rp', 'rt',
]);

/** Elements whose content is raw text, not markup — skipped wholesale when scanning. */
const RAW_TEXT_ELEMENTS = new Set(['script', 'style', 'textarea', 'title']);

/**
 * A run of this many consecutive whitespace characters is the derail signature,
 * not formatting. The observed loop emitted thousands; no real card body has 80
 * whitespace characters in a row.
 */
const MAX_WHITESPACE_RUN = 80;

/** A body with less visible text than this is a stub, not a lesson. */
const MIN_BODY_TEXT_CHARS = 40;

/**
 * Function words that cannot end a finished sentence. Deliberately restricted to
 * determiners, prepositions, conjunctions and auxiliaries — no nouns, no verbs —
 * so that a real card tail ("Confidence: High", "View Repository", an emoji) can
 * never trip it, while both observed derails do ("Click on the \"", "Go to the ").
 */
const DANGLING_TAIL_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'nor', 'of', 'to', 'in', 'on', 'at',
  'by', 'for', 'with', 'from', 'into', 'onto', 'upon', 'about', 'as', 'than',
  'that', 'this', 'these', 'those', 'your', 'our', 'their', 'its', 'his', 'her',
  'my', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'has', 'have', 'had',
  'will', 'would', 'can', 'could', 'should', 'may', 'might', 'must', 'if',
  'when', 'while', 'because', 'so', 'then', 'each', 'every', 'which', 'who',
]);

/**
 * PER-TYPE required markers — the small, declarative half of the gate.
 *
 * Kept as DATA, not logic, and kept tiny on purpose: a rule earns a place here
 * only when the type's own render contract already requires the marker, so this
 * is not three-card overfitting.
 *
 *  - The ten Intelligence Pipeline types all render a `Source: … Confidence: …`
 *    footer (seeds/intelCardFormats.ts renders it in every one of the ten
 *    formats, and every generation prompt copies that structure verbatim). A
 *    Build Breakdown shipped in August 2026 having dropped every figure AND that
 *    footer, from a card whose whole purpose is traceable numbers. The footer is
 *    the part of that failure that generalises across all ten types; "must
 *    contain a figure" does NOT (a quote-of-the-day card has no figures), so it
 *    is deliberately not encoded.
 *  - prompt_lab bodies are parsed by PromptCatalogRender, which pairs
 *    <h4> title / <p> explanation / <pre> prompt across direct children. A
 *    prompt_lab card with no <pre> has no prompts, which is the entire card.
 */
const INTEL_FOOTER_TYPES = [
  'ai_news_flash', 'ai_research_digest', 'ai_tool_of_the_day', 'ai_video_stream',
  'ai_quote_of_the_day', 'ai_architecture_breakdown', 'build_breakdown',
  'mcp_server_spotlight', 'claude_code_technique', 'market_intelligence',
] as const;

export interface RequiredMarker {
  /** Matched against body_html + summary together. */
  pattern: RegExp;
  /** Human label for the failure message. */
  label: string;
  /** Stable machine code appended to `failures`. */
  code: string;
}

/** The per-type marker table. Exported so a test can pin it against the render contracts. */
export const TYPE_REQUIRED_MARKERS: Readonly<Record<string, RequiredMarker[]>> = {
  ...Object.fromEntries(INTEL_FOOTER_TYPES.map((slug) => [slug, [
    { pattern: /Source\s*:/i, label: 'a "Source:" attribution', code: 'missing_marker:source' },
    { pattern: /Confidence\s*:/i, label: 'a "Confidence:" rating', code: 'missing_marker:confidence' },
  ]])),
  prompt_lab: [
    { pattern: /<pre[\s>]/i, label: 'at least one <pre> prompt block', code: 'missing_marker:pre' },
  ],
};

export interface CardCompletenessVerdict {
  ok: boolean;
  /** Stable codes, e.g. 'unclosed_tag:ol', 'dangling_prose:the'. Empty when ok. */
  failures: string[];
  /** Non-fatal observations worth logging (e.g. an extra closing tag). */
  warnings: string[];
}

export interface CardCompletenessOptions {
  /** Curriculum type slug — selects the per-type marker checks. */
  type?: string | null;
  /**
   * Whether a missing/blank body_html is a failure. True for every generated
   * card path today; an option so a future type that legitimately renders from
   * `summary` alone can opt out explicitly rather than by weakening the gate.
   */
  requireBodyHtml?: boolean;
}

/** The identifier immediately after "<" or "</", or '' when there is none. */
function readIdentifier(html: string, start: number): string {
  let i = start;
  while (i < html.length && /[a-zA-Z0-9:-]/.test(html[i])) i += 1;
  return html.slice(start, i);
}

/**
 * The index just past this tag's closing ">", honouring quoted attribute values
 * so that `<div title="a > b">` is not cut short. Returns -1 when the tag never
 * closes — i.e. the string was cut off mid-tag.
 */
function endOfTag(html: string, start: number): number {
  let quote: string | null = null;
  for (let i = start; i < html.length; i += 1) {
    const c = html[i];
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '>') return i + 1;
  }
  return -1;
}

interface TagScan {
  /** Required-close elements still open at the end, outermost first. */
  unclosed: string[];
  /** Close tags with no matching open — logged, never fatal. */
  strayCloses: string[];
  /** True when the markup was cut off inside a tag or a comment. */
  cutOffMidTag: boolean;
}

/**
 * Walk the markup once and report what is still open. Comments, doctypes and
 * raw-text elements are skipped wholesale so CSS and example markup cannot
 * confuse the balance.
 */
function scanTags(html: string): TagScan {
  const stack: string[] = [];
  const unclosed: string[] = [];
  const strayCloses: string[] = [];
  let cutOffMidTag = false;

  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) break;

    // Comment: skip to "-->" wholesale. An unterminated comment is a cut-off.
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      if (end === -1) { cutOffMidTag = true; break; }
      i = end + 3;
      continue;
    }

    // Doctype / processing instruction: skip to ">".
    if (html[lt + 1] === '!' || html[lt + 1] === '?') {
      const end = endOfTag(html, lt + 1);
      if (end === -1) { cutOffMidTag = true; break; }
      i = end;
      continue;
    }

    // Closing tag.
    if (html[lt + 1] === '/') {
      const name = readIdentifier(html, lt + 2).toLowerCase();
      const end = endOfTag(html, lt + 2);
      if (end === -1) { cutOffMidTag = true; break; }
      i = end;
      if (!name) continue;

      const at = stack.lastIndexOf(name);
      if (at === -1) {
        // Extra close with nothing open. 27 of 29 "unbalanced HTML" hits in the
        // production audit were exactly this, so it is a warning, not a failure.
        strayCloses.push(name);
        continue;
      }
      // Everything above `at` is implicitly closed. That is legal for the
      // optional-close set and evidence of damage for anything else.
      for (let k = stack.length - 1; k > at; k -= 1) {
        if (!OPTIONAL_CLOSE_ELEMENTS.has(stack[k])) unclosed.push(stack[k]);
      }
      stack.length = at;
      continue;
    }

    const name = readIdentifier(html, lt + 1).toLowerCase();
    if (!name) { i = lt + 1; continue; } // a bare "<" in prose

    const end = endOfTag(html, lt + 1);
    if (end === -1) { cutOffMidTag = true; break; }
    const selfClosing = html[end - 2] === '/';
    i = end;

    if (VOID_ELEMENTS.has(name) || selfClosing) continue;

    if (RAW_TEXT_ELEMENTS.has(name)) {
      const close = html.toLowerCase().indexOf(`</${name}`, i);
      if (close === -1) { unclosed.push(name); break; }
      i = close;
      continue;
    }

    stack.push(name);
  }

  // Anything still open at the end that HTML does not let us omit.
  for (const name of stack) {
    if (!OPTIONAL_CLOSE_ELEMENTS.has(name)) unclosed.push(name);
  }

  return { unclosed, strayCloses, cutOffMidTag };
}

const ENTITIES: Readonly<Record<string, string>> = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&#39;': "'", '&apos;': "'", '&mdash;': '-', '&ndash;': '-', '&hellip;': '...',
};

/** The reader-visible text of a body: raw-text elements and tags removed. */
export function visibleText(html: string): string {
  return html
    .replace(/<(script|style|textarea|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/<[^>]*$/g, ' ') // a trailing, never-closed tag
    .replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The tail-of-prose rules. Narrow by design — see the false-positive note at the
 * top of this file. Returns failure codes, or an empty array.
 */
function checkProseTail(text: string): string[] {
  if (!text) return [];
  const failures: string[] = [];

  // An OPENING quote left dangling: a quote preceded by a space, with nothing
  // after it. `Click on the "` fails; `he said "hello"` does not.
  const last = text[text.length - 1];
  if (/["'“‘]/.test(last) && /\s/.test(text[text.length - 2] || ' ')) {
    failures.push('dangling_open_quote');
    return failures; // the word before an open quote is not the real signal
  }

  const words = text.replace(/["'“”‘’]+$/, '').trim().split(/\s+/);
  const tail = (words[words.length - 1] || '').toLowerCase().replace(/[^a-z]/g, '');
  if (tail && DANGLING_TAIL_WORDS.has(tail)) failures.push(`dangling_prose:${tail}`);

  return failures;
}

/**
 * Is this generated card structurally finished? Pure; never throws.
 *
 * Run this on the parsed content AFTER the stop-reason check and BEFORE any
 * write. A verdict of `ok: false` means: persist nothing.
 */
export function checkCardCompleteness(
  content: unknown,
  opts: CardCompletenessOptions = {},
): CardCompletenessVerdict {
  const failures: string[] = [];
  const warnings: string[] = [];
  const requireBodyHtml = opts.requireBodyHtml !== false;

  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    return { ok: false, failures: ['empty_content'], warnings };
  }

  const c = content as Record<string, unknown>;
  const str = (k: string): string => (typeof c[k] === 'string' ? (c[k] as string) : '');
  const body = str('body_html');
  const summary = str('summary');

  // An object with nothing in it is the classic "JSON.parse threw, the catch
  // turned it into {}, and we saved it anyway" blank card. Reject it first.
  const populated = ['title', 'summary', 'body_html', 'reflection'].some((k) => str(k).trim())
    || (Array.isArray(c.questions) && (c.questions as unknown[]).length > 0);
  if (!populated) return { ok: false, failures: ['empty_content'], warnings };

  if (!body.trim()) {
    if (requireBodyHtml) failures.push('missing_body_html');
    return { ok: failures.length === 0, failures, warnings };
  }

  // The derail signature: a loop of whitespace where prose should be.
  if (new RegExp(`[\\s\\u00a0]{${MAX_WHITESPACE_RUN},}`).test(body)) {
    failures.push('whitespace_derail');
  }

  const scan = scanTags(body);
  if (scan.cutOffMidTag) failures.push('cut_off_mid_tag');
  for (const name of new Set(scan.unclosed)) failures.push(`unclosed_tag:${name}`);
  for (const name of new Set(scan.strayCloses)) warnings.push(`stray_close_tag:${name}`);

  // A finished fragment ends on markup. Every truncation observed so far ends on
  // prose (`<li>Click on the "`, `<ol><li>Go to the `).
  if (!body.trimEnd().endsWith('>')) failures.push('ends_mid_markup');

  const text = visibleText(body);
  if (text.length < MIN_BODY_TEXT_CHARS) failures.push('body_text_too_short');
  failures.push(...checkProseTail(text));

  // Per-type required markers, matched against the body plus the summary.
  const markers = opts.type ? TYPE_REQUIRED_MARKERS[opts.type] : undefined;
  if (markers) {
    const haystack = `${body}\n${summary}`;
    for (const m of markers) {
      if (!m.pattern.test(haystack)) failures.push(m.code);
    }
  }

  return { ok: failures.length === 0, failures, warnings };
}

/**
 * Throw a classified error when the card is not structurally complete. The
 * thrown error carries `error_class: 'IncompleteGeneration'` and the failure
 * codes, so the caller logs one shape and persists nothing.
 */
export function assertCardComplete(
  content: unknown,
  opts: CardCompletenessOptions = {},
): CardCompletenessVerdict {
  const verdict = checkCardCompleteness(content, opts);
  if (!verdict.ok) {
    throw Object.assign(
      new Error(`Card generation structurally incomplete: ${verdict.failures.join(', ')}. Refusing to save a partial card.`),
      { status: 502, error_class: 'IncompleteGeneration', failures: verdict.failures },
    );
  }
  return verdict;
}
