# Backbone adoption — the register that says who is actually on the lifecycle

**Why this file exists.** Two builds were paused waiting for this one: the government contracts
pipeline and the Project Factory's ten agent domains. The owner's question on 2026-10-14 was the
right one — *can I be sure what I am building in those two projects is connected to this process?*
— and the honest answer was **"one yes, one not yet proven"**. That is not something to hold in
anybody's head. It is a register with measurable exits.

**The rule this encodes:** the lifecycle is the backbone. A project-creating path that does not
register a lifecycle row is a bypass, not an exception. This programme's acceptance ID **LC-01**
says a new-project path "cannot bypass plan authorization", and these tasks are how that gets
proven for each consumer rather than assumed.

---

## Where each consumer stands, measured 2026-10-14

| Consumer | Wired? | Proven in production? | Evidence |
|---|---|---|---|
| 🏭 **Project Factory** (10 agent domains) | ✅ | ✅ | All ten domains hold exactly one `project_lifecycle_states` row each, stage `discovery`, created 2026-10-13 14:03Z. 0 duplicates, 0 orphans, 0 tenant mismatches |
| 🏛️ **Gov contracts** (delivery projects) | ✅ | ✅ **proven 2026-10-14** | The delivery hook fired in production for the first time. A sandbox project created through the real `DeliveryProject` model — the exact hook-carrying path `govDeliveryProject.ts:134` uses — left **exactly one** `project_lifecycle_states` row: stage `discovery`, `tenant_id` matching, `entry_point` `delivery_project.afterCreate`. Created, verified, then removed; baseline restored to 4 projects / 0 delivery lifecycle rows. Full query + output in **B1** below |
| Legacy delivery projects | — | n/a | 4 rows, 2 of them `government_public_sector`, created 2026-09-21 → 2026-09-28. All predate the hook (2026-10-09). None has a lifecycle row. **Measured 2026-10-14: all four are at delivery status `building`, not `discovery`** — see **B2** |
| Legacy student projects | — | n/a | 62 rows predating the student hook (2026-10-12). None has a lifecycle row. Covered by `legacy_compatibility` in the story gate |

**The difference that matters:** "wired" means the code path exists. "Proven" means it ran in
production and left evidence. The Factory is both. **As of 2026-10-14 Gov is both as well.**

---

## The tasks. This project is not complete until every one of these passes.

### B1 — Prove a NEW gov delivery project registers 🏛️  ✅ PASS (2026-10-14)

**Why:** the delivery hook had never fired in production. A hook that has never run is a claim.

**Pass condition.** A delivery project created through the real gov path
(`govDeliveryProject.ts`, not a test double) holds **exactly one** `project_lifecycle_states` row
with `delivery_project_id` set, `tenant_id` matching the project, and stage `discovery` — verified
by a read-only query naming the project id, with the query and its output recorded.

**What was done.** `govDeliveryProject.ts` registers nothing itself — it relies entirely on the
`afterCreate` hook on the `DeliveryProject` model (`DeliveryProject.ts:174`). So the honest test
drives that same model, inside a transaction, exactly as `ensureGovTwoTrackProject` does at
`govDeliveryProject.ts:134`. Per the instruction, a **clearly-labelled `sandbox` project** was
used rather than a fabricated government one (two existing rows already use `project_class`
`sandbox`). No test double, no stubbed hook: the production model ran against the production
database (`docker exec accelerator-db psql -U accelerator -d accelerator_prod`).

**Verbatim result — create + verify (ran through the compiled model in `accelerator-backend`):**

```
{"timestamp":"2026-10-14T14:14:13.506Z","level":"info","service":"backend","event":"project_lifecycle_registered","outcome":"success","delivery_project_id":"b2aee34b-e47e-4ed5-8f7a-005a78fbd7a7","tenant_id":"a1ccf4d3-74a3-4b98-b4dd-ba0087efd924","entry_point":"delivery_project.afterCreate","created":true}
CREATED_DELIVERY_PROJECT_ID=b2aee34b-e47e-4ed5-8f7a-005a78fbd7a7
SANDBOX_SLUG=lifecycle-verify-b1-1791987253420
---
QUERY: SELECT id, tenant_id, delivery_project_id, stage, entry_point, created_at
       FROM project_lifecycle_states WHERE delivery_project_id = 'b2aee34b-e47e-4ed5-8f7a-005a78fbd7a7';
---
ROW_COUNT=1
[
  {
    "id": "04a6052b-abcf-4e73-b16c-e0b3c39ab98d",
    "tenant_id": "a1ccf4d3-74a3-4b98-b4dd-ba0087efd924",
    "delivery_project_id": "b2aee34b-e47e-4ed5-8f7a-005a78fbd7a7",
    "stage": "discovery",
    "entry_point": "delivery_project.afterCreate",
    "created_at": "2026-10-14T14:14:13.490Z"
  }
]
---CHECKS---
exactly_one_row: true
delivery_project_id_matches: true
tenant_id_matches: true
stage_is_discovery: true
```

**Verbatim result — cleanup (the test rows removed, baseline restored):**

```
=== CLEANUP: delete the B1 test lifecycle row, then the test project ===
DELETE 1
DELETE 1

=== PROOF test project is gone (expect 0 rows) ===
 id | slug
----+------
(0 rows)

 id
----
(0 rows)

=== PROOF baseline restored (expect 4 delivery projects, 0 delivery-side lifecycle rows) ===
 delivery_projects
-------------------
                 4
 delivery_lifecycle_rows
-------------------------
                       0
```

**Verdict:** PASS. The hook fired, created exactly one correctly-shaped lifecycle row, emitted its
`project_lifecycle_registered` success event, and the test artifact was removed with the tree left
at its pre-test baseline.

---

### B2 — Decide the four legacy delivery projects 🗂️  ⏳ RECOMMENDATION DELIVERED — DRI DECISION PENDING

**Why:** two of them are `government_public_sector`. Today they are invisible to the lifecycle,
and nobody has decided whether that is correct.

**Pass condition.** A recorded DRI decision, one of:
(a) backfill them with lifecycle rows at the stage they are genuinely at, or
(b) declare them legacy and out of scope, with the same reasoning used for the 62 legacy student
projects — in which case the delivery side needs its own compatibility treatment, because the
story gate's `legacy_compatibility` branch covers STUDENT projects only.

**The trap to avoid:** backfilling them at `discovery` would state that work already done has not
started. If they are backfilled, the stage must be the one they are actually at.

**Measured state (read-only, 2026-10-14):**

```
id (abbrev)   name                                                          project_class             status    lifecycle_rows
f52e9a43...   AI Government Contract Finder (demo)                          sandbox                   building  0
008e483f...   AI Ops Assistant (ordinary demo)                             sandbox                   building  0
d898d2cf...   RFP - Agenda and Meeting Management System for Harris County  government_public_sector  building  0
cbffc145...   AI-Assisted Digital Evidence Analysis Platform                government_public_sector  building  0
```

All four carry delivery status **`building`** — not `discovery`. This is precisely the trap the
pass condition names: a blanket backfill at `discovery` would assert that work already in flight
has not started.

**Recommendation to the DRI — option (b), declare them legacy and out of scope.** Three reasons:
1. **They predate the hook** (2026-09-21 → 2026-09-28; hook shipped 2026-10-09), exactly like the
   62 legacy student projects already treated this way.
2. **A truthful backfill is not cheap.** Their genuine delivery status is `building`, but the
   lifecycle stage machine's vocabulary is a different axis (`discovery` → `requirements_ready` →
   …). Mapping delivery-status `building` to a lifecycle stage is itself an unproven transformation
   that would need its own justification per project — the opposite of a clean backfill.
3. **The honest cost is a one-time compatibility treatment, not per-row archaeology.** Option (b)
   requires giving the delivery side its own `legacy_compatibility` equivalent (the story gate's
   branch covers students only). That is a single, reviewable change, versus four hand-assigned
   stages that each assert something about work the register cannot verify.

**Not implemented.** Per instruction, neither option is built until the DRI chooses. This row moves
to ✅ only when that decision is recorded here.

---

### B3 — Prove a Factory domain can MOVE 🏭  (outside this gov-verification scope)

**Why:** all ten domains are registered and all ten are stuck at `discovery`. Registration is
proven; the stage machine is not.

**Pass condition.** One agent domain advances `discovery` → `requirements_ready` through the real
transition path, with the four discovery prerequisites genuinely assessed rather than waived, and
the stage change visible on the admin surface. **This is also the only way LC-10's approval
evidence gets exercised**, because the approval path sits six stages in.

*Status: outstanding. Not part of the 2026-10-14 gov-pipeline verification (B1/B2/B5).*

---

### B4 — Give the bypass detectors a caller ⚠️  (outside this gov-verification scope)

**Why, measured:** `unregisteredDeliveryProjectsSince` and `unregisteredStudentProjectsSince` are
called from **tests only**. There is no production caller. A detector nobody runs cannot detect
anything, and this programme has already shipped one control that proved nothing until it was
itself tested.

**Pass condition.** Both detectors are invoked by something that runs on its own — a scheduled
job, a health surface, or the ops digest — and a non-empty result is surfaced where a human will
see it. Proven by a deliberately unregistered row appearing in that output, then removed.

*Status: outstanding. Note: the detector's underlying query was exercised read-only on 2026-10-14
during B1 (it returned 0 rows both before and after the test), but it still has no production
caller — that is what B4 requires.*

---

### B5 — Prove NO creation path bypasses the hook 🔍  ✅ delivery/gov half PROVEN (2026-10-14); student-`projects` half outstanding

**Why:** the chokepoint inventory for this programme was wrong within a week once already —
`govDeliveryProject.ts` landed three days after the inventory was taken and was live in
production, creating projects with no lifecycle. That is exactly why the hook was moved onto the
model. This task proves the move worked.

**Pass condition.** An enumerating command — printed with its output, not summarised — that lists
every call site creating a `projects` or `delivery_projects` row, and shows each one goes through
a model carrying the registration hook. Any raw-SQL insert is a finding. The command must be
re-runnable by someone else and must name what it searched.

**Command (re-runnable; names exactly what it searched) — the `delivery_projects` half:**

```bash
# (1) every model-based create of a delivery project
grep -rnE "DeliveryProject\.(create|bulkCreate|upsert|findOrCreate|build)\b" \
  backend/src --include=*.ts | grep -v "__tests__"
# (2) any RAW SQL insert into delivery_projects (ANY hit is a FINDING)
grep -rniE "insert[[:space:]]+into[[:space:]]+delivery_projects" \
  backend/src/services backend/src/scripts backend/src/db backend/src/seeds | grep -v "__tests__"
# (3) any hook-bypassing form (bulkCreate / upsert / hooks:false) on DeliveryProject
grep -rnE "DeliveryProject\.(bulkCreate|upsert)|hooks:\s*false" \
  backend/src --include=*.ts | grep -v "__tests__"
```

**Verbatim output:**

```
--- (1) Model-based creation sites ---
backend/src/scripts/seedDevClientReviewer.ts:183:    project = await DeliveryProject.create({
backend/src/scripts/seedFactoryDemoContract.ts:31:    project = await DeliveryProject.create({
backend/src/scripts/seedOrdinaryProjectDemo.ts:27:    project = await DeliveryProject.create({
backend/src/services/delivery/leadConversion.ts:175:  const project = found.project ?? await DeliveryProject.create({
backend/src/services/factory/govDeliveryProject.ts:134:      project = await DeliveryProject.create({
(line 9 of the grep — projectLifecycleRegistration.ts:99 — is a comment, not a call site)

--- (2) RAW SQL inserts into delivery_projects (ANY hit here is a FINDING) ---
NONE — no raw-SQL insert into delivery_projects in backend/src (excluding tests)

--- (3) bulkCreate / upsert / hooks:false on DeliveryProject ---
(no DeliveryProject.bulkCreate/upsert and no hooks:false; the only grep hits are an unrelated
 `webhooks: false` in providerCapabilities.ts and comment text in projectLifecycleRegistration.ts)
```

**Verdict (delivery half):** PASS. Exactly five call sites create a `delivery_projects` row, every
one through `DeliveryProject.create` — the model that carries `afterCreate:
deliveryProjectLifecycleHook`. The gov path (`govDeliveryProject.ts:134`) is in the set. Zero
raw-SQL inserts, zero hook-bypassing forms. B1 above then proves that hook actually fires.

**Remaining for a full B5 pass:** the same sweep for the student `projects` table (the pass
condition names `projects` as well as `delivery_projects`). That half was not in this
gov-verification scope and is still outstanding.

---

### B6 — Record both consumers against LC-01 ✅  (outside this gov-verification scope)

**Why:** LC-01 is the acceptance ID that says a new-project path cannot bypass plan
authorization. Today it is satisfied by the student path alone.

**Pass condition.** `acceptance-evidence.md` carries an LC-01 row naming **both** consumers, with
the production evidence for each, and states plainly which paths are proven versus merely wired.

*Status: outstanding. B1's evidence above is now ready to be cited in the LC-01 row when B6 is
taken up — the gov delivery path is proven, not merely wired, as of 2026-10-14.*

---

## How to read this register

A row moves to ✅ only on evidence that was produced and pasted, never on a reading of the code.
That standard is not pedantry: every failure in this programme's eight phases was a claim that
did not survive measurement, and not one was a broken behaviour the tests passed over.

**Current score (2026-10-14):**
- **B1 ✅ proven** — gov delivery path fires the hook in production, evidence pasted above.
- **B5 ✅ (delivery/gov half) proven** — five chokepoint call sites, zero bypasses; student-`projects` half outstanding.
- **B2 ⏳ recommendation delivered, DRI decision pending** — recommended option (b), legacy + out of scope.
- **B3 / B4 / B6 — outstanding** (not part of the gov-pipeline verification).

The Project Factory's registration remains proven. **The gov contracts pipeline is now proven to
sit on the Unified Project Lifecycle backbone** (B1), through a chokepoint shown to have no bypass
(B5, delivery half). What is left is a decision (B2) and the broader-programme tasks (B3/B4/B6).
