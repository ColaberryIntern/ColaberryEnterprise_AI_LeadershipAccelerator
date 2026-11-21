/**
 * connectedDemoFlag - who gets STORY-900, and who keeps it.
 *
 * ## Two questions, not one, and the difference is the whole module
 *
 * There is a WRITE decision and a READ decision, and conflating them is how a student ends up
 * with a task on their board that nothing will ever verify or pay.
 *
 *   WRITE: "should this build GET a Connected Demo story?" -> the env flag, per enrollment.
 *          Asked once, at publish, by `sbpOrchestrator`.
 *   READ:  "does this build HAVE a Connected Demo story?" -> the board row, per project.
 *          Asked by every surface that renders the doc, prices the story, or judges it.
 *
 * If the read path asked the env flag instead, turning the flag off would orphan every demo
 * already materialized: the row stays on the board, the doc stops being rendered, and
 * `planStorySpecs` stops emitting a spec, so the verifier has nothing to grade. The student can
 * build it, push it, and never be credited. That is not hypothetical - it is the defect Quincy
 * Ninying found by reading `storyPoints.ts`, where the verifier appended a story id that could
 * not exist on domain boards, logged `sbp_verification_task_missing`, and silently cost the first
 * task of every domain release its points. The lesson written in that file's header is: resolve
 * it from the PROJECT, do not assume it from a setting. This module is that lesson applied one
 * feature further on.
 *
 * Turning the flag back off is therefore a rollout control, not an undo. It stops NEW builds from
 * getting a demo; it does not retract one a student is already working on. To retract, delete the
 * row (`StudentTask` where `story_id = 'STORY-900'`), which is a deliberate act with an audit
 * trail rather than a side effect of an env var.
 *
 * ## What the dilution costs, stated plainly
 *
 * Story pay is a per-build budget split evenly across the stories the verifier judges
 * (`storyPoints.ts`), so a build that gains STORY-900 pays slightly less per story. That is
 * accepted: the alternative is a story that is built and pushed for nothing, which is the gap
 * Ali's 2026-11-20 decision 4 exists to close. It also means the rate moves when the row appears,
 * which is the same thing that already happens when a plan gains a story.
 */
import { CONNECTED_DEMO_STORY_ID } from './connectedDemoStory';

/**
 * Is the Connected Demo on for this enrollment?
 *
 * `SBP_CONNECTED_DEMO` is 'off' (the default), 'all', or a comma-separated list of enrollment ids.
 * The same three-way shape as `SBP_AGENT_SCOPING` and `PROJECT_APPROVAL_GATE`, deliberately: this
 * codebase has one convention for "narrow a rollout to named accounts" and a second one would be
 * a second thing to get wrong.
 *
 * OMITTING THE SETTING MEANS OFF. Deploying this changes nothing for anybody until somebody sets
 * the variable, which is the only honest default for a step that adds a task to a student's board
 * mid-cohort.
 */
export function connectedDemoEnabledFor(
  enrollmentId: string | null | undefined,
  setting: string | null | undefined,
): boolean {
  const v = (setting || 'off').trim();
  if (v === 'off' || v === '') return false;
  if (v === 'all') return true;
  if (!enrollmentId) return false;
  return v.split(',').map((s) => s.trim()).filter(Boolean).includes(enrollmentId);
}

function warn(event: string, context: Record<string, unknown>, err?: unknown): void {
  const e = err as Error | undefined;
  console.warn(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'warn',
    service: 'sbp-connected-demo',
    event,
    outcome: 'partial',
    error_class: e ? (e?.constructor?.name ?? 'Error') : undefined,
    context: { ...context, message: e?.message },
  }));
}

/**
 * Does this project already carry the Connected Demo story on its board?
 *
 * THE source of truth for every read path. A row exists only because a publish decided it should,
 * so this answer survives the env flag changing underneath it.
 *
 * Fails SOFT to false, and the choice is reasoned rather than reflexive. Verification, pricing and
 * document refresh all run repeatedly on a schedule. A throw here would take down a whole
 * verification run, paying nothing for ANY story on the build; returning false degrades exactly
 * one story and the next run pays it. The failure is logged with its `error_class` so it is
 * visible rather than absorbed, which is what separates this from the silent-swallow CLAUDE.md
 * forbids.
 */
export async function connectedDemoMaterializedFor(projectId: string | null | undefined): Promise<boolean> {
  if (!projectId) return false;
  try {
    /*
     * Imported HERE, not at module scope, and the reason is measured rather than stylistic.
     *
     * `models/StudentTask.ts` calls `StudentTask.init(...)` at load, which needs a real
     * `sequelize.define`. Importing it at the top of this file made it a load-time dependency of
     * everything that imports this module - including `sbpOrchestrator` - and five existing
     * suites that mock `config/database` as `{ sequelize: { query } }` stopped being able to run
     * at all: `TypeError: Cannot read properties of undefined (reading 'define')`. A rollout flag
     * must not dictate how unrelated suites mock the database. `publishBuild` already uses this
     * pattern for `lifecycleReadinessHook`, so it is the house precedent, not an invention.
     */
    const { default: StudentTask } = await import('../../models/StudentTask');
    const n = await StudentTask.count({
      where: { project_id: projectId, story_id: CONNECTED_DEMO_STORY_ID },
    });
    return n > 0;
  } catch (err) {
    warn('connected_demo_row_lookup_failed', { projectId, fell_back_to: false }, err);
    return false;
  }
}

/**
 * The WRITE-path answer: render and materialize the demo for this publish?
 *
 * `enabled OR already materialized`, and the second half is load-bearing. A republish of a build
 * that already has the row must keep rendering STORY-900.md even if the flag has since been turned
 * off for that enrollment, or the student is left holding a task whose instructions have
 * disappeared from their repository. The row is the commitment; the flag only decides whether to
 * make one.
 */
export async function connectedDemoForPublish(
  projectId: string | null | undefined,
  enrollmentId: string | null | undefined,
  setting: string | null | undefined,
): Promise<boolean> {
  if (connectedDemoEnabledFor(enrollmentId, setting)) return true;
  return connectedDemoMaterializedFor(projectId);
}
