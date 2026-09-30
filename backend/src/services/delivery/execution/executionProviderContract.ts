/**
 * executionProviderContract — the five replaceable seams of the execution plane.
 *
 * Master plan §5.2: "AI execution engines are replaceable." Gate 0 found that claim is
 * currently aspirational platform-wide (43 files instantiate OpenAI directly), but it is
 * achievable *here* because this is greenfield — so the seam is defined before any engine
 * is wired behind it, not retrofitted afterwards.
 *
 * ## The two decisions these interfaces encode
 *
 * **ESC-3 — `@anthropic-ai/claude-agent-sdk`, not `@anthropic-ai/claude-code`.** The
 * package names are confusable and the distinction is load-bearing: `claude-code` is the
 * CLI; the **Agent SDK** is Claude Code packaged as a library, shipping the agent loop,
 * built-in file/bash/search tools, permissions and sessions, callable as
 * `query(prompt, options)`. A backend driving an agentic coding loop wants the library.
 * (A third thing exists and is *not* what we want: the Messages API Tool Runner, which
 * loops over tools you define and has no built-in tools or filesystem access.)
 *
 * **ESC-4 — GitHub Actions runner.** The Agent SDK is harness-only: it does not host
 * anything, so where it runs is a separate decision. It runs in an ephemeral GitHub
 * Actions runner — off the VPS, per-job token, GitHub's network policy — which is what
 * makes the §Gate 8 default-deny list enforceable (see `executionPolicy.ts`).
 *
 * Together: the SDK is the *engine*, the runner is the *containment*, and this file is
 * the seam between them and the rest of the delivery domain.
 *
 * ## What is deliberately NOT here
 *
 * No `query()` call and no SDK import. Writing Agent SDK bindings from memory is exactly
 * how a plausible-but-wrong integration gets shipped; the call belongs behind
 * `ExecutionProvider` once its documented API has been read. The interface is stable
 * regardless of what fills it, which is the point of defining it first.
 *
 * Types only — no runtime code, so nothing here can fail at boot.
 */

import type { DeliveryRiskLevel } from '../../../modules/delivery/deliveryRiskLevels';

/** Where a run's files live while it executes. */
export interface WorkspaceHandle {
  workspaceId: string;
  /** Absolute path inside the runner. Never a path on the backend host. */
  rootPath: string;
  repoUrl: string;
  baseSha: string;
  branch: string;
}

export interface WorkspaceProvider {
  /**
   * Provision an isolated workspace cloned at an exact base SHA.
   *
   * Pinning the SHA rather than a branch name is what makes a run reproducible and
   * makes its diff reviewable: a branch moves under you between plan and execute.
   */
  provision(input: {
    repoUrl: string;
    baseSha: string;
    branch: string;
    correlationId: string;
  }): Promise<WorkspaceHandle>;

  /**
   * Destroy the workspace. Must be safe to call twice and must run even when the run
   * failed — an orphaned workspace holding a client's source is the failure mode.
   */
  destroy(workspaceId: string): Promise<void>;
}

/** One normalized event from the execution engine. Engine-agnostic by construction. */
export interface ExecutionEvent {
  at: Date;
  kind: 'plan' | 'tool_use' | 'file_change' | 'message' | 'error' | 'complete';
  summary: string;
  /** Never raw secrets; the prompt envelope's redaction applies to this too. */
  detail?: Record<string, unknown> | null;
}

export interface ExecutionOutcome {
  completed: boolean;
  events: ExecutionEvent[];
  filesChanged: string[];
  /** Engine-reported reason when `completed` is false. */
  failureReason?: string | null;
}

export interface ExecutionProvider {
  /** Stable identifier, e.g. `claude_agent_sdk`. Recorded on every run. */
  readonly name: string;

  /**
   * Run one story contract to completion or failure.
   *
   * Takes the assembled prompt rather than raw materials, so the §11 region separation
   * in `executionPromptEnvelope.ts` cannot be bypassed by a provider implementation.
   */
  execute(input: {
    workspace: WorkspaceHandle;
    prompt: string;
    riskLevel: DeliveryRiskLevel;
    /** Hard ceiling. A run that hits it is `timed_out`, never silently truncated. */
    maxDurationSeconds: number;
    correlationId: string;
  }): Promise<ExecutionOutcome>;
}

export interface RepositoryProvider {
  /** Commit the workspace's changes. Content-hash idempotent, path-allowlisted. */
  commit(input: {
    workspace: WorkspaceHandle;
    message: string;
    allowedPaths: string[];
  }): Promise<{ sha: string | null; changedPaths: string[] }>;

  /**
   * Open a pull request. Never pushes to a protected branch — that is a default-deny
   * capability, and it is also what makes a human review the boundary of every change.
   */
  openPullRequest(input: {
    workspace: WorkspaceHandle;
    title: string;
    body: string;
    baseBranch: string;
  }): Promise<{ url: string; number: number }>;
}

export interface BrowserVerificationProvider {
  /** Run the story's browser checks and capture screenshots as evidence. */
  verify(input: {
    workspace: WorkspaceHandle;
    specPaths: string[];
    viewports: Array<{ width: number; height: number; label: string }>;
  }): Promise<{
    passed: boolean;
    screenshotRefs: string[];
    consoleErrors: string[];
  }>;
}

/**
 * Deployment. **Intentionally unimplemented.**
 *
 * Master plan §20 does not authorize production deployment, and
 * `executionPolicy.ts` records `production_deploy` as enforced by `no_provider` — that
 * enforcement is only true while this interface has no implementation. Declaring the
 * shape without filling it keeps the seam honest: the absence is the control.
 */
export interface DeploymentProvider {
  readonly name: string;
  deploy(input: { releaseId: string; approvedByIdentityId: string }): Promise<never>;
}

/** The full provider set an execution orchestrator needs. */
export interface ExecutionProviderSet {
  execution: ExecutionProvider;
  workspace: WorkspaceProvider;
  repository: RepositoryProvider;
  browser?: BrowserVerificationProvider;
  /** Absent by design. See DeploymentProvider. */
  deployment?: never;
}
