# Implementation Deviations

**Session:** CC-20260821-m6t4 · **Base:** `bb152ded`

Plan §76.15 requires that every conflict between the master plan and repository reality be
recorded here, with the lowest-risk compatible implementation chosen unless the conflict
crosses a strategic governance boundary.

---

## D-01 — Work was moved off the OneDrive tree (blocking, resolved)

**Plan assumption:** work proceeds in the current checkout.

**Reality:** the OneDrive working tree was **2,586 commits behind `origin/main`** and 76 commits
ahead on an unrelated workstream branch, with several dozen uncommitted modifications. It does
not contain `Organization.ts`, `OrgMember.ts`, or `OrgCohort.ts` at all — models the plan
names as foundations to preserve (§3.4).

**Impact if ignored:** every discovery document would have described a codebase that no longer
exists, and the schema work would have collided with 2,586 commits on merge.

**Resolution:** a dedicated worktree at `C:\Users\ali_m\multitenancy-wt` on branch
`workstream/multi-tenant-ecosystem`, created from `origin/main` at `bb152ded`, outside
OneDrive per repository convention. All discovery and implementation happen there.

---

## D-02 — There is no migration framework

**Plan assumption:** §22 describes staged migrations; §64 Gate 1 says "migrations/ensure-schema
strategy consistent with repo".

**Reality:** no `sequelize-cli`, no `umzug`, no `migrations/` directory. Schema evolves via 32
`backend/src/db/ensure*Schema.ts` modules plus inline `ensureXxx()` functions in `server.ts`,
all idempotent raw DDL run at boot. `server.ts:193` records that `sync({alter:true})` once
produced ~50k duplicate constraints and OOM-ed Postgres.

**Resolution:** one new module, `backend/src/db/ensureMultiTenantSchema.ts`, modelled on
`ensureOrgAccountSchema.ts`. Additive DDL only, per-statement error isolation, never fatal to
boot. Backfills are **separate explicitly-invoked scripts**, never boot-time work.

---

## D-03 — `leads.id` is INTEGER, not UUID

**Plan assumption:** §6 correctly types `lead_id INTEGER FK` but the surrounding tables are
UUID-centric.

**Reality:** confirmed — `leads.id` is an INTEGER autoincrement; `visitors`, `visitor_sessions`,
`page_events`, `campaigns`, `organizations` are all UUID.

**Resolution:** `lead_tenant_contexts.lead_id` and `communication_preferences.lead_id` are
`INTEGER`. Every other FK in the new tables is `UUID`. The mixed-key situation is deliberate
and documented rather than "fixed", because retyping `leads.id` would be the single most
destructive change available in this codebase.

---

## D-04 — `page_events` gets tenancy columns with no foreign keys

**Plan assumption:** §9.3 lists seven columns to add to `PageEvent` without commenting on
constraints.

**Reality:** `page_events.lead_id` deliberately has **no FK** — the model comment states the
DDL omits it so Postgres never validate-scans this high-write table.

**Resolution:** the seven new tenancy columns on `page_events` also carry no FK constraints,
matching the established policy. Referential integrity for these columns is enforced in the
service layer, not the database. Declaring a constraint in the model that the DDL does not
create would be a lie about the schema — the existing comment says exactly that.

---

## D-05 — Only `campaigns` receives tenancy columns; 17 child tables scope by join

**Plan assumption:** §14 says "every tenant-owned campaign query must be scoped" and lists
~18 tables to audit.

**Reality:** all 18 are present. All but `FollowUpSequence` are strict children of `campaigns`.

**Resolution:** tenancy columns go on `campaigns` and on `follow_up_sequences` only. The other
17 are scoped by joining to their parent campaign. Stamping `tenant_id` on all of them would
mean 17 backfills and 17 chances for a child's tenant to drift from its parent's. This
satisfies §14's requirement (every query scoped) without its literal column-per-table reading.

---

## D-06 — `UnsubscribeEvent` stays global; no `EmailSuppression` model exists

**Plan assumption:** §16 assumes "one simplistic global marketing unsubscribe flag".

**Reality:** suppression is `UnsubscribeEvent` + `unsubscribeRoutes.ts` + bounce handling in
`mandrillWebhookController.ts`. There is no `EmailSuppression` model.

**Resolution:** matches the plan's own §16 conclusion — infrastructure-level suppression (hard
bounce, abuse complaint, provider suppression, invalid address) stays **global**, and
brand-level preference is a new additive `communication_preferences` table. Global suppression
always overrides a brand-level allow. Plan §76.10 forbids weakening existing unsubscribe /
CAN-SPAM logic, and nothing here touches it.

---

## D-07 — `organizations.owner_enrollment_id` is NOT NULL UNIQUE

**Plan assumption:** §5.5 introduces `platform_identities` as "the eventual person-level
authentication identity"; §52 says keep current organization logic working.

**Reality:** an organization **cannot exist without an `Enrollment`**. A CPN community partner
or an AI Flotation client contact has no enrollment.

**Resolution:** `platform_identities` is fully independent of `Enrollment` and is bridged by
`platform_identity_links`. `owner_enrollment_id` is untouched. Making organizations creatable
without an enrollment is real work with real blast radius on registration, and it belongs to
the CPN product project (plan §80 Project A), not to this foundation.

---

## D-08 — `page_events` has no `site_slug` today

**Plan assumption:** §49 says keep `site_slug` during migration and map it to `LeadSource`.

**Reality:** `site_slug` exists on `visitor_sessions` but **not** on `page_events`. Page-event
brand attribution today is only reachable by joining to the session.

**Resolution:** `page_events` receives `tenant_id`/`brand_id` directly rather than gaining a
`site_slug` it never had. Backfill derives them from the parent session. This gives page-level
brand queries without a join and without inventing a new legacy column.

---

## D-09 — Tracker `email` and `lid` identity params are kept

**Plan assumption:** §10.1 says V2 "must deprecate" raw-email identification.

**Reality:** `handleTrackEvent` accepts unauthenticated `email` and `lid` params, and live
external sites depend on them.

**Resolution:** the signed `journeyLinkService` token path is added and is the **only**
supported identification mechanism for new ecosystem flows. `email` and `lid` keep working for
existing sites, per plan §76.3 (no removing public APIs without a compatibility alias). Their
use is logged so the removal project has usage data. Deprecating them for existing traffic is
a separate change with its own blast radius.

---

## D-11 — `apps/*` and `packages/*` are NOT added to the root npm workspaces

**Plan assumption:** §1.1 says "Extend workspaces safely to include `apps/*` and
`packages/*` when the skeleton applications are introduced."

**Reality:** `backend/Dockerfile` builds with

```
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci
```

`npm ci` requires `package-lock.json` to be exactly in sync with the workspace set, and
it fails outright if a declared workspace's `package.json` is absent from the build
context. Adding `apps/*` and `packages/*` to the root `workspaces` array would therefore
break the **production backend build** on the next deploy, in two independent ways at
once.

**Resolution:** the workspaces array is left alone. The skeleton apps declare
`"dependencies": {}` and build with plain `node build.js`, so workspace registration
would buy them nothing — there is nothing to hoist and nothing to link. Two root scripts
were added instead (`validate:boundaries`, `build:apps`), which do not touch the lockfile
and therefore cannot affect `npm ci`.

The plan's word was "safely". The safe version of this step is not doing it: registering
the workspaces becomes worthwhile only when an app takes its first real dependency, and
that change should ship with a regenerated lockfile and an updated Dockerfile context in
the same diff.

---

## D-10 — Playwright ecosystem suite is authored, not executed

**Plan assumption:** §54 and §66 require a passing Playwright ecosystem smoke suite.

**Reality:** `/tests/systemV2` needs a running stack and staging credentials unavailable in
this environment.

**Resolution:** the specs are written and committed; they are **reported as not executed**, not
as passing. This is a real gap in the Definition of Done and is stated as such in the
validation report rather than papered over.
