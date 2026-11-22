# Session CC-20261109-k2w7 — Explorer Growth, by brand, inside Growth Journey

**Why this exists.** Ali, 2026-11-22: *"I noticed there is a Explorer Growth page and Growth
Journey page. We have been using Explorer Growth, but it seems like Growth Journey was meant to
create the same logic, but across the different brands. For example, for the Colaberry Training
brand, Maya is an Enrollment specialist, but for Colaberry Enterprise, she is a Business
Development Specialist. She will still have job of reaching out to new accounts, but her role and
job will change depending on the brand. I need these 2 pages merged and be able to be setup by
brand."*

**Branch:** `workstream/growth-journey-by-brand` (worktree `C:/dev/wt-growth-brand`)
**Run directory:** `.loop-architect/runs/20261121-growth-journey-by-brand/` (gitignored)

`PROGRESS.md` is sealed, so this file is the log of record for this piece of work.

---

## Decisions taken up front, so they are not re-litigated later

| Question | Ali's answer, 2026-11-21 / 22 |
|---|---|
| Shape | A **true merge**: one page, the old URL redirects |
| Maya's role | **Configurable per brand in the UI**, display and copy only |
| Parity | **Everything read-only now**; writes in a follow-up |
| Brand data | All 1,191 Explorer profiles are **Colaberry Training** |
| Switch on | `GROWTH_JOURNEY_ENABLED=true` in prod, reads only |
| Membership blocker | Build rides `scopedContext`; **Ali runs the seed** after a dry run |
| Delivery | One PR, one merge, one deploy |

**AD-1 (hard):** no `explorer_*` table is renamed, altered, copied or migrated, and
`/admin/explorer-growth` keeps working.

---

## The state this deploys into, measured read-only against production 2026-11-21

| Fact | Value | Why it matters |
|---|---|---|
| `explorer_journey_profiles` | 1,191 rows, **no brand/tenant/program column** | Single-brand by construction, so scoping is resolved at read time rather than backfilled |
| Profiles resolving to another brand's context | **0** (282 Colaberry Training, 909 none) | The assumption the whole build rests on holds today and **nothing enforces it** |
| `tenant_memberships` | **0 rows** (14 `platform_identities`) | `scopedContext` cannot grant a brand, so **every brand-scoped journey read 403s today** |
| `journey_programs` | 4 rows, all `status='draft'` | Colaberry Training `learner`, Colaberry Enterprise `business`, CPN `learner`, AI Flotation `consulting` |
| Brands | 8 active across 4 tenants; 4 have a journey programme | The other 4 read as unset |

`adminScopeBridge`'s migration ramp keeps admins cross-tenant while `tenant_memberships` is
empty, but **`scopedContext` does not consult the ramp.** Both paths were read; they genuinely
differ. That is why the UI has to render a 403 as a named configuration state rather than a red
error, and why the seed is Ali's run, not the loop's.

---

## T1 — whether a requested brand is Explorer's

`backend/src/services/growthJourney/explorerBrandScope.ts`

- Date: 2026-11-22 · Session: CC-20261109-k2w7 · Commit `c8076b6c1`
- Verification: **10 tests passed**; `tsc --noEmit` clean with a planted control proving it discriminates.

The lookup takes a **tenant slug as well as a brand slug**, through `resolveBrandBySlug`, because
`brands` is unique on `(tenant_id, slug)` and **not** on `slug`. A slug-only lookup can bind a
different tenant's brand, report `explorer_brand`, and serve all 1,191 Colaberry Training learners
under it. The `unknown_brand` branch cannot catch that, because the row genuinely exists. The
identity comes from `EXPLORER_PROGRAM`, which already existed and is already depended on by five
modules — the first draft of the plan invented a new constant for this and an audit caught it.

A request with **no brand is not automatically every brand**: it falls back to the caller's own
brand, so a brand-restricted operator cannot omit the parameter and be served everyone's rows.

**Mutations:** dropping the tenant from the lookup killed 1 test; letting an unknown brand through
killed 1.

---

## T2 — Explorer's thirteen reads, brand-scoped

`backend/src/services/growthJourney/reads/explorerBrandReads.ts`

- Date: 2026-11-22 · Session: CC-20261109-k2w7 · Commit `afaec00be`
- Verification: **12 tests passed**; `tsc --noEmit` clean.

Every read delegates to an **unmodified** Explorer service. Nothing re-derives a score or reaches
past those services into Explorer's models, for the reason `explorerFacade.ts` already gives: a
facade that re-derived anything would be a second Explorer, and the moment the two disagreed
nobody could say which was right.

Out of scope returns **`data: null`, never zeros** — "this brand has no explorers yet" and "we
cannot show you this brand" are different facts, and a confident `0` asserts the first while
meaning the second. The decisive property is that when the scope refuses, **the Explorer service
is not called at all**, which a spy asserts; "returned null" would also be true of a version that
fetched the rows and discarded them, and that version leaks through logging, timing and error
messages.

Three of Explorer's sixteen read GETs are deliberately **not** carried: `/learners/:id/scores`
(nothing renders it), `/decisions/:id/history` (a deferred write surface) and `/controls` (the
deferred Settings tab).

**One inherited write, stated rather than glossed:** zero data writes, but `getOutreach` opens
with `ensureCampusActivitySchema()`, three `IF NOT EXISTS` statements that already fire whenever
anyone opens Explorer Growth's Campus tab. Inherited, not introduced.

A **drift sentinel** ships with the summary read: it counts Explorer profiles whose brand context
resolves elsewhere, reports rather than blocks, and distinguishes "could not check" (`-1`) from
"checked and fine" (`0`).

**Mutations:** removing the out-of-scope guard killed **5** tests, including the no-call spy;
hardcoding the sentinel to always hold killed 1.

**Correction made during the build:** `getLearnerDecisions` is paginated, taking
`(enrollmentId, limit, offset)`, not one argument. The plan had it wrong and the typechecker
caught it. The page is threaded through rather than defaulted, because a default would silently
cap a learner drawer at whatever number this file happened to pick.

---

## T3 — the per-brand agent role

`backend/src/services/growthJourney/brandRoleService.ts`,
`backend/src/schemas/growthJourneyBrandRoleSchema.ts`

- Date: 2026-11-22 · Session: CC-20261109-k2w7 · Commit `ca95f3649`
- Verification: **3 suites, 48 tests passed**; `tsc --noEmit` clean with a planted control
  producing exactly one error.

This is the **one write this build introduces**, and it is configuration, not capability.

**Display and copy only.** Nothing reads the role to decide what an agent may do or say. A
pattern-based scan asserts that no Maya or agent file imports the service — **pattern, not
directory**, because twelve `maya*` files sit loose under `services/` and
`admissionsMayaService.ts`, where `MAYA_ADMISSIONS_VOICE` actually lives, is not under `maya/` at
all. A directory scan would have skipped the single most likely home for a persona leak. The scan
proves its matched set is non-empty before asserting none of them imports the service, so a glob
that silently matches nothing cannot pass.

### The clobber guard

`journey_programs.metadata` holds exactly one key today. A bare
`program.update({ metadata: { role } })` **destroys `terminology`**: `terminologyOf` returns null,
the caller falls back to `NEUTRAL_WORDS`, and every Growth Journey tab silently rebrands from
"learner / enrolment / path" to "subject / relationship / pipeline". Nothing errors. Nobody is
told.

The repo already solved this, so its solution is the one copied —
`seedJourneyPrograms.seedTerminology` does read-modify-write with a spread and guards the same
three shapes (null, non-object, array all collapse to `{}`). The load-bearing test asserts
`terminology` is **byte-identical** after a role write, not merely present and shaped right.

The prior `metadata` is logged before the write, so a bad value is restorable from the log without
a backup. Safe to log: the column holds operator configuration only and carries no personal data
by construction.

### Four honest outcomes, not two

`journey_programs` is unique on `(brand_id, slug)` rather than `brand_id`, so a brand may legally
carry more than one programme. Today none does — which is exactly why "take the first" would work
on every row that exists and bind an arbitrary programme the day one does not. The brand's own
default pointer wins when it resolves **and belongs to that brand**; zero programmes and many are
refused distinctly.

### Two documented deviations from `plan.md`

1. **The seeded default is keyed by programme kind, not brand slug.** That reproduces both of
   Ali's named values exactly — Colaberry Training is `learner`, Colaberry Enterprise is
   `business` — while adding no brand-slug map, and follows `journeyTerminology.ts`, which made
   the same call for the same reason ("the words follow the machine"). Importing
   `journeyProgramDefinitions.ts` from a service a route reaches would have dragged in
   `offerPolicyDefinitions` → `models/OfferFamily` → a real database connection, which is the trap
   that file was moved out of the seed tree to avoid. **Consequence, stated rather than buried:**
   CPN defaults to "Enrollment Specialist" rather than a neutral placeholder, because CPN runs a
   learner journey. Every default is overridable per brand.
2. **A brand with no programme reads unset and the write is refused with a reason**, where
   `plan.md` said such a brand is "settable". There is nowhere to store a role without a
   programme row, and creating a journey programme is creating a journey — out of scope.

American spelling is deliberate and does **not** match `terminology`'s `enrolment`. These are
Ali's words for a job title. Do not "fix" one to match the other.

The length bound is applied **after** stripping, so it governs what is stored rather than what was
typed.

**Mutations:** replacing the spread with a bare object killed 2 tests (both clobber cells, 25
surviving); adding an import of the service to `maya/mayaPortalPrompt.ts` killed 2; adding it to
the loose `admissionsMayaService.ts` killed 1 — and that third one is the proof the pattern scan
earns its keep, because the prompt-name scan did not catch it and a directory scan would not have
either.
