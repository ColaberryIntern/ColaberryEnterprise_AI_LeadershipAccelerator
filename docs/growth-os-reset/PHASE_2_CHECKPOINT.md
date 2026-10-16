# Phase 2 Checkpoint — Canonical Free AI Entry and a Person 360 That Can Be Trusted

**Session** `CC-20261005-r6h2` · recorded 2026-10-11, §F updated 2026-10-12 post-deploy (Central) · **Phase 2 of 6**
**Branch** `workstream/growth-os-reset-phase2` · **MERGED 2026-10-12 and DEPLOYED** — running commit `12c1e5fc`; see §F.

> Every number in this document was pasted from a command's output. Where a figure could not
> be produced by a command, the document says it is unknown rather than estimating it.

---

## Ali's five questions, answered

| # | Question | Answer |
|---|---|---|
| 1 | Can a Free AI account still exist without an Explorer Growth profile? | **No for new accounts. YES for 86 existing ones** — measured, see §F |
| 2 | Can an unpaid Explorer still be mistaken for converted? | **No — live in production** |
| 3 | Can I look at one person and see the website journey that led to their signup? | **Yes.** |
| 4 | Can I see what they have done since registering? | **Yes, with named gaps.** |
| 5 | Is Person 360 trustworthy enough to be the Sales Readiness Score's input in Phase 3? | **Not yet, but close** — population repaired, loss-of-evidence guard live, all 11 loaders covered, the `matchMethod` mutant dead, and `explorer_entered_at` filled so the score has a denominator. What remains: one unexplained load flake, and the written readiness call itself (M24) |

**The answers are not yes/yes/no/no/no, and they are also not five clean yeses.** Two carry real
qualifications and the fifth is a no. In detail:

**1 — No for new accounts. YES for 86 existing ones, and that number is now measured.** Both
public signup implementations establish the Explorer identity *at registration*:
`freeAccountRegistration` writes both semantic columns together
(`freeAccountRegistration.test.ts` → *"learner gets BOTH columns"*) and
`explorerProfileAtRegistration` creates the profile row keyed on the enrollment, including when no
lead matches, in which case it reports the person as unresolved rather than skipping them. A
registration-time write failure is logged by error class and recovered by the nightly repair, so a
transient failure leaves a gap **until the next night** rather than forever.

For accounts that already existed, the pre-deploy version of this document said the answer was
unknown. **It is no longer**, and as of **2026-10-13 it is also largely repaired.** The measured
starting state was **86 active `standard` + `guest` rows invisible to Explorer Growth**, because
the running population filter is `enrollment_type: 'explorer'` AND `status: 'active'` and never
consults `tier`.

**ALI AUTHORISED THE BACKFILL AND IT HAS NOW RUN** (2026-10-13, 56 writes: 37 programme, 19 tier).
Measured straight from the table, before and after:

| Shape | Before | After |
|---|---|---|
| `explorer` + `guest` — coherent, visible | 0 | **56** |
| `standard` + `guest` — invisible | 86 | **49** |
| `explorer` + non-`guest` | 290 | **271** |
| total rows | 630 | **630** |

So **49 rows remain in that shape, not 86** — and of those, the script **excludes 12** as provably
NOT free-signup, which is the opposite of unprovable. The genuine residual is therefore the **37
it reports as ambiguous** and refuses to guess about. An earlier version of this line wrongly
folded the excluded and the ambiguous together, and an earlier version said the backfill had not
been run.

**Two disclosures belong with that result.** The script warns that the 37 rows joining the Explorer
programme would carry `explorer_entered_at` NULL; measured afterwards, **all 56 coherent rows have
it NULL** — the 37 joiners *and* the 19 whose tier was corrected — because the column has never
been populated for anybody and no task owns backfilling it:

```
coherent_free_total | entered_at_null | entered_at_set
                 56 |              56 |              0
```

And the script's own success line printed `committed NaN of 56 planned write(s)`; the write is
evidenced by the before/after counts above and a 56-entry rollback ledger, not by that line. See §F.

**2 — No. Live in production as of 2026-10-12.** Conversion now derives from authoritative paid and
subscription state in one place (`adminOs/conversionState.ts`), and both stage derivations import
the same constant. Before this, `WHEN e.email IS NOT NULL THEN 'enrolled_student'` meant the mere
existence of an enrollments row staged a person as converted — and worse, suppressed their intent
and temperature as post-conversion noise, for exactly the population whose intent matters most.
Proved by `conversionState.test.ts` → *"does not treat an unpaid Explorer as converted"*, paired
with *"does treat a paid learner as converted"* so the fix did not disable the feature, plus
comp-seat tests. **Deployed 2026-10-12 and verified in the running container** by the deploy's
marker check against the compiled SQL, so this is now true of production and not only of the
branch.

**3 — Yes.** Pre-registration `page_events` are keyed to the stitched lead and ordered by time
descending in the statement the service issues. Mutation-proved: removing the `lead_id` stitch key
kills named tests (T211 mutant **M8**, the stitch key); commenting out the `ORDER BY`, or flipping `DESC` to `ASC`,
kills named tests (M7, and a DESC-to-ASC variant). Cross-brand history follows the stitch with **no brand filter
applied** — filtering by brand would hide the very history the criterion exists to surface — and
an unstitched person gets nothing, which is the control.

**4 — Yes, with named gaps.** The timeline, the Explorer E/I/F snapshot, the GHL contact id and
the existing panels all render on one screen (§D). The gaps are real and listed in §H: of roughly
twenty evidence groups the spec names, several have no test, and **there is no registry test that
would fail if a group silently lost its evidence.**

**5 — Still not yet, but four of the five original reasons are now gone.** (a) Deployed and
production-verified. (e) The incoherent population — the rows an SRS would actually score — is
repaired: **86 invisible became 49**, and 56 rows are coherent where none were. (b) **closed**: a
guard fails when an evidence group loses its evidence (`evidenceRegistry.test.ts`, 22 groups, both
halves bound), and all **eleven** uncovered loaders now have behavioural tests. (c) **closed**:
`trustPanel`'s surviving `matchMethod` mutant is dead, all four branches asserted.

**What still blocks it:** (d) suites that pass in isolation and fail under heavy parallel load —
**not root-caused**, see the Phase 3 list below for the candidate and why it is not yet a finding.
A gate that produces false reds is the gate protecting this input. Note that (b) and (c) closing
does **not** by itself make the answer yes: the inputs are now covered, but whether they are good
enough to score is the question M24 exists to answer, with a written yes or no.

~~**And one new reason, created by closing (e):** all 56 now-coherent rows carry
`explorer_entered_at` NULL.~~ **CLOSED 2026-10-16.** A journey score with no journey start date has
no denominator, so the column was filled once the semantic was settled from the live writers rather
than invented: 56 rows, NULL to 0, reversible from a saved ledger. **The score now has its
denominator.** What remains for question 5 is the Gap 5 flake and the written readiness call in M24.

---

## A · What this phase was supposed to accomplish

Make the canonical Free AI entry work without breaking authentication, entitlement, cohort, login,
reporting or existing paid users — so that **it is impossible for a legitimate Free AI account to
exist while being invisible to Explorer Growth merely because it came through the other signup
implementation.** Then fix Person 360 before expanding it, and only then build the canonical
evidence package. Origin brand, originating website, source, entry point, campaign, UTM, page URL
and visitor linkage all had to be preserved separately, because **origin brand is not journey
ownership.**

---

## B · What actually shipped, with every verifier score

**SIX OF THE SEVENTEEN TASKS NEVER OBTAINED A VERIFIER PASS, and the plan itself
never passed its audit.** An earlier version of this section said "three of the
eight tasks failed independent verification" and recorded T201–T206 as a single
`PASS` band. Both were false: the ledger records three of those tasks as
`no_pass_disclosed` with their retry caps exhausted. A verifier failed T217 for
exactly this, and it was right to.

Re-derive the first nine rows yourself:

```
$ node -e "const l=require('./.loop-architect/runs/20261005-growth-os-reset-phase2/state-ledger.json');
  const r=Object.values(l.tasks||l); console.log(JSON.stringify(
  r.reduce((a,t)=>(a[t.status]=(a[t.status]||0)+1,a),{})));
  console.log('NO PASS:', r.filter(t=>String(t.status).includes('no_pass')).map(t=>t.id).join(', '))"

  {"passed":5,"no_pass_disclosed":3,"passed_by_inspection":1}
  NO PASS: T202b, T203, T206
```

| Task | Verdict | Source |
|---|---|---|
| T201 | PASS, attempt 1 | ledger `passed` |
| T202a | PASS, attempt 2 | ledger `passed` |
| **T202b** | **NO PASS** — 10/12 three times, cap spent | ledger `no_pass_disclosed`; log:192 |
| **T203** | **NO PASS** — 8/12, 9/12, 6/12, cap spent | ledger `no_pass_disclosed`; log:206 |
| T204 | PASS, attempt 2 | ledger `passed` |
| T205 | PASS, attempt 3 | ledger `passed` |
| T206a | PASS by inspection, attempt 1 | ledger `passed_by_inspection` |
| **T206** | **NO PASS** — 10/12, 9/12 (zero), 8/12 (zero), cap spent | ledger `no_pass_disclosed`; log:363, 413 |
| T207 | **PASS 12/12** (after FAIL 8/12) | ledger `passed` |
| T208 | PASS — but **first graded FAIL 8/12** at the commit I delivered | log:585 |
| T209 + T210 | **PASS 12/12** (after FAIL 10/12) | session log |
| **T211** | **NO PASS** — FAIL 8/12, FAIL 10/12; attempt 3 mutation-proved but **never re-graded** | session log |
| T212 | FAIL 7/12 → FAIL 9/12 → **PASS 11/12** | session log |
| **T213** | **NO PASS** — FAIL 10/12, 10/12, 9/12 (graded DISCLOSABLE); two later fixes **never re-graded** | session log |
| T214 | **PASS 12/12** — but **first graded FAIL 6/12** at the commit I delivered | log:585 |
| T215 + T216 | Deployed and read-only verified; **no verifier was commissioned** | §F |
| **T217** | **FAIL 7/12**, criterion 6 = 0, ruled BLOCKING — this section was the defect | T217 verification |

**THE PLAN NEVER PASSED ITS OWN AUDIT EITHER**, and the ledger says this belongs
here: three cycles, **7/20 → 12/20 → 15/20**, cap spent, `never_reached_pass:
true`. Cycle 1 scored three zeros for having no deployment, no
production-verification and no handoff task at all. So the plan this phase
executed was itself never graded fit.

**What that means, and what it does not.** The production behaviour is tested,
deployed and verified — §F is measured from the live database and the running
container. What repeatedly failed was the *evidence I wrote about it*: tests that
could not fail, guards whose names claimed more than they checked, citations
pointing at the wrong task, and this section asserting PASS where the record said
otherwise. A reader should treat every claim here as carrying that risk and
prefer §F's commands, which can be re-run, over any sentence of mine.

**The three claims this phase rests on, each at a line you can open.** My §B
rewrite deleted the checkpoint's only code citation and the citation gate caught
it, which is the gate doing exactly its job:

- What "converted" now means, the defect the phase existed to fix:
  `backend/src/services/adminOs/conversionState.ts:84` → "export const IS_CONVERTED_SQL"
- Why 86 accounts are invisible — the filter asks for programme and status, never access level:
  `backend/src/services/explorerGrowth/explorerIdentityBridge.ts:122` → "where: { enrollment_type: 'explorer', status: 'active' },"
- The stage label the roster had never been taught, now in one place for both pages:
  `frontend/src/adminOs/personStages.ts:38` → "explorer: 'Explorer ($0 to start)',"

**T212's first failure scored ZERO on criterion 6 for a false claim of mine.** I
wrote that the duplicated lifecycle stage map was fixed "on the profile AND the
roster". `PeoplePage.tsx` was untouched and still carried its own nine-key copy
with no `explorer` key, so the roster was still rendering the raw lowercase enum
for the one stage this phase exists to make visible — while the module I had just
written carried a docblock headed "WHY THIS IS ONE FILE AND NOT TWO COPIES".

**Two T212 tests could not fail.** One was named *"introduces no permission path
of its own"* and asserted only that a scored panel renders its numbers, so a real
`localStorage` role gate inserted into the component passed it. The other
asserted `textContent.toContain('0')` for a 0/0/0 score, and the rendered date
"1 Oct 2026" already contains a `0`, so suppressing a genuine zero passed too.

**T213 was graded three times and failed three times.** Verifiers found three of
fifteen scenarios pinned to a control instead of the proof; six wrong provenance
labels, three of them citing a task whose mutation cannot reach the test; a
registry that certified a *skipped* test as coverage; and then, after I fixed
that, the `xdescribe` alias taking the same six tests dark again because my fix
matched one spelling of the hole.

---

## C · Architecture changes

- **One conversion definition.** `adminOs/conversionState.ts` exports the SQL facts, the join, the
  `IS_CONVERTED_SQL` predicate and the stage CASE. The roster and the profile import the same
  constant, because two copies of that CASE drifting apart surfaces as a row an operator can see
  but cannot open. It carries a deliberate-asymmetry note on `past_due`.
- **One subject-key builder.** `identity/identifierPrecedence.ts` is pure and imports nothing. As
  of attempt 3 the three person views build their refs from it; a tripwire forbids any view from
  spelling one itself.
- **One declared canonical person view.** `personProfileService` declares `'canonical'`; the two
  growthJourney views declare `'answers'` and say which different question they answer. A checker
  asserts exactly one claims canonical, with positive controls for all three failure modes.
- **A new lifecycle stage.** `explorer` sits between `applicant` and `enrolled_student`, forced
  into `lead_ingestion` and `revenue` by the contiguity test. Labelled **"Explorer ($0 to start)"**.
- **Fail-closed GHL routing, at both levels.** An unreadable routes map withholds; as of this
  phase's last fix, so does a map with any present-but-unusable entry.

---

## D · Screens and UI

One screen changed: the admin person profile (`/admin/people/:ref`).

- **Explorer score tab** — Engagement / Intent / Fit, the primary state, overlays, and the
  snapshot's own date so a stale score cannot read as current. Absent evidence renders as a
  sentence; the test asserts **no digit appears at all** when the panel is null, because three
  zeroes are a real score and an unscored person shown as zeroes is indistinguishable from one. A
  genuine zero still renders as zero.
- **GoHighLevel contact** on the acquisition panel, with "Not linked to GoHighLevel" when absent
  rather than the generic "Not recorded".
- **The `explorer` stage now has a name.** It had none: `STAGE_LABEL` carried nine keys and no
  `explorer`, so the one stage this phase exists to make visible rendered through the `?? stage`
  fallback as the raw lowercase enum — on the profile **and** the roster. The map was duplicated
  across two pages, which is why neither was updated.
- **The page was split**, because CLAUDE.md requires the next change to an oversize file to split
  it first: 1,076 lines → **470** (hard ceiling 500), with eight panels extracted and the tab
  registry moved to a pure, unit-testable function. The component function is still ~300 lines
  against a 100-line ceiling, which is disclosed in the file itself rather than left implied.

**Not verified in a browser, and that is now the only thing missing from §D.** No screenshots were
taken. Both of the reasons the pre-deploy version gave have since been disproved: it IS deployed,
and the CRA production build runs locally **without Docker** — a verifier confirmed
`CI=true react-scripts build` compiling successfully, twice. So the absence of screenshots is a gap
I did not close, not a constraint that prevented it.

---

## E · Data and behaviour verification

```
backend CI, full:        7 failed, 8 skipped, 1890 passed, 1897 of 1905 suites
                         7 failed, 162 skipped, 30879 passed, 31048 tests
T211 evidence set:       Test Suites: 5 passed, 5 total    Tests: 110 passed, 110 total
adminOs+growthJourney+identity:  80 suites, 1866 tests, EXIT=0
T213 acceptance registry:        38 passed, 38 total   (was 21 before T213 attempts 2-4)
frontend (new suites):   Test Suites: 2 passed, 2 total    Tests: 26 passed, 26 total
backend typecheck:       tsc 5.9.3, EXIT=0, 0 bytes of output
frontend typecheck:      EXIT=0
```

**Mutation results, all with two witnesses required per kill** (a named failing test AND a non-zero
failed count):

| Sweep | Mutants | Result |
|---|---|---|
| T211 attempt 3 | 3 | all killed; chain view, journey view, and the dropped import |
| T212 | 8 | all killed |
| T213 | 1 | killed — renaming a covering test fails by the scenario's own name |
| T214 follow-up | 1 | killed by 2 named tests |

**The 7 remaining backend failures are not from this phase, and that was tested rather than
asserted.** An import-closure walk from each failing suite — with a control suite that correctly
shows reachability — proves **four cannot reach any file this phase changed** (closures of 3, 3, 28
and 5 files, zero of mine). The other three do reach my files, so closure alone cannot clear them
and each was read instead: two are 5000 ms jest timeouts on harnesses booting **818-** and
**1070-file** import closures on this Windows box, and the third compares a file **absent from my
diff** against LF-authored literals after `split('\n')` when that file is CRLF (38 CR / 38 LF).
`main`'s own CI is green at this branch's merge parent. Reachability does not prove causation, but
unreachability disproves it, and that is the only direction the argument needs.

**The fifteen acceptance scenarios** are enumerated in
`backend/src/__tests__/acceptanceScenarios.phase2.test.ts`, each bound to the real test that proves
it and to the task and mutation that showed that test can fail. The registry fails if a covering
test is renamed, moved, duplicated or deleted — which is what stops "all fifteen pass" from naming
a population nobody can reconstruct.

---

## F · Production state — DEPLOYED AND VERIFIED 2026-10-12

**Merged, deployed, and read. This section replaces the pre-deploy version, which said
"NOTHING IS DEPLOYED. NOTHING HAS BEEN READ FROM PRODUCTION."**

- PR [#3062](https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/3062)
  merged `2026-10-12T14:18:52Z`, merge commit `0ba1eaf1`. All nine CI jobs passed — **including
  Backend unit tests**, which independently confirms the 7 local failures were Windows-only.
- Deployed via `DEPLOY_MODE=registry bash scripts/deploy-prod.sh` **on the prod host** (the script
  needs `flock` to serialise deploys, which Git Bash on Windows does not have).
- **The deployed commit is `12c1e5fc`, not `0ba1eaf1`.** `main` advanced while the deploy was
  running — PR #3065 (cb-daily-tick) merged in between — and the script pulls `origin/main`.
  `12c1e5fc` contains this phase's merge, verified with `git merge-base --is-ancestor`, so Phase 2
  shipped together with that unrelated change.
- **The first deploy attempt correctly REFUSED.** Registry mode compares the digest behind `:main`
  against `sha-<HEAD>` and found no image for `12c1e5fc`, because CI published it at
  `14:43:09Z` — after the attempt began. The guard exists so that pulling a moving `:main` tag
  cannot silently deploy an older build while every other check passes.
- **Marker proof, which is the only thing that shows the RUNNING container carries the change:**

```
[deploy] marker 'has_paid_subscription' present in backend:/app/dist/services/adminOs/conversionState.js
[deploy] backend answering after 5s
```

  `has_paid_subscription` is a string literal inside T210's conversion SQL and did not exist in
  `main` before this merge, so it cannot be satisfied by an older image.

### The two flag values that were UNKNOWN are now observed

```
$ docker exec accelerator-backend printenv CONTENT_PAID_GATE_ENABLED EXPLORER_WEEK0_ONLY
  true
  true
$ ... GROWTH_JOURNEY_EXECUTION_ENABLED   -> unset
```

So the paid-content gate is ON and Explorers are confined to Week 0 **in production**, which is
the entitlement consequence the pre-deploy checkpoint could only assert from `.env.example`.
`GROWTH_JOURNEY_EXECUTION_ENABLED` is unset: **nothing sends, confirmed in production** and not
only in tests. It was confirmed independently in tests too: a verifier built a syscall-level
tripwire patching `net.connect`, `tls.connect` and `dns.lookup`, with controls proving it blocks,
and recorded **zero vendor-host contact attempts across all 31,042 tests** — still zero with the
withholding logic mutated out, so the stub rather than the business logic is what enforces it.

### The row counts that were UNKNOWN are now measured

One `GROUP BY` over `enrollments`, no PII:

| programme | access | status | count |
|---|---|---|---|
| explorer | member | active | 270 |
| standard | member | active | 211 |
| standard | guest | active | 86 |
| standard | member | withdrawn | 43 |
| explorer | member | withdrawn | 20 |

**THE STARTING STATE HAD ZERO `explorer` + `guest` ROWS**, and that pair is what DECISION 1
defines a Free AI learner to be. Both incoherent shapes were real, and the backfill's own dry run
named them:

```
before: shape_a(explorer+non-guest)=290  shape_b(standard+guest)=86
        coherent(explorer+guest)=0       total=630
```

**That zero is now 56.** Ali authorised the backfill on 2026-10-13 and it ran; the result is at the
end of this section. The three bullets below describe the population as it was **before** that run,
because they are what justified running it:

- **86 active `standard` + `guest`** carry the wrong `enrollment_type`. The running container's
  population filter is `enrollment_type: 'explorer'` AND `status: 'active'` and never consults
  `tier` — verified by grep inside the container — so **these 86 were invisible to Explorer
  Growth.** 37 of them have since been written into the programme; **49 remain**.
- **288 of the 290 `explorer` + `member`** rows carry the wrong `tier`. **270 are visible** to
  Explorer Growth; the other 20 are `withdrawn`, and the filter quoted above requires
  `status='active'`.
- **The remaining 2 are CORRECTLY shaped and were miscounted here at first.** Both have
  `amount_paid = 250.00`, `payment_status = paid`, `status = active` and no subscription, so they
  are people who entered at $0 and then paid. Per DECISION 1 `tier: member` is the RIGHT access
  level for a paid student, so `explorer` + `member` is coherent for a converted Explorer: the
  programme records where they came from, the tier records what they may now see. They display as
  **Enrolled**, which is correct, and an earlier version of this line folded them into the
  incoherent population. Of the 288 genuinely wrong, the backfill plans only **19** tier writes,
  because it moves nothing it cannot prove.

### What the backfill planned, from its own dry run

```
== 56 write(s) planned ==
  37  enrollment_type   standard -> explorer
  19  tier              member   -> guest
DRY RUN — nothing written. Re-run with --confirm-production to commit.

DISCLOSURE: 37 row(s) would join the Explorer programme with explorer_entered_at still
NULL. This script writes exactly two columns by design, and NO TASK CURRENTLY OWNS
backfilling that column.
```

It plans **56 writes out of 376 incoherent rows**, because it requires POSITIVE free-signup
provenance and excludes org members, AI Flotation prospect accounts, staff by the union of all
three disagreeing predicates, agent identities, paid rows and anything undeclared. Its own
buckets, which sum to 630 exactly: **254 already coherent, 37 programme writes, 19 tier writes,
37 ambiguous and reported for human decision, 283 excluded.** So "the rest is reported" would
be wrong — **37 are reported and 283 are excluded**, and the distinction matters because
excluded means proven not to belong, not unproven.

### What the backfill ACTUALLY DID, run 2026-10-13 on Ali's authorisation

```
$ docker exec accelerator-backend node dist/scripts/backfillFreeAccountCoherence.js \
    --confirm-production --ledger /tmp/t207-ledger.json

  before:  shape_a(explorer+non-guest)=290  shape_b(standard+guest)=86
           coherent(explorer+guest)=0       total=630
  committed NaN of 56 planned write(s)
  after:   shape_a(explorer+non-guest)=271  shape_b(standard+guest)=49
           coherent(explorer+guest)=56      total=630
```

Confirmed by an independent query rather than by the script reporting on itself:

```
$ docker exec accelerator-db psql -U accelerator -d accelerator_prod -P pager=off -c "..."
  coherent_free | still_invisible | explorer_nonguest | total
             56 |              49 |               271 |   630
```

Every delta closes against the plan: **290 − 19 = 271**, **86 − 37 = 49**, **0 + 56 = 56**, and the
**630 total is unchanged**, so nothing was created or destroyed. The rollback ledger holds **56
entries** and was copied off the container to `/root/t207-ledger-20261013.json`, because a deploy
empties the container's `/tmp` and a rollback file that vanished is not a rollback plan.

**The two genuinely paid Explorers were NOT touched** — still `member` / `paid` / `250.00`, count
2 — which is the paid exclusions behaving as designed. Their stage still reads **Enrolled**, which
is correct.

**`committed NaN of 56` IS A REAL DEFECT IN THE SCRIPT, not a cosmetic one.** `commitLedger`
destructures `const [, affected] = await sequelize.query(...)`; for a Postgres `UPDATE` without
`type: QueryTypes.UPDATE` the second element is a result object, not a row count, so
`Number(affected)` is `NaN`. The consequence is that **the script cannot tell an operator whether
it wrote 56 rows or 3.** The write here is evidenced by the before/after shape counts and the
independent query above, both of which are derived from the table rather than from the script's
own bookkeeping. Fixed in the same commit as this disclosure, with a test that pins the count.

**So the honest answer to question 1, for EXISTING accounts: mostly repaired, and the remainder is
measured rather than unknown.** 56 rows are now coherent and visible where none were. **49 rows
remain `standard` + `guest`**; of those the script **excludes 12** as provably NOT free-signup, so
the genuine residual is the **37 it reports as ambiguous** and refuses to guess about. An earlier
version of this paragraph said all 49 "cannot be proven either way", which was wrong in both
directions.

### Still not done

- ~~**All 56 now-coherent rows carry `explorer_entered_at` NULL.**~~ **FILLED 2026-10-16** by
  `backfillExplorerEnteredAt.ts` on Ali's authorisation, after the semantic was settled from the
  live writers rather than chosen. `entered_at_null` went **56 to 0**. The script's own disclosure
  had named only the 37 it wrote into the programme, which understated it — the 19 tier-corrected
  rows were NULL too. Both are now filled.
- **37 ambiguous rows are still reported rather than decided.** The script will not guess at
  programme membership from shape alone, which is the behaviour it was written for.
- `explorer_entered_at` would be left NULL for all 37 joiners, and **no task owns that column.**
- Whether Open-House deposit rows exist is still **unknown**; nothing in this phase measured it.
- No browser verification and no screenshots.

---

## G · Behaviour changes a person could notice — derived, not remembered

Taken from T202's committed enumeration by command
(`grep -cE '\*\*CHANGES\*\*' docs/growth-os-reset/FREE_ACCOUNT_CONSUMERS.md` → **16**), not from
memory, because a remembered list is always short:

1. `controllers/v1EnrollmentLookupController.ts` — the partner-app lookup reports free Explorers
   as not-enrolled.
2. `services/access/contentEntitlement.ts` — the Week-0 gate for existing portal accounts.
3. `services/cape/capeTodayPlanService.ts` — the CAPE Today plan.
4. `services/enrollmentPick.ts` — which enrollment is picked.
5. `services/explorerGrowth/explorerIdentityBridge.ts` — the nightly bridge's population.
6. `services/explorerRosterService.ts` — the Explorer population expands into the nightly scoring
   run.
7. `services/subscriptionRosterService.ts` — the subscription roster.
8. `services/subscriptionService.ts` — `needs_subscription`.
9. `services/subscriptionAnalyticsService.ts` — the analytics buckets.
10. `services/paymentReconciliationService.ts` — reconciliation's view of these rows.
11. `services/personHistoryService.ts` — the person-history title.
12. `services/timeline/feedControlService.ts` — the feed.
13. `services/reese/reeseWelcomeService.ts` — **Reese's first message changes for `/enroll`
    Explorers.**
14. `services/cohortService.ts` — **`totalEnrollments` and `pendingInvoice` on the admin dashboard
    drop** by the number of portal free accounts; `paidEnrollments` does not move.
15. `services/freeSignupService.ts` — the signup path itself.
16. `services/adminOs/conversionState.ts` — the conversion definition.
17. `services/portalSettingsService.ts` — **an Explorer's Settings page will read `explorer` /
    `guest`** where it used to read `standard` / `member`.

**Item 17 is here by judgement, not by the scan**, and that is worth saying plainly. The
enumeration classifies `portalSettingsService` as REPORTING, but lines 253–254 return `tier` and
`enrollment_type` straight to the portal, so a person sees the change. It is the same misfile class
the enumeration already flags in bold for `paymentSyncService`. The scan's classification is left
alone rather than quietly edited, and the exception is declared in
`backend/src/__tests__/phase2CheckpointDisclosure.test.ts` so that "one extra entry" cannot become
a silent habit.

**This list is now asserted complete, not merely derived.** That test compares it against the
generated enumeration in both directions: a consumer the scan finds and this list omits fails it,
and so does a file named here with no row behind it. It was written after the phase had already
merged, because T217's acceptance asked for the assertion and I had shipped only the derivation —
and on its first run it caught that item 17 was sitting in prose beneath the list rather than in
it, where a reader scanning sixteen numbered lines would have missed it.

---

## H · Known gaps

1. ~~**No registry test fails if an evidence group loses its evidence.**~~ **CLOSED 2026-10-15**
   by `adminOs/__tests__/evidenceRegistry.test.ts`. It binds BOTH halves of each of the 22
   groups — the `profile.<group> =` assignment **and** the backing loader call — because keeping
   the assignment while swapping the loader for `[]` is exactly how a panel goes dark with every
   suite still green. Nothing may be assigned on the profile without being declared evidence or
   derived, so a new panel cannot join silently. Mutation-proved against the real service:
   deleting `profile.community = community;` fails it by name
   (`MUTANT_EXIT=1`, 2 failed / 10 passed), and the file restored byte-identical (`cmp` clean).
2. **MOSTLY CLOSED 2026-10-15, and the count here was wrong.** This line said "several… nine",
   named by concept. Counted from the tree it was **eleven loaders**, and **four panel modules had
   no test file at all** (`trustPanel`, `journeyPanel`, `workPanels`, `historyPanels`).
   `adminOs/__tests__/growthWorkAcquisitionPanels.test.ts` now covers **eight** of the eleven with
   17 tests, pinning the two properties that have actually gone wrong here: an empty id list
   never reaches the database, and every query is scoped to exactly the ids it was given.
   Mutation-proved twice — removing `loadCommunity`'s empty-id guard, and changing
   `loadAutomation`'s text binding to numeric, each kill their test by name with
   `MUTANT_EXIT=1`, both restores `cmp`-clean.

   **A measurement trap worth recording:** grepping each loader across `__tests__` now hits for
   all 22, because `evidenceRegistry.test.ts` (gap 1 above) names every one in its registry map.
   A naive count reports full coverage. The eleven are only visible when that file is excluded.

   **FULLY CLOSED 2026-10-16.** The last three — `loadCcppHistory`, `buildJourney` and
   `buildTrust` — are covered by `adminOs/__tests__/historyJourneyTrustPanels.test.ts`, 21 tests.
   All **eleven** loaders now have behavioural coverage.
3. ~~**`trustPanel`'s `matchMethod` has a surviving mutant**~~ **CLOSED 2026-10-16**, in the same
   suite, because `buildTrust` was the last uncovered composer and the mutant lived in it.
   `matchMethod` is one ternary over two id lists, so all four combinations are enumerable and all
   four are now asserted. Mutating it to a constant `'exact_email'` kills three tests by name.

   **What those 21 tests pin, beyond presence.** Three rules these modules state in their own
   comments and then rely on:
   - **Absent is not zero.** `daysKnown` is null when there is no first touch; a 0 would read as
     "we met them today" about a person we know nothing about.
   - **Sales data is withheld, not zeroed.** `intentScore` is null for a caller without the sales
     sections. Removing that check kills the test by name — a 0 there is a number the caller is
     not cleared to see, and a wrong one.
   - **An unconfigured dependency never silently connects.** With CCPP unset, `loadCcppHistory`
     returns unavailable *with its reason* and never constructs a pool; the two EMPTY branches
     carry different reasons, and a control asserts they have not collapsed into one message.

   Three mutations, all proved, six named kills, every restore byte-identical. The first run of
   that mutation driver reported `MUTANT_EXIT=null` with no jest output at all, because the
   `.bin/jest` shim is not directly spawnable on Windows — no evidence, dressed as a result. The
   driver now refuses to report a verdict unless jest actually produced a `Tests:` line.
4. **Nothing typechecks test files.** `tsc -p tsconfig.json` excludes `**/*.test.ts` and ts-jest
   runs `isolatedModules`, so a type error in a test file passes every gate.
5. **Two suites fail only under heavy parallel load** (`personViewRoles`, `evidencePackage`, and in
   the final run `responsePrivacy.phase6`) and pass in isolation. A real flake in the gate.
6. **`PersonProfilePage`'s component function is ~300 lines** against a 100-line ceiling.
7. **The `'delegates'` predicate is defeatable** by a dead literal or a type-only import. No view
   claims it today.
8. **`reconcileAppPayments` is ~213 lines** over the function ceiling, untouched by this phase.
9. **The backfill HAS now run** (2026-10-13, 56 writes, §F) — an earlier version of this line said
   it never had, and said the legacy population was unmeasured. Both are superseded. What remains:
   **49 rows** are still `standard` + `guest` (12 provably not free-signup, 37 reported as
   ambiguous and deliberately not guessed at), the **37 rows written into the programme carry
   `explorer_entered_at` NULL** with no task owning that column, and the script's success line
   reports `NaN` rather than a row count.
10. **T213's acceptance registry has named limits**, written into the file rather than left to be
    found: nine of fifteen entries name no specific mutation, which is an unmet part of the
    acceptance; S1 pins the canonical decision point rather than the `/enroll` route wiring (the
    "immediately" half is S4's); **S13 is proved by no Phase 2 task at all** — its covering test
    and production module both pre-date the phase; S14's live-write half is uncited; and an
    emptied test body, a nested indented disabled block, and a block disabled by expression are
    all undetectable by a registry.
11. **T212's guard covers person surfaces only.** A verifier's role gate in `PersonProfilePage`
    was invisible to **every required CI check** — that is a gap in the gate, not only in my
    test. A repo-wide lint for frontend authority reads would close it; this phase did not build
    one.

---

## I · Decisions needed before Phase 3

**ALL FOUR WERE DECIDED AND CLOSED BETWEEN 2026-10-13 AND 2026-10-15.** Kept here with their
outcomes rather than deleted, because what was asked and what was chosen is the record.

1. ~~**Merge.**~~ **DONE** — merged, deployed and production-verified.
2. ~~**An open TWC breach on the surface this phase calls first priority, which I did not fix.**~~
   **FIXED, AND I HAD THE SEVERITY WRONG.** I wrote that lines 196–197 returned *"Your free account
   is ready…"* **to a person**. They did not: the only caller awaits the POST and discards the
   body —
   `frontend/src/pages/EnrollPage.tsx:123` → "await api.post('/api/create-free-account', {"
   — so nothing rendered it. The string a person actually read was on the page itself — the `<h1>`
   **"Start for free"**, the submit button, the success panel and five more, **nine occurrences**
   frozen at 9 in `frontendCopyBaseline.ts`. Both are now fixed and deployed: the response and the
   raw-email log on 2026-10-13, the page on 2026-10-15 (baseline entry deleted, repo total
   287 → 278). The API response was the lesser half, and I fixed it first.
3. ~~**Whether to run the backfill**, and on what population.~~ **RUN 2026-10-13 on Ali's
   authorisation** — 56 writes, `explorer`+`guest` 0 → 56, invisible 86 → 49, 630 total unmoved.
   See §F.
4. **Phase 3 should not accept Person 360 as the SRS input until gaps 1, 2 and 5 are closed** —
   see question 5.

---

## J · Exact next-phase proposal

**Phase 2 is COMPLETE: merged, deployed, production-verified, and handed off.** The four steps the
pre-deploy version of this section listed have all been done — PR
[#3062](https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/3062)
merged, deployed in registry mode with a marker check against the running container, read-only
verification recorded in §F, and `PHASE_2_HANDOFF.md` written with six numbered steps a
non-developer can follow in a browser.

### Two decisions that belonged to Ali — both since taken

1. ~~**Whether to run the coherence backfill.**~~ **Authorised and run 2026-10-13.** 56 writes;
   question 1 now answers **"yes, 49"** rather than "yes, 86", and 12 of those 49 are provably not
   free signups, so the genuine residual is the 37 the script reports as ambiguous.
2. ~~**The `enrollmentController` copy and the raw-email log.**~~ **Both fixed and deployed**, and
   the page copy behind them too — see §I item 2 for why the response was the lesser half.

### What Phase 3 should require before it starts

Phase 3's purpose is the Sales Readiness Score, and §F now shows why it cannot simply begin:
**the 86 invisible accounts are exactly the population an SRS would score.** Scoring a population
the engine cannot see produces a confident number about the wrong people.

So Phase 3 should open by closing, in this order. **Progress as of 2026-10-15:**

1. ~~**The backfill decision above**, because it determines the input set.~~ ✅ **DONE** — run
   2026-10-13; the input set is now 56 coherent rows with 49 still outside it.
2. **Gap 1 and 2 of §H.** ✅ **BOTH CLOSED.** Gap 1 by `evidenceRegistry.test.ts`; gap 2 by
   `growthWorkAcquisitionPanels.test.ts` (eight loaders) and
   `historyJourneyTrustPanels.test.ts` (the last three). It was **eleven** loaders uncovered,
   not the nine §H claimed, and all eleven now have behavioural coverage.
   ✅ **Gap 3 closed in the same pass**, because its surviving mutant lived in `buildTrust`,
   which was the last uncovered composer.
3. ⬜ **Gap 5** — the suites that pass in isolation and fail under parallel load. **NOT root-caused.**
   `personViewRoles` runs 24 tests in **14.5 s alone**, against its own `jest.setTimeout(120000)`,
   so reaching that ceiling needs roughly an 8× degradation. The leading candidate is that
   `config/database.ts` constructs `new Sequelize(...)` **eagerly at import** with
   `pool.acquire: 30000`, and that suite carries **zero** `jest.mock` calls — so requiring a model
   for one pure 7-line function builds a real Postgres pool in every worker. **That is a
   hypothesis, not a finding:** the isolation timing does not confirm it, and nothing here should
   be refactored until the flake is reproduced under load. Diagnostic: run the full backend suite
   repeatedly and capture which assertion times out, rather than inferring from module cost.
4. ✅ **`explorer_entered_at` — DECIDED AND FILLED 2026-10-16.** Ali authorised option A:
   `enrollments.created_at`, labelled as backfilled. **56 rows written; NULL went 56 to 0**, and
   an independent query confirms all 56 are exact. A 56-entry rollback ledger sits at
   `/root/m21-ledger-20261016.json`.

   **THE SEMANTIC WAS NOT MINE TO CHOOSE, AND AN EARLIER VERSION OF THIS LINE GOT IT WRONG.** It
   said using `created_at` "would be the same guess the backfill predicate deliberately refuses to
   make". That conflated two questions. The predicate refuses to guess at **programme membership**,
   which was already settled for these rows; given membership, the entry date follows from the
   definition the live code already writes. Both live writers set the moment of registration:

   `backend/src/services/freeAccountRegistration.ts:85` → "explorer_entered_at: programme === 'learner' ? new Date() : null,"
   `backend/src/services/enrollmentService.ts:352` → "explorer_entered_at: new Date(),"

   This line also said the column "has never been populated for anybody". That stopped being true
   on 2026-10-13: every Explorer registering after the fix gets a real date, 11 of them by the time
   this was measured and 13 an hour later. Only the recovered rows were ever blank.

   **The earliest lead date was rejected, and not for lack of coverage** — it reaches all 56 too.
   It answers a different question, first touch, which `journeyPanel` already carries as
   `firstTouch`. Using it here would put two meanings in one column.

Only then the score itself.

### Honest note on this phase's own record

**Six of seventeen** tasks never obtained a verifier PASS, and the plan never passed its own audit
(§B) — an earlier version of this paragraph said "three of eight", which was one of the three
different counts three artefacts were giving for the same fact. The production behaviour is tested
and live; what repeatedly failed was the evidence I wrote about it, and that pattern continued
after the phase closed: the backfill script could not report its own row count, and my
`explorer_entered_at` disclosure said 37 where the measured answer was 56. Phase 3 should assume
the same risk and budget verification rounds
accordingly rather than treating a green suite as a finished task.
