/**
 * executionOrchestrator — drives one execution run from claimed to terminal. PURE, no I/O.
 *
 * This is the piece Gate 8 deferred. Gate 8 built the parts — the policy gate, the prompt
 * envelope, the provider seam, the state machine — and deliberately did not wire them
 * together, because the engine behind `ExecutionProvider` had not been written. It has now
 * (`claudeAgentSdkProvider`), so the loop can close.
 *
 * ## Why this is pure, when its whole job is side effects
 *
 * Every effect is injected: the workspace provider, the execution provider, the repository
 * provider, the clock, and a `persist` callback for state transitions. The orchestrator
 * decides *what should happen*; the caller performs it. That split is what makes the
 * sequence testable without a runner, a repository or a database — and the sequence is the
 * part that carries the safety properties.
 *
 * The alternative — an orchestrator that opens its own database handles and shells out —
 * can only be tested by running it, which in practice means it is tested once, by hand,
 * and never again.
 *
 * ## The order is the control
 *
 * 1. **Policy first, before a workspace exists.** A run that violates the default-deny list
 *    must fail at plan time, not after a client's repository has been cloned onto a
 *    machine. `decideExecutionPolicy` refuses anything not on an isolated runner.
 * 2. **Envelope before execute.** The provider receives an assembled prompt and never the
 *    raw materials, so it cannot bypass the §11 region separation.
 * 3. **Workspace destroyed in `finally`.** Not on the success path. An orphaned workspace
 *    holding a client's source is the failure being designed against, and it is most
 *    likely precisely when something has already gone wrong.
 * 4. **Every transition checked against the state machine.** An illegal transition throws
 *    rather than being written, so a run cannot reach `completed` from `provisioning`
 *    because a branch was missed.
 */

import {
  assertTransition,
  isTerminal,
  type ExecutionRunState,
} from './executionRunState';
import { decideExecutionPolicy, type ExecutionCapabilityRequest } from './executionPolicy';
import {
  DEFAULT_EXECUTION_POLICY,
  buildExecutionEnvelope,
  type UntrustedSource,
} from './executionPromptEnvelope';
import type {
  ExecutionProvider,
  RepositoryProvider,
  WorkspaceHandle,
  WorkspaceProvider,
} from './executionProviderContract';
import type { DeliveryRiskLevel } from '../../../modules/delivery/deliveryRiskLevels';

export interface OrchestratedRun {
  runId: string;
  deliveryProjectId: string;
  storyId?: string | null;
  repoUrl: string;
  baseSha: string;
  branch: string;
  riskLevel: DeliveryRiskLevel;
  correlationId: string;
  /** The story contract, already approved. Rendered into the envelope. */
  storyContract: string;
  approvedContract?: string | null;
  approvedDecisions?: string[] | null;
  /** Repository content, client comments, tool output — fenced by the envelope. */
  untrusted?: UntrustedSource[] | null;
  /** Capabilities the run declares. Anything denied refuses the run. */
  capabilities: ExecutionCapabilityRequest;
  maxDurationSeconds: number;
  /** Paths the story declared it would touch. The commit is allowlisted to these. */
  allowedPaths: string[];
}

export interface OrchestratorDeps {
  workspace: WorkspaceProvider;
  execution: ExecutionProvider;
  repository: RepositoryProvider;
  /** Called on every state change. The caller writes it; the orchestrator decides it. */
  persist: (runId: string, from: ExecutionRunState, to: ExecutionRunState, detail?: Record<string, unknown>) => Promise<void>;
  now?: () => Date;
}

export interface OrchestratorResult {
  runId: string;
  finalState: ExecutionRunState;
  states: ExecutionRunState[];
  pullRequestUrl?: string | null;
  filesChanged: string[];
  failureReason?: string | null;
  /** True when a workspace was provisioned and subsequently destroyed. */
  workspaceDestroyed: boolean;
}

/**
 * Run one story to a terminal state.
 *
 * Never throws for an ordinary failure — a refused policy, a failed engine or a timeout all
 * resolve to a terminal state with a reason. An orchestrator that threw would leave the run
 * row in whatever state it was last written to, which is the one outcome the state machine
 * exists to prevent.
 */
export async function orchestrateRun(
  run: OrchestratedRun,
  deps: OrchestratorDeps,
): Promise<OrchestratorResult> {
  const states: ExecutionRunState[] = [];
  let current: ExecutionRunState = 'queued';
  let workspace: WorkspaceHandle | null = null;
  let workspaceDestroyed = false;

  const move = async (to: ExecutionRunState, detail?: Record<string, unknown>) => {
    assertTransition(current, to);
    await deps.persist(run.runId, current, to, detail);
    current = to;
    states.push(to);
  };

  /**
   * The result is assembled here and returned AFTER cleanup, never with `return` inside
   * the try block.
   *
   * JavaScript evaluates a returned object before `finally` runs, so a `return { …,
   * workspaceDestroyed }` captures the flag while it is still false and the cleanup that
   * sets it true arrives too late. That field would then lie on every successful run, and
   * a caller alerting on orphaned workspaces would raise a false alarm each time.
   */
  let result: Omit<OrchestratorResult, 'workspaceDestroyed'> | null = null;

  const fail = async (reason: string, to: ExecutionRunState = 'failed') => {
    await move(to, { failureReason: reason });
    result = {
      runId: run.runId,
      finalState: current,
      states,
      filesChanged: [],
      failureReason: reason,
    };
  };

  // 1. POLICY, before anything is provisioned. A run that crosses the default-deny list
  //    must fail at plan time, not after a client's repository is on a machine.
  const policy = decideExecutionPolicy(run.capabilities);
  if (!policy.allowed) {
    await fail(
      `Execution policy refused the run: ${policy.violations.map((v) => v.rule).join(', ')}`,
    );
    return { ...result!, workspaceDestroyed };
  }

  try {
    // 2. PROVISION at the exact base SHA. A branch name moves under a run.
    await move('provisioning');
    workspace = await deps.workspace.provision({
      repoUrl: run.repoUrl,
      baseSha: run.baseSha,
      branch: run.branch,
      correlationId: run.correlationId,
    });

    // 3. PLAN — assemble the envelope. The provider gets this, never the raw materials.
    await move('planning');
    const envelope = buildExecutionEnvelope({
      systemPolicy: [...DEFAULT_EXECUTION_POLICY],
      approvedContract: run.approvedContract ?? null,
      approvedDecisions: run.approvedDecisions ?? null,
      storyContract: run.storyContract,
      untrusted: run.untrusted ?? null,
    });

    // 4. EXECUTE.
    await move('executing', { redactedSecrets: envelope.redactedCount });
    const outcome = await deps.execution.execute({
      workspace,
      prompt: envelope.prompt,
      riskLevel: run.riskLevel,
      maxDurationSeconds: run.maxDurationSeconds,
      correlationId: run.correlationId,
    });

    if (!outcome.completed) {
      // A ceiling breach is `timed_out`, not `failed`. They need different responses:
      // one is retried with more room, the other is investigated.
      const timedOut = /ceiling|timed out/i.test(outcome.failureReason ?? '');
      await fail(
        outcome.failureReason ?? 'Execution did not complete.',
        timedOut ? 'timed_out' : 'failed',
      );
      // Deliberately NOT an early `return`. A bare return here exits the function with
      // `undefined`, and a `return <object>` would evaluate before `finally` and report a
      // stale `workspaceDestroyed`. Falling through to cleanup is the only shape that
      // gets both right.
    } else {
    // 5. TESTING then VERIFYING. Modelled as distinct states because verification failing
    //    sends a run BACK to executing, which is the whole reason they are not one state.
    await move('testing', { filesChanged: outcome.filesChanged.length });
    await move('verifying');

    // 6. COMMIT and open a pull request. Never a direct push to a protected branch —
    //    work lands via review, which is also what makes a human the boundary.
    const commit = await deps.repository.commit({
      workspace,
      message: `${run.storyId ?? run.runId}: automated delivery execution`,
      allowedPaths: run.allowedPaths,
    });

    let pullRequestUrl: string | null = null;
    if (commit.sha) {
      const pr = await deps.repository.openPullRequest({
        workspace,
        title: `Delivery run ${run.runId}`,
        body: `Automated execution for story ${run.storyId ?? '(none)'} from base ${run.baseSha}.`,
        baseBranch: 'main',
      });
      pullRequestUrl = pr.url;
    }

    await move('completed', { pullRequestUrl, changedPaths: commit.changedPaths });

      result = {
        runId: run.runId,
        finalState: current,
        states,
        pullRequestUrl,
        filesChanged: outcome.filesChanged,
        failureReason: null,
      };
    }
  } catch (err: any) {
    // An unexpected throw still ends in a terminal state. The run row must never be left
    // describing a step that is no longer happening.
    if (!isTerminal(current)) {
      try {
        await move('failed', { failureReason: err?.message ?? String(err) });
      } catch {
        /* transition already impossible; the reason below still surfaces */
      }
    }
    result = {
      runId: run.runId,
      finalState: current,
      states,
      filesChanged: [],
      failureReason: err?.message ?? String(err),
    };
  } finally {
    // 7. DESTROY. In `finally`, not on the success path — an orphaned workspace holding a
    //    client's source is most likely exactly when something already went wrong.
    if (workspace) {
      try {
        await deps.workspace.destroy(workspace.workspaceId);
        workspaceDestroyed = true;
      } catch {
        /* destroy must be safe to call twice and must never mask the real failure */
      }
    }
  }

  // Returned here, after cleanup, so `workspaceDestroyed` reflects what actually happened
  // rather than what was true when the try block finished.
  return { ...result!, workspaceDestroyed };
}
