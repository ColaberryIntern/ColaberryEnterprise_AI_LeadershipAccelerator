/**
 * Reconcile a live agent-domain board against the row set the generator says it should hold.
 *
 * Written for the capability-ladder migration (2026-11-13, PR #3993 follow-up), but deliberately
 * NOT written as a one-off for it. The generator already produces the complete desired row set for
 * a domain through `planProvision`, with deterministic ids, so "make the board match the plan" is
 * the general operation and the ladder migration is one instance of it. A bespoke
 * delete-the-964-rows script would have had to be written again the next time the shape changed.
 *
 * ## The three outcomes
 *
 *   DELETE   a row on the board that the plan no longer contains -- the 964 per-rung behaviour
 *            stories, which the generator stopped emitting.
 *   INSERT   a row in the plan that is not on the board -- the 40 ladder stories.
 *   UPDATE   a row in both whose content has changed -- the 443 capability rows, whose bodies now
 *            say "candidate, not started, not assigned" or "in flight".
 *
 * ## Why this is safe to run twice
 *
 * Every id is `derivedStoryId(domainKey, story_id)`, a pure function of the two strings. So a
 * second run finds the inserted rows already present and byte-identical, computes an empty plan,
 * and writes nothing. Idempotency here is structural rather than a flag somebody has to remember
 * to pass -- which matters, because this is the kind of script that gets re-run at 11pm by someone
 * who is not sure whether the first run finished.
 *
 * ## What it refuses
 *
 * **It will not delete work somebody has done.** A row whose status is anything but `not_started`,
 * or which carries a `verified_at`, becomes a REFUSAL rather than a deletion, and a refusal fails
 * the whole domain rather than being skipped. Measured before writing this: all 964 rows due for
 * deletion are `not_started` with no `verified_at`, so the guard should never fire today -- which
 * is exactly when a guard is worth adding, because the run that trips it will be some later one
 * nobody is watching.
 *
 * Partial application is impossible by construction: the runner applies one domain in one
 * transaction, and a refusal is raised before the transaction opens.
 */

import { planProvision, type PlannedStory } from './agentDomainProvisionPlan';

/** The columns of a live `student_tasks` row this reconciler needs in order to judge it. */
export interface ExistingStoryRow {
  readonly id: string;
  readonly story_id: string;
  readonly story_kind: string | null;
  readonly status: string;
  readonly verified_at: string | Date | null;
  readonly title: string;
  readonly narrative: string | null;
  readonly build: string | null;
  readonly release_key: string | null;
  readonly autonomy_stage: string | null;
  readonly acceptance: unknown;
}

/** A row the plan still contains, but whose stored content has drifted from it. */
export interface StoryUpdate {
  readonly id: string;
  readonly story_id: string;
  /** The fields that actually differ, for the log and for the test. Never a blanket overwrite. */
  readonly changed: ReadonlyArray<string>;
  readonly next: PlannedStory;
}

/** A deletion the reconciler will not perform, and why. Any refusal fails the domain. */
export interface DeletionRefusal {
  readonly story_id: string;
  readonly reason: 'status_not_untouched' | 'verified';
  readonly detail: string;
}

export interface BoardReconcilePlan {
  readonly domain_key: string;
  readonly to_delete: ReadonlyArray<ExistingStoryRow>;
  readonly to_insert: ReadonlyArray<PlannedStory>;
  readonly to_update: ReadonlyArray<StoryUpdate>;
  readonly refusals: ReadonlyArray<DeletionRefusal>;
  /** True when the board already matches the plan. The second run of a successful migration. */
  readonly noop: boolean;
}

/**
 * The only status a row may hold and still be deleted.
 *
 * Not a list of "safe" statuses: the question is whether anybody has touched this row, and
 * `not_started` is the only answer that means no. `in_progress` is somebody's open work and
 * `blocked` is somebody's recorded problem; both are theirs, not ours to drop.
 */
const UNTOUCHED = 'not_started';

/** Normalize acceptance for comparison: the column is jsonb, the plan holds a string array. */
function sameAcceptance(stored: unknown, planned: ReadonlyArray<string>): boolean {
  const a = Array.isArray(stored) ? stored.map((x) => String(x)) : [];
  if (a.length !== planned.length) return false;
  return a.every((x, i) => x === planned[i]);
}

/**
 * Which fields of a stored row differ from the plan.
 *
 * `title`, `narrative`, `build`, `release_key`, `autonomy_stage`, `story_kind` and `acceptance`
 * are compared. `position` deliberately is NOT: it is assigned by enumeration order within a
 * release, so an unrelated story being added upstream would otherwise mark every row below it as
 * drifted and rewrite the whole board for nothing.
 */
export function changedFields(row: ExistingStoryRow, next: PlannedStory): string[] {
  const diffs: string[] = [];
  if (row.title !== next.title) diffs.push('title');
  if ((row.narrative ?? '') !== next.narrative) diffs.push('narrative');
  if ((row.build ?? '') !== next.build) diffs.push('build');
  if ((row.release_key ?? '') !== next.release_key) diffs.push('release_key');
  if ((row.autonomy_stage ?? '') !== next.autonomy_stage) diffs.push('autonomy_stage');
  if ((row.story_kind ?? '') !== next.kind) diffs.push('story_kind');
  if (!sameAcceptance(row.acceptance, next.acceptance)) diffs.push('acceptance');
  return diffs;
}

/** True when this row carries work somebody has done, and therefore must not be deleted. */
export function isUntouched(row: ExistingStoryRow): boolean {
  return row.status === UNTOUCHED && !row.verified_at;
}

/**
 * What one domain's board needs in order to match the generator, as data.
 *
 * Pure: no database, no clock, no randomness. The caller reads the rows and performs the writes,
 * so this can be tested against any board state including ones that have never existed.
 */
export function planBoardReconcile(
  domainKey: string,
  existing: ReadonlyArray<ExistingStoryRow>,
): BoardReconcilePlan {
  const planned = planProvision(domainKey).stories;
  const plannedById = new Map(planned.map((s) => [s.id, s]));
  const existingById = new Map(existing.map((r) => [r.id, r]));

  const to_delete: ExistingStoryRow[] = [];
  const refusals: DeletionRefusal[] = [];
  for (const row of existing) {
    if (plannedById.has(row.id)) continue;
    if (!isUntouched(row)) {
      refusals.push(
        row.verified_at
          ? {
            story_id: row.story_id,
            reason: 'verified',
            detail: `carries verified_at, so somebody signed this off; refusing to delete it.`,
          }
          : {
            story_id: row.story_id,
            reason: 'status_not_untouched',
            detail: `status is '${row.status}', not '${UNTOUCHED}', so somebody has worked on it.`,
          },
      );
      continue;
    }
    to_delete.push(row);
  }

  const to_insert = planned.filter((s) => !existingById.has(s.id));

  const to_update: StoryUpdate[] = [];
  for (const s of planned) {
    const row = existingById.get(s.id);
    if (!row) continue;
    const changed = changedFields(row, s);
    if (changed.length) to_update.push({ id: row.id, story_id: s.story_id, changed, next: s });
  }

  return {
    domain_key: domainKey,
    to_delete,
    to_insert,
    to_update,
    refusals,
    noop: to_delete.length === 0 && to_insert.length === 0 && to_update.length === 0,
  };
}

/** One line per domain, for the dry run and for the applied log. */
export function describePlan(plan: BoardReconcilePlan): string {
  if (plan.refusals.length) {
    return `${plan.domain_key}: REFUSED — ${plan.refusals.length} row(s) carry work; `
      + plan.refusals.slice(0, 3).map((r) => `${r.story_id} (${r.reason})`).join(', ');
  }
  if (plan.noop) return `${plan.domain_key}: already matches the plan, nothing to do`;
  return `${plan.domain_key}: -${plan.to_delete.length} delete, +${plan.to_insert.length} insert, `
    + `~${plan.to_update.length} update`;
}
