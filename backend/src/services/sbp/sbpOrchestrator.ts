/**
 * sbpOrchestrator — the chain that turns a student's idea into a buildable plan.
 *
 * Everything else in services/sbp/ is a correct, tested component that nothing
 * called. This is what calls them, in order:
 *
 *   intake → generate → gate → repair → persist(draft) → [review] → publish
 *          → render → commit to the workspace repo
 *
 * Two design rules the pilot taught us the hard way:
 *
 *  1. **Generate once.** The draft is written at generation and `publish`
 *     promotes THAT row. The pilot regenerated between review and commit, which
 *     is how a reviewed 6/3/1/1/1 plan shipped as 8/1/1/1/1.
 *  2. **Fail closed, and say why.** A plan that cannot pass the gate is never
 *     persisted as publishable. The violations are stored so the student sees
 *     what is missing rather than a spinner that stops.
 *
 * Generation is minutes long, so `startBuild` returns immediately and the work
 * runs on the bounded queue. State lives in `build_intake.status` and
 * `build_plans`, so a restart loses progress but never leaves a half-built plan
 * — the intake is always replayable.
 */
import { randomUUID } from 'crypto';
import { decomposeBuild } from './decomposeService';
import { GateResult, formatViolations } from './planGate';
import { gateAndRepair } from './planRepair';
import { BuildPlan } from './planContract';
import { renderDocs } from './renderDocs';
import { writeDocsToRepo } from './repoWriter';
import { materializePlanAsTasks } from './materializeTasks';
import { hashPlan } from './planHash';
import {
  saveIntake, getIntake, savePlanDraft, getPlan, publishPlan, StoredPlan, BuildIntake,
} from './planStore';
import { getProvisionQueue } from './boundedQueue';

/** Where a build is. Stored on `build_intake.status`. */
export type BuildStatus =
  | 'captured'        // intake saved, nothing generated yet
  | 'generating'      // a model call is in flight
  | 'gate_failed'     // generated, but the plan has violations — not publishable
  | 'drafted'         // generated and gate-clean, awaiting review
  | 'published'       // promoted; documents written if a repo exists
  | 'awaiting_repo'   // published, but no repo to write documents into
  | 'failed';         // generation itself failed; intake is replayable

export interface BuildState {
  projectId: string;
  status: BuildStatus;
  correlationId: string | null;
  plan: StoredPlan | null;
  gate: GateResult | null;
  /** Present when status is 'failed'. */
  error?: { error_class: string; message: string };
}

function log(event: string, correlationId: string | null, outcome: string, ctx: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'sbp-orchestrator',
    event,
    correlation_id: correlationId,
    outcome,
    context: ctx,
  }));
}

export interface StartBuildInput {
  projectId: string;
  enrollmentId: string;
  idea: string;
  name?: string;
  size?: string;
  users?: string;
  dataSources?: string;
  doneDefinition?: string;
  targetWeeks?: number;
  /** The expanded requirements document, when one exists. Optional: the brief alone works. */
  document?: string;
}

/**
 * Capture the intake and start generation. Returns as soon as the intake is
 * durable — generation continues on the queue.
 *
 * Idempotent on `projectId`: re-submitting updates the intake rather than
 * stacking, and a build already generating is not started twice.
 */
export async function startBuild(input: StartBuildInput): Promise<{ projectId: string; correlationId: string; status: BuildStatus }> {
  const correlationId = randomUUID();

  const existing = await getIntake(input.projectId);
  if (existing?.status === 'generating') {
    log('sbp_build_already_running', correlationId, 'success', { projectId: input.projectId });
    return { projectId: input.projectId, correlationId, status: 'generating' };
  }

  await saveIntake({
    project_id: input.projectId,
    enrollment_id: input.enrollmentId,
    idea: input.idea,
    name: input.name ?? null,
    size: input.size ?? 'project',
    users: input.users ?? null,
    data_sources: input.dataSources ?? null,
    done_definition: input.doneDefinition ?? null,
    target_weeks: input.targetWeeks ?? null,
    correlation_id: correlationId,
    status: 'generating',
  });
  log('sbp_build_started', correlationId, 'success', { projectId: input.projectId, idea_chars: input.idea.length });

  // Bounded: a cohort starting together queues rather than fanning out. The
  // promise is deliberately not awaited — the caller gets its answer now — but
  // it is never unhandled, because a lost rejection is how a build silently dies.
  void getProvisionQueue()
    .run(() => runGeneration(input, correlationId), `generate:${input.projectId}`)
    .catch((err) => {
      log('sbp_build_queue_failed', correlationId, 'failure', {
        projectId: input.projectId, error_class: err?.error_class ?? 'Error', message: err?.message,
      });
    });

  return { projectId: input.projectId, correlationId, status: 'generating' };
}

/** generate → gate → persist. Never throws to the queue; records the outcome instead. */
async function runGeneration(input: StartBuildInput, correlationId: string): Promise<void> {
  const started = Date.now();
  try {
    const { plan, attempts, model, client } = await decomposeBuild({
      brief: buildBriefText(input),
      document: input.document ?? '',
      correlationId,
    });

    const source = `${buildBriefText(input)}\n${input.document ?? ''}`;

    // The gate is strict by design, so a first pass usually has a gap — the
    // first live run produced 3 violations. Repair closes them in place rather
    // than failing the student at the first one: without it a build stops at
    // "your plan has a gap" with no way forward, which is a worse experience
    // than the generic template this replaced.
    const repaired = await gateAndRepair(plan, source, {
      client, model, correlationId,
      onAttempt: (attempt, violations) => log('sbp_build_repairing', correlationId, 'partial', {
        projectId: input.projectId, attempt, violations,
      }),
    });
    const gate = repaired.gate;

    await savePlanDraft(input.projectId, repaired.plan, { gate, model, attempts, correlationId });
    await setStatus(input.projectId, gate.ok ? 'drafted' : 'gate_failed');

    log('sbp_build_generated', correlationId, gate.ok ? 'success' : 'partial', {
      projectId: input.projectId,
      duration_ms: Date.now() - started,
      attempts,
      requirements: repaired.plan.requirements.length,
      stories: repaired.plan.stories.length,
      repair_attempts: repaired.attempts,
      repair_rejected: repaired.rejected,
      repaired_stories: repaired.changed.flat(),
      gate_ok: gate.ok,
      violations: gate.violations.length,
    });
    if (!gate.ok) console.log(formatViolations(gate));
  } catch (err: any) {
    await setStatus(input.projectId, 'failed').catch(() => { /* status write must not mask the real error */ });
    log('sbp_build_failed', correlationId, 'failure', {
      projectId: input.projectId,
      duration_ms: Date.now() - started,
      error_class: err?.error_class ?? 'Error',
      message: err?.message,
    });
  }
}

/**
 * The brief the decomposer treats as ground truth. Assembled from the wizard's
 * answers rather than the idea alone, because the sharpening questions are
 * exactly the detail the pilot dropped.
 */
export function buildBriefText(input: StartBuildInput): string {
  const parts = [input.idea.trim()];
  if (input.users) parts.push(`WHO USES IT: ${input.users}`);
  if (input.dataSources) parts.push(`DATA SOURCES IT MUST CONNECT TO: ${input.dataSources}`);
  if (input.doneDefinition) parts.push(`WHAT DONE LOOKS LIKE (the guardrail): ${input.doneDefinition}`);
  // Scheduling context only. Phrased so it shapes release week ranges without
  // becoming a requirement — the first live run turned "TIMELINE: 6 weeks" into
  // REQ-016 "The system must be deployed within 6 weeks", which no story can
  // fulfil and which the coverage rule then flagged as an uncovered must-have.
  if (input.targetWeeks) {
    parts.push(
      `SCHEDULE (context for release planning, NOT a requirement — do not emit a requirement about the timeline): ` +
      `fit the releases into ${input.targetWeeks} weeks.`,
    );
  }
  return parts.join('\n\n');
}

async function setStatus(projectId: string, status: BuildStatus): Promise<void> {
  const intake = await getIntake(projectId);
  if (!intake) return;
  await saveIntake({ ...(intake as BuildIntake), project_id: projectId, status });
}

/** Current state of a build, for polling. */
export async function getBuildState(projectId: string): Promise<BuildState | null> {
  const intake = await getIntake(projectId);
  if (!intake) return null;
  const plan = await getPlan(projectId);
  return {
    projectId,
    status: (intake.status as BuildStatus) ?? 'captured',
    correlationId: intake.correlation_id ?? null,
    plan,
    gate: plan ? { ok: plan.gate_ok, violations: (plan.gate_violations as any) ?? [] } : null,
  };
}

export interface PublishResult {
  status: BuildStatus;
  planVersion: number;
  /** Null when there is no repo to write into. */
  commitSha: string | null;
  filesWritten: number;
  repoUrl: string | null;
}

/**
 * Promote the reviewed draft and write its documents into the workspace repo.
 *
 * Refuses a plan that has not passed the gate — "published" must mean every
 * must-have requirement is covered, or the word is worthless. Refuses too if the
 * plan changed since review (`expectedSha`).
 */
export async function publishBuild(
  projectId: string,
  opts: { enrollmentId: string; expectedSha?: string; repo?: { owner: string; repo: string; url: string } | null },
): Promise<PublishResult> {
  const draft = await getPlan(projectId);
  if (!draft) {
    const e: any = new Error('no plan to publish'); e.status = 404; throw e;
  }
  if (!draft.gate_ok) {
    const e: any = new Error(
      'this plan has unresolved gate violations and cannot be published — regenerate or repair it first',
    );
    e.status = 409;
    throw e;
  }

  const published = await publishPlan(projectId, draft.version, opts.expectedSha);
  const correlationId = published.correlation_id;

  if (!opts.repo) {
    // No repo yet, but the plan must still reach the portal — otherwise a
    // student completes a build and sees nothing change on screen, which is the
    // exact failure this pipeline was built to fix. Prompts fall back to
    // inlining their context instead of citing paths (FR-031).
    const m = await materializePlanAsTasks(projectId, opts.enrollmentId, published.plan as BuildPlan, {});
    await setStatus(projectId, 'awaiting_repo');
    log('sbp_build_published_no_repo', correlationId, 'partial', {
      projectId, version: published.version, lists: m.lists, tasks: m.tasks,
    });
    return { status: 'awaiting_repo', planVersion: published.version, commitSha: null, filesWritten: 0, repoUrl: null };
  }

  const files = renderDocs(published.plan as BuildPlan, {
    repoUrl: opts.repo.url,
    generatedAt: new Date().toISOString(),
    planVersion: published.version,
    planSha256: published.plan_sha256,
    correlationId: correlationId ?? undefined,
  });

  const write = await writeDocsToRepo(
    { owner: opts.repo.owner, repo: opts.repo.repo },
    files,
    null,   // TODO(step 6): read the existing manifest so conflict detection can run
    { correlationId: correlationId ?? undefined },
  );

  // Materialize AFTER the write, so prompts can cite paths now proven to exist.
  const materialized = await materializePlanAsTasks(projectId, opts.enrollmentId, published.plan as BuildPlan, {
    repoUrl: opts.repo.url,
    manifestPaths: files.map((f) => f.path),
  });

  await setStatus(projectId, 'published');
  log('sbp_build_published', correlationId, 'success', {
    projectId, version: published.version, commit: write.commitSha, files: write.changedPaths.length,
    lists: materialized.lists, tasks: materialized.tasks, preserved_complete: materialized.preservedComplete,
  });

  return {
    status: 'published',
    planVersion: published.version,
    commitSha: write.commitSha ?? null,
    filesWritten: write.changedPaths.length,
    repoUrl: opts.repo.url,
  };
}

/** Verify the stored plan still hashes to what a reviewer was shown. */
export function planMatchesReviewed(plan: BuildPlan, expectedSha: string): boolean {
  return hashPlan(plan) === expectedSha;
}
