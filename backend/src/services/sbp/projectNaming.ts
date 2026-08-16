/**
 * projectNaming — the one place that decides what a student's project is CALLED.
 *
 * WHY THIS EXISTS
 *
 * Every project is supposed to have a real name, chosen by the student, used
 * everywhere the platform refers to it. Measured on 2026-08-16 in production:
 * all 20 student builds had `projects.name IS NULL`, so the portal rendered the
 * generic literal "Your build" for every one of them.
 *
 * The name was never missing. `build_intake.name` held the student's own answer
 * for 15 of those 20 builds, and the generated plan carried a `project_name` for
 * all 20. The hand-off simply did not exist: `startBuild` wrote the name into
 * `build_intake` (sbpOrchestrator, `saveIntake`) and nothing downstream ever
 * read it. `buildBriefText` — which assembles everything the decomposer is told
 * about the project — enumerates idea, answers, users, data sources, done
 * definition and schedule, and omits `name`. So the student's chosen name was
 * captured, stored, and then dropped on the floor between intake and project.
 *
 * ── PRECEDENCE, AND WHY IT IS A DATABASE GUARD RATHER THAN AN IF ─────────────
 *
 * 1. What the student typed at intake (`build_intake.name`).
 * 2. Failing that, the plan's own `project_name`, which exists by the time a
 *    build publishes and is derived from the student's idea.
 * 3. Failing that, NOTHING. No template, no "Project 4", no invented name. A
 *    row that cannot be named from the student's own words stays NULL and is
 *    reported, because a name the student does not recognise is worse than the
 *    honest fallback the UI already has.
 *
 * That order is not enforced by branching on which source is present. It falls
 * out of `setProjectNameIfEmpty`, whose UPDATE is guarded on the name being
 * empty: intake runs first (at `startBuild`) and wins; publish runs later and
 * only fills a gap intake left. The same guard is what makes this safe to run
 * against a live cohort — a name a student has already set is unreachable by
 * every writer here, including the backfill.
 *
 * ── AND WHERE THAT PRECEDENCE IS WRONG ───────────────────────────────────────
 *
 * "The student's own words" is the right default only when the student actually
 * chose a name. Two of the twenty live builds show it failing:
 *
 *   - Regina Asafor's intake name is "my AI email triage project", and her
 *     stored *idea* is character-for-character the wizard's placeholder
 *     (ProjectWizard.tsx:108) minus the "e.g. " prefix — she typed the example
 *     back in. Demo text is not an answer, so the name beside it is not a name.
 *   - Million Meshesha's intake name, "Automated meeting minutes and action
 *     tracking", describes what the build does rather than naming it.
 *
 * A rule cannot tell those apart from a real answer, and a model guessing at it
 * would be a second thing to review. So a human decides, and says so, through
 * `ProjectNameOverride` — see below. NOTHING IS GENERATED IN THIS FILE. There is
 * no model call anywhere in it.
 */
import { sequelize } from '../../config/database';

/**
 * Cap, matching `build_intake.name VARCHAR(200)`.
 *
 * `projects.name` is unbounded TEXT in production, so this is not a storage
 * limit — it is a sanity limit. The plan's `project_name` comes from a model,
 * and an unbounded model field is exactly the kind of thing that arrives as a
 * paragraph once a year and blows out a heading that was designed for a phrase.
 */
export const MAX_PROJECT_NAME_LENGTH = 200;

/**
 * Where a name came from. Reported so a reviewer can see it, not inferred.
 *
 *   - `intake` / `plan`  — the two derived sources, in precedence order.
 *   - `operator`         — a name a human typed at the command line.
 *   - `operator-skip`    — a human said "leave this one NULL", deliberately.
 *   - `unmet`            — a human asked for a source this project does not
 *                          have. Resolves to NULL and blocks the write; it is
 *                          NOT a quiet fall back onto the rejected source.
 *   - `none`             — nothing to name it from, and nobody asked for one.
 */
export type ProjectNameSource =
  | 'intake' | 'plan' | 'operator' | 'operator-skip' | 'unmet' | 'none';

export interface ProjectNameCandidates {
  /** `build_intake.name` — what the student typed. */
  intakeName?: string | null;
  /** `build_plans.plan_json.project_name` — what the plan calls itself. */
  planName?: string | null;
}

export interface DerivedProjectName {
  name: string | null;
  source: ProjectNameSource;
}

/**
 * A single hand decision about a single project, supplied by the operator.
 *
 * WHY THIS SHAPE. The alternative was two hardcoded project ids in the backfill
 * — which fixes today, and buys a code change, a review and a deploy for the
 * next name a human looks at and disagrees with. An override is data the
 * operator passes in, so the next hand decision costs one argument.
 *
 * Three of the four kinds select an EXISTING source rather than supplying text,
 * because the honest fix for both live cases was "use the other column we
 * already have". `literal` exists for the case neither column covers, and is
 * reported distinctly wherever it is used precisely because it is the one kind
 * that puts words on a student's screen that no student and no plan wrote.
 */
export type ProjectNameOverride =
  | { kind: 'plan' }
  | { kind: 'intake' }
  | { kind: 'skip' }
  | { kind: 'literal'; name: string };

/**
 * Trim, collapse and bound a candidate name; `null` when nothing survives.
 *
 * Whitespace-only input returning `null` rather than `''` is load-bearing on
 * both sides of the wire. A `' '` name is truthy in JavaScript, so it survives
 * every `name || fallback` in the frontend and then renders as an empty
 * heading — a card with no title at all, which is strictly worse than the
 * fallback it defeated. Normalising to `null` here means that value never
 * reaches the column in the first place.
 */
export function normalizeProjectName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    // Control characters, including the newlines a pasted name arrives with.
    // Written as escapes, never as the literal bytes: a raw NUL in a source
    // file makes git treat it as binary, which makes the diff unreviewable.
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    // Any run of whitespace becomes one space: "Goal   Kick" is one name.
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  return cleaned.slice(0, MAX_PROJECT_NAME_LENGTH).trim();
}

/**
 * Parse one operator override spec, as typed on the command line.
 *
 *   plan | intake | skip | name:<some name>
 *
 * Returns `null` for anything else, and the caller MUST report that rather than
 * dropping it. Two failure modes are deliberately closed here:
 *
 *   - An unrecognised word is never treated as a literal name. If `plann` fell
 *     through to text, one slipped finger would put the word "plann" on a
 *     student's project card, having passed every guard in the system.
 *   - A blank literal is rejected rather than normalised to nothing, so
 *     `name:` cannot silently become "no override at all".
 */
export function parseProjectNameOverride(spec: unknown): ProjectNameOverride | null {
  if (typeof spec !== 'string') return null;
  const raw = spec.trim();
  if (/^name:/i.test(raw)) {
    const name = normalizeProjectName(raw.slice('name:'.length));
    return name ? { kind: 'literal', name } : null;
  }
  switch (raw.toLowerCase()) {
    case 'plan': return { kind: 'plan' };
    case 'intake': return { kind: 'intake' };
    case 'skip': return { kind: 'skip' };
    default: return null;
  }
}

/**
 * Apply the precedence above to a set of candidates, or an operator override to
 * the same candidates. Pure — no I/O — so the backfill and the live pipeline can
 * share it and be tested without a database.
 *
 * With no override the behaviour is exactly what it was: intake, then plan, then
 * nothing. The live pipeline never passes one; overrides are an operator concept
 * belonging to the backfill.
 *
 * An override that selects a source the project does not have resolves to
 * `unmet`, NOT to the next source down. That distinction is the whole point:
 * `plan` means "do not use the intake name", so falling back to intake when the
 * plan is empty would write the exact value the operator overrode — the original
 * defect, wearing the override as a hat.
 */
export function deriveProjectName(
  candidates: ProjectNameCandidates,
  override?: ProjectNameOverride,
): DerivedProjectName {
  const intake = normalizeProjectName(candidates.intakeName);
  const plan = normalizeProjectName(candidates.planName);

  if (override) {
    switch (override.kind) {
      case 'skip':
        return { name: null, source: 'operator-skip' };
      case 'literal': {
        const literal = normalizeProjectName(override.name);
        return literal ? { name: literal, source: 'operator' } : { name: null, source: 'unmet' };
      }
      case 'plan':
        return plan ? { name: plan, source: 'plan' } : { name: null, source: 'unmet' };
      case 'intake':
        return intake ? { name: intake, source: 'intake' } : { name: null, source: 'unmet' };
    }
  }

  if (intake) return { name: intake, source: 'intake' };
  if (plan) return { name: plan, source: 'plan' };
  return { name: null, source: 'none' };
}

/**
 * Set `projects.name` only if it is not already set. Returns true when this call
 * is the one that named the project.
 *
 * The WHERE clause carries the whole safety argument:
 *
 *   - `name IS NULL OR btrim(name) = ''` — a name a student already chose is
 *     never overwritten, by this path or by the backfill. Re-running is a no-op,
 *     which is what makes the backfill idempotent and the publish path safe to
 *     retry (publish is explicitly designed to be re-runnable).
 *   - The blank test is `btrim(name) = ''` rather than `name = ''` because a
 *     row that already holds `' '` is the broken state this function exists to
 *     prevent, and it must be repairable rather than treated as "already named".
 *
 * Never throws. A project without a name renders the fallback; a publish that
 * fails because of a cosmetic column would cost the student their build. The
 * caller logs the outcome.
 */
export async function setProjectNameIfEmpty(projectId: string, rawName: unknown): Promise<boolean> {
  const name = normalizeProjectName(rawName);
  if (!name) return false;
  // `updated_at` is set deliberately and it does exist on this table (verified
  // against production, 2026-08-16). The sibling statement in this pipeline —
  // `makeActiveProject` — shipped naming a column `enrollments` does not have,
  // threw on every publish, and was swallowed by its own catch; see
  // sbpOrchestrator.activeProject.test.ts. PROJECT_NAME_COLUMNS below is what
  // holds this statement to the same standard.
  const [rows]: any = await sequelize.query(
    `UPDATE projects SET name = $name, updated_at = NOW()
      WHERE id = $pid AND (name IS NULL OR btrim(name) = '')
      RETURNING id`,
    { bind: { pid: projectId, name } },
  );
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * Every column `setProjectNameIfEmpty` writes or filters on. Asserted against
 * the real Project model by projectNaming.columns.test.ts, so a column that does
 * not exist cannot reach production the way `enrollments.updated_at` did.
 */
export const PROJECT_NAME_COLUMNS = ['name', 'updated_at', 'id'] as const;
