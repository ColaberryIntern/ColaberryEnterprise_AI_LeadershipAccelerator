# Enable the platform-built Command Center and Demo (L13.1)

## Purpose

After a student's plan is published, the platform builds that project's Command Center and
Connected Demo itself, stores every version, and serves them from our own site. Every story in the
portal then links to both. The student's GitHub repository is not involved: the result works
before a repo exists, and it stays under our control after one does. The feature ships OFF and is
turned on per enrollment.

## Inputs

| Input | Where | Notes |
|---|---|---|
| `OPENAI_API_KEY` | GitHub repo **Actions secret** | The stored production key (Ali, 2026-11-24). Only the step that starts the key proxy sees it. Rotating the backend key means updating this secret too. |
| `SBP_PLATFORM_BUILD` | backend env | `off` (default), `all`, or comma-separated enrollment ids |
| `GITHUB_TOKEN` | backend env (already set in production) | Needs `workflow` scope to dispatch the runner. Production's token has it. |
| `PLATFORM_API_BASE` | GitHub repo **Actions variable**, optional | Defaults to `https://enterprise.colaberry.ai` |
| `PLATFORM_BUILD_MODEL` | GitHub repo **Actions variable**, optional | Defaults to `gpt-6.2-sol`. Must have a price in `scripts/platformBuild/codexConfig.cjs`. |
| `.github/workflows/platform-build-runner.yml` | must be on `main` | The backend only accepts OIDC tokens from this file on `refs/heads/main` |

## Steps

1. **Add the secret.** GitHub, repository Settings, Secrets and variables, Actions, New repository
   secret: `OPENAI_API_KEY`. Success: `gh secret list` shows it.
2. **Deploy the backend** with `scripts/deploy-prod.sh` (never a hand-run compose). Success: the
   boot log has no `[boot] platform build schema unavailable` line, and
   `SELECT to_regclass('platform_build_runs'), to_regclass('platform_build_artifacts');`
   returns two non-null values.
3. **Turn it on for ONE test enrollment first.** Set `SBP_PLATFORM_BUILD=<enrollment id>` in the
   production backend env and redeploy the backend. Success: the env var is visible in
   `docker exec accelerator-backend printenv SBP_PLATFORM_BUILD`.
4. **Publish a plan for that enrollment.** Success: a log line
   `"event":"platform_build_dispatched"` with the project id, and a new run in the repository's
   Actions tab named "Platform build runner".
5. **Wait for the run** (typically 15 to 40 minutes). Success: the run is green, its log ends with
   `{"event":"uploaded",...}`, and `platform_build_runs.status = 'uploaded'` for that run.
6. **Open any story of that project in the portal.** Success: "Command Center" and "Demo" buttons
   in the story header open the hosted pages, and both render with no console errors.
7. **Widen** to more enrollment ids, then to `all`, only after L13.4 (retiring STORY-000 and
   STORY-900 for platform-built projects) has shipped. Until then a covered student would see
   both the platform's Command Center and a STORY-000 task asking them to build one.

## Outputs

- `platform_build_runs`: one row per attempt, `queued -> dispatched -> building -> uploaded | failed`.
- `platform_build_artifacts`: one row per stored version per kind (`command_center`, `demo`),
  exactly one `active` per kind. Versions are never deleted.
- Served pages under `/api/platform-view/<signed token>/` (Command Center), `.../demo/` (Demo).
- Log events (service `sbp-platform-build`): `platform_build_dispatched`,
  `platform_build_not_queued`, `platform_build_dispatch_failed`, `platform_build_bundle_served`,
  `platform_build_uploaded`, `platform_build_upload_refused`, `platform_build_runner_failed`,
  `platform_build_runner_refused`, `platform_build_stale_runs_failed`, `platform_view_failed`.

## Verification

- `SELECT status, error_class, cost_usd FROM platform_build_runs WHERE project_id = '<id>' ORDER BY created_at DESC;`
  shows `uploaded` with a cost.
- `SELECT kind, version, status, bytes FROM platform_build_artifacts WHERE project_id = '<id>';`
  shows an active `command_center` row (and normally an active `demo` row).
- The portal project read (`GET /api/portal/projects/<id>`) contains `platform_build.state = "ready"`
  and two `/api/platform-view/...` URLs.

## Edge cases / failure modes

| What happens | What the system does | What you do |
|---|---|---|
| Republish of a built project | Nothing new is built (`already_built_or_running`). The Command Center reads plan, progress and schedule live, so it is already current. | Nothing. |
| GitHub dispatch fails | Run marked `failed` with `AuthError`, `RateLimitError`, `ContractViolation` or `UpstreamUnavailable`. Next publish retries. | If `AuthError`: check the backend `GITHUB_TOKEN` scopes. |
| Runner never starts, or dies silently | After 120 minutes the next publish marks it `StaleRun` and queues a new one. | Nothing, unless it repeats. |
| `OPENAI_API_KEY` missing or rejected | Runner reports `AuthError` and the run fails. | Step 1. |
| Agent fails or runs too long | Runner reports `AgentIncomplete`, `AgentTimeout` (30 min Command Center, 15 min demo), `QuotaError`, `RateLimitError` or `ModelUnavailable`; nothing is stored. | Re-publish, or raise `PLATFORM_BUILD_MINUTES_*` in the workflow. |
| Sandbox cannot be proven | Runner reports `SandboxUnavailable` before any paid call. | Run the "Platform build sandbox check" workflow on a PR; a runner image change is the usual cause. |
| Demo spec invalid but Command Center fine | Command Center stored, demo not; run `uploaded` with `error_class = DemoSpecInvalid` and the reasons in `error_detail`. | Optional: re-run later. |
| 3 failed runs for one project | Queue stops (`attempts_exhausted`). | Fix the cause, then `DELETE FROM platform_build_runs WHERE project_id = '<id>' AND status = 'failed';` and re-publish. |
| A link is opened after 12 hours | "Not ready yet" page. | Re-open the story in the portal; it mints a fresh link. |

## Safety constraints

- **The agent never runs on the production VPS** (ESC-4). It runs on an ephemeral GitHub-hosted
  runner. Its shell commands run in Codex's sandbox with no network and an empty environment, the
  key lives only in a separate proxy process, sudo is removed first, and the runner proves the
  sandbox before every build.
- **There is no per-build dollar cap.** Codex has none. The limits are the timeouts, one run per
  project, three failed runs, and the spend limit on the OpenAI project.
- **The repository is public.** The workflow takes only a run id as input, proves itself with
  GitHub OIDC (no stored secret), and prints counts, states and costs only, never project content.
- **The backend accepts only** a token from `platform-build-runner.yml` on `refs/heads/main`,
  dispatched by `workflow_dispatch`, on a GitHub-hosted runner.
- **Hosted pages are sandboxed** (`Content-Security-Policy: sandbox` without
  `allow-same-origin`), so model-written script cannot read a signed-in student's portal token.
- **Idempotent:** one live run per project (database unique index), one upload per run (row lock),
  one active version per kind (database unique index).
- **Rollback:** set `SBP_PLATFORM_BUILD=off`. Existing builds keep showing, because what a project
  has is read from its rows, not from the flag. To hide them as well, mark their artifacts
  `superseded`.
