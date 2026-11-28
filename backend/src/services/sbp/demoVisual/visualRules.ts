/**
 * demoVisual/visualRules - the thresholds, caps and vocabulary the visual engine obeys. PURE.
 *
 * ## Why the numbers live here and not in the engine
 *
 * `directives/demo-visual-rules.md` is the standing reference a person reads. If the numbers in
 * that document and the numbers in the code are typed twice, they drift, and the document becomes
 * a description of what the engine used to do. These constants are the ones the engine uses and
 * the ones the directive quotes, and `visualPlan.rules.test.ts` reads the directive off disk and
 * fails when a number in it no longer matches the constant beside it.
 *
 * ## Why thresholds exist at all
 *
 * The platform generates demos for thousands of projects in domains nobody has seen. A chart
 * drawn from two data points is not an analysis, it is decoration that implies one. Each minimum
 * below is the point beneath which the picture says less than the table it would replace, so
 * beneath it the engine keeps the table. Each cap is the point beyond which the picture stops
 * being readable, so beyond it the engine shows the most attention-worthy items and a way to
 * reach the rest.
 *
 * These are starting values, as the pack that specified them says. They are named so that tuning
 * them is one edit with a test and a directive line attached, rather than a hunt through a 50 KB
 * HTML file.
 */

/** Minimum work items before a timeline beats a table. One lane is a date, not a timeline. */
export const MIN_TIMELINE_LANES = 2;

/** Minimum timed events before a timeline is worth drawing, when lanes come from events. */
export const MIN_TIMELINE_EVENTS = 4;

/** Minimum rows before a bar chart beats reading the numbers. */
export const MIN_BAR_ROWS = 3;

/** Minimum stages before a funnel is a funnel rather than two numbers. */
export const MIN_FUNNEL_STAGES = 2;

/** Minimum distinct tiers before a stacked tier bar carries information. */
export const MIN_TIER_SEGMENTS = 2;

/** Minimum steps before a path of steps beats a sentence. */
export const MIN_PATH_STEPS = 2;

/** At most this many headline tiles. Beyond six nobody reads the seventh. */
export const MAX_HEADLINE_TILES = 6;

/** At most this many timeline lanes; the rest are reachable through the table. */
export const MAX_TIMELINE_LANES = 8;

/** At most this many bars in one comparison. */
export const MAX_BAR_ROWS = 12;

/** At most this many funnel stages. */
export const MAX_FUNNEL_STAGES = 8;

/**
 * A text field longer than this is quoted, never charted or truncated into a cell.
 *
 * Applies to the VALUE, not the field name: the same field can be short in one row and a
 * paragraph in another, and the decision is about what is actually there.
 */
export const QUOTE_BLOCK_MIN_CHARS = 120;

/**
 * Field types the contract defines. Mirrored here because `screens` and `entities` arrive as
 * `unknown` from the Zod schema, so the reader has to decide what it is looking at from strings.
 */
export const FIELD_TYPES = [
  'text', 'date', 'time', 'datetime', 'number', 'enum', 'ref', 'meter', 'bool', 'who', 'private',
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

/** Field types that carry a moment in time, used to find a work item's start and end. */
export const TIME_FIELD_TYPES: ReadonlyArray<FieldType> = ['date', 'time', 'datetime'];

/**
 * Every visual the plan can ask for. The engine implements exactly these and nothing else, so a
 * new picture is a change here first, which is what keeps the directive able to list them all.
 */
export const VISUAL_KINDS = [
  'timeline',
  'target_bar',
  'status_pills',
  'funnel',
  'step_path',
  'comparison_bars',
  'matrix',
  'decision_cards',
  'actor_summary',
  'quote_block',
] as const;
export type VisualKind = (typeof VISUAL_KINDS)[number];

/**
 * Why a visual was NOT drawn. Carried in the plan rather than dropped, for two reasons: the tests
 * assert the reason (so "no timeline" cannot pass for the wrong cause), and the engine needs to
 * know which fallback to render in that block's place.
 */
export const SKIP_REASONS = [
  'no_candidate_data',
  'below_minimum',
  'no_variation',
  'private_field',
] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

/** What the engine draws instead when a visual is skipped. Never "nothing". */
export const FALLBACKS = ['table', 'list', 'facts', 'none'] as const;
export type Fallback = (typeof FALLBACKS)[number];
