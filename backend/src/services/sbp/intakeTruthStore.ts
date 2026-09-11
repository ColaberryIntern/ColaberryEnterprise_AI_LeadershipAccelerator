import ProjectUnderstandingRecord from '../../models/ProjectUnderstandingRecord';
import { itemsFromIntake, type IntakeTruthInput } from './intakeTruth';
import type { UnderstandingItem } from '../delivery/projectUnderstanding';

/**
 * intakeTruthStore — a student's intake, persisted as project truth.
 *
 * ## No schema change, and that is the design
 *
 * `project_understandings` is already keyed `(source, source_ref)` UNIQUE, with
 * a NULLABLE `lead_id`. A student project needs no new column: it is
 * `source: 'student_intake'`, `source_ref: <project id>`.
 *
 * That matters beyond tidiness. AI Flotation and the CPN scholarship interview
 * both read this table. Adding a subject column would have meant a migration
 * against a table two live products depend on, to express something the
 * existing key already expresses. The unique index also hands us idempotency
 * for nothing: running intake twice for the same project updates one row rather
 * than creating a second understanding of the same project.
 *
 * ## The one rule worth arguing about
 *
 * **A regenerated intake never overwrites a human correction.**
 *
 * Once someone has corrected an item, that item carries `client_confirmed`, and
 * a later automatic write must not silently replace it. This is the brief's
 * rule - a new value cannot silently replace a confirmed value - and it is the
 * same lesson as `plan.json` in H-13: platform-generated is not platform-owned.
 * A student who fixes "Priya" to "Priyanka" and watches the next sync put
 * "Priya" back learns not to bother correcting anything.
 *
 * So the automatic path REFUSES and says so, rather than merging cleverly. A
 * merge that silently picks a winner is the failure wearing a solution's
 * clothes; a refusal is visible and a person can act on it.
 */

/** Every student intake lands under this source. */
export const STUDENT_INTAKE_SOURCE = 'student_intake';

export type SaveOutcome = 'created' | 'updated' | 'unchanged' | 'refused_confirmed';

export interface SaveIntakeTruthResult {
  readonly outcome: SaveOutcome;
  /**
   * The revision the stored truth is now at.
   *
   * Increments only when the items ACTUALLY changed. A re-extraction returning
   * the same facts in a different order is not a new revision, and counting it
   * as one would make every routine sync look like an edit to whoever is
   * deciding whether a plan is stale.
   */
  readonly revision: number;
  readonly items: readonly UnderstandingItem[];
  /** Answers whose angle was not recognised. Reported, never filed by guess. */
  readonly unmapped: number;
  /** Set only on `refused_confirmed`: the items a person had already corrected. */
  readonly confirmedItems?: readonly UnderstandingItem[];
}

export interface SaveIntakeTruthInput extends IntakeTruthInput {
  readonly projectId: string;
}

/** An item a person has corrected or confirmed, which the automatic path may not touch. */
const isHumanConfirmed = (item: UnderstandingItem): boolean =>
  item.provenance === 'client_confirmed' || item.provenance === 'pm_confirmed';

/** Order-independent comparison, so a reordered extraction is not a change. */
function sameItems(a: readonly UnderstandingItem[], b: readonly UnderstandingItem[]): boolean {
  if (a.length !== b.length) return false;
  const key = (i: UnderstandingItem) => `${i.dimension}\u0000${i.classification}\u0000${i.provenance}\u0000${i.value}`;
  const left = a.map(key).sort();
  const right = b.map(key).sort();
  return left.every((k, idx) => k === right[idx]);
}

export async function saveIntakeTruth(input: SaveIntakeTruthInput): Promise<SaveIntakeTruthResult> {
  const { items, unmapped } = itemsFromIntake(input);

  const existing = await ProjectUnderstandingRecord.findOne({
    where: { source: STUDENT_INTAKE_SOURCE, source_ref: input.projectId },
  });

  if (!existing) {
    await ProjectUnderstandingRecord.create({
      lead_id: null,
      source: STUDENT_INTAKE_SOURCE,
      source_ref: input.projectId,
      status: 'extracted',
      title: null,
      proposed_surfaces: [],
      items,
      rejected: [],
      revision: 1,
    } as never);
    return { outcome: 'created', items, unmapped: unmapped.length, revision: 1 };
  }

  const stored: UnderstandingItem[] = Array.isArray(existing.items) ? existing.items : [];
  const confirmed = stored.filter(isHumanConfirmed);
  if (confirmed.length > 0) {
    // Refuse the whole write rather than merging around the corrected items.
    // Partially overwriting is how a student ends up with half their correction
    // intact and no way to tell which half.
    return {
      outcome: 'refused_confirmed',
      items: stored,
      unmapped: unmapped.length,
      // Unchanged: a refused write moves nothing, so the plan's basis is intact.
      revision: existing.revision ?? 1,
      confirmedItems: confirmed,
    };
  }

  const current = existing.revision ?? 1;
  if (sameItems(stored, items)) {
    return { outcome: 'unchanged', items: stored, unmapped: unmapped.length, revision: current };
  }

  const next = current + 1;
  await existing.update({ items, status: 'extracted', revision: next });
  return { outcome: 'updated', items, unmapped: unmapped.length, revision: next };
}

/**
 * Write items a PERSON produced.
 *
 * The guard in `saveIntakeTruth` refuses to overwrite a confirmed item, which
 * is right for the automatic path and wrong here: this IS the human, and a
 * correction must land. Two functions rather than a flag, because a boolean
 * called `force` on the automatic path is exactly how the guard gets switched
 * off by a caller who did not read it.
 *
 * Creates the row when the intake never ran, so a correction is never lost to
 * ordering.
 */
export async function saveCorrectedTruth(
  projectId: string,
  items: readonly UnderstandingItem[],
): Promise<number> {
  const existing = await ProjectUnderstandingRecord.findOne({
    where: { source: STUDENT_INTAKE_SOURCE, source_ref: projectId },
  });

  if (existing) {
    // A correction is always a new revision. Unlike the automatic path there is
    // no "unchanged" case worth detecting: a person pressed confirm, and the
    // fact that somebody read it back is itself the change.
    const next = (existing.revision ?? 1) + 1;
    await existing.update({
      items: [...items], status: 'extracted', revision: next, confirmed_at: new Date(),
    });
    return next;
  }
  await ProjectUnderstandingRecord.create({
    lead_id: null,
    source: STUDENT_INTAKE_SOURCE,
    source_ref: projectId,
    status: 'extracted',
    title: null,
    proposed_surfaces: [],
    items: [...items],
    rejected: [],
    revision: 1,
    confirmed_at: new Date(),
  } as never);
  return 1;
}

/** The stored truth for one project, or null. */
export async function loadIntakeTruth(projectId: string): Promise<UnderstandingItem[] | null> {
  const row = await ProjectUnderstandingRecord.findOne({
    where: { source: STUDENT_INTAKE_SOURCE, source_ref: projectId },
  });
  if (!row) return null;
  return Array.isArray(row.items) ? row.items : [];
}

/**
 * The truth AND the revision it is at, for a caller about to generate a plan.
 *
 * Separate from `loadIntakeTruth` because most readers want the items and only
 * the plan generator needs to record which revision it built from. A caller
 * that reads the items without the revision cannot accidentally record the
 * wrong one.
 */
export async function loadIntakeTruthAtRevision(
  projectId: string,
): Promise<{ items: UnderstandingItem[]; revision: number } | null> {
  const row = await ProjectUnderstandingRecord.findOne({
    where: { source: STUDENT_INTAKE_SOURCE, source_ref: projectId },
  });
  if (!row) return null;
  return {
    items: Array.isArray(row.items) ? row.items : [],
    revision: row.revision ?? 1,
  };
}

/**
 * Save truth a story's evidence changed, only if nobody else changed it first.
 *
 * Compare-and-set on the revision: the UPDATE carries `revision = expected`
 * in its WHERE, so two enrichments landing together cannot both build on the
 * same base and both win. The loser gets `null` and re-merges against the
 * newer truth, which is cheap because the merge is pure and idempotent.
 *
 * `expected` null means "there is no row yet": forward repair for a project
 * whose intake never wrote one. The create is then the whole write, at
 * revision 1.
 */
export async function saveEnrichedTruth(
  projectId: string,
  items: readonly UnderstandingItem[],
  expected: number | null,
): Promise<number | null> {
  if (expected === null) {
    try {
      await ProjectUnderstandingRecord.create({
        lead_id: null,
        source: STUDENT_INTAKE_SOURCE,
        source_ref: projectId,
        status: 'extracted',
        title: null,
        proposed_surfaces: [],
        items: [...items],
        rejected: [],
        revision: 1,
      } as never);
      return 1;
    } catch {
      // Someone created it between our read and this write. Caller re-reads.
      return null;
    }
  }

  const next = expected + 1;
  const [count] = await ProjectUnderstandingRecord.update(
    { items: [...items], status: 'extracted', revision: next } as never,
    { where: { source: STUDENT_INTAKE_SOURCE, source_ref: projectId, revision: expected } },
  );
  return count === 1 ? next : null;
}
