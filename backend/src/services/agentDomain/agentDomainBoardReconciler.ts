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
 *
 * ## An update may add content. It may never destroy it.
 *
 * The first version of this module assumed a board is purely derived from the generator,
 * so making it match the plan could only ever be correct. **That assumption was wrong, and
 * the production dry run on 2026-11-13 is what caught it.** These boards carry content
 * authored AFTER generation, which exists nowhere else:
 *
 *   - 683 acceptance lines across 513 rows. The generator emits acceptance for the 40
 *     ladder stories only, so a straight overwrite wrote null over every one of them --
 *     including 100 rows already complete and signed off.
 *   - Hand-written narrative on three research rows. One admissions story would have lost
 *     487 characters, among them a finding somebody had investigated ("a role-name
 *     collision, not an ownership question"), replaced by the generic template body.
 *
 * `partitionUpdate` is the guard. It splits the fields that differ into those safe to write
 * and those that would destroy something, and the second group is reported, never silently
 * skipped. The unit tests did not catch this because their fixtures were built FROM the
 * plan, so stored content could not differ from planned content -- see the test file's
 * `authoredRow` helper, which exists so that gap cannot reopen.
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
  /**
   * The subset of `changed` this reconciler will actually write. A field that differs
   * but would destroy stored content is reported in `preserved` and left alone, so
   * `changed` stays an honest record of the drift while `write` is what happens.
   */
  readonly write: ReadonlyArray<string>;
  readonly preserved: ReadonlyArray<PreservedField>;
  readonly next: PlannedStory;
}

/**
 * A field the plan would have overwritten, which is being left as it is instead.
 *
 * Measured on production 2026-11-13, and the reason this type exists: the plan carries
 * acceptance for the 40 new ladder stories ONLY, so a straight overwrite would have
 * written null over 683 authored acceptance lines on 513 rows, 100 of them already
 * signed off. Three rows would also have lost hand-written narrative -- one admissions
 * row dropped 487 characters including a specific finding somebody had investigated,
 * replaced by generic template text.
 */
export interface PreservedField {
  readonly story_id: string;
  readonly field: string;
  readonly reason: 'plan_has_nothing' | 'would_discard_edits';
  readonly detail: string;
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
  /**
   * Every field left alone across the whole board, including those on rows that
   * dropped out of `to_update` entirely. Reported rather than silently skipped: a
   * migration that quietly declines to do part of its job is indistinguishable from
   * one that did it.
   */
  readonly preserved: ReadonlyArray<PreservedField>;
  /**
   * True when the board already matches the plan, OR when every remaining difference
   * is one this reconciler refuses to write. In both cases there is nothing to do, and
   * on a second run the second case stays stable rather than rewriting forever.
   */
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

/** Empty for this purpose: nothing a reader would lose if it were replaced. */
function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  return String(value).trim() === '';
}

/** The stored and planned value of one comparable field, by name. */
function valuesFor(
  field: string, row: ExistingStoryRow, next: PlannedStory,
): { stored: unknown; planned: unknown } {
  switch (field) {
    case 'title': return { stored: row.title, planned: next.title };
    case 'narrative': return { stored: row.narrative, planned: next.narrative };
    case 'build': return { stored: row.build, planned: next.build };
    case 'release_key': return { stored: row.release_key, planned: next.release_key };
    case 'autonomy_stage': return { stored: row.autonomy_stage, planned: next.autonomy_stage };
    case 'story_kind': return { stored: row.story_kind, planned: next.kind };
    case 'acceptance': return { stored: row.acceptance, planned: next.acceptance };
    default: return { stored: undefined, planned: undefined };
  }
}

/** Prose fields, where a human may have added something the generator cannot reproduce. */
const PROSE_FIELDS: ReadonlySet<string> = new Set(['narrative', 'build']);

/**
 * Of the fields that differ, which may be written -- and which must be left alone.
 *
 * TWO RULES, both of them "an update may add, never destroy":
 *
 *   1. **The plan having nothing to say is not a reason to erase.** If the planned
 *      value is blank and the stored value is not, the stored value stays. The
 *      generator emits acceptance for ladder stories only; without this rule every
 *      other row's authored criteria would be nulled.
 *
 *   2. **A rewrite that drops what is already there is a conflict, not an update.**
 *      For prose, an additive change (the stored text still appears inside the planned
 *      text, which is what the IN FLIGHT / CANDIDATE relabel does) is written. A
 *      planned body that does NOT contain the stored body is somebody's edit being
 *      overwritten by a template, so it is preserved instead.
 *
 * Rule 2 is deliberately NOT limited to rows somebody has touched. `status` records
 * whether a task was worked, not whether its text was edited, and the row that proved
 * this -- an admissions research story carrying a hand-written finding -- would be
 * equally lost whatever its status said.
 */
export function partitionUpdate(
  row: ExistingStoryRow, next: PlannedStory, changed: ReadonlyArray<string>,
): { write: string[]; preserved: PreservedField[] } {
  const write: string[] = [];
  const preserved: PreservedField[] = [];

  for (const field of changed) {
    const { stored, planned } = valuesFor(field, row, next);

    if (isBlank(planned) && !isBlank(stored)) {
      preserved.push({
        story_id: row.story_id,
        field,
        reason: 'plan_has_nothing',
        detail: `the plan carries no ${field}, and the stored value is not empty; keeping what is there.`,
      });
      continue;
    }

    if (PROSE_FIELDS.has(field) && !isBlank(stored)
      && !String(planned ?? '').includes(String(stored))) {
      preserved.push({
        story_id: row.story_id,
        field,
        reason: 'would_discard_edits',
        detail: `the planned ${field} does not contain the stored one `
          + `(${String(stored).length} chars stored, ${String(planned ?? '').length} planned), `
          + 'so this would replace somebody\'s text rather than extend it.',
      });
      continue;
    }

    write.push(field);
  }

  return { write, preserved };
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
  const preserved: PreservedField[] = [];
  for (const s of planned) {
    const row = existingById.get(s.id);
    if (!row) continue;
    const changed = changedFields(row, s);
    if (!changed.length) continue;
    const split = partitionUpdate(row, s, changed);
    preserved.push(...split.preserved);
    // A row whose every difference is preserved is not an update. Emitting it anyway
    // would make the runner issue an UPDATE with no columns and report work it did not do.
    if (split.write.length === 0) continue;
    to_update.push({
      id: row.id,
      story_id: s.story_id,
      changed,
      write: split.write,
      preserved: split.preserved,
      next: s,
    });
  }

  return {
    domain_key: domainKey,
    to_delete,
    to_insert,
    to_update,
    refusals,
    preserved,
    noop: to_delete.length === 0 && to_insert.length === 0 && to_update.length === 0,
  };
}

/** One line per domain, for the dry run and for the applied log. */
export function describePlan(plan: BoardReconcilePlan): string {
  if (plan.refusals.length) {
    return `${plan.domain_key}: REFUSED — ${plan.refusals.length} row(s) carry work; `
      + plan.refusals.slice(0, 3).map((r) => `${r.story_id} (${r.reason})`).join(', ');
  }
  // Always state what was preserved, including on a no-op: "nothing to do" and "there
  // were differences I declined to write" are different facts and must not read alike.
  const kept = plan.preserved.length ? `, =${plan.preserved.length} field(s) preserved` : '';
  if (plan.noop) return `${plan.domain_key}: already matches the plan, nothing to do${kept}`;
  return `${plan.domain_key}: -${plan.to_delete.length} delete, +${plan.to_insert.length} insert, `
    + `~${plan.to_update.length} update${kept}`;
}

/** Why each field was left alone, grouped so a board's worth of them reads in a few lines. */
export function describePreserved(plan: BoardReconcilePlan): string[] {
  const byReasonAndField = new Map<string, number>();
  for (const p of plan.preserved) {
    const key = `${p.field} (${p.reason})`;
    byReasonAndField.set(key, (byReasonAndField.get(key) ?? 0) + 1);
  }
  return [...byReasonAndField]
    .sort((a, b) => b[1] - a[1])
    .map(([key, n]) => `${n} x ${key}`);
}

