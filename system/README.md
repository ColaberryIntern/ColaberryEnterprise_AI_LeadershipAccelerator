# system

**Auto-generated state. Do not hand-edit anything in this directory.**

These files are the authoritative system-state maps, rebuilt from telemetry by the portal's synchronizer services. Any manual edit is clobbered on the next rebuild — usually within minutes, silently.

Local rules: [CLAUDE.md](CLAUDE.md).

---

## Who writes what

| File | Written by |
|---|---|
| `intelligence/state_graph.json` | `graphSynchronizer.ts` |
| `database/database_map.json` | `databaseSynchronizer.ts` |
| `ui/ui_map.json` | `uiSynchronizer.ts` |
| `intelligence/manifests/builds/*.json` | The `BuildManifest` ingestion endpoint |

## Who reads

- Frontend portal surfaces (Cory Home, SystemView, SystemViewV2)
- The state-explanation endpoint, `GET /api/portal/project/system-state/explain/:taskId`
- Other synchronizers, cross-referencing each other

---

## How to change what these files say

**By emitting a `BuildManifest`, not by editing JSON.**

After a non-trivial build, `POST` a `BuildManifest` to `/api/portal/project/telemetry`. The portal validates it, ingests it, and rebuilds the affected maps.

If a map looks wrong, the fix is a **corrective manifest with a later `execution_timestamp`** — the resolver takes the later one. Editing the JSON directly does nothing durable.

The ownership split is deliberate and worth stating plainly:

| Owner | Owns |
|---|---|
| Claude Code | `BuildManifest` emission, `PROGRESS.md`, `/directives`, `CLAUDE.md` |
| The portal | `intelligence/state_graph.json`, `database/database_map.json`, `ui/ui_map.json` |

Do not cross those streams.

---

## Contracts

| File | Defines |
|---|---|
| `intelligence/manifests/build_manifest.schema.json` | The manifest schema |
| `intelligence/contracts/BUILD_MANIFEST_CONTRACT.md` | Manifest contract documentation |
| [`../backend/src/intelligence/systemStateEngine/system/README.md`](../backend/src/intelligence/systemStateEngine/system/README.md) | State and database contracts for the engine itself |

Read the engine's contracts before adding any consumer of system state. The governing rule: **never re-derive readiness, coverage, maturity, queue order, or next-action anywhere else.** The engine is the single source of truth. If it lacks a dimension you need, extend the engine and open a ticket — do not compute it locally. Fragmentation is precisely what this subsystem was built to end.

---

## Subdirectories with their own notes

- [`intelligence/history/`](intelligence/history/README.md)
- [`intelligence/manifests/`](intelligence/manifests/README.md)

---

## Common mistakes

- **Editing `state_graph.json` to fix a state issue.** It will not survive the next rebuild.
- **Adding top-level keys without touching the synchronizer.** They get dropped.
- **Treating `manifests/` as a log.** It is append-only telemetry, not a journal. Human-readable history goes in the session log under `docs/sessions/`.

These files are listed in `.claudeignore` because they are large and rebuild often. Read one directly by path when you need it.

Changing this directory's contract usually requires a matching change in `backend/src/intelligence/systemStateEngine/`. Coordinate with the DRI.
