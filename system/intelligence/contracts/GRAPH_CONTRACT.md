# GRAPH_CONTRACT.md
## State graph synchronization

**Version:** 1.0
**Status:** Active (Phase 3)
**Output:** [`state_graph.json`](../state_graph.json) (per-project snapshots persisted in `system_state_snapshots.state_graph`)

---

## 1. What the graph models

The state graph is a directed graph of project entities (project, BPs, tasks,
files, APIs, DB objects, UI components, validation results, tests) and the
relationships between them.

It is the system's structured knowledge of "what exists, and what depends on
what." Every consumer of "explain this BP / API / UI surface" reads the graph.

---

## 2. Node types

| Type | What it represents | Example id |
|---|---|---|
| `project` | The project root | `proj:{uuid}` |
| `bp` | Business process / capability | `bp:{uuid}` |
| `task` | Authoritative task | `task:{uuid}` |
| `file` | Repo file (path-keyed) | `file:backend/src/services/x.ts` |
| `database_object` | Table, view, index | `db:public.users` |
| `api` | HTTP endpoint | `api:GET /api/foo` |
| `ui_component` | Page, widget, form | `ui:HomePage` |
| `validation_result` | Evidence row | `val:{uuid}` |
| `test` | Test file or suite | `test:backend/src/__tests__/x.test.ts` |

Every node carries:
```ts
{
  id: string,
  type: NodeType,
  label: string,
  metadata: { /* type-specific */ }
}
```

---

## 3. Edge relations

| Relation | From → To | Meaning |
|---|---|---|
| `contains` | project → bp | BP belongs to project |
| `implements` | file → bp | File contributes to BP implementation |
| `exposes` | api → bp | API surface for BP |
| `renders` | ui_component → bp | UI surface for BP |
| `tests` | test → file/bp/api | Test covers target |
| `depends_on` | bp → bp | Soft dependency (sequencing) |
| `derived_from` | task → bp | Task targets BP |
| `validates` | validation_result → task | Validation evidence |
| `mutates` | api → database_object | API writes to DB object |
| `reads` | api → database_object | API reads DB object |

Relations are typed strings; the graph contract enforces a fixed vocabulary.
New relation kinds require contract bump.

---

## 4. Source layering

The graph is built by `graphSynchronizer.ts` from these sources, in priority
order:

1. **Manifest telemetry** — `apis_added`, `frontend_routes_added`, `database_changes`,
   `tests_added` in each manifest become nodes + edges
2. **Validation telemetry** — `validation_result` nodes + `validates` edges
3. **Declared maps** — `database_map.json`, `ui_map.json` flesh out structure
4. **Repo evidence** — repo file tree fills in `file` nodes; pattern-matching adds
   `implements` / `exposes` edges where no manifest exists

The synchronizer merges sources WITHOUT duplicating nodes/edges by id.

---

## 5. Persistence

The graph for a project lives in `system_state_snapshots.state_graph` (JSONB
column, Phase 1). Every snapshot has its own immutable graph. The "current"
graph is `getLatestSystemSnapshot(projectId).state.graph`.

A reference copy of the latest graph for the LIVE project is also written to
`/system/intelligence/state_graph.json` for inspection / git history. This
file is auto-maintained by `graphSynchronizer.persistReferenceCopy()`. It is
NOT the source of truth — the snapshot is.

---

## 6. Telemetry vs heuristics

Phase 3 rule: when a manifest declares an edge, the manifest wins. Heuristic
edges (e.g., file `implements` BP from name-stem matching) only fill gaps.

Graph nodes/edges sourced from manifests are tagged
`metadata.source = "manifest"`; heuristic ones are tagged `"heuristic"`. The
explainability surface uses this to show "what's known vs inferred."

---

## 7. Forbidden patterns

- Building a parallel graph from `Capability.linked_*` arrays alone. Use the
  synchronizer.
- Mutating a snapshot's graph in place. Build a new snapshot.
- Hand-crafting node IDs in user-facing code. Use the canonical id helpers.
