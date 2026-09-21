# AI Project Factory — Phase 6: Migration, Consolidation & Role Map

Status: shipped (loop `20260921-p6-migration`, session CC-20260921-p2k9). Additive; no schema redesign,
no nav/permission execution. This document is the Phase 6 exit artifact required by
`docs/AI_PROJECT_FACTORY_EXECUTION_PLAN.md:180-186`.

Audience: engineers and operators maintaining the factory. It explains how an existing delivery project
is put onto the factory model honestly, why overlapping pages stay separate for now, and what a future
nav/permission consolidation would have to touch.

---

## 1. Migration & rollback report

### What the migration does

An existing delivery project has no factory decomposition until one is created. `contract_*` rows FK off
`delivery_projects`, so a project **becomes** a contract project purely by having those child rows —
"contract-ness" is structural, not a column (`backend/src/db/ensureContractTrackSchema.ts:39-138`). The
migration therefore adds rows; it never alters a legacy table or `delivery_projects`.

`backfillUnassessedContract(deliveryProjectId)` (`backend/src/services/factory/factoryBackfill.ts`) writes,
in ONE transaction with deterministic ids (idempotent + atomic):

- two `contract_tracks` (`proposal`, `solution_build`), `status = 'unassessed'`, owner unknown (null).
  `solution_student_project_id` is set **only** when a real `DeliveryProjectSourceLink` exists — never
  guessed;
- one `contract_requirements` row that is an **explicit "not yet assessed" marker** — `canonical_req_id
  'UNASSESSED'`, `evidence_state 'unassessed'`, `human_confirmed false`. It is a stored "don't know", not
  a fabricated requirement;
- one `draft` `contract_process_documents` per track with an **empty decomposition** (no processes,
  tasks, assignments, roles). Without at least one document row the read API 404s
  (`backend/src/routes/admin/factoryRoutes.ts:77-80`), so the shell is what makes the project render.

**It fabricates nothing.** Legacy projects hold no process/RACI/source-evidence data anywhere in the
schema, so the only honest representation is `unassessed`. The new evidence value was added to the typed
contract (`backend/src/services/factory/contracts/factoryContract.ts:28` union + `EVIDENCE_STATES`) and
the read mapper now defaults an unknown `evidence_state` to `'unassessed'`, never `'planned'`
(`factoryRoutes.ts:221`).

### What "renders" means (and does not)

A backfilled project **renders** in the command center — the two tracks, the unassessed compliance row,
the empty flow — without error (`factoryProjectView` is null-safe). It is **not approvable**: an empty
task graph fails the gate's structural START/END checks
(`backend/src/services/factory/factoryValidate.ts:131-132`), so the Gate & approval panel reads failed and
Approve is refused by design. Acceptance for an ordinary project is "renders honestly with visible gaps",
never "approves". A real decomposition (and thus approvability) only comes from the generation engine,
which ships dark behind `ENABLE_FACTORY_GENERATION` and is out of Phase 6 scope.

### How to run it (prod)

```
# the contract demo (already live): docker exec accelerator-backend node dist/scripts/seedFactoryDemoContract.js
docker exec accelerator-backend node dist/scripts/seedOrdinaryProjectDemo.js
```

`seedOrdinaryProjectDemo` stands up a labeled ordinary project ("AI Ops Assistant (ordinary demo)", slug
`ai-project-factory-demo-ordinary`) under the shared, reversible "AI Project Factory (demo)" container and
backfills its unassessed shell. Idempotent — safe to re-run.

### Rollback (reversible)

Delete the demo `DeliveryProject`; `contract_tracks` / `contract_requirements` /
`contract_process_documents` / `contract_process_reviews` cascade (`ON DELETE CASCADE`):

```
docker exec accelerator-backend node -e "(async()=>{const {default:P}=await import('/app/dist/models/DeliveryProject.js');for(const slug of ['ai-project-factory-demo-ordinary']){const p=await P.findOne({where:{slug}});if(p){await p.destroy();console.log('removed',slug,p.id);}}process.exit(0);})()"
```

The `'unassessed'` union value is inert if unused; reverting the merge unwinds the code with no data
migration.

### Remaining gaps

- Legacy projects can only be represented as `unassessed` until the generation engine runs — there is no
  legacy source of process/RACI/evidence data to map from.
- Only demo projects exist on prod today; a real backfill of real delivery projects is a later,
  data-owner-approved step (the capability is ready).

---

## 2. Page-consolidation plan (no nav changes this loop)

The Factory Command Center (`/admin/factory`, Program section) shows one contract's process, roles,
human/AI allocation, tasks, and compliance. Surfaces that overlap conceptually — and the decision for each:

| Surface | Route | Overlap | Decision |
|---|---|---|---|
| AI Organization (WorkforceOS) | `/admin/workforce` | roles / AI employees / allocation, but **org-wide** | Stays separate; cross-link later |
| Project Overview | `/admin/projects` | per-project, but **student-build** (build plan / releases / artifacts) | Stays separate |
| Accelerator | `/admin/accelerator` | cohort/project tabs | Stays separate |
| Enterprise Intelligence | `/admin/brain` | cross-entity graph | Stays separate |
| Delivery OS (Client Room / Builder Workspace) | `/admin/refactored/*` | the **closest** conceptual match | Already **retired** from nav (`frontend/src/components/Layout/adminNav.ts:229-232`); its `/api/refactored/admin/*` backend is still live. The eventual absorption target for the factory + Phase 5 builder, not this loop. |

**Conclusion:** no live page duplicates the factory closely enough to force a merge now; the retired
Delivery OS is the long-term absorption target. No nav moves in Phase 6.

### Redirect recipe (for any FUTURE move — do not execute now)

The app already has a proven pattern (`frontend/src/routes/adminRoutes.tsx`): `RedirectKeepingQuery`
(`:108-111`, query-preserving), `LeadDetailRedirect` (`:94-97`, param-preserving), and bare
`<Navigate replace>` aliases (e.g. `/admin/ops-center` → `/admin/workforce` `:204`). The two-gate contract:
a redirected OLD path must ALSO be classified in `adminNav.ts` `UNLISTED_PATH_SECTIONS` **and** backend
`mgmtSectionGate.ts` `PATH_SECTION`, or scoped identities bounce off a page the API would serve. Any actual
move is an escalation-tier step, brought for approval separately.

---

## 3. Role-migration map

### Today

The factory and every overlapping surface are gated on the **same** section, `'program'`:

- `mgmtSectionGate.ts` `PATH_SECTION`: `/api/admin/factory`, `/api/admin/workforce`, `/api/admin/projects`,
  `/api/admin/accelerator`, `/api/admin/brain` → all `'program'` (`:58-62`).
- Roles holding `'program'` (`backend/src/services/access/mgmtRoles.ts:45-75`): **owner** (all sections),
  **admin** (all-but-inbox), **curriculum** (`['dashboard','program']`). No scoped role
  (revenue / admissions / support / mentor / community_organizer) holds it.

So the same people — owner, admin, curriculum — already see the factory and all consolidation candidates.

### The map

**Zero permission change is required for Phase 6.** Any consolidation that keeps pages inside `'program'`
inherits the exact access they have now. Access only changes if a surface is moved to a **different**
section key or a **new** section key is minted — either of which requires updating **both** gates in
lockstep (frontend `adminNav.ts` `sectionForPath` / `UNLISTED_PATH_SECTIONS` and backend
`mgmtSectionGate.ts` `PATH_SECTION`), and is **escalation-tier** (a permission change), handled as a
separate approved step. The dual-gate lockstep is non-negotiable: a path classified on one side but not the
other produces a latent 403 (the failure both `adminNav.ts` and `mgmtSectionGate.ts` warn about).

---

## Acceptance (Phase 6 exit)

- **Contract project** — the existing demo (`ai-project-factory-demo-contract`) passes render →
  request-changes → approve (documented → full); the write layer is live (Phase 4).
- **Ordinary project** — the demo (`ai-project-factory-demo-ordinary`) renders as an `unassessed` shell
  with a visibly failed gate and a disabled Approve — honest, not approvable.

See the run's `deployment-log.md` and `handoff.md` for the live evidence and a non-developer test scenario.
