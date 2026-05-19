---
name: telemetry-emission
description: Emit BuildManifest telemetry to the portal after any non-trivial build operation. Invoke when you've completed a feature, fix, or refactor and need to notify the SystemStateEngine of what changed.
user-invocable: true
---

# Telemetry Emission — BuildManifest Contract

## When to invoke
After Claude Code completes a build (feature, fix, refactor) that changed files, schema, APIs, routes, or UI components. The portal consumes these manifests to maintain authoritative state maps. Without a manifest, the portal falls back to repo heuristics, which are less reliable.

## The contract
Manifest schema: `system/intelligence/manifests/build_manifest.schema.json`
Full contract: `system/intelligence/contracts/BUILD_MANIFEST_CONTRACT.md`

## Required fields
- `manifest_version: "1.0"`, `telemetry_version: "1.0"`
- `task_id`, `project_id` (UUIDs); `bp_id` if the build targeted a specific BP
- `execution_timestamp` (ISO-8601)
- Whatever changed (use the relevant arrays, omit empty):
  - `files_created`, `files_modified`, `files_deleted`
  - `database_changes`
  - `apis_added`, `apis_modified`
  - `frontend_routes_added`, `ui_components_added`, `ui_components_modified`
  - `tests_added`
  - `validation_results` (whichever ran: `tsc`, `jest`, `playwright`, `build`, `lint`)
  - `dependencies_added`
- `system_impacts` (qualitative deltas)
- Optionally: `decision_trace` (why the build chose this approach; powers the "Why is this next?" panel)

## How to emit
POST to `/api/portal/project/telemetry`. The portal validates, ingests, and triggers a state rebuild — fire-and-forget.

## Strict rules
- **Manifest authority.** When telemetry exists, the engine prefers it over repo heuristics. Don't assume the engine will "figure it out from the file tree." Emit the manifest.
- **No secrets.** The validator rejects AWS keys, GitHub PATs, OpenAI keys, JWTs, and private key blocks with HTTP 400. Redact before emitting.
- **No `..` traversal in paths.** Repo-relative POSIX only. The validator rejects leading `/` and `../`.
- **Append-only.** Never modify or delete an emitted manifest. To correct stale state, emit a new one with a later `execution_timestamp` — the resolver picks the later one as the winner.
- **Validation results are first-class.** Emit `validation_results` whenever a check ran. Missing validation results contribute to the `missing_validation_telemetry` health score.
- **Database, API, UI changes flow through the manifest.** Don't assume out-of-band documentation will catch up — the manifest IS the documentation.
- **Decision tracing.** When the build's choices were non-obvious (alternative approach considered, trade-off accepted, dependency surfaced), include a `decision_trace` block, even a short one.

## What the portal owns (do NOT duplicate)
- The state graph: `system/intelligence/state_graph.json` — auto-maintained by `graphSynchronizer`. Manual edits are overwritten.
- The DB map: `system/database/database_map.json` — auto-maintained by `databaseSynchronizer`.
- The UI map: `system/ui/ui_map.json` — auto-maintained by `uiSynchronizer`.
- The queue: read via `GET /api/portal/project/system-state` — never invent a parallel queue.

## What Claude Code owns
- `BuildManifest` emission for every non-trivial build.
- Updating `PROGRESS.md` (the human-readable log).
- Updating directives in `/directives` when scope changes.
- Updating `CLAUDE.md` itself for new operational rules.

## Reading state
If you need to understand current project state during a build:
- `GET /api/portal/project/system-state` — full state
- `GET /api/portal/project/system-state/explain/:taskId` — "Why is this task next?"
- `GET /api/portal/project/telemetry` — recent manifests
- `GET /api/portal/project/telemetry/health` — health summary
- `GET /api/portal/project/graph` — state graph
- `GET /api/portal/project/database-map` / `/ui-map` — declared topology

Don't re-read the codebase to derive state when an endpoint already answers the question.
