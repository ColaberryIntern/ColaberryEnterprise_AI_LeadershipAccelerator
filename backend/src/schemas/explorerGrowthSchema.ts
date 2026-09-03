import { z } from 'zod';
import type {
  ExplorerActionType,
  ExplorerOverlay,
  ExplorerPrimaryState,
} from '../types/explorerGrowth';

/**
 * Zod contracts for the Explorer Growth Command Center (spec §27).
 *
 * Data only — no I/O, no model imports, no database. This file is pure enough to
 * be unit-tested without a `DATABASE_URL`, which matters because CI's jest config
 * is an ignore-list: a suite that reaches the model layer without a database goes
 * red and gets excluded into invisibility.
 *
 * ── REJECT, DO NOT COERCE ───────────────────────────────────────────────────
 *
 * Every field below refuses malformed input rather than repairing it. Two reasons,
 * both learned the expensive way in this repo:
 *
 * 1. A malformed learner id that reaches a query becomes
 *    `WHERE enrollment_id = 'garbage'`, which returns no rows, which the route
 *    reports as 404. "No such learner" and "that is not a learner id" are
 *    different claims, and collapsing them sends whoever is debugging to look for
 *    a missing record instead of a broken caller.
 *
 * 2. Clamping is a silent substitution. A caller who asks for `limit=500` and
 *    receives 50 rows was answered a question they did not ask, and nothing in the
 *    response says so. They will conclude there are only 50 learners.
 *
 * This is also why `z.coerce` appears nowhere here. `z.coerce.number()` turns the
 * empty string into 0 and `true` into 1 — it is a repair mechanism wearing a
 * parser's name. Query parameters genuinely do arrive as strings, so strings are
 * parsed explicitly: a digits-only regex, then a real numeric bound. `"50"`
 * becomes 50; `""`, `"abc"`, `"50.5"` and `"-1"` become 400.
 */

// ─── Enums, pinned to the type unions so drift fails the build ───────────────

/**
 * These arrays restate unions from `types/explorerGrowth.ts`. A restatement can
 * drift, so each is checked against its union in BOTH directions below — an
 * extra member fails `satisfies`, a missing one fails the `Exhaustive` alias.
 *
 * The checks live in this source file deliberately. `tsconfig` excludes
 * `__tests__/` and ts-jest transpiles without type-checking, so an identical
 * guard written in a test file would be checked by nothing at all — which has
 * already happened once in this workstream.
 */
export const PRIMARY_STATES = [
  'NEW_EXPLORER',
  'ACTIVATING',
  'ACTIVE_LEARNER',
  'ENGAGED_LEARNER',
  'CONNECTED_TO_COMMUNITY',
  'CONSIDERING_NEXT_STEP',
  'ENROLLMENT_READY',
  'CONVERTED',
] as const satisfies readonly ExplorerPrimaryState[];

export const OVERLAYS = [
  'DORMANT',
  'HIGH_INTENT',
  'FRICTION',
  'NEEDS_SUPPORT',
  'EVENT_READY',
  'EVENT_REGISTERED',
  'EVENT_ATTENDED',
  'EVENT_NO_SHOW',
  'INTERNSHIP_READY',
  'SUBSCRIPTION_READY',
  'REFERRAL_READY',
  'IN_CONVERSATION',
] as const satisfies readonly ExplorerOverlay[];

export const ACTION_TYPES = [
  'SEND_EMAIL',
  'SEND_SMS',
  'SCHEDULE_VOICE',
  'SHOW_IN_APP_NUDGE',
  'RECOMMEND_LESSON',
  'INVITE_TO_EVENT',
  'SEND_ALI_OUTREACH',
  'ENTER_SUBCAMPAIGN',
  'EXIT_SUBCAMPAIGN',
  'CREATE_HUMAN_TASK',
  'RECOVER_FRICTION',
  'WAIT',
  'SUPPRESS_CONTACT',
] as const satisfies readonly ExplorerActionType[];

/** `never` unless the array covers the union completely. */
type Exhaustive<Union, Listed> = [Exclude<Union, Listed>] extends [never] ? true : never;

const _statesCoverUnion: Exhaustive<ExplorerPrimaryState, (typeof PRIMARY_STATES)[number]> = true;
const _overlaysCoverUnion: Exhaustive<ExplorerOverlay, (typeof OVERLAYS)[number]> = true;
const _actionsCoverUnion: Exhaustive<ExplorerActionType, (typeof ACTION_TYPES)[number]> = true;
void _statesCoverUnion;
void _overlaysCoverUnion;
void _actionsCoverUnion;

// ─── Primitives ─────────────────────────────────────────────────────────────

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

/**
 * A whole number arriving as a query string. Digits only, then a real bound.
 *
 * The regex is what makes this a parser rather than a repair: `"50.5"` and `"-1"`
 * never reach `Number()`, so they cannot be rounded or absolute-valued into
 * something plausible.
 */
function numericParam(label: string, min: number, max: number) {
  return z
    .string()
    .regex(/^\d+$/, `${label} must be a whole number`)
    .transform(Number)
    .pipe(
      z
        .number()
        .int(`${label} must be a whole number`)
        .min(min, `${label} must be at least ${min}`)
        .max(max, `${label} must be at most ${max}`),
    );
}

/** A score band. All three of E, I and F are 0-100 (§7). */
const scoreParam = (label: string) => numericParam(label, 0, 100);

export const enrollmentIdSchema = z.string().uuid('Not a valid learner id');
export const decisionIdSchema = z.string().uuid('Not a valid decision id');

/**
 * An ISO calendar day, `YYYY-MM-DD`.
 *
 * The shape check alone accepts `2026-02-30`, so the value is round-tripped
 * through a UTC date and compared back to the input. UTC is explicit rather than
 * incidental: constructing a bare `new Date('2026-02-30')` reads as local time and
 * has already produced an off-by-one-day bug in this repo's cron layer.
 */
export const isoDaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Not a real calendar day');

/**
 * A boolean arriving as a query string. Exactly "true" or "false".
 *
 * Not `Boolean(value)`, which makes "false" true — the single most common way a
 * filter silently inverts itself.
 */
const booleanParam = (label: string) =>
  z
    .enum(['true', 'false'], { message: `${label} must be "true" or "false"` })
    .transform((v) => v === 'true');

const searchSchema = z
  .string()
  .trim()
  .min(1, 'Search cannot be blank')
  .max(120, 'Search is too long');

// ─── Route params ───────────────────────────────────────────────────────────

/** `/learners/:enrollmentId`, and its `/signals`, `/decisions`, `/scores` children. */
export const learnerParamsSchema = z.object({ enrollmentId: enrollmentIdSchema });

/** `/decisions/:id` — the Why payload. A DECISION id, not a learner id. */
export const decisionParamsSchema = z.object({ id: decisionIdSchema });

/** `/eligibility/:enrollmentId`. */
export const eligibilityParamsSchema = z.object({ enrollmentId: enrollmentIdSchema });

// ─── Query contracts ────────────────────────────────────────────────────────

/**
 * Pagination, applied wherever a list is returned.
 *
 * `limit` is bounded at 200 and REJECTS above it. The alternative — clamping —
 * would answer a different question silently; see the header.
 */
const paginationShape = {
  limit: numericParam('limit', 1, MAX_LIMIT).optional(),
  offset: numericParam('offset', 0, Number.MAX_SAFE_INTEGER).optional(),
};

/** Fills the documented defaults once validation has already passed. */
const withPaginationDefaults = <T extends { limit?: number; offset?: number }>(q: T) => ({
  ...q,
  limit: q.limit ?? DEFAULT_LIMIT,
  offset: q.offset ?? 0,
});

/** `GET /learners` — the Journey roster. */
export const learnersQuerySchema = z
  .object({
    ...paginationShape,
    state: z.enum(PRIMARY_STATES).optional(),
    overlay: z.enum(OVERLAYS).optional(),
    e_min: scoreParam('e_min').optional(),
    e_max: scoreParam('e_max').optional(),
    i_min: scoreParam('i_min').optional(),
    i_max: scoreParam('i_max').optional(),
    f_min: scoreParam('f_min').optional(),
    search: searchSchema.optional(),
  })
  .strict()
  .refine((q) => q.e_min === undefined || q.e_max === undefined || q.e_min <= q.e_max, {
    message: 'e_min cannot exceed e_max',
    path: ['e_min'],
  })
  .refine((q) => q.i_min === undefined || q.i_max === undefined || q.i_min <= q.i_max, {
    message: 'i_min cannot exceed i_max',
    path: ['i_min'],
  })
  .transform(withPaginationDefaults);

/** `GET /decisions` — the Decisions tab. */
export const decisionsQuerySchema = z
  .object({
    ...paginationShape,
    action: z.enum(ACTION_TYPES).optional(),
    date: isoDaySchema.optional(),
    executed: booleanParam('executed').optional(),
  })
  .strict()
  .transform(withPaginationDefaults);

/** `GET /shadow` — what WOULD have run. */
export const shadowQuerySchema = z
  .object({ ...paginationShape, date: isoDaySchema.optional() })
  .strict()
  .transform(withPaginationDefaults);

/** `GET /content` — registry health. */
export const contentQuerySchema = z
  .object({ ...paginationShape, date: isoDaySchema.optional() })
  .strict()
  .transform(withPaginationDefaults);

/** `GET /distribution` — state distribution and its trend. */
export const distributionQuerySchema = z
  .object({ days: numericParam('days', 1, 365).optional() })
  .strict()
  .transform((q) => ({ days: q.days ?? 30 }));

/** `GET /learners/:enrollmentId/signals` and `/scores`. */
export const learnerSeriesQuerySchema = z
  .object({ days: numericParam('days', 1, 365).optional() })
  .strict()
  .transform((q) => ({ days: q.days ?? 90 }));

// ─── Inferred types — the contract as consumed by controllers ────────────────

export type LearnerParams = z.infer<typeof learnerParamsSchema>;
export type DecisionParams = z.infer<typeof decisionParamsSchema>;
export type EligibilityParams = z.infer<typeof eligibilityParamsSchema>;
export type LearnersQuery = z.infer<typeof learnersQuerySchema>;
export type DecisionsQuery = z.infer<typeof decisionsQuerySchema>;
export type ShadowQuery = z.infer<typeof shadowQuerySchema>;
export type ContentQuery = z.infer<typeof contentQuerySchema>;
export type DistributionQuery = z.infer<typeof distributionQuerySchema>;
export type LearnerSeriesQuery = z.infer<typeof learnerSeriesQuerySchema>;
