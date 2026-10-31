/**
 * The autonomy-release migration, as a PURE function of current state.
 *
 * Phase 2 of `docs/architecture/ai-workforce-management/AUTONOMY_RELEASE_MIGRATION.md`, items 4-6:
 * create the ten rung releases keeping the three originals, re-parent the existing stories, and
 * project the 964 `release_behaviour[]` entries into rows.
 *
 * ## Why the plan is separated from the script that applies it
 *
 * `scripts/migrateAgentDomainAutonomyReleases.ts` does the I/O; this module decides. The decision
 * is the part worth testing, and it is testable here without a database, a transaction or a
 * `--apply` flag. The Command Center backfill shipped the same split and it is the reason that
 * defect was caught by inspection: the ordering logic could be exercised directly.
 *
 * It also means the dry run and the apply share this one code path, so a dry run reports the plan
 * the apply will execute. That is a narrower claim than it sounds -- a dry run proves the PLAN, not
 * the SQL, and that distinction cost a production run already -- but within its scope it holds.
 *
 * ## What a migrated row keeps, and the one place this document had to be corrected
 *
 * `AUTONOMY_RELEASE_MIGRATION.md` promised that "the only column that changes on an existing row is
 * `task_list_id`". Building it showed that is not quite achievable, so the promise is corrected
 * rather than quietly broken. An existing row's `release_key` moves WITH its `task_list_id`,
 * because every one of the 513 rows in production satisfies `release_key = its list's cluster`
 * today, and leaving `release_key` behind would break that invariant and leave `coverageMatrix`
 * and both acceptance backfills reporting the superseded axis forever. `position` is renormalized
 * for the same reason Phase 1 renormalized it: three lists merging into one rung produces dozens
 * of duplicate positions, and the portal sorts the board on that column.
 *
 * What is never touched on an existing row: `id`, `title`, `status`, `narrative`, `build`,
 * `verified_at`, `verified_by`, `verified_ref`, `verification_json`, `due_on`. **51 rows carry a
 * verification stamp, and all 51 keep it.** The three ladder columns were null on all 513 rows
 * before this ran, so populating them takes nothing away.
 */
import {
  planForDomain,
  AUTONOMY_RELEASES,
  LEGACY_RELEASES,
  type GeneratedStory,
} from './agentDomainStoryTemplates';
import { derivedReleaseId, derivedStoryId, STORY_ID_MAX } from './agentDomainProvisionPlan';
import { isAutonomyStage } from './autonomyLadder';

/**
 * The width `student_tasks.story_id` had before Phase 2 widened it to 120.
 *
 * Needed because the rows already in the database were truncated to this, and a migration that
 * only recognises the new width treats 17 real production stories as strangers. See `existingFor`.
 */
export const LEGACY_STORY_ID_WIDTH = 60;

/**
 * The story kinds that could possibly be behind a legacy-truncated row.
 *
 * `release_behaviour` is excluded, and that exclusion is what makes the legacy lookup decidable.
 * Running the planner against real production rows refused `curriculum.CAP.module_and_artifact_
 * drafting_for_human_approv` as the 60-character truncation of FOUR generated stories: the
 * capability story and its R0, R1 and R4 rung stories, which all share that prefix.
 *
 * The ambiguity is only apparent. The per-rung stories did not exist while `story_id` was
 * `varchar(60)` -- this phase is what creates them -- so a row written under the old width can
 * only be one of the four kinds that existed then, and among those a `CAP.`-prefixed id belongs to
 * the capability story. Narrowing the candidates by kind resolves every real case and leaves the
 * refusal in place for a genuine collision between two pre-ladder stories.
 */
const PRE_LADDER_KINDS: ReadonlyArray<string> = Object.freeze([
  'command_center', 'research', 'legacy_migration', 'implementation',
]);

/** A `student_task_lists` row as the migration needs to see it. */
export interface ExistingList {
  readonly id: string;
  readonly cluster: string;
  readonly title: string;
  readonly position: number;
}

/** A `student_tasks` row as the migration needs to see it. */
export interface ExistingStory {
  readonly id: string;
  readonly story_id: string;
  readonly task_list_id: string;
  readonly release_key: string | null;
  readonly position: number;
  readonly capability_id: string | null;
  readonly autonomy_stage: string | null;
  readonly story_kind: string | null;
}

export interface ListToCreate {
  readonly id: string;
  readonly cluster: string;
  readonly title: string;
  readonly position: number;
}

/** A kept legacy release whose title or position changes so it reads as superseded. */
export interface ListToRetitle {
  readonly id: string;
  readonly cluster: string;
  readonly title: string;
  readonly position: number;
}

/** An existing row moving to a rung. Only the fields listed here are written. */
export interface StoryToReparent {
  readonly id: string;
  readonly story_id: string;
  readonly task_list_id: string;
  readonly release_key: string;
  readonly autonomy_stage: string;
  readonly capability_id: string | null;
  readonly story_kind: string;
  readonly position: number;
}

export interface StoryToInsert {
  readonly id: string;
  readonly story_id: string;
  readonly task_list_id: string;
  readonly release_key: string;
  readonly autonomy_stage: string;
  readonly capability_id: string | null;
  readonly story_kind: string;
  readonly title: string;
  readonly narrative: string;
  readonly build: string;
  readonly acceptance: ReadonlyArray<string>;
  readonly position: number;
}

export interface DomainMigrationPlan {
  readonly domain_key: string;
  readonly lists_to_create: ReadonlyArray<ListToCreate>;
  readonly lists_to_retitle: ReadonlyArray<ListToRetitle>;
  readonly stories_to_reparent: ReadonlyArray<StoryToReparent>;
  readonly stories_to_insert: ReadonlyArray<StoryToInsert>;
  /** Rows in the database that the generator does not produce. Reported, never deleted. */
  readonly unrecognised_stories: ReadonlyArray<string>;
  /** True when nothing at all would be written. The second run's expected state. */
  readonly already_migrated: boolean;
}

export class MigrationRefusedError extends Error {
  readonly error_class = 'MigrationRefusedError';

  constructor(message: string) {
    super(`MigrationRefusedError: ${message}`);
    this.name = 'MigrationRefusedError';
  }
}

/** Human work statement duplication is avoided by reading what the plan already decided. */
function buildOf(s: GeneratedStory): string {
  return s.claude_code_prompt;
}

/**
 * The order stories should sit in within one rung.
 *
 * The generator's own array order IS the intended order -- Command Center, then the five research
 * stories, then the legacy plan, then the capability stories, then the per-rung stories -- so this
 * returns positions `0..n` in that order. Rows the generator does not know about keep their
 * relative order and go last, ordered by `(position, id)` so the result is deterministic even when
 * positions tie, which they will: three lists merging into one rung guarantees duplicates.
 *
 * Renormalizing rather than shifting, for the reason Phase 1 recorded: a shift has to know whether
 * it already ran, and both of its failure modes are silent. This is idempotent by value, so the
 * second run computes the same numbers and writes nothing.
 */
export function intendedOrderWithinRung(
  generatedOrder: ReadonlyArray<string>,
  rows: ReadonlyArray<{ story_id: string; position: number; id: string }>,
): string[] {
  const rank = new Map(generatedOrder.map((sid, i) => [sid, i]));
  const known = rows.filter((r) => rank.has(r.story_id));
  const unknown = rows.filter((r) => !rank.has(r.story_id));

  known.sort((a, b) => (rank.get(a.story_id) as number) - (rank.get(b.story_id) as number));
  unknown.sort((a, b) => (a.position - b.position) || a.id.localeCompare(b.id));

  return [...known, ...unknown].map((r) => r.story_id);
}

/**
 * What one domain's migration would change, given what is in the database right now.
 *
 * Refuses rather than guessing when the generator produces a story whose rung is not a real one;
 * `agentDomainStoryTemplates` already refuses at generation, so this is the second line and exists
 * because a migration that places work on a wrong rung is a migration that mis-states authority.
 */
export function planDomainMigration(
  domainKey: string,
  existingLists: ReadonlyArray<ExistingList>,
  existingStories: ReadonlyArray<ExistingStory>,
): DomainMigrationPlan {
  const plan = planForDomain(domainKey);

  const listIdByCluster = new Map(existingLists.map((l) => [l.cluster, l.id]));
  const listsToCreate: ListToCreate[] = [];
  for (const r of AUTONOMY_RELEASES) {
    if (listIdByCluster.has(r.cluster)) continue;
    const id = derivedReleaseId(domainKey, r.cluster);
    listsToCreate.push({ id, cluster: r.cluster, title: r.name.slice(0, 255), position: r.position });
    listIdByCluster.set(r.cluster, id);
  }

  // The three originals are kept. They only move down and gain a "(superseded…)" title, and only
  // when they do not already say so -- `IS DISTINCT FROM` semantics, computed here so the SQL
  // stays a plain UPDATE.
  const listsToRetitle: ListToRetitle[] = [];
  for (const r of LEGACY_RELEASES) {
    const existing = existingLists.find((l) => l.cluster === r.cluster);
    if (!existing) continue;
    if (existing.title === r.name.slice(0, 255) && existing.position === r.position) continue;
    listsToRetitle.push({
      id: existing.id, cluster: r.cluster, title: r.name.slice(0, 255), position: r.position,
    });
  }

  // Every story the generator produces, indexed by the id the database will store.
  const generated = new Map<string, GeneratedStory>();
  const orderByRung = new Map<string, string[]>();
  // And the same stories indexed by the id a database written BEFORE the widening would hold.
  // Several generated ids can share one legacy key, so this holds candidates rather than a single
  // story and an ambiguous match is refused instead of guessed.
  const legacyIndex = new Map<string, GeneratedStory[]>();

  for (const s of plan.stories) {
    if (!isAutonomyStage(s.autonomy_stage)) {
      throw new MigrationRefusedError(
        `story '${s.story_id}' names rung '${s.autonomy_stage}', which is not autonomy:R0..R9`,
      );
    }
    const stored = s.story_id.slice(0, STORY_ID_MAX);
    generated.set(stored, s);
    if (!orderByRung.has(s.autonomy_stage)) orderByRung.set(s.autonomy_stage, []);
    (orderByRung.get(s.autonomy_stage) as string[]).push(stored);

    const legacy = s.story_id.slice(0, LEGACY_STORY_ID_WIDTH);
    if (legacy !== stored && PRE_LADDER_KINDS.includes(s.kind)) {
      if (!legacyIndex.has(legacy)) legacyIndex.set(legacy, []);
      (legacyIndex.get(legacy) as GeneratedStory[]).push(s);
    }
  }

  const existingByStoryId = new Map(existingStories.map((s) => [s.story_id, s]));

  /**
   * The existing row for a generated story, matching the WIDE id first and the legacy truncated
   * id second.
   *
   * Found by running this planner against a snapshot of real production rows, which reported 17
   * stories as unrecognised. They are not unrecognised: `story_id` was `varchar(60)` when they
   * were written, so the database holds
   * `curriculum.CAP.certification_item_rubric_review_and_improvem` while the generator produces
   * `...improvement`. Matching only the wide form would have left those 17 behind under a
   * superseded release and inserted a fresh duplicate of each beside them -- 17 interns' stories
   * orphaned, silently, with the new rows looking perfectly correct.
   *
   * No fixture could have caught this. The pre-migration fixture in the unit tests generates its
   * ids with today's width, so they match by construction. Only the real rows disagree.
   */
  const existingFor = (stored: string, s: GeneratedStory): ExistingStory | undefined => {
    const exact = existingByStoryId.get(stored);
    if (exact) return exact;

    if (!PRE_LADDER_KINDS.includes(s.kind)) return undefined;
    const legacy = s.story_id.slice(0, LEGACY_STORY_ID_WIDTH);
    if (legacy === stored) return undefined;
    const row = existingByStoryId.get(legacy);
    if (!row) return undefined;

    const candidates = legacyIndex.get(legacy) ?? [];
    if (candidates.length > 1) {
      throw new MigrationRefusedError(
        `the stored story_id '${legacy}' is the ${LEGACY_STORY_ID_WIDTH}-character truncation of `
        + `${candidates.length} different generated stories (${candidates.map((c) => c.story_id).join(', ')}), `
        + 'so which row it belongs to cannot be decided. Widen the id scheme or rename the '
        + 'capability rather than letting this pick one.',
      );
    }
    return row;
  };

  // Which rows end up in each rung, so positions can be computed once per rung over the union of
  // rows that are moving in and rows being created.
  const rowsByRung = new Map<string, { story_id: string; position: number; id: string }[]>();
  for (const [stored, s] of generated) {
    const rung = s.autonomy_stage;
    if (!rowsByRung.has(rung)) rowsByRung.set(rung, []);
    const existing = existingByStoryId.get(stored);
    (rowsByRung.get(rung) as { story_id: string; position: number; id: string }[]).push({
      story_id: stored,
      position: existing ? existing.position : Number.MAX_SAFE_INTEGER,
      id: existing ? existing.id : derivedStoryId(domainKey, s.story_id),
    });
  }

  const positionOf = new Map<string, number>();
  for (const [rung, rows] of rowsByRung) {
    const order = intendedOrderWithinRung(orderByRung.get(rung) ?? [], rows);
    order.forEach((storyId, i) => positionOf.set(storyId, i));
  }

  const storiesToReparent: StoryToReparent[] = [];
  const storiesToInsert: StoryToInsert[] = [];

  for (const [stored, s] of generated) {
    const rung = s.autonomy_stage;
    const listId = listIdByCluster.get(rung);
    if (!listId) {
      throw new MigrationRefusedError(
        `story '${stored}' needs release '${rung}', which neither exists nor is being created`,
      );
    }
    const position = positionOf.get(stored) ?? 0;
    const existing = existingFor(stored, s);

    if (!existing) {
      storiesToInsert.push({
        id: derivedStoryId(domainKey, s.story_id),
        story_id: stored,
        task_list_id: listId,
        release_key: rung,
        autonomy_stage: rung,
        capability_id: s.capability_id,
        story_kind: s.kind,
        title: s.title.slice(0, 500),
        narrative: s.body,
        build: buildOf(s),
        acceptance: s.acceptance,
        position,
      });
      continue;
    }

    // Value-idempotent: a row already in the right place with the right labels is not rewritten,
    // which is what makes a second run report zero changes rather than rewriting 1,477 rows.
    const unchanged = existing.task_list_id === listId
      && existing.release_key === rung
      && existing.autonomy_stage === rung
      && existing.capability_id === s.capability_id
      && existing.story_kind === s.kind
      && existing.position === position
      && existing.story_id === stored;
    if (unchanged) continue;

    storiesToReparent.push({
      id: existing.id,
      // The FULL id, which repairs the 17 rows written while the column was varchar(60). This is
      // a change to an existing row that the design document did not promise, and it is the right
      // one: the row `id` was already derived from the untruncated string, so writing the full
      // `story_id` makes the row self-consistent, and leaving the truncation in place would mean
      // every future run has to re-do this reconciliation and one capability rename away from two
      // rows sharing an id.
      story_id: stored,
      task_list_id: listId,
      release_key: rung,
      autonomy_stage: rung,
      capability_id: s.capability_id,
      story_kind: s.kind,
      position,
    });
  }

  // Reported so a human can look, never deleted. Nothing an intern has done is removed, and a row
  // the generator stopped producing is exactly the kind of thing that deserves a person's eyes
  // rather than a DELETE.
  // Matched against BOTH id widths, or the 17 legacy-truncated rows would be reported here as
  // strangers while being correctly re-parented above -- a report that contradicts the plan.
  const claimed = new Set([
    ...storiesToReparent.map((s) => s.id),
    ...existingStories.filter((s) => generated.has(s.story_id)).map((s) => s.id),
  ]);
  const unrecognised = existingStories
    .filter((s) => !claimed.has(s.id))
    .map((s) => s.story_id)
    .sort();

  return {
    domain_key: domainKey,
    lists_to_create: listsToCreate,
    lists_to_retitle: listsToRetitle,
    stories_to_reparent: storiesToReparent,
    stories_to_insert: storiesToInsert,
    unrecognised_stories: unrecognised,
    already_migrated: listsToCreate.length === 0 && listsToRetitle.length === 0
      && storiesToReparent.length === 0 && storiesToInsert.length === 0,
  };
}
