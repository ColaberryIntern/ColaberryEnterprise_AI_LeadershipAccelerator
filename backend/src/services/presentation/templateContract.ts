/**
 * The lesson contract every presentation template must satisfy.
 *
 * WHY THIS IS A TYPE PLUS A VALIDATOR AND NOT JUST A TYPE. TypeScript can force a
 * field to exist; it cannot stop that field being `'TODO'`, `''`, or "AI will generate
 * this later". The build spec is explicit that templates ship with real authored
 * content and no placeholders, and the only way to hold that line across seven
 * templates and future edits is a check that reads the actual strings and fails the
 * build when one is empty, stubbed, or obviously unwritten.
 *
 * So: `PresentationTemplate` is the shape, `validateTemplate` is the contract, and the
 * guard test runs the validator over every shipped template. Adding an eighth template
 * with a blank example fails CI rather than reaching a student.
 *
 * ONE TYPE, SEVEN TEMPLATES — NOT SEVEN CURRICULUM TYPES. This follows the precedent
 * `community_live_session` already set in this repo: its eight variants
 * (study / build_room / demo / office_hours / …) are a per-card enum consumed by one
 * generation prompt, not eight registry entries. Reusing `presentation` and `demo` the
 * same way avoids the six obligations a new `CARD_TYPES` row carries (a CAPE policy
 * group, four hardcoded count literals, SUPPORTED_RENDER_BANDS, THUMBNAIL_SLUGS plus a
 * restated thumbnail_url, a real JPEG asset, and the frontend BAND map).
 */

/** A single beat of the timed outline: what to say, and how long it should take. */
export interface TemplateBeat {
  beat: string;
  seconds: number;
  /** What the student is actually doing or saying during this beat. */
  say: string;
}

/** An annotated example. Always labelled as an example, never attributed to a real student. */
export interface TemplateExample {
  /** The example line or passage itself. */
  text: string;
  /** Why it works, or why it does not — the annotation IS the teaching. */
  why: string;
}

export interface RubricDimension {
  dimension: string;
  /** Percentage weight. The set must total 100. */
  weight: number;
  lookFor: string;
}

export interface PresentationTemplate {
  id: string;
  label: string;
  /** The first four are surfaced prominently in the student chooser. */
  prominent: boolean;
  /** Speaking time, in seconds. Q&A is separate and never counted inside it. */
  defaultSeconds: number;
  qaSeconds: number;
  /** What the student should be able to do after this, in their words. */
  outcome: string;
  objective: string;
  expectedOutput: string;
  /** Short framing shown before the lesson proper. */
  preface: string;
  /** The required structure, as named beats. */
  structure: string[];
  strongExample: TemplateExample;
  weakExample: TemplateExample;
  timedOutline: TemplateBeat[];
  /** Terms the audience may not know, with plain-language definitions. */
  vocabulary: Array<{ term: string; plain: string }>;
  /** What to pull from their own project before they start. */
  prepare: string[];
  checklist: string[];
  practiceDrill: string;
  rubric: RubricDimension[];
  reflection: string;
}

/**
 * Strings that mean "not written yet" however they are dressed up. Checked
 * case-insensitively against every prose field.
 */
const PLACEHOLDER_PATTERNS: RegExp[] = [
  /\bTODO\b/i,
  /\bTBD\b/i,
  /\bFIXME\b/i,
  /\bplaceholder\b/i,
  /\blorem ipsum\b/i,
  /\bcoming soon\b/i,
  /\bfill (this|in)\b/i,
  /\bAI will generate\b/i,
  /\bto be (written|added|decided)\b/i,
  /^\s*x+\s*$/i,
];

/** Prose short enough that it cannot be real content. */
const MIN_PROSE = 25;

function prose(label: string, value: string, min: number, out: string[]): void {
  const v = (value || '').trim();
  if (!v) { out.push(`${label} is empty`); return; }
  if (v.length < min) out.push(`${label} is ${v.length} chars, under the ${min} minimum`);
  for (const rx of PLACEHOLDER_PATTERNS) {
    if (rx.test(v)) { out.push(`${label} contains placeholder text (${rx})`); break; }
  }
}

/**
 * Returns the list of contract violations for one template. Empty means it satisfies
 * the lesson contract. Never throws — the caller decides whether a violation is fatal,
 * so a seed can report every bad template at once rather than dying on the first.
 */
export function validateTemplate(t: PresentationTemplate): string[] {
  const out: string[] = [];
  const at = (f: string) => `${t.id}.${f}`;

  if (!t.id || !/^[a-z][a-z0-9_]*$/.test(t.id)) out.push(`${t.id || '(no id)'}: id must be lower_snake_case`);
  if (!t.label?.trim()) out.push(`${at('label')} is empty`);

  prose(at('outcome'), t.outcome, MIN_PROSE, out);
  prose(at('objective'), t.objective, MIN_PROSE, out);
  prose(at('expectedOutput'), t.expectedOutput, MIN_PROSE, out);
  prose(at('preface'), t.preface, 60, out);
  prose(at('practiceDrill'), t.practiceDrill, MIN_PROSE, out);
  prose(at('reflection'), t.reflection, MIN_PROSE, out);

  // Timing. Q&A is deliberately NOT inside the speaking budget: a deck whose outline
  // silently spends the question time is how a student runs over on the day.
  if (t.defaultSeconds <= 0) out.push(`${at('defaultSeconds')} must be positive`);
  if (t.qaSeconds < 0) out.push(`${at('qaSeconds')} cannot be negative`);

  if (t.structure.length < 3) out.push(`${at('structure')} needs at least 3 beats, has ${t.structure.length}`);

  // BOTH examples are required. A strong example alone teaches imitation; the weak one
  // plus its annotation is what teaches judgement.
  prose(at('strongExample.text'), t.strongExample?.text ?? '', MIN_PROSE, out);
  prose(at('strongExample.why'), t.strongExample?.why ?? '', MIN_PROSE, out);
  prose(at('weakExample.text'), t.weakExample?.text ?? '', MIN_PROSE, out);
  prose(at('weakExample.why'), t.weakExample?.why ?? '', MIN_PROSE, out);

  if (!t.timedOutline.length) out.push(`${at('timedOutline')} is empty`);
  t.timedOutline.forEach((b, i) => {
    if (b.seconds <= 0) out.push(`${at(`timedOutline[${i}].seconds`)} must be positive`);
    prose(at(`timedOutline[${i}].say`), b.say, 15, out);
  });

  // The outline must FIT the speaking time. An outline that overruns its own budget is
  // the single most common way a timed presentation fails, and it is checkable here.
  const outlineTotal = t.timedOutline.reduce((n, b) => n + b.seconds, 0);
  if (outlineTotal > t.defaultSeconds) {
    out.push(`${at('timedOutline')} totals ${outlineTotal}s, over the ${t.defaultSeconds}s speaking limit`);
  }

  if (t.vocabulary.length < 2) out.push(`${at('vocabulary')} needs at least 2 terms`);
  t.vocabulary.forEach((v, i) => prose(at(`vocabulary[${i}].plain`), v.plain, 15, out));

  if (t.prepare.length < 2) out.push(`${at('prepare')} needs at least 2 items`);
  if (t.checklist.length < 4) out.push(`${at('checklist')} needs at least 4 items`);
  [...t.prepare, ...t.checklist].forEach((s, i) => prose(at(`item[${i}]`), s, 10, out));

  if (!t.rubric.length) out.push(`${at('rubric')} is empty`);
  const weight = t.rubric.reduce((n, r) => n + r.weight, 0);
  if (weight !== 100) out.push(`${at('rubric')} weights total ${weight}, must total 100`);
  t.rubric.forEach((r, i) => prose(at(`rubric[${i}].lookFor`), r.lookFor, MIN_PROSE, out));

  return out;
}

/** Validates a whole set and returns every violation, keyed by template. */
export function validateTemplates(list: readonly PresentationTemplate[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of list) {
    if (seen.has(t.id)) out.push(`duplicate template id: ${t.id}`);
    seen.add(t.id);
    out.push(...validateTemplate(t));
  }
  return out;
}
