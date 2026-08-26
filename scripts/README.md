# Scripts

Repo-root operational tooling: **142 tracked files**. Several distinct groups live here — the CB System ops engine, the screenshot capture pipeline, report builders, PR review automation, and safety/drift guards.

Backend-specific one-off scripts live in [../backend/src/scripts/](../backend/src/scripts/README.md) instead. The line: if it needs the backend's models and services, it goes there; if it operates on the repo, the VPS, or an external system, it goes here.

---

## `ops-engine/` — the CB System

The autonomous operations layer that works the Basecamp backlog. **This is the piece that makes the AI ops story real rather than architectural.** Three cron processes run continuously on the production VPS.

| Process | Cadence | What it does |
|---|---|---|
| `worker.js` | every 15 min | Lists every CB-System-assigned open todo across accessible projects, classifies by `#auto-<recipe>` hashtag, executes **one** (FIFO by `created_at`) under a 5-minute hard timeout, and posts the result as a comment. **Never auto-closes** — a human closes. Posts a digest every ~16 ticks. |
| `inbound-dispatcher.js` | every 3 min | Polls the Basecamp events feed for `@CB System` mentions in comments, classifies the request, runs a safe recipe (`gmail:`, `ccpp:`, `grep:`), and replies on the same recording. |
| `backlog-enforcer.js` | every 4 hr | Scans Ali Personal for open Ali-assigned todos, classifies by urgency, posts a snapshot to a meta tracking todo. Tags Ali only past a threshold or at the 9am CT tick. Read-only apart from one comment write per tick. |

Supporting processes:

| File | Purpose |
|---|---|
| `reports-runner.js` | Every 5 min. Reads `automated_reports`, dispatches what is due, logs every run to `automated_report_runs`. Single source of truth for scheduled reporting. |
| `cb-watchdog.js` | Daily health check on the dispatcher pipeline. Computes 24h metrics, runs the coverage audit, emails a GREEN/YELLOW/RED status. `--dry` prints without sending. |
| `cb-coverage-check.js` | Audits whether mentions were actually caught. |
| `scan-missed-cb-mentions.js` | Backfill scan for mentions the dispatcher missed. |
| `cb-context-walker.js` | Walks ticket context for the responder. |
| `cb-artifact-tools.js` | Artifact helpers for CB recipes. |
| `cb-system-handler.js` | Recipe handler dispatch. |
| `cardtable-sync.js` | Mirrors todo status into Basecamp Card Table columns. One-way: todo is the source of truth, cards are a visual. |
| `cleanup-cb-dup-replies.js` | Removes duplicate replies. |
| `worker.js` state | `tmp/ops-engine/worker-state.json` on the host |

Tests: `ops-engine/__tests__/` — `circuit-breaker.test.js`, `self-reply-guard.test.js`, `automated-card-guard.test.js`. All three guard against the failure modes that matter most here: runaway loops, the bot replying to itself, and automated cards multiplying.

**Safety design.** Every process is read-mostly with a tightly bounded write surface, dedupes via lock plus state file, and never closes a human's todo. Logs land at `/var/log/cb-worker.log`, `/var/log/cb-inbound.log`, `/var/log/cb-backlog.log` on the prod VPS.

Operator surface: `/admin/ops` (AI Ops Command Center) and `/admin/reports`.

---

## Screenshot capture

~25 `capture*.js` scripts producing the images behind the `*_REVIEW.html` docs in [../docs/](../docs/README.md).

**All capture scripts must route through [`captureHelpers.js`](captureHelpers.js)**, which enforces an 1800px safe-width ceiling. This is not stylistic — an oversized screenshot has ended a working session before now.

| Script | Captures |
|---|---|
| `captureProductionScreenshots.js` | The general-purpose production capture entry point |
| `captureAdminOpsScreenshots.js` | AI Ops Command Center |
| `captureFirstRunOnboarding.js` | First-run onboarding flow |
| `captureOperationalTrust.js`, `captureOperatorOrientation.js`, `captureOperationalLeverage.js`, `captureOperationalPathways.js`, `captureOperationalOnboarding.js` | Operator-experience sprints |
| `captureBPDetailPreview.js`, `captureBPDetailV2.js`, `captureBPSurfaceNav.js`, `captureBPv2Variants.js` | Business-process surfaces |
| `captureSemanticCoherence.js`, `captureStructuralConfidence.js`, `captureMaturityVariants.js`, `capturePresenceVariants.js`, `captureDrawerVariants.js` | Design-system sprints |
| `captureEnvironmentalContinuity.js`, `captureContinuityVariants.js`, `captureTopologyRecovery.js`, `captureOperationalPriorityTopology.js` | Continuity and topology |
| `captureExecutiveSignalLayering.js`, `captureCritiqueBlueprintWalkthrough.js`, `captureBuildOut.js` | Executive and build surfaces |

Output goes to `docs/screenshots/<YYYY-MM-DD>-<slug>/`. Full protocol lives in the `/screenshot-review` skill.

---

## Report and document builders

| Script | Output |
|---|---|
| `generateSessionChangelog.js` | `docs/sessions/SESSION_<SessionID>.html` — per-session change report. Pass `--no-open` to skip launching a browser. |
| `buildArchitectReport.js` | Architect run report |
| `buildDocComparisonReport.js` | Generator comparison (`docs/doc-comparison/`) |
| `buildFullPipelineReport.js` | End-to-end pipeline report |
| `buildOnboardingRunReport.js` | Onboarding run report |
| `buildPathTimingReport.js` | Build-path timing |
| `compareDocGenerators.js` | Architect vs. regular generator |
| `documentBuildPaths.js` | Build-path documentation |

---

## Verification and health

| Script | Checks |
|---|---|
| `systemHealthCheck.js` | Overall system health |
| `verifyTelemetrySync.js` | Telemetry sync integrity |
| `verifyBuildTiers.js` | Build tier correctness |
| `verifyDemoRevival.js` | Demo content revival |
| `e2ePipelineSoak.js` | Pipeline soak test |
| `bcTokenHealthCheck.sh` | Basecamp token health |

## Backfills and data operations

`backfillAttribution.js`, `backfillBuildManifests.js`, `backfillSkoolUTM.js`, `backfillSmartVerification.js`, `importPilotLeads.js`, `closeRequirement.js`, `skoolStripUrlsFromComments.js`

## Drivers

`driveArchitectBuild.js`, `driveRequirementsBuilder.js` — drive a full pipeline run end to end, used for E2E validation.

## Inbox

`full-inbox-scan.js`, `inbox-auth-helper.js`

---

## PR review automation

A self-contained loop that reviews open PRs and reports out.

| Script | Purpose |
|---|---|
| `prReviewState.js` | Review state ledger |
| `renderPrReviewReport.js` | Renders the HTML review report (archived under `docs/pr-reviews/`) |
| `sendPrReviewDigest.js` | Emails the digest |
| `prReviewEmailCron.sh` | Cron wrapper |
| `prAutoMerge.js` | Auto-merge once a PR is green |

## Safety and drift guards

| Script | Guards |
|---|---|
| `secret-scan.js`, `secret-scan-run.js`, `ensure-gitleaks.js` | Secrets reaching a commit |
| `schemaDriftCheck.sh` | Dev/prod schema divergence |
| `syncDevSchemaFromProd.sh` | Pulls prod schema down to dev |
| `lint-route-auth.js` | Routes missing an auth guard |
| `validate-app-boundaries.js` | Cross-boundary imports between `apps/` |
| `prod-preflight.sh` | Pre-deploy checks |
| `unsubscribe-health-check.js` | Unsubscribe path health |

`lint-route-auth.js` is worth knowing about: the mount-order auth trap described in [`../backend/src/routes/README.md`](../backend/src/routes/README.md) is exactly the class of bug it exists to catch early.

## Other subdirectories

| Path | Contents |
|---|---|
| `deep-dive/` | Generators for the per-week field guides in `docs/deep-dive/` |
| `curriculum-type-thumbnails/` | Thumbnail prompts and generation for curriculum types |
| `lib/productionTransport.js` | Shared production transport helper |

## Infrastructure and cron helpers

| File | Purpose |
|---|---|
| `cron-env-wrapper.sh` | Wraps cron jobs with the right environment. Host crontab entries call this, not the scripts directly. |
| `refreshBasecampTokenFromVault.sh` | Basecamp token refresh (the token rotates roughly every 2 weeks) |
| `provision-kes-vps-access.sh` | VPS access provisioning |
| `task-prompt-worker.sh` | Task prompt worker |
| `ata-report-digest.sh` | Ali Task Agent report digest |

---

## Rules

- **Single responsibility.** One script, one job. A script that "also does X" gets split.
- **Header comment required.** Purpose, context, `Run:` line, and output destination. The existing `ops-engine/*.js` headers are the standard to match.
- **Idempotent.** Re-running must not duplicate side effects. Where duplication is genuinely hard to prevent, log loudly and require an explicit `--allow-duplicate` flag.
- **Secrets from env only**, never logged. Mask to the first 8 characters if a token must be printed for debugging.
- **Dry-run first** for anything that writes. `--dry` is the convention.
- **No em-dashes in outbound content.** Enforced by `.claude/hooks/check-emdash.sh`.

If a script becomes recurring, promote it to a worker with a scheduler entry. If it becomes reusable, lift it into `backend/src/services/`.
