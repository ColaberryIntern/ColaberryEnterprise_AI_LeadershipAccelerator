# Session CC-20261111-r7m2 — admin soft delete for projects

Ali: *"Create the ability to do soft deletes to projects and hide them from everywhere including
admins with the ability to flip a switch to see deleted projects for possible reinstatement."*
Prompted by Swati asking him to delete "KPI Investigation Automation System" because Project
Studio has no delete option.

## The design I started with was wrong, and mapping first is why it did not ship

My plan was Sequelize `paranoid` mode with a new `deleted_at`. **Soft delete already exists** as
`projects.archived_at`, with a full archive/restore service, its own ensure-schema and
student-facing endpoints. A second column would have produced two half-filters over one table and
doubled the number of queries that can leak a removed project.

What was actually missing was the other two thirds of the request:

1. **No admin path at all.** Archiving was student-only, guarded by `loadOwnedLiveProject`.
2. **~100 reads do not filter `archived_at`**, so an archived project still appeared on the admin
   delivery board, person profiles and cohort stats, and was **still publicly reachable by its
   share token**.
3. No reveal toggle.

- [x] Admin archive, restore and reveal
  - Date: 2026-11-11 · Session: CC-20261111-r7m2
  - What changed: `ensureProjectArchiveAuditSchema.ts` (adds `archived_by`, `archived_reason` as
    ALTERs in their own file), `projectAdminArchiveService.ts`, three admin routes, the
    `ArchivedProjectsPanel` switch, and `archived_by`/`archived_reason` declared on the model.
  - Verification: 19 new cases; 117 across the affected suites; backend `tsc` 0 errors in `src/`
    with a planted control error; frontend `tsc` 0 and `CI=true npm run build:frontend` clean;
    `checkTestTypecheck` matched exactly in both directions.

### Decisions worth keeping

**A separate service, not a flag.** The student path's first act is an ownership check that answers
404 rather than 403 so a project id on another enrollment cannot be probed. An `asAdmin` boolean
threaded through it is one wrong caller away from a student archiving another student's build. The
ownership check is simply absent from the admin service, and the admin check lives at the route.

**The reveal is its own route and its own panel**, not `includeArchived` on the existing listings.
A flag defaults to false in one place and is forgotten in the next; a route that only ever returns
archived rows cannot be reached by accident. The panel fetches nothing until the switch is on, so
opening the board never puts removed work back on screen.

**`nextActiveAfterArchiving` is exported and reused rather than reimplemented.** Its own comment
records that getting it wrong can silently make the platform's 144k-row record a student's active
build. Two implementations is two chances to do that.

**A reason is required.** `archived_reason` is VARCHAR(200) and the service refuses an empty or
over-long one rather than truncating. An admin removing somebody else's project with no recorded
reason is indistinguishable from data loss six weeks later.

### The leaks closed, in priority order by blast radius

| Surface | What it did before |
|---|---|
| `portfolioShareService.getPortfolioByShareToken` | **archived project still PUBLIC by its share link** |
| `projectDeliveryService` | selected `archived_at` and never filtered: archived projects on the admin board |
| `workPanels` (x2), cohort stats (x2) | archived projects shown as current work, inflating phase and maturity averages |
| `enrollmentsWithoutProjects` (x2) | an archived project made a student look covered |
| internship and org counts (x4) | archived counted as "has a project" |

The per-student lookup in `projectOverviewRoutes` also had **no filter AND no order**, so it
returned an arbitrary row; it now takes the newest live one.

### Two mistakes the gates caught

1. **The routes used `err.errorClass`; the real class names it `code`.** Caught by `tsc`.
2. **My test mock had invented `errorClass` too**, so the suite was green against a class that does
   not exist. The mock now mirrors the real shape. A mock that drifts from the thing it stands in
   for has stopped being a test.

### Not done

- **About 90 further unfiltered reads remain.** They are reached by project id rather than by
  listing, so they leak only to a caller who already holds the id. The listing surfaces were the
  ones showing removed work to people who were not looking for it.
- **Not deployed.**
- **"KPI Investigation Automation System" has not been archived.** That is Swati's actual request
  and it needs Ali's go-ahead plus a reason for the audit trail.
