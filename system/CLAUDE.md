# system/CLAUDE.md
**Portal-owned auto-generated state. DO NOT MANUALLY EDIT.**

## What this directory is
Authoritative system-state maps maintained automatically by the portal's synchronizer services. These files are the source of truth for the SystemStateEngine and any UI surface that displays system state.

## Who writes
The portal backend services own writes:
- `intelligence/state_graph.json` ← `graphSynchronizer.ts`
- `database/database_map.json` ← `databaseSynchronizer.ts`
- `ui/ui_map.json` ← `uiSynchronizer.ts`
- `intelligence/manifests/builds/*.json` ← `BuildManifest` ingestion endpoint

Each of those is rebuilt from telemetry. Manual edits are clobbered on the next rebuild.

## Who reads
- Frontend portal surfaces (Cory Home, SystemView, etc.)
- The state-explanation endpoint (`GET /api/portal/project/system-state/explain/:taskId`)
- Other synchronizers (cross-referencing)

## How Claude Code interacts
**Claude Code's only job here is emitting BuildManifests, NOT editing these files.**

After every non-trivial build, emit a `BuildManifest` POST to `/api/portal/project/telemetry`. The portal ingests, validates, and triggers a rebuild of the relevant maps. See root CLAUDE.md > Telemetry Synchronization Contract for the schema and rules.

If a map looks wrong, the fix is **not** to edit the JSON file — it's to emit a corrective BuildManifest with a later `execution_timestamp`. The resolver picks the later one.

## Schemas / contracts
- Build manifest schema: `intelligence/manifests/build_manifest.schema.json`
- Manifest contract docs: `intelligence/contracts/BUILD_MANIFEST_CONTRACT.md`

## File excluded from Claude search
These files are listed in `.claudeignore` because they can be large and rebuilds happen often. If you need to inspect one, `Read` it directly by path.

## Common mistakes to avoid
- Editing `state_graph.json` to "fix" a state issue. Won't survive next rebuild.
- Adding new top-level keys without coordinating with the synchronizer code. Will get dropped.
- Treating the manifests directory as a log. It's append-only telemetry, NOT a journal — write to PROGRESS.md for human-readable history.

## When this directory's contract changes
Coordinate with the portal backend team (currently: Ali as DRI). A change here usually requires a corresponding change in `backend/src/intelligence/systemStateEngine/`.
