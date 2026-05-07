# BUILD_MANIFEST_CONTRACT.md
## Authoritative Telemetry from Claude Code Builds

**Version:** 1.0
**Status:** Active (Phase 3)
**Schema:** [`build_manifest.schema.json`](../manifests/build_manifest.schema.json)
**Runtime validation:** [`build_manifest.ts`](../manifests/build_manifest.ts) (Zod)

---

## 1. What a manifest is

A `BuildManifest` is a deterministic, machine-readable summary of a single
Claude Code build operation. Claude Code emits one manifest per task it
completes; the portal ingests and trusts it.

Manifests are the single most important Phase 3 artifact: they are how the
portal moves from "what appears to exist" to "what was authoritatively
declared."

---

## 2. Required structure

```json
{
  "manifest_version": "1.0",
  "task_id": "uuid",
  "bp_id": "uuid | null",
  "project_id": "uuid",

  "execution_timestamp": "ISO-8601",

  "files_created": ["path/to/file.ts"],
  "files_modified": ["path/to/other.ts"],
  "files_deleted": [],

  "database_changes": [
    { "table": "x", "operation": "create_table" | "add_column" | "drop_column" | "add_index", "details": "..." }
  ],
  "apis_added": [
    { "method": "GET" | "POST" | "PUT" | "DELETE" | "PATCH", "path": "/api/...", "handler_file": "path/to/handler.ts" }
  ],
  "apis_modified": [],
  "frontend_routes_added": [
    { "route": "/x/y", "component_file": "path/to/Component.tsx" }
  ],

  "ui_components_added": [
    { "name": "ComponentName", "file": "path/to/Component.tsx", "category": "page" | "widget" | "form" }
  ],
  "ui_components_modified": [],

  "tests_added": [
    { "file": "path/to/x.test.ts", "type": "unit" | "integration" | "e2e", "coverage_target": "module/symbol" }
  ],
  "tests_modified": [],

  "validation_results": [
    {
      "check": "tsc --noEmit" | "jest" | "playwright" | "build" | "lint",
      "status": "pass" | "fail" | "skipped",
      "details": "...",
      "evidence_file": "path/to/log | null"
    }
  ],

  "dependencies_added": [
    { "name": "package-name", "version": "x.y.z", "scope": "runtime" | "dev" | "peer" }
  ],
  "packages_added": [],

  "system_impacts": [
    { "kind": "increases_readiness" | "increases_coverage" | "blocks_dependency" | "resolves_contradiction", "target_id": "uuid", "delta": 5 }
  ],

  "decision_trace": { /* DecisionTrace at build time, optional */ },

  "telemetry_version": "1.0"
}
```

---

## 3. Required fields

`manifest_version`, `task_id`, `project_id`, `execution_timestamp`, `telemetry_version`.

`bp_id` may be null for foundation/global tasks.

All array fields default to empty arrays — emit `[]`, not `null`.

---

## 4. Validation rules

The Zod validator (`backend/src/intelligence/systemStateEngine/telemetry/manifestValidator.ts`)
enforces:

- ISO-8601 timestamp parses (otherwise `400 invalid_timestamp`)
- File paths are repo-relative POSIX (`/` only, no leading `/`, no `..`)
- API methods are uppercase HTTP verbs from a whitelist
- Database operations match a known whitelist
- `manifest_version` must match the engine's accepted versions (currently `1.0`)
- `project_id` must exist (FK check)
- `bp_id` must reference an existing capability when not null

Manifests that fail validation are rejected with `400` and a structured error
list. They are NOT partially ingested.

---

## 5. Storage

Table: `build_manifests`
Append-only. One row per manifest. Indexes on:
- `(project_id, execution_timestamp DESC)` — primary read path
- `(bp_id, execution_timestamp DESC)` — per-cap drilldown
- `(task_id)` — task-to-manifest lookup

Manifests for the same `(project_id, bp_id)` are NOT merged or deduplicated
at ingest. The conflict resolver may surface contradictions across them.

---

## 6. Lifecycle

```
Claude Code build  →  POST /api/portal/project/telemetry  →
  manifestValidator (Zod)  →
    telemetryIngestionService.ingest(manifest)  →
      INSERT INTO build_manifests  →
      refreshSystemState(projectId, 'manifest_ingested')  →
        engine reads manifests for this project, merges into state
```

The whole chain is non-blocking after `INSERT`: refresh is `setImmediate`
fire-and-forget.

---

## 7. Conflict resolution

When two manifests for the same `(project_id, bp_id)` declare contradictory
state (e.g., manifest A says `files_created: ['x.ts']`, manifest B says
`files_deleted: ['x.ts']` later), the conflict resolver:

1. Treats the **later timestamp** as the current truth.
2. Emits a `telemetry_conflict` contradiction at `info` severity for visibility.
3. Engine state reflects the later manifest.

Manual override: a privileged `POST /telemetry/resolve` (TBD) can pin a manifest
as canonical. Out of scope for V1.

---

## 8. Freshness

A manifest is considered:
- **Fresh** if `execution_timestamp` is within 24h
- **Aging** if 24h–7d
- **Stale** if 7d–30d
- **Expired** if >30d (still readable, but no longer informs current state)

Freshness scoring feeds into `sync_health` (Phase 3 extension).

---

## 9. Privacy / safety

Manifests MUST NOT include:
- Secret values (API keys, tokens, credentials)
- File CONTENTS (only paths and high-level operations)
- User PII

The validator scans for common secret patterns and rejects on match.
