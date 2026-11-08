/**
 * What a "batch" is, and which month it belongs to — the one definition, shared.
 *
 * The monthly batch model (`directives/run-monthly-enrollment-batches.md`, active
 * 2026-11-05) says a batch is a `cohorts` row with `cohort_type = 'accelerator'` whose
 * calendar month is recorded in `settings_json.batch_month`. Three separate concerns need
 * that same answer — placement (which batch a payer joins), rollover (which batch is
 * current), and rooms (which cohorts get a private batch room) — so it lives in a module
 * that none of them reach each other through. Rooms already carried a second copy of it
 * (C10.14); that copy now re-exports from here rather than offering a second opinion.
 *
 * Pure: no DB, no clock, no I/O. Everything here is a function of the row handed in.
 */

export const BATCH_COHORT_TYPE = 'accelerator';

/** The columns these predicates read. Deliberately narrow so a caller can pass a plain
 *  object, a Sequelize instance, or a raw SQL row without casting the whole model. */
export interface BatchCohortRow {
  id?: string;
  name?: string | null;
  cohort_type?: string | null;
  settings_json?: any;
}

/**
 * Is this row a monthly batch at all?
 *
 * A NULL `cohort_type` counts as a batch because that is the column's own default
 * (`models/Cohort.ts`: `defaultValue: 'accelerator'`), so a row inserted without naming
 * the type is an accelerator row. Reading NULL as "not a batch" would silently exclude
 * exactly the rows a hand-written insert produces.
 *
 * The parameter is the WHOLE row shape, not `Pick<BatchCohortRow, 'cohort_type'>`. The
 * narrower version compiled fine and still broke C10.14's callers: TypeScript's excess-
 * property check rejects an object literal carrying `id` and `name` against a one-field
 * type, so `isBatchCohort({ id: 'c1', name: 'Cohort - December 2026', cohort_type: null })`
 * — which is how a test and a raw SQL row both arrive — stopped type-checking. Narrowing a
 * published signature is a breaking contract change even when the body is unchanged.
 */
export function isBatchCohort(cohort: BatchCohortRow): boolean {
  return (cohort.cohort_type ?? BATCH_COHORT_TYPE) === BATCH_COHORT_TYPE;
}

/** 'YYYY-MM', months 01-12 only, so '2026-13' and '2026-1' are both rejected. */
const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
] as const;

/** "Cohort - November 2026" and "Cohort — April 2026" both appear in production, so the
 *  separator is not matched at all: the month name and year are found wherever they sit. */
const NAME_MONTH_RE = new RegExp(`\\b(${MONTH_NAMES.join('|')})\\b[^0-9]{0,10}(\\d{4})\\b`, 'i');

/**
 * The batch month of a row as 'YYYY-MM', or null if it does not have one.
 *
 * Returns null for any row that is not a batch, so this single call answers both "is this
 * a batch" and "which month" — a caller cannot accidentally read a month off the AI
 * Internship or Explorer cohort just because its name contains one.
 *
 * `settings_json.batch_month` is the explicit answer and is preferred. **The name is a
 * documented fallback, not a guess**: the directive states outright that "the batch month
 * lives in `name` ("Cohort - December 2026") and in `description`", and names batch rows
 * `Cohort - <Month> <Year>` in its Outputs section. The fallback is load-bearing right
 * now rather than theoretical — measured on production 2026-11-08, the batch that is
 * OPEN today (November 2026) carries no `batch_month` at all, while December 2026 through
 * March 2027 all carry the full block. A resolver keyed only on the explicit field would
 * find nothing for the one batch currently taking signups.
 *
 * **`start_date` is never consulted, by design.** On a batch row it holds the
 * ORIENTATION date, which falls in the month AFTER the batch — November 2026's
 * orientation is 7 December 2026 — so reading a month off it would place every payer one
 * batch late. That is the same error as sorting on `start_date`, which the directive
 * forbids by name (`selectNextOpenCohort`).
 */
export function batchMonthOf(cohort: BatchCohortRow | null | undefined): string | null {
  if (!cohort || !isBatchCohort(cohort)) return null;

  const declared = cohort.settings_json?.batch_month;
  if (typeof declared === 'string' && MONTH_KEY_RE.test(declared.trim())) {
    return declared.trim();
  }
  return batchMonthFromName(cohort.name);
}

/**
 * The month a batch row's NAME claims, ignoring `settings_json` entirely.
 *
 * Exported separately so the two readings can be COMPARED rather than only resolved.
 * `batchMonthOf` prefers the declared key, so on its own it cannot tell a row whose stored
 * `batch_month` contradicts its own name from a row where the two agree — and that
 * contradiction is exactly the state `backfillBatchMonths` has to refuse to paper over.
 */
export function batchMonthFromName(name: string | null | undefined): string | null {
  const fromName = NAME_MONTH_RE.exec(String(name ?? ''));
  if (!fromName) return null;
  const month = MONTH_NAMES.indexOf(fromName[1].toLowerCase() as typeof MONTH_NAMES[number]) + 1;
  const key = `${fromName[2]}-${String(month).padStart(2, '0')}`;
  return MONTH_KEY_RE.test(key) ? key : null;
}
