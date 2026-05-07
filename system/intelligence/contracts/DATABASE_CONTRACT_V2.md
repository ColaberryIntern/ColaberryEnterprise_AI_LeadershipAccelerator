# DATABASE_CONTRACT_V2.md
## Database telemetry contract — V2

**Version:** 2.0
**Status:** Active (Phase 3)
**Schema:** [`database_map.schema.json`](../../database/database_map.schema.json)
**Map:** [`database_map.json`](../../database/database_map.json)
**Phase 2 predecessor:** `backend/src/intelligence/systemStateEngine/system/database/DATABASE_CONTRACT.md` (snapshot table only)

V2 extends the Phase 2 contract to cover:
- The declared database map (tables, columns, relationships, indexes)
- Cross-references from APIs / BPs / frontend to DB objects
- Orphan detection (tables nothing references)

---

## 1. Database map shape

```json
{
  "db_version": "2.0",
  "project_id": "uuid",
  "generated_at": "ISO-8601",
  "source": "manifest" | "declared" | "discovered",

  "tables": [
    {
      "schema": "public",
      "name": "users",
      "columns": [
        { "name": "id", "type": "uuid", "nullable": false, "is_pk": true },
        { "name": "email", "type": "varchar", "nullable": false, "is_unique": true }
      ],
      "indexes": [
        { "name": "users_email_idx", "columns": ["email"], "unique": true }
      ],
      "relationships": [
        { "kind": "fk", "to_table": "organizations", "to_column": "id", "from_column": "organization_id" }
      ],
      "row_count_estimate": 1234,
      "documented": true,
      "consumers": {
        "apis": ["GET /api/users"],
        "bps": ["uuid"],
        "frontend_components": ["UserList"]
      }
    }
  ],

  "orphan_tables": [
    { "name": "old_audit_log", "reason": "no API/BP/frontend reference" }
  ],

  "undocumented_tables": [
    { "name": "internal_cache", "reason": "no comment/doc, no contract entry" }
  ]
}
```

---

## 2. Source layering

1. **Manifest telemetry** — `database_changes` from each manifest (additive)
2. **Declared map** — hand-edited `database_map.json` (canonical for documented tables)
3. **Discovered** — Sequelize model introspection / `information_schema` query (fallback)

`databaseSynchronizer.ts` merges. Manifest > declared > discovered. Conflicts
surface as contradictions (`db_drift`).

---

## 3. Persistence

- Snapshot copy in `system_state_snapshots.state_graph` (database_object nodes)
- Reference copy at `/system/database/database_map.json` per project (kept up to date)
- Optional dedicated table `database_maps` (NOT created in V2 — uses snapshot column)

---

## 4. Orphan & undocumented detection

A table is an **orphan** when no API, BP, or frontend component references it
in the merged map. Orphans surface as `orphan_table` contradictions at `info`
severity (warning if older than 30 days).

A table is **undocumented** when:
- No `COMMENT ON TABLE` is set in Postgres, AND
- No entry in `database_map.json`, AND
- It has been queried by application code in the last 30 days

Undocumented tables surface as `undocumented_table` contradictions at `warning`.

---

## 5. Privacy / safety

The map MUST NOT include:
- Sample row data
- PII column values
- Connection strings or auth secrets

Column names + types only. Row counts are aggregate estimates.

---

## 6. Forbidden patterns

- Building a separate `databaseDiscoveryService` outside of `databaseSynchronizer`.
- Joining `system_state_snapshots` directly to read DB topology — read the
  `database_map.json` reference file or the `state_graph` column.
- Caching the map in-memory across requests — always read from the latest
  snapshot.
