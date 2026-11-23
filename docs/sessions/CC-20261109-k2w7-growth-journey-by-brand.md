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

### T3 hardening after independent verification — commit `cc2ce1903`

T3 scored **11/12, PASS**, graded by `loop-task-verifier` on evidence it gathered itself. Five
findings, all taken rather than deferred, because T4 is the controller that would have paid for
the first one.

1. **`brandRoleBodySchema` is now branded** and `setBrandRole` takes `BrandRoleBody`. The
   inferred type was `{ title: string; description: string }`, which TypeScript satisfies
   structurally — so a controller that forgot to `parse` would have compiled, stored unbounded
   markup, and failed no test. Proven with a throwaway probe module: an unvalidated object is now
   `error TS2345`. That is a compile-time guarantee where a test would have been a hope.
2. **The pre-write log line no longer claims success.** It is emitted before the update and it is
   the designated rollback record; claiming `success` there meant a write that threw still read
   as one, and the line could not distinguish "about to write" from "wrote". Now
   `brand_role_write_starting` / `partial`, with a second line after the update claiming the
   success, and the ambiguous-programme line reclassified as `failure` with an `error_class`.
3. **A wrong measurement in my own comment, corrected.** It said "77 maya-matching files plus 189
   under `agents/`"; those counts include the `__tests__` files this scanner's walk skips.
   Re-measured independently under the scanner's own rules: **43, 164, union 207**. The `> 150`
   floor was and is honest, but a floor justified by the wrong measurement is one nobody can
   check.
4. **The leak scan now catches a dynamic `await import(...)`**, which the verifier demonstrated
   slipping past the first regex. Each spelling — static, type-only, `require`, dynamic — is
   proven by a cell rather than by reading the pattern, and the file carries the "what this
   provably cannot see" section `redactionAndFlags.test.ts` sets the precedent for: a re-export
   shim remains invisible, because the Maya file would never name this module.
5. **Two missing cells added:** idempotency (CLAUDE.md's fourth mandatory type) and the
   ambiguous-programme refusal on the **write** path, asserting neither candidate row was written
   to.

Verification after hardening: **3 suites, 52 tests passed**; blast radius
`npx jest src/services/growthJourney src/schemas` → **130 suites, 2,899 tests passed**;
`tsc --noEmit` 0 errors. Mutation A still kills 3 cells; the dynamic-import evasion now kills the
leak cell by name.

**One product question deferred to Ali, not a defect.** `execution-contract.md` assumption 4 says
a programme-less brand should "show the role as unset and offer to set it". The read half ships;
the set half is refused, because there is no row to write to. Either those four brands stay
read-only-unset, or somebody decides to create journey programmes for them — a decision, not
code.

---

## T12 — deployed to production, 2026-11-23

**Session:** CC-20261109-k2w7
**What changed:** PR #4351 merged and deployed; `GROWTH_JOURNEY_ENABLED=true` set in the
production backend environment. Reads only.
**Verification:** 19 in-container checks passed, each with a control that must come back
absent. Full evidence in
`.loop-architect/runs/20261121-growth-journey-by-brand/deployment-log.md`.

### The deployed commit is not the merge commit, and that is not a mistake

PR #4351 merged as `abfcf1b98` at 11:58:39 UTC. PR #4352 merged **11 seconds later**, and
GitHub cancelled the superseded `Build images` run — so no image was ever published for
`abfcf1b98`. `deploy-prod.sh` runs in registry mode, which needs an image for the exact
commit and refuses rather than silently shipping an older one. The deploy therefore rode
main HEAD, `f6b7ed30f`.

Proven rather than assumed, in both directions:

```
git merge-base --is-ancestor abfcf1b9819e origin/main   -> true
git merge-base --is-ancestor f6b7ed30f9a4 abfcf1b9819e  -> false   (control)
```

The reverse check is there so that "is an ancestor" cannot be a test that returns true for
anything handed to it.

Production was 20 commits behind, so this release also carries other sessions' merged work.
That is what deploying main means; it is worth stating rather than discovering later.

### The host .env edit alone would not have switched the flag on

Measured in that order on purpose. After appending `GROWTH_JOURNEY_ENABLED=true` to
`/opt/colaberry-accelerator/.env` (line 315, backup at `.env.bak-20261123T120127Z`) and
**before** deploying:

```
docker exec accelerator-backend printenv GROWTH_JOURNEY_ENABLED   ->   (nothing)
```

The compose file already warns about this — *"a bare host-.env edit may not recreate"* —
and other flags there are written as literals in `environment:` for exactly that reason.
The flag took effect because the deploy replaced the container with a new image, not
because the file changed.

**The consequence for whoever flips a flag next:** editing `.env` is not a deploy. A flag
change without a container recreate reads as a flag that does not work.

### Before and after, from the box

| Fact | Before | After |
|---|---|---|
| Backend image | `sha256:475d5653…` | `sha256:bf59709f…` |
| nginx image | `sha256:f646b3c7…` | `sha256:5e3b4391…` |
| `GROWTH_JOURNEY_ENABLED` in container | unset | `true` |
| `growthJourneyExplorerController` in running `dist` | 0 | 14 |

The deploy printed `Container accelerator-backend Running` while nginx said `Recreated`,
which reads as a skipped backend recreate and is not one: the image digest changed and the
running `dist` went from 0 to 14. The digest is the evidence. Compose's wording is not.

### Unauthenticated HTTP cannot verify this surface at all

Every probe returns 401, **including a route that does not exist**:

```
401  /api/admin/growth-journey/explorers/summary
401  /api/admin/growth-journey/brand-role
401  /api/admin/explorer-growth/summary
401  /api/admin/this-route-does-not-exist-control    <- the control
```

`requireAdmin` runs ahead of the router mount, so the status code says nothing about
whether a route exists. The control is what makes that visible; without it, four 401s look
like a failed deploy. Route presence is proven from inside the container and nowhere else.

Minting an admin token to get past this was not done — a production secret operation,
out of bounds for this run. So the honest ceiling is: **the code and the flag are provably
in the running containers; the surface itself is proven only as far as a signed-in operator
loading the page.**

### One verification check failed, and the failure was the check

`Brand not in scope` asserted against `dist/controllers/growthJourneyExplorerController.js`
returned 0. The string lives in `tenantAuthorization.js`, which the controller delegates to;
the controller never spells it. Re-pointed at the right file: present 3 times.

Recorded because a check naming the wrong file reports a defect that does not exist — and
the same mistake in the other direction passes silently.

### Also recorded: two-word patterns do not survive the quoting chain

`grep -e "Brand setup"` sent through PowerShell to ssh to sh arrives split, and grep reads
`setup` as a path. It fails loudly here (`No such file or directory`) but a pattern that
happens to match a real path would fail **quietly and wrongly**. All verification runs
through a scp'd script for that reason.

### State after this deploy, before the membership seed

| Request | Result |
|---|---|
| `/admin/growth-journey`, no brand | 200, whole population, labelled "All brands" |
| `…?brand=<any brand>` | 403, rendered as a named configuration state, zero rows |
| `/admin/explorer-growth` | forwards to the merged page with no brand param |

`tenant_memberships` holds zero rows, so `scopedContext` refuses any request naming a
brand. Fail-closed and intended. The seed is Option B, 54 memberships, zero human
lock-outs, and remains Ali's to run:
`docs/sessions/CC-20261109-k2w7-membership-seed-dry-run.md`.

No sub-flag set. No journey programme activated. No `explorer_*` table touched. Nothing can
send.

---

## T14 — the Brain and Settings tabs, restored, 2026-11-23

**Session:** CC-20261109-k2w7
**What changed:** `brain` and `settings` added to `/admin/growth-journey` (12 tabs to 14);
Maya's Brain client split out of `explorerGrowthApi.ts` into `mayaBrainApi.ts`; a
`GlobalScopeNotice` on both tabs; `TAB_MAP` in the Explorer redirect now carries both keys.
**Verification:** frontend 20 suites / 393 passed (was 19 / 383), Explorer's own 16 suites /
203 passed, both copy ratchets 42 passed with baselines untouched, `tsc` clean with a planted
control, notice mutation kills 9 of 10 cells.

### The gap, and why no test caught it

Ali, 2026-11-23: *"We are also missing the brain which is a very important part."*

The execution contract excluded Explorer's write surfaces, and the PR body stated that as
*"reachable nowhere in this build"* as though it were a parking decision. **It was not a
deferral, it was a removal**, and the thing that turned one into the other was the redirect
shipped in the same PR: `/admin/explorer-growth` no longer renders Explorer's page, so the
only route to the Brain stopped existing. Its backend routes stayed mounted and live the whole
time with nothing able to reach them.

Worse, a bookmark to `?tab=brain` did not break. `TAB_MAP` had no entry, so it fell back to
`shadow` and rendered a working page. **A missing surface that silently lands somewhere
plausible is the worst shape for this kind of bug** — nothing announces it, and the operator
concludes they misremembered where the tab was.

The independent production verifier found the same thing from the other direction on the same
day, before Ali's message arrived. Two findings, one cause.

### Why the Brain mattered more than the role field I shipped

The original ask was that Maya's role and job change by brand. What T3 shipped was a role
**title and description** in `journey_programs.metadata` — display copy. The Brain is where
the substance lives: her voice, her never-say list, which shelves she draws from, how often,
and the Monday email. Restoring it is closer to the original request than the field built for
it.

### The Brain is global, and that is now stated on its face

`saveBrainRules` persists through `setSetting(BRAIN_RULES_SETTING, ...)` — **one system
setting shared by every brand**. So saving the rules changes what Maya says everywhere, and
the inventory and already-given list are Explorer's population, which is Colaberry Training's.

Under a brand selector all of that reads as "this brand's". An operator who picks Colaberry
Enterprise, edits the voice and saves has just rewritten Colaberry Training's outreach and
been told nothing. **That is the same class of error as rendering one brand's learners under
another's name** — the failure `ScopeState` exists to prevent — except the mismatch is in the
label rather than the fetch.

Nothing in code can prevent it; it is a property of the storage. So `GlobalScopeNotice` names
the selected brand and says the tab does not follow it, and a mutation that makes the notice
render nothing **kills 9 of the 10 cells**. The survivor is the one asserting the settings
body renders, which is exactly the cell that should survive — a mutation killing everything
would mean the tests were coupled rather than discriminating.

Per-brand rules are the next increment and need brand-keyed storage, which is a storage
change rather than a client change. Ali chose that sequencing deliberately: restore access
first, then per-brand rules, rather than mixing a port with a storage change in one diff.

### The safety check Ali asked for, done from source

He approved all writes including the sample generator, on condition its no-send behaviour was
proven from the backend rather than from its comment. It was:

`DraftRenderDeps` has exactly **three** write-capable members, and the sample neutralizes all
three — `commitDraft` and `recommitDraft` replaced with an in-memory capture returning a fake
`sample-N` id, and `enqueueForApproval` set to `undefined`. The other fifteen members are
loaders, one model call, or pure validators. `gatherBrainPiece`, the one whose name suggests
it records a pick, delegates to `openHouseBrain.ts`, which contains **zero** write-shaped
calls in the whole file — verified with a control proving the grep actually ran rather than
matching nothing.

No `scheduled_emails` row is created, so nothing exists for a send worker to collect. There is
a second, independent protection: in `liveDeps`, `enqueueForApproval` is itself gated on
`explorer_growth_send_enabled`, so even un-overridden it would be inert. The sample does spend
model tokens, capped at 5 people by 3 emails, which is why its route is `requireFullAdmin`.

**Settings turned out not to be a write surface at all.** Its own header records that the mode
dropdown is deliberately absent, because its upper values are what would let the system email
real learners. Restoring it cannot enable sending.

### Splitting the client, which the size rule required anyway

The Brain's client sat in `explorerGrowthApi.ts` at **786 lines**, past this repo's 500-line
hard ceiling and grandfathered until touched. Two pages need the Brain now, so a copy would
have been two definitions of one contract. Extracted unchanged to `mayaBrainApi.ts` (156
lines), with `explorerGrowthApi.ts` re-exporting it via `export *` so **not one Explorer
component was edited** — the cheapest way to guarantee AD-1 is to not touch it. That file is
now 713 lines: still over the ceiling, reduced rather than fixed, and left there because
splitting the rest is not this change's job.

The extraction was done with `head`/`tail` reconstruction rather than in-place surgery,
because index-based string edits broke JSX twice earlier in this build.

### Two process notes worth keeping

**A clean `tsc` and a `tsc` that never ran look identical.** The extraction was validated by
planting `export const CONTROL_ERROR: number = "..."` and confirming `TS2322` at that exact
line before trusting the clean run.

**`jest.clearAllMocks()` in `afterEach` removes the implementation, not just the call
record.** A `mockResolvedValue` declared in the `jest.mock` factory survives exactly one test;
every later one receives `undefined` and fails as `Cannot read properties of undefined
(reading 'then')` deep inside the hook, far from the cause. Set it in `beforeEach`.

---

## T15 — Maya's brain rules, per brand, 2026-11-23

**Session:** CC-20261109-k2w7
**What changed:** `maya_brain_rules` is now keyed by brand, with the shared set as the fallback.
The Brain tab reads and writes the selected brand; the draft renderer, the governor and the send
guard all read Explorer's brand. New shared module `services/explorerIdentity.ts`.
**Verification:** backend 52,394 passed; 12 new cells in `brainRulesByBrand.test.ts`; leak
mutation kills 3 of 12; frontend 394 growthJourney + 203 Explorer passed; both typechecks clean;
test-typecheck baseline matched both directions; copy ratchets 42 passed; build compiled.

### Why this was the increment that mattered

T3 shipped a per-brand role **title and description** in `journey_programs.metadata`. That is
display copy. Maya's voice, her never-say list, which shelves she draws from and how often are
what actually make her an Enrollment Specialist on one brand and a Business Development
Specialist on another, and until now they were **one setting shared by everybody**.

### The property that made it safe to ship

`loadBrainRules()` with no brand reads exactly the key it always read. A brand with no row falls
back to the shared set. So with no brand rows anywhere, **behaviour is byte-identical to
before** — which is the state of every brand on the day this ships. It changes nothing until
somebody saves a brand's rules, and the first save affects only that brand.

That matters because this touches the path that decides what Maya says. A change there should
do nothing until it is asked to.

### A cycle, and the fix CLAUDE.md names

`services/growthJourney/**` imports `services/explorerGrowth/**` in at least six places. So the
moment `explorerGrowth` needed Explorer's brand identity — which lives in
`growthJourney/explorerProgramBridge` — the import would have closed a cycle between two
top-level service trees.

CLAUDE.md's Modular Composition Rule names both the smell and the remedy: *"A imports B imports
A is a code smell that signals a missing third module C that both depend on."*
`services/explorerIdentity.ts` is module C. It depends on `modules/tenancy` only, which imports
no service, so it cannot be part of any cycle.

It holds the two BRAND slugs, not the programme slug: pulling the programme slug in would drag
a growthJourney dependency back into module C and undo the point of it. `explorerProgramBridge`
composes `EXPLORER_PROGRAM` from it, so **all 14 existing importers are untouched** — the same
extract-and-re-export shape used for `queryParams`, `explorerStates` and `mayaBrainApi`.

### The guard that made me justify a new dependency

`noSendPaths.test.ts` enforces a **whitelist** of what the Governor may import, and the new
import failed it. That is the test working: its header says a new dependency *"is a deliberate
decision that fails this test until someone adds it and says why."*

Traced rather than assumed before adding it:
`governor -> services/explorerIdentity -> modules/tenancy/tenantResolver -> models`.
`explorerIdentity` has exactly one import; `tenantResolver` has exactly one, and it is `models`.
No mailer, scheduler, queue or campaign engine anywhere on the chain.

### Isolation is asserted on keys written, not on a read-back

The load-bearing property is that saving Colaberry Enterprise's voice cannot rewrite what Maya
says to Colaberry Training's 1,191 learners. The test asserts the **keys written**, because a
read-back assertion passes against an implementation that writes both keys and happens to read
the right one. A mutation making the save write the global key regardless kills 3 of 12 cells;
the 9 read cells correctly survive, which is what makes it a targeted kill rather than coupling.

### Three things that went wrong here, each worth keeping

1. **My test fixture was invalid, not the code.** It distinguished rule sets by a short
   `explorerVoice` marker; `resolveBrainRules` rejects a voice that short and substitutes the
   real one, so all seven cells failed at once. The fixture now varies `brainPickMinHours` and
   `neverSay`, all valid values, all three distinct — and the defaults cell pins that the
   default differs from both, so a drift cannot make the fallback cells pass while proving
   nothing.
2. **A test asserted typography, not meaning.** The notice copy uses `&rsquo;`, which renders as
   U+2019 and does not match a typed `'`. The assertion now reads around the apostrophes.
3. **`tsc` caught what jest could not.** Explorer's 203 tests passed with a `BrainControl`
   fixture missing the two new fields, because the jest transform does not typecheck. The
   frontend `tsc --noEmit` found it. Running the suite is not the same as checking the types.

### Still not brand-scoped, and the notice says so

The shelf inventory is one library, and the already-given list is Explorer's population, which
is Colaberry Training's. The notice did not disappear when the rules became per-brand; it
changed to name the half that still does not follow the selector. **A notice removed the moment
part of a problem is fixed is how the other half gets forgotten.**

### One failure I could not fully attribute

The full suite showed 5 failures: the four long-standing ones, plus
`sessionRecordingService.test.ts`, which is new to that list. It **passes in isolation (27
tests)**, is absent from this branch's diff, was last touched on 2026-11-18 by other work, and
fails with a Sequelize model-registry `TypeError` in the Zoom recording path. It reads as an
ordering flake under the full parallel run. **I did not prove it also flakes on `main`**, so it
is recorded as unattributed rather than as pre-existing.

---

## T16 — the membership seed and the brand-context backfill, 2026-11-23

**Session:** CC-20261109-k2w7
**What changed:** Two production data writes, both authorised by Ali in this session.
`tenant_memberships` 0 to 54 (Option B), and 939 `lead_tenant_contexts` rows created so every
Explorer profile is stored under Colaberry Training.
**Verification:** below, each with a control.

### Why the seed had to happen for any of this to be visible

Every brand selection answered 403, Colaberry Training included, and the page rendered a named
configuration state with zero rows. That was fail-closed and correct, but it meant the whole
by-brand build was invisible.

The cause is precise and worth keeping, because it is not obvious from the flag being on.
`tenantAuthorization.ts` computes
`permitted = Boolean(tenantId) && (authorizedBrandIds === null || includes(...))`.
With zero memberships no tenant resolves, so `Boolean(tenantId)` is false and the expression
short-circuits **ahead of the super-admin escape**. A platform super-admin was refused every
brand too.

### The seed, measured rather than recalled

Dry run re-run immediately before the write and matched 2026-11-22 exactly: 15 identities,
15 links, **54 memberships**, 35 lock-outs, **0 human**. Written: identities created 14 /
existing 1, links created 15 / conflicts 0, memberships created 54 / existing 0.

| Check | Result |
|---|---|
| `tenant_memberships` | **54** — 28 `tenant_admin`, 24 `tenant_viewer`, 2 `platform_super_admin` |
| People / tenants | 15 / 4 |
| Ali's own account | **1** membership, `platform_super_admin`, tenant `colaberry` |
| Humans with no membership | **0** |
| CONTROL: `ai_staff` with no membership | **35** — proves the check can find people |

That control matters: "0 humans locked out" is only meaningful beside a number the same query
**did** find. Without it, a broken join reads as a clean result.

Ali holds exactly **one** membership, which is what makes the page work:
`authorizedTenantIds.length === 1` is the branch that resolves `tenantId` when the frontend
sends no tenant, and the frontend never sends one.

### The backfill, and the thing it deliberately did not do

Ali, 2026-11-23: *"Everything that exists today should be stored under Colaberry training."*

Measured first: of 1,221 Explorer profiles, 282 already carried a Colaberry Training context,
939 carried none, and **zero belonged to any other brand**. So this recorded an attribution
that was already true rather than deciding a new one.

Written through `ensureLeadTenantContext`, the app's own writer, not an INSERT. Three reasons,
all of which matter:

1. It is already the one place brand relationships are created, so the backfill cannot drift
   from how the product does it.
2. It is idempotent by construction, over a unique index on `(lead_id, tenant_id, brand_id)`.
3. **It defaults `consent_contact` to false.** Its own comment says why: *"Inheriting consent
   from another brand relationship would be a CAN-SPAM problem wearing a data-model costume."*

| Check | Result |
|---|---|
| Created / existing / failed | **939 / 0 / 0** |
| Explorer profiles resolving to Colaberry Training | **1,221 of 1,221** |
| Still without a context | 0 |
| Idempotency: re-run | finds **0** to write; control shows 1,221 already have one |
| Other brands | untouched: 20 / 6 / 1 / 1, unchanged |
| **Consent on the 939 new rows** | **all false**, 0 `consent_at`, 0 `consent_source` |

### A verification of mine that was wrong, and how it was caught

The first consent check counted every Colaberry Training context with `consent_contact = true`
and returned **203**. Read quickly, that says the backfill made 203 people contactable. It did
not: those rows were created between 3 and 10 November by real forms.

The query was asking the wrong question. Re-scoped to rows created in the last hour, the answer
is 939 rows, **all false**, with a control confirming exactly 939 rows written in that window.

**A number that looks alarming is worth a second query before it is worth a sentence.**

### What this does not do

The 939 rows record attribution. They grant nothing: no consent, no contactability, no change
to any sending path. The backfill touched no other brand, and `explorer_*` tables were not
renamed, altered, copied or migrated, so AD-1 holds.

The seed closed the cross-tenant migration ramp for every admin, which is the one-way-feeling
part. It is reversible: the ramp condition is `(await TenantMembership.count()) === 0`, so
deleting the rows re-opens it.

---

## T17 — a named brand names its own tenant, 2026-11-23

**Session:** CC-20261109-k2w7
**What changed:** `buildRequestContext` now resolves a tenant from a requested `brand_id` when
no tenant resolved otherwise, but only when the caller already holds a membership in that
brand's tenant.
**Verification:** 47 cells in `tenantAuthorization.test.ts` (was 39); the privilege-escalation
mutation kills exactly 1, and it is the security cell; 6 tenancy suites / 115 tests;
`tsc` clean, proven with a planted `TS2322` control.

### The fault, found by the independent verifier and not by me

Phase I cycle 2 measured production: **13 of 15 admin identities hold memberships in four
tenants and are not super-admins**, and the admin client sends `brand_id` but never
`tenant_id`. `tenantId` resolved only via `authorizedTenantIds.length === 1`, so for those
thirteen it stayed null, `Boolean(tenantId)` short-circuited the brand check, and every brand
selection answered 403.

The page worked for the two super-admins and silently refused everyone else.

### It is a consequence of a recommendation I made

Option B of the membership seed gave each person all four tenants, which I argued for because
nobody loses access to the cpn, ai-flotation and refactored surfaces. That was true. What I did
not think through is that **four tenants is as unresolvable as zero** under
`length === 1`, so the roster that preserved everyone's access is the roster that left nobody
able to resolve a tenant. Option A would have given each person one tenant and the page would
have worked for all fifteen.

Nothing got worse: before the seed everyone got 403 anyway. But it was not fixed for them, and
I reported the seed as the thing that unblocked the page when it unblocked it for two people.

### The fix, and the half of it that is the actual work

Adopting the brand's own tenant is the obvious move and is a **privilege escalation** if it
stops there. Every membership row in production carries `brand_id` NULL, so
`authorizedBrandsOf` returns null (unrestricted) for everyone. With a tenant resolved from the
brand alone, any operator with any membership could read any brand.

So the adoption is gated on the caller already holding a membership in that tenant, which is
the same test `requestedTenantId` passes through. A CPN viewer naming a Colaberry brand still
resolves nothing and is still refused.

**The load-bearing test is the refusal, not the grant.** A version that drops the membership
check passes every other cell in the new block. The mutation that drops it kills exactly one
test of 47, and that one is "REFUSES a brand whose tenant they do not belong to".

### Two smaller things the tests pin

- The brand is **not** looked up when a tenant already resolved, asserted on the lookup *not*
  happening. "It still works" would also be true of a version that queried on every request to
  an authorization hot path.
- A failed brand read **fails closed**, the same stance as the membership read above it. A
  database outage must not become a grant.

### A note for whoever adds the next model import here

`Brand` joined the `jest.mock('../../../models', ...)` factory in that suite. The production
code wraps the lookup in try/catch and fails closed, so a model missing from that mock does
**not** throw: it silently denies, and the cells would pass for the wrong reason.
`expect(brandFindByPk).toHaveBeenCalledWith(...)` is asserted where the lookup is supposed to
happen so that cannot go unnoticed.

### An environment artifact worth recording

Running the suites in the orphaned `wt-growth-brand` worktree, whose git registration another
session had pruned, failed `ownerIsConfiguration.test.ts` on a repo-wide scan **including its
own positive control**. The same suite passes in a clean worktree. A positive control failing
alongside the assertion is the signal that the scan, not the code, is what broke.
