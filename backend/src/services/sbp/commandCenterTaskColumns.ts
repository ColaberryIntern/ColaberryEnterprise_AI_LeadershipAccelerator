/**
 * The STORY-000 task-row columns that MUST move together.
 *
 * ── THE DEFECT THIS MODULE EXISTS TO MAKE IMPOSSIBLE ─────────────────────────
 *
 * #1490 raised `COMMAND_CENTER_ACCEPTANCE` from three criteria to five.
 * `backfillStory000Prompt` then swept all 20 published builds and rewrote
 * `student_tasks.build` — the prompt, which renders its "Done means" list from
 * that same constant. It did not touch `student_tasks.acceptance`, because it
 * had never selected that column and did not import the constant. It reported
 * every build updated, and it was telling the truth about the only column it
 * could see.
 *
 * The result, live on 19 of 20 builds: a prompt listing FIVE criteria, a portal
 * checklist reading THREE (`storyVerificationRead` reads the row), and a
 * verifier grading against FIVE (`buildVerificationService` builds its spec
 * from the constant). A student does three things correctly, ticks three boxes,
 * and sits at `submitted 3/5` against two criteria their checklist never showed
 * them, with no way to discover why.
 *
 * ── WHY A SHARED CONSTRUCTOR RATHER THAN "ALSO UPDATE ACCEPTANCE" ────────────
 *
 * Adding the column to that one UPDATE would have fixed this bump and left the
 * next one to chance. The script was not merely missing a column; it was
 * *convergent* on `build` and *non-convergent* on `acceptance` — re-running it
 * any number of times could never repair what it had done, so the defect could
 * only ever be found by a human reading two screens side by side. And because
 * both columns derive from the same constant, the next criteria change
 * reproduces it deterministically rather than by bad luck.
 *
 * So the two columns are now produced by ONE call, and every writer constructs
 * its write from that call's result: `materializeTasks` at publish, and the
 * backfill at migration. There is no longer a place where a writer can hold the
 * prompt without also holding the criteria it renders.
 *
 * ── WHY IT IS NOT IN commandCenterStory.ts ───────────────────────────────────
 *
 * That is where it was asked for, and it would read naturally there. But that
 * file is already ~1,090 lines against a 500-line hard ceiling — grandfathered
 * only until the next change touches it, at which point CLAUDE.md requires a
 * split before new code goes in. A new leaf module beside it is that split
 * taken one piece at a time, and it matches the shape already used for
 * `progressContract`, `profileContract` and `commandCenterLocation`. The import
 * runs one way only, so there is no cycle.
 *
 * Pure. No I/O, no database, no Sequelize — which is also what makes the drift
 * check below testable without standing anything up.
 */
import type { BuildPlan } from './planContract';
import type { Schedule } from './buildSchedule';
import {
  COMMAND_CENTER_ACCEPTANCE,
  COMMAND_CENTER_NARRATIVE,
  COMMAND_CENTER_STORY_ID,
  COMMAND_CENTER_TITLE,
  commandCenterPrompt,
} from './commandCenterStory';

/**
 * Everything about a STORY-000 task row that is derived from the plan and the
 * constants — and therefore everything that goes stale together.
 *
 * Deliberately NOT the whole row. `status`, `verified_at`, `verification_json`,
 * `position`, `due_on` and `due_baseline_on` are per-student facts that a
 * regeneration must never overwrite, and leaving them out of this type is what
 * stops a caller spreading them in by accident.
 */
export interface CommandCenterTaskColumns {
  story_id: string;
  title: string;
  narrative: string;
  /** The prompt the student copies. Renders its Done-means list from `acceptance`. */
  build: string;
  /** The criteria the portal checklist shows and the verifier grades against. */
  acceptance: string[];
}

/**
 * The one place both columns are produced.
 *
 * A fresh `acceptance` array each call, so no caller can reach through and
 * mutate `COMMAND_CENTER_ACCEPTANCE` itself.
 */
export function commandCenterTaskColumns(
  plan: BuildPlan,
  schedule?: Schedule | null,
): CommandCenterTaskColumns {
  return {
    story_id: COMMAND_CENTER_STORY_ID,
    title: COMMAND_CENTER_TITLE,
    narrative: COMMAND_CENTER_NARRATIVE,
    build: commandCenterPrompt(plan, schedule ?? null),
    acceptance: [...COMMAND_CENTER_ACCEPTANCE],
  };
}

/**
 * What a stored row currently holds, as it comes back from the database.
 *
 * `acceptance` is `unknown` on purpose: it is a JSON column, so it arrives as
 * an array from `jsonb`, as a string from a driver that did not parse it, and
 * as null from a row written before the column existed. A signature that
 * claimed `string[]` would be lying about at least two of those.
 */
export interface StoredCommandCenterColumns {
  build?: string | null;
  acceptance?: unknown;
}

export interface CommandCenterColumnDrift {
  needs_update: boolean;
  build_changed: boolean;
  acceptance_changed: boolean;
}

/**
 * Read a JSON acceptance column into the list of criterion strings.
 *
 * Order is preserved and significant — the criteria are displayed in order and
 * `.colaberry/progress.json` is seeded in order, so a reordering is a real
 * change to what the student sees rather than a formatting difference.
 */
export function normaliseAcceptance(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v));
    } catch {
      // Not JSON. A bare string is one stored line, which will never match the
      // criteria list — so this reports drift, which is the safe direction.
    }
    return [value];
  }
  return [];
}

/**
 * Does this stored row still match what the constants and the plan produce?
 *
 * BOTH columns are compared, and that is the entire point. The previous rule
 * was `next === current` on `build` alone, so a row whose prompt was already
 * current and whose criteria were three versions behind reported `unchanged`
 * and was skipped — permanently, on every future run.
 */
export function commandCenterColumnDrift(
  current: StoredCommandCenterColumns,
  next: CommandCenterTaskColumns,
): CommandCenterColumnDrift {
  const build_changed = (current.build ?? '') !== next.build;

  const stored = normaliseAcceptance(current.acceptance);
  const acceptance_changed =
    stored.length !== next.acceptance.length
    || stored.some((line, i) => line !== next.acceptance[i]);

  return { needs_update: build_changed || acceptance_changed, build_changed, acceptance_changed };
}
