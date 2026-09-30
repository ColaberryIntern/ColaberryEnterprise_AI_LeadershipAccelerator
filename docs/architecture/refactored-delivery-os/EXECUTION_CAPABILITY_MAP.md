# Execution Capability Map

**Session:** CC-20260823-r4k9 · **Base:** `d1d46d1e` · **Gate:** 0

What exists today that Gate 8 (Execution Plane + Claude Code) can stand on, what does not
exist, and the two decisions that are Ali's rather than Claude's.

---

## 1. Claude Code: not integrated

| Probe | Result |
|---|---|
| `@anthropic-ai/claude-code` in any `package.json` | **absent** |
| Claude Agent SDK | **absent** |
| `claude-code` / `ClaudeCode` symbol in `backend/src`, `frontend/src` | **absent** |
| `@anthropic-ai/sdk` | present, `^0.106.0` (backend) |

The only file whose name suggests otherwise is
`backend/src/services/intel/sources/claude_code_technique.ts` — a curriculum content
source that publishes Claude Code tips to the student feed. It is not an execution
integration.

### E-01 — Escalation: the SDK is a new external dependency

Master plan §Gate 8: *"Use official Claude Code SDK/headless mode if approved and
available. Do NOT rebuild Claude Code through raw Messages API unless SDK use is
impossible."*

Root `CLAUDE.md` lists "External dependency introduction" under **Strategic decisions
(ESCALATE)**. The plan's own instruction says "if approved" — so the plan defers to
exactly this escalation rather than granting it.

**Recommendation:** adopt the official SDK. Rebuilding an agentic coding loop on raw
Messages API means reimplementing tool dispatch, file editing, permission gating and
session resumption — all of which are the parts that carry the security requirements in
master plan §11. The `ExecutionProvider` interface keeps the dependency behind one seam,
so the decision stays reversible.

**Decision required from Ali.** Not taken here.

---

## 2. Sandbox: `previewStackService.ts` already does most of this

398 lines. Its own header states the responsibilities:

> - Manage the lifecycle of per-project preview stacks (isolated docker-compose
>   environments booted from the user's own repo).
> - Allocate ports from a reserved pool.
> - Clone the project's repo using its GitHub access token.
> - Boot / stop / teardown the stack via `docker compose`.
> - Record state transitions on `PreviewStack` + `PreviewEvent`.

Supporting: `models/PreviewStack.ts`, `models/PreviewEvent.ts`,
`routes/admin/previewStackRoutes.ts`, `docs` under `/preview-db-init`.

Mapped against Gate 8's `WorkspaceProvider`:

| Gate 8 needs | `previewStackService` has | Gap |
|---|---|---|
| provision workspace | ✅ port allocation + compose up | — |
| clone repo | ✅ with the project's GitHub token | — |
| lifecycle states | ✅ on `PreviewStack`/`PreviewEvent` | Needs the `ExecutionRun` state set |
| destroy workspace | ✅ teardown + archive/restore | — |
| branch / commit / PR | ❌ | `sbp/repoWriter.ts` covers commit; PR creation is new |
| run tests inside | ❌ | new |
| network boundaries | ❌ | new — see S-01 |
| tool allowlist | ❌ | new |

This is a substantially better starting point than "build a runner." It is also the
source of the one security finding.

---

## 3. S-01 — The isolation boundary is one Docker API call wide

**Severity: high. Must be resolved before Gate 8 executes any untrusted repository.**

`previewStackService`'s stated assumption:

> Backend container has the docker socket mounted (`/var/run/docker.sock`) and the
> `docker` CLI available on PATH.

Mounting the Docker socket into a container grants control of the Docker daemon, which is
root-equivalent on the host. The container holding that socket is the **main backend
container**, which also serves public HTTP.

Master plan §5.7 and §11 require:

> Client/student code never executes in the main backend/web process.
> Never run untrusted client repo code in the main app/backend process.

Strictly read, preview stacks do not violate this — the repo's code runs in sibling
containers, not in the Node process. But the property the rule is *protecting* is
weaker than it looks:

- the process that can be reached from the internet is the process that can start
  containers, mount host paths, and read every other container's environment;
- a single SSRF, path traversal or prompt-injection-to-tool-call in the backend becomes
  host compromise rather than a bad HTTP response;
- and master plan §11 explicitly classifies repo/client content as **untrusted input**
  while Gate 8 feeds exactly that content to a model that can call tools.

Today's blast radius is students' own repos. Gate 8's is *client* repositories under
commercial and government delivery contracts, with private source and secrets.

**Options:**

| Option | Isolation | Cost |
|---|---|---|
| **A (recommended for MVP)** | GitHub Actions runner — execution leaves the VPS entirely, per-job token, network policy from GitHub | Ephemeral runners, no host Docker access, well-understood permission model. Slowest feedback loop |
| B | Dedicated execution worker container, no public HTTP, its own Docker socket or rootless runtime; backend enqueues and never executes | Keeps execution on the VPS; requires the durable queue (E-03) and a new deploy unit |
| C | Approved external sandbox provider | New paid dependency ⇒ escalation |
| D | Keep as-is | Rejected — puts client repositories behind an internet-facing process that holds a root-equivalent socket |

Master plan §Gate 8 lists exactly A, B and C as "acceptable MVP execution shapes" and says
"choose the smallest safe current option." **A is the smallest safe one**, because it is
the only one that requires no new isolation code to be correct.

**Decision required from Ali.** Not taken here.

---

## 4. E-03 — No durable job queue

| Probe | Result |
|---|---|
| `bull` / `bullmq` / `agenda` / `bee-queue` / `node-resque` | **none** |
| Scheduling | `node-cron ^4.2.1` |
| In-repo queues | `sbp/boundedQueue.ts` (in-process, bounded); `intelligence/systemStateEngine/queue/authoritativeTaskQueue.ts`; `models/QueueHistoryEntry.ts`, `models/ResponseQueue.ts`, `models/OpsApprovalQueueItem.ts`, `models/LinkedInActionQueue.ts` |

Gate 8 defines an `ExecutionRun` state machine:

```
queued → provisioning → planning → executing → testing → verifying
       → waiting_for_human → completed | failed | cancelled | timed_out
```

A run can sit in `executing` for many minutes and in `waiting_for_human` for days. An
in-process queue loses every in-flight run on deploy, and this stack deploys with
`docker compose up -d --build`.

**Resolution:** persist `ExecutionRun` rows as the queue — state lives in Postgres, a
worker claims rows with `SELECT … FOR UPDATE SKIP LOCKED`, and `boundedQueue` continues to
bound *in-process* concurrency on top. This adds no dependency and reuses the existing
`ensure*Schema` pattern. `models/OpsApprovalQueueItem.ts` is precedent for
database-as-queue in this codebase.

---

## 5. AI provider abstraction: partial

| Probe | Result |
|---|---|
| `services/runtime/anthropicClient.ts` | 121 lines — `anthropicChatText`, `anthropicChatJson`, cost accounting, `MENTOR_ANTHROPIC_MODEL` env override |
| Direct OpenAI instantiation | **43 files** |
| `services/ai/` directory | absent |
| `services/llm/` | exists, contains only `stopReason.ts` |
| `services/lib/openaiInstrumented.ts`, `llmCallWrapper.ts` | instrumentation wrappers, not a provider abstraction |

Master plan §5.2: "AI execution engines are replaceable." For the *delivery execution
plane* this is achievable because `ExecutionProvider` is greenfield. For the platform as a
whole it is currently untrue, and this plan should not claim otherwise.

**Scope discipline:** refactoring 43 OpenAI call sites is not in this plan. Logged as an
observation, not adopted as work.

---

## 6. Git / GitHub capability that already exists

| Capability | Where |
|---|---|
| Commit to a repo, idempotent, allowlisted, bot-authored | `sbp/repoWriter.ts` |
| Resolve a project's repo, with `access_unknown` vs `pull_only` | `sbp/workspaceRepo.ts` |
| Write-access probing | `sbp/repoWriteAccess.ts` |
| Repo connect contract | `docs/REPO_CONNECT_CONTRACT.md`, `sbp/__tests__/repoConnectService.test.ts` |
| Push webhook + sync | `docs/BUILD_PIPELINE_GITHUB_SYNC.md` |
| GitHub automation agent | `services/agents/gitHubAutomationAgent.ts` |
| CI | `.github/workflows/ci.yml`, `secret-scan.yml`, `sync-main-to-staging.yml` |

**Not present:** PR creation from an execution run, branch-per-story, base-SHA pinning.
Those are new at Gate 8.

`secret-scan.yml` is worth noting — master plan §11 requires secret redaction, and a
secret-scanning workflow already gates this repo. The delivery execution path should route
its commits through the same scan rather than inventing a second one.

---

## 7. Provider contracts Gate 8 must define

Nothing in the repo satisfies these; all five are new. Written as contracts so the
implementation stays replaceable (§5.2).

```
ExecutionProvider            run(storyContract, workspace, policy) -> ExecutionRun events
WorkspaceProvider            provision / clone / destroy      (adapt previewStackService)
RepositoryProvider           branch / commit / PR / base SHA  (extend repoWriter)
BrowserVerificationProvider  Playwright run + screenshots     (tests/systemV2 exists)
DeploymentProvider           abstracted, human-approved, NOT authorized by this plan
```

---

## 8. Default-deny list (master plan §Gate 8) — enforcement status

| Denied action | Enforceable today? |
|---|---|
| production deploy | Yes — no `DeploymentProvider` will exist |
| production DB | Requires explicit env isolation in the worker; **not currently guaranteed** if execution shares the backend container (S-01) |
| DNS | Yes |
| live email | Partially — `test mode` exists on the Mandrill path; a worker must not hold `MANDRILL_API_KEY` at all |
| cloud deletion | Depends on S-01 outcome; option A removes the capability entirely |
| direct protected-main push | Yes — branch protection is on `main` |
| unbounded network | **Not enforceable today.** New with the chosen isolation model |
| secret exfiltration | Partially — `secret-scan.yml` catches committed secrets; prompt-side redaction is new |

Three of these eight are only enforceable once S-01 is decided. That is the clearest
argument for resolving S-01 before Gate 8 rather than during it.

---

## Summary

| ID | Finding | Type | Owner |
|---|---|---|---|
| E-01 | Claude Code SDK absent; adopting it is a new external dependency | **Escalation** | Ali |
| S-01 | Docker socket mounted into the internet-facing backend container | **Escalation / security** | Ali |
| E-03 | No durable job queue; `ExecutionRun` needs one | Design | Claude — DB-as-queue |
| E-04 | AI provider abstraction partial (43 direct OpenAI sites) | Observation | Out of scope |
| E-05 | `previewStackService` is a viable `WorkspaceProvider` base | Reuse | Gate 8 |
| E-06 | PR creation / branch-per-story / base-SHA pinning absent | New work | Gate 8 |
