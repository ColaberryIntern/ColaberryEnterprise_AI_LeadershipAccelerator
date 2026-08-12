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
import { GateResult, formatViolations, blockingViolations, advisoryViolations, isPublishable } from './planGate';
import { gateAndRepair } from './planRepair';
import { BuildPlan } from './planContract';
import { renderDocs } from './renderDocs';
import { writeDocsToRepo } from './repoWriter';
import { materializePlanAsTasks } from './materializeTasks';
import { hashPlan } from './planHash';
import {
  saveIntake, getIntake, savePlanDraft, getPlan, publishPlan, StoredPlan, BuildIntake,
} from './planStore';
import { getProvisionQueue, getArchitectQueue } from './boundedQueue';
import {
  startJob, awaitDocument, jobNameFor, depthForSize, blueprintForSize, ArchitectError,
} from './architectClient';
import { buildBriefFromAnswers, reinforceNonNegotiables, Answers } from './sharpeningQuestions';

/** Where a build is. Stored on `build_intake.status`. */
export type BuildStatus =
  | 'captured'        // intake saved, nothing generated yet
  | 'researching'     // the Architect is writing the requirements document (~15 min)
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
  /** Answers to the ten sharpening questions, keyed by slot id. */
  answers?: Answers;
  /**
   * Generate the requirements document with the Architect before decomposing
   * (FR-003). Off makes a build ~30s and thinner; on makes it ~15 minutes and
   * chapter-scaffolded. Defaults to the SBP_USE_ARCHITECT env flag.
   */
  useArchitect?: boolean;
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

  // Every in-flight status, not just 'generating'. Adding 'researching' without
  // this would let a re-submit during the ~15-minute Architect phase start a
  // SECOND job — which either 409s on the same job name or races the first one
  // to write the same intake. FR-001 idempotency covers the whole run, not one
  // phase of it.
  const existing = await getIntake(input.projectId);
  if (existing?.status && IN_FLIGHT.has(existing.status as BuildStatus)) {
    log('sbp_build_already_running', correlationId, 'success', {
      projectId: input.projectId, status: existing.status,
    });
    return { projectId: input.projectId, correlationId, status: existing.status as BuildStatus };
  }

  const firstStatus: BuildStatus = useArchitect(input) && !input.document ? 'researching' : 'generating';

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
    status: firstStatus,
    answers: input.answers ?? null,
  });
  log('sbp_build_started', correlationId, 'success', {
    projectId: input.projectId, idea_chars: input.idea.length,
    answered: input.answers ? Object.values(input.answers).filter((v) => (v ?? '').trim()).length : 0,
    architect: firstStatus === 'researching',
  });

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

  return { projectId: input.projectId, correlationId, status: firstStatus };
}

/** Statuses that mean a run is already underway. Re-submitting must not start a second. */
const IN_FLIGHT: ReadonlySet<BuildStatus> = new Set<BuildStatus>(['researching', 'generating']);

/**
 * Ask the Architect for the requirements document.
 *
 * Returns the markdown, or null when the document could not be produced — a
 * failure here degrades the build to brief-only decomposition rather than
 * failing it. That choice is deliberate: a thinner plan is a worse outcome, but
 * losing a student's build entirely because a third-party service was down is a
 * much worse one, and the traceability gate still holds the quality line.
 *
 * Runs on the ARCHITECT queue, not the provision queue — see getArchitectQueue.
 */
async function generateDocument(
  input: StartBuildInput,
  brief: string,
  correlationId: string,
): Promise<{ markdown: string; words: number } | null> {
  const jobName = jobNameFor(input.name, input.projectId);
  const started = Date.now();

  try {
    return await getArchitectQueue().run(async () => {
      const { jobId } = await startJob({
        projectName: jobName,
        requirements: brief,
        depthMode: depthForSize(input.size),
        blueprint: blueprintForSize(input.size),
        correlationId,
      });

      // Persisted before the wait begins, so a backend restart can find a job
      // still running upstream instead of orphaning 15 minutes of work.
      await setArchitectJob(input.projectId, jobId);

      const doc = await awaitDocument(jobId, {
        correlationId,
        onProgress: (s) => log('sbp_architect_progress', correlationId, 'partial', {
          projectId: input.projectId, job_id: jobId, percent: s.percent, phase: s.phase,
        }),
      });

      log('sbp_architect_done', correlationId, 'success', {
        projectId: input.projectId, job_id: jobId, words: doc.words,
        duration_ms: Date.now() - started, quality_warning: Boolean(doc.qualityWarning),
      });
      return { markdown: doc.markdown, words: doc.words };
    }, `architect:${input.projectId}`);
  } catch (err: any) {
    log('sbp_architect_failed', correlationId, 'failure', {
      projectId: input.projectId,
      duration_ms: Date.now() - started,
      error_class: err instanceof ArchitectError ? err.error_class : (err?.error_class ?? 'Error'),
      message: err?.message,
    });
    return null;   // degrade to brief-only, never lose the build
  }
}

/** generate → gate → persist. Never throws to the queue; records the outcome instead. */
async function runGeneration(input: StartBuildInput, correlationId: string): Promise<void> {
  const started = Date.now();
  try {
    const brief = buildBriefText(input);

    // FR-003: the document is built chapter-by-chapter by the Architect. A
    // single completion asked for >=6,000 words returns ~1,450 — measured, not
    // assumed (docs/REQUIREMENTS_GENERATOR_COMPARISON.html).
    let document = input.document ?? '';
    if (!document && useArchitect(input)) {
      await setStatus(input.projectId, 'researching');
      const generated = await generateDocument(input, brief, correlationId);
      if (generated) {
        // Measured on 2026-08-12: a 183k-char expansion of a 2k brief contained
        // the word "approv" zero times, dropping the owner's stated guardrail.
        // Restate the non-negotiables where the model finishes reading.
        const { document: reinforced, reinstated } = reinforceNonNegotiables(
          generated.markdown, input.answers ?? {},
        );
        document = reinforced;
        if (reinstated.length) {
          log('sbp_architect_non_negotiables_reinstated', correlationId, 'partial', {
            projectId: input.projectId, reinstated, document_chars: reinforced.length,
          });
        }
      }
    }
    await setStatus(input.projectId, 'generating');

    const { plan, attempts, model, client } = await decomposeBuild({
      brief,
      document,
      correlationId,
    });

    const source = `${brief}\n${document}`;

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

    // A plan that repair could not make perfect still reaches the student, as
    // long as nothing left is BLOCKING. A lone `story_redundant_scaffold` used
    // to mean an empty Projects page; a slightly redundant story beats no plan.
    const publishable = isPublishable(gate.violations);

    await savePlanDraft(input.projectId, repaired.plan, { gate, model, attempts, correlationId });
    await setStatus(input.projectId, publishable ? 'drafted' : 'gate_failed');

    log('sbp_build_generated', correlationId, gate.ok ? 'success' : 'partial', {
      projectId: input.projectId,
      duration_ms: Date.now() - started,
      attempts,
      requirements: repaired.plan.requirements.length,
      stories: repaired.plan.stories.length,
      document_words: document ? document.trim().split(/\s+/).length : 0,
      repair_attempts: repaired.attempts,
      repair_rejected: repaired.rejected,
      repaired_stories: repaired.changed.flat(),
      gate_ok: gate.ok,
      publishable,
      violations: gate.violations.length,
      blocking: blockingViolations(gate.violations).map((v) => v.rule),
      advisory: advisoryViolations(gate.violations).map((v) => v.rule),
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
  // The ten sharpening answers supersede the four legacy fields when present.
  // They carry the CONSTRAINT framing and the falsifiable success measure that
  // the four fields never did — see sharpeningQuestions.buildBriefFromAnswers.
  if (input.answers && Object.values(input.answers).some((v) => (v ?? '').trim())) {
    return buildBriefFromAnswers(input.idea, input.answers, input.targetWeeks);
  }

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

/**
 * Record the Architect job id against the intake BEFORE the 15-minute wait, so a
 * restart can resume rather than orphan the job (FR-005). Best-effort: failing
 * to note the id must not abort a document that is already being written.
 */
async function setArchitectJob(projectId: string, jobId: string): Promise<void> {
  try {
    const intake = await getIntake(projectId);
    if (!intake) return;
    await saveIntake({ ...(intake as BuildIntake), project_id: projectId, architect_job_id: jobId } as BuildIntake);
  } catch (err: any) {
    console.warn(JSON.stringify({
      level: 'warn', service: 'sbp-orchestrator', event: 'architect_job_id_not_persisted',
      context: { projectId, jobId, message: err?.message },
    }));
  }
}

/**
 * Whether to run the Architect. Per-build override wins; otherwise the env flag.
 * Defaults OFF so deploying this changes nothing until it is switched on — the
 * same rollout discipline as SBP_PIPELINE_ENABLED.
 */
function useArchitect(input: StartBuildInput): boolean {
  if (typeof input.useArchitect === 'boolean') return input.useArchitect;
  return String(process.env.SBP_USE_ARCHITECT || '').toLowerCase() === 'true';
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
  // Refuse only on BLOCKING violations. "Published" still means every must-have
  // is covered, every reference resolves, and r0 is startable — the invariant
  // that makes the word worth anything. It no longer means "stylistically
  // perfect", because enforcing that stranded students with nothing at all.
  const blocking = blockingViolations((draft.gate_violations as any) ?? []);
  if (blocking.length > 0) {
    const e: any = new Error(
      `this plan cannot be published: ${blocking.map((b) => b.message).join('; ')}`,
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
