# Session CC-20261122-enterprise-suspect-flags

**Date:** 2026-11-22 (Central)
**Ticket:** R23 — Revenue source: enterprise.colaberry.ai with three plans
https://app.basecamp.com/3945211/buckets/7463955/todos/10534796798
**PR:** https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/4308
**Branch:** `workstream/r23-enterprise-suspect-flags` off `7d1bda478`
**Phase:** 4 — flagging the rows that are not real inquiries

---

## What this phase was for

Phase 3 shipped the write path and deployed at 01:05Z. Within hours `enterprise_intakes` held
its first row ever: **"Acme Test Logistics"**, blank service field, status `interviewed`,
created 2026-11-21 15:40Z.

The stream did exactly what it was built to do and flipped from `measured_zero` to `live`. The
consequence is the problem: a row somebody typed to check the form now counted as a real
enterprise inquiry in a funnel on a board Ram reads, and the card had no way to say so.

The government stream had already solved this a week earlier. `govBidFlow.suspectReasons()`
derives flags from the row itself, emits a `bid_suspect` event for each, and the pricing panel
shows them so a person deciding what to price can see which rows **not** to price. This phase is
that, for the enterprise stream, using the signals this table actually has.

| Layer | File | What changed |
|---|---|---|
| Logic | `services/revenueFlow/enterpriseSuspect.ts` | **NEW.** `suspectReasons()`, `countCompanies()`, the patterns |
| Read | `services/revenueFlow/enterpriseFlow.ts` | reads `full_name` / `email`, derives flags once, funnel row, caveat, events, sort |
| Type | `services/revenueFlow/revenueFlowTypes.ts` | `flags: string[]` on `EnterpriseDeal` |
| Registry | `services/revenueFlow/revenueClassifications.ts` | `enterprise_suspect`, `carriesValue: false` |
| UI | `components/admin/revenueFlow/DealPricingPanel.tsx` | `flagWarning()`, the row chip, the reasons, the count |

`RevenueFlowDashboard.tsx` needed no change: it imports `EnterpriseDealRow` and passes the
roster straight through, so the new field arrived on its own.

---

## The decision that mattered: flag, never filter

Ali's framing was that a test row "counts as a real one in a funnel Ram reads". The obvious
reading of that is to exclude flagged rows from the count. **I did not do that, deliberately.**

There are real companies with "Test" in the name. A heuristic with the power to delete rows
would eventually delete one, and a row missing from a funnel leaves no trace at all, whereas a
flag is reversible by reading it. The same module already had the right precedent in it:
`plan_unattributed` reports the plan gap **beside** the plans rather than hiding the rows.

So the funnel still counts every intake, and the flagged total is reported next to it. Two of
the new tests exist only to pin this, and they are the most important ones in the diff:

- `STILL COUNTS a flagged row in the funnel, because flagging is not filtering`
- `does not let a flag change the headline, which is gated on pricing instead`

What keeps a test row out of the money is the gate that already existed, now better informed:
the headline sums only deals a named person has priced, and the pricing form shows the reasons
before the save. A test row reaches a dollar total only if somebody reads
*"looks like a test row"* and prices it anyway.

**This is a judgment call, it is reversible, and it is logged as an assumption rather than
escalated** per the Autonomy Model. If Ali wants flagged rows subtracted from the funnel, that
is a small change on top of this, not a rebuild.

---

## The six flags

| Flag | Signal |
|---|---|
| looks like a test row | placeholder word in company name, contact name or email local part |
| this is us, not a prospect | email at one of our own domains, subdomains included |
| throwaway or reserved domain | disposable provider, or an RFC 2606 / 6761 / 6762 reserved TLD |
| no company name | cannot be named, so cannot be safely priced |
| no contact email | cannot be answered, so cannot become a deal |
| duplicate company name | flagged on **both** halves, not just the second |

Every one is a fact about the row, never a judgment about the prospect. *"Their process
description is vague"* is a judgment and has no place here. *"The contact email is at
colaberry.com"* is a fact, and it means we filled in our own form.

**The table gave better signals than the government stream has.** `enterprise_intakes` carries
`full_name`, `email` and `website`, so the strongest check available is the email domain: an
inquiry from inside the company is a test or a demo whatever name was typed into it. That check
is what makes the placeholder word list safe to keep short.

### "Acme" is deliberately NOT a placeholder word

The live row is "Acme Test Logistics", and `acme` is the canonical placeholder company name in
English, so adding it was tempting. **Acme Brick and Acme Markets are real companies with real
revenue.** A false flag beside a real $54,000 engagement costs more trust than the whole feature
saves, and our own test rows are caught by the internal-domain check regardless. The live row
already trips on `test`.

---

## One deliberate departure from the government panel

Flagged rows **sink** within their group rather than rising.

`govBidFlow` sorts them up, reasoning in its own comment that a reader wants to see the rows not
to price. That holds there, because unpriced-first is its only ordering key, so the flag only
orders inside that block. Here the primary keys are stronger: a **signed** unpriced deal is the
row genuinely suppressing the headline. Promoting a test row would make it compete with that
deal for the first thing a reader's eye lands on, and the test row is the one row on the panel
that needs no action at all.

Pinned in both directions, because a sort assertion in one direction only proves half of it:

- `sinks a flagged row BELOW a clean one inside the same group`
- `does NOT let the flag outrank signed, which is the key that matters for money`

---

## Why a new module

`enterpriseFlow.ts` was already 560 lines, past CLAUDE.md's 500-line hard ceiling, and the rule
is that the next change to such a file must split it before adding new code. So the obligation
was already there, and it paid for itself: the pure function needs no database, which is why
48 of the 67 new tests mock nothing at all.

---

## Mutation testing: 10 of 10 killed

Every mutation was grep-confirmed to have applied **before** the run and grep-confirmed reverted
**after**, because a mutation that does not change the file proves nothing. The commit went in
first, so a failed revert could not be mistaken for clean.

| # | Mutation | Result |
|---|---|---|
| M1 | drop the leading `\b` | 1 failed |
| M2 | drop the trailing `\b` | 1 failed |
| M3 | suffix match instead of subdomain match | 2 failed |
| M4 | count blank company names as duplicates | 1 failed |
| M5 | `> 1` becomes `> 0` on the duplicate check | 18 failed |
| M6 | roster carries no flags, so the panel can never warn | 3 failed |
| M7 | funnel row always reads zero | 6 failed |
| M8 | **flagged rows filtered OUT of the funnel** | 2 failed |
| M9 | sort inverted, so a test row rises to the top | 1 failed |
| F1 | `flagWarning` always returns null | 2 failed |

M8 is the one worth naming. It implements the behaviour this design rejects, and the point of
writing it was to confirm that a future change in that direction cannot pass silently.

---

## Gates, honestly

- **Backend jest: GREEN.** 10 suites, 219 tests. That includes both tree-scanning frontend
  ratchets, which trip on *any* frontend file and cost me a CI run yesterday.
- **Frontend jest: GREEN.** 1 suite, 26 tests.
- **A new test is itself a ratchet:** `keeps an em dash out of the event label, which is
  rendered copy`. The government stream's equivalent label uses one, so this would have been
  easy to copy in.

### Local `tsc` is still a confirmed false clean, and is claimed as nothing

Planted `const __control: number = "definitely not a number"` in the new module,
grep-confirmed **1** occurrence in the file, then ran `tsc --noEmit`: it reported **0**
occurrences of `__control`. The compile aborts on `@types/d3-dispatch` (TS1139/TS1005) and
`zod/v4/classic/schemas.d.cts` in the junctioned `node_modules` before it ever reaches changed
files. **CI is the only type authority on this branch.** Second day running this has been true.

### The frontend build gate could not run locally, and the reason is not this change

It fails on `Can't resolve 'bootstrap-icons/font/bootstrap-icons.css'`, imported by
`frontend/src/index.tsx` since PR #4069. The package is declared in `frontend/package.json`
(`^1.13.1`) and is simply absent from the local junctioned `node_modules`. `git diff origin/main
--name-only` touches neither that file nor any `package.json`, which is what rules my change out
rather than my assuming it. CI runs `npm ci` and has the package. **Installing it locally was
rejected**: a drive-by `npm install` is disallowed, and the junction means it would mutate the
shared install other sessions are using.

### There is no standalone lint gate here

No eslint config exists anywhere in this worktree and `frontend/package.json` has no
`eslintConfig` block. CRA lints inside its own build. Nothing to run, so nothing is claimed.

---

## Not covered

- The rendered card, which is auth-gated.
- Every value-dependent branch, since `enterprise_deal_values` still holds 0 rows in production.
- Whether the flag actually fires on the live row. It should, on `test` in the company name, but
  that is a claim about production and belongs to the post-deploy check, not to this build.

---

## Still open on R23

The W28 intake form does not constrain its service field to the three plans. The production row
is the proof, arriving blank. That is a change to W28's own form and is not made here.

**Taken on R23 the same day, at Ali's instruction ("take it on R23"). See Phase 5 below.**

---

## Deployed and production-verified

Merged as `0f1eb2bfb`, deployed 19:17-19:18Z on 2026-11-22. Registry mode confirmed `:main`
matched `sha-0f1eb2bfbf83d0646a29156a8d9c3a6d53c5ca1e` for both images before pulling. CI was
10 of 10 green (1 skipped) on head `67641003c`.

### The proof that matters: the deployed code was asked about the real row

Not a grep for a string. `buildEnterpriseFlow` run read-only inside the running container:

```
ROW {"company":"Acme Test Logistics","stage":"interviewed","signed":false,
     "priced":false,"flags":["looks like a test row (company name, contact name, contact email)"]}
rows_flagged = 1
inquired     = 1
suspect events = 1   EVENT 2026-11-21 | Acme Test Logistics: looks like a test row (...)
```

**All three fields tripped**, so the contact name and the email on that row are placeholder text
too, not only the company name.

`rows_flagged = 1` **while** `inquired = 1` is the pair that proves the design rather than the
plumbing: the flagged row is counted in the funnel *and* flagged. That is flag-not-filter
verified in production instead of only in a test.

The caveat came out at 828 characters and does carry the louder clause: *"EVERY row in this
table is flagged, so the enterprise site has not produced a single unflagged inquiry yet. The
stream reads as live because the table is not empty, which is a fact about the table rather than
about demand."*

### Both containers were replaced, despite compose saying otherwise

| | image before → after | started before → after |
|---|---|---|
| backend | `7398bf3b0160` → `9fe5abd6aa79` | 14:09:38Z → **19:17:38Z** |
| nginx | `b096abd416b6` → `f681a62f5386` | 19:09:08Z → **19:18:32Z** |

Compose printed `accelerator-backend Running`, not `Recreated`, and only the nginx image showed
in the pull output. It replaced both anyway. **Second consecutive day that verb has been
misleading**, which is exactly why the proof is the image id and the timestamp.

### A pre-existing partial deploy, found by the before-state read

Before I started, host HEAD was `e6d0d6d43` (built 18:05Z) while the **backend** container had
been running since **14:09:38Z** and nginx since 19:09:08Z. Somebody's earlier deploy had
updated nginx and not backend, so production was serving a backend older than its own checkout
and nothing was reporting it. This deploy corrected it as a side effect. **The condition is
reachable and silent**, which is the part worth remembering.

### A marker I had to throw away before it produced false proof

The obvious string to grep for was `looks like a test row`, and the before-state read returned
**2** for it in the OLD build: `govBidFlow.suspectReasons()` uses the identical sentence. It is
4 now. Used as the marker it would have given a number that rose across the deploy and meant
nothing at all. **Every marker actually used was measured at zero beforehand.**

With that correction: 7 backend markers present, positive control 1, negative control **0**.
Served nginx bundle: 5 markers at 2 each, positive control 2, negative control **0**. Five
surfaces 200 on `enterprise.colaberry.ai`, and `www.refactored.ai/health` 200.

### The cascade was checked, not assumed

#4313 merged two minutes before mine. The last successful build at that moment was
`e6d0d6d43`, and `git merge-base --is-ancestor` proved it does **not** contain this merge, with
the reversed direction confirming the check was live rather than silently failing. Deploying
then would have served pre-merge code and reported success.

### Errors

5 in the window, **none from this change**: all `intel-card-content` /
`IncompleteGeneration` from the card generation pipeline. Checked by grep for
`enterprise|suspect|revenueFlow` rather than by eye; 0 matches.

### Still not verified

The rendered card, which is auth-gated: the copy is proven present in the served bundle, but
nobody has looked at the page. Every value-dependent branch, since `enterprise_deal_values`
still holds 0 rows.

---

## One process note worth keeping

A `cat >> file` with no stdin hung for the full two-minute timeout and left an empty
`.append_marker` file behind in the tests directory. My own slip, caught because I staged with
explicit paths and `git status` showed the stray `??` entry. Explicit staging is what surfaced
it; `git add -A` would have committed it.

---

# Phase 5: the W28 form records which plan they chose

Ali, after the Phase 4 deploy report: **"take it on R23"**. So this is the same ticket, not a
new one.

PR: https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/4331

## What was actually wrong

The gap was not in the reporting. It was three separate holes in one form field.

1. **Optional.** The legend said so, and `validate()` never checked it. A skipped answer is
   indistinguishable on the board from a question nobody asked, and the live production row is
   exactly that case.
2. **It posted the display word, not the plan key.** This is the one worth remembering, because
   it *looked* like it worked: `Build` lowercases to the key `build`, so three of the four chips
   round-tripped by coincidence. The fourth did not. `Not sure yet` matched no plan, so a
   prospect who answered honestly was counted in the same number as rows nobody had ever asked.
3. **The schema took any 50 characters.** Nothing stated the allowed set, so no test could fail
   if the form drifted.

## The decision that mattered: normalize, never reject

The obvious reading of "constrain the field to the three plans" is `z.enum([...])` answering
400 to anything else. **That would lose real leads, and not hypothetically.**

Today's form posts `Build`. People leave forms open in tabs for hours. A strict enum shipped at
time T answers 400 to every submission from a page loaded before T, so the cost of the stricter
contract is paid by whichever prospects happened to be mid-form during the deploy. On a
lead-capture surface a dropped submission is unrecoverable: **nobody writes in to say their form
failed.**

So the contract is enforced where enforcement is safe (the form submits a canonical value, and
a test fails if it stops) and lenient at the boundary, where strictness would destroy the thing
being measured. Unmatched text is kept verbatim and capped at the column width rather than
blanked, because blanking would throw away a buyer's own words *and* make a failed match
identical to an unanswered question.

This is the same shape as Phase 4's flag-never-filter decision, and for the same underlying
reason: the destructive option is the one that leaves no trace.

## Five buckets where there were four

`Not sure yet` is now its own funnel stage, and `Plan not recorded` holds only our own gap.
Before this, one number meant three unrelated things: they had not decided, nobody asked, or
the text was unreadable. The first is the prospect's honest position on first contact, the
second is a defect on our side, and the third is something a human should go and read. Reporting
them as one number made the board look complete while hiding which of them anyone could act on.

The roster and the timeline make the same split. A `not sure` deal carries the words as its
label while its plan key and engagement shape stay **null** — the honest pair: they answered,
and the answer does not say whether this is a retainer or a total. So the pricing form opens on
one total figure, which is `initialMode`'s null default and the safe one.

### The ordering trap

`not sure, maybe training` contains "training". Running `planOf` first files that person under
Train, which is the exact opposite of what they said. So the not-sure phrases are checked
**before** the plan phrases, and a test pins it. An explicit disclaimer outranks a plan name
appearing later in the same sentence.

## Why the breakdown moved out

`enterpriseFlow.ts` was 628 lines, past the 500-line hard ceiling, and CLAUDE.md is explicit
that the next change to such a file splits it before adding code. Second time this rule has
paid for itself on this stream: the extracted `enterprisePlanFunnel` is pure, so the whole
breakdown is testable as a partition of the rows without a mocked query. Inside the flow
builder, every one of those cases would have needed one. `enterpriseSuspect` came out of the
same file in Phase 4 for the same reason.

It returns stage **descriptors**, not `FunnelStage`, deliberately. Rebuilding a FunnelStage
there would copy the "this counts people, not dollars" default into a second file free to
disagree with the first; importing the builder back out of `enterpriseFlow` would make the two
circular. So it returns what only it knows and the flow maps them through the one builder.

## Mutation testing: 6 of 6 killed

Run against the committed tree, each reverted after.

| Mutation | Result |
|---|---|
| Drop the not-sure check so a plan word later in the sentence wins | KILLED `enterprisePlans` |
| Count a recorded "not sure" as our own missing answer | KILLED `enterprisePlanFunnel` + `enterpriseFlow` |
| Make the timeline call their undecided our missing answer | KILLED `enterpriseFlow` |
| Stop canonicalizing at the contract boundary | KILLED `enterpriseIntake` |
| Form posts the display word again (the old coincidence) | KILLED `enterprisePlansMatchTheSite` |
| Make the service question optional again | KILLED `enterprisePlansMatchTheSite` |

One note on reading mutation output honestly: the timeline mutation's own "expect 0 occurrences
left" line printed **1**, which looks like the mutation failed to apply. It had applied; the
remaining occurrence was the phrase inside a comment I had written two lines above the code.
The verdict stands on the suite failing, not on the grep count, and the grep expectation was
simply wrong.

## The drift guard is the load-bearing test

`enterprisePlansMatchTheSite.test.ts` already read `frontend/src/config/v2Pricing.ts` to stop
the backend's plan keys drifting from the pricing page. It now also reads
`frontend/src/pages/publicV2/demoPilotModel.ts` and fails if the form's four values stop
matching `SERVICE_ANSWERS`, if a plan key moves out of the first three, or if the required
check is removed.

Without it this design is unsafe. Someone restoring the display words breaks revenue
attribution **silently**: the funnel keeps rendering, the stages keep adding up, and the new
answers quietly pile into "Plan not recorded".

## Assumptions logged

Both reversible, local blast radius, no governance boundary, so taken rather than escalated.

- **The service question is now required.** It costs one click on a chip already on screen and
  commits the buyer to nothing, because the last choice says they have not decided. Requiring
  an answer is not requiring a decision, and it is the only thing that ends the blank case.
- **`interest_area` keeps receiving the display words.** It is read by the growth-journey
  classifier, the AI message service and the acquisition panels, all written against the words.
  Canonicalizing the intake row is the point of this phase; silently changing what a dozen
  downstream readers see is not. One stored value, one rendering of it.

## Gates

- Backend: **36 suites, 649 passed, 5 skipped** across `revenueFlow`, `enterpriseIntake`, and
  both tree-wide copy ratchets, which run because this touches `frontend/src`.
- Frontend: **2 suites, 43 passed**.
- The ratchets were re-run *after* rebasing onto current main, because someone else's
  typography baseline had landed there and that baseline is exact in both directions.
- Branched off `origin/main`, which was **65 commits ahead** of the Phase 4 branch. Checked
  first that none of those commits touched the files in this change; only the typography
  baseline overlapped, and this change does not touch it.

### Local `tsc` is still a confirmed false clean

Third time measured on this stream. Planted `const __control: number = "definitely not a
number"`, grep-confirmed present, and `tsc --noEmit` **never reported it**. It reports 267
errors, every one of them inside the junctioned `node_modules` (`zod/v4/*.d.cts` 258,
`@types/d3-dispatch` 9), and the TS1139/TS1005 parse errors abort it before it reaches repo
source. **CI is the only type authority here and no local pass is claimed.**

## Not verified

- The rendered page. The radio values and the removal of "optional" are asserted in the static
  markup; nobody has loaded `/demo-pilot` in a browser.
- An end-to-end submission through the new contract against a real database.
- Whether a real prospect now picks a plan, which is the only thing that will actually move
  `plan_unattributed` off its current count.

---

## Phase 5 in production, and I deployed nothing

Merged as `53b1f5ba8` at 22:47:48Z. **By the time I came to deploy it, it was already live**, and
not by my hand. `/var/log/colaberry-registry-deploys.log`:

```
2026-11-22T22:57:23Z 53b1f5ba8...  services=nginx     <- my own merge, deployed by another session
2026-11-22T23:12:03Z 48e55fcb6...  services=backend
2026-11-22T23:12:31Z 66770932c...  services=nginx
```

Three merges landed within half an hour and other sessions deployed main's tip, which carried
my commit along. Backend started 23:11:33Z on image `60e6e310c6fd`, nginx 23:12:27Z on
`bd43aac005fe`, host HEAD and `origin/main` both `66770932c`.

So there was no deploy to perform, and claiming one would have been a lie. What was left was
verification.

### The baseline was a FALSE ZERO, and a positive control is the only reason I know

This is the finding worth keeping from this phase.

My first pre-deploy baseline ran the markers through nested PowerShell into `ssh` into
`docker exec sh -c "grep -rlF '$m' ..."` with backtick-escaped quotes. **It reported 0 for all
seven markers.** Every one of them was actually non-zero: `normalizeService` 4, `attributionOf`
4, `SERVICE_NOT_SURE` 4, `plan_not_sure` 1, `plan not chosen yet` 1, `serviceLabel` 3,
`planBreakdown` 5.

The quoting was eaten somewhere in that chain and the grep returned nothing, which looks
**exactly** like a clean baseline. Had I trusted it, I would then have measured the same markers
after a deploy, watched them "rise from zero", and reported that as proof. The numbers would
have been real; the baseline they were compared against would have been fabricated.

What caught it was a **positive control inside the harness**: the same script also grepped for
three strings known to be present from Phase 4 (`enterprise_suspect`, `looks like a test row`,
`buildEnterpriseFlow`). Those returned 2, 4 and 3 on the re-run via a scp'd script, and would
have returned 0 under the broken harness. The negative control alone would NOT have caught
this: a broken grep and an absent string both return 0.

So the rule tightens. Phase 4's lesson was *baseline every marker at zero before deploying*.
Phase 5's is **the harness that takes the baseline must itself carry a positive control**, or
the zero it reports is unfalsifiable. And the quoting lesson already in memory applies to reads,
not just writes: scp a script, never inline a remote command through PowerShell.

### What is proven, and by what

I could not baseline at zero, because the deploy preceded me. The complementary proof is
stronger anyway, because it is a disappearance that only this change causes:

| Claim | Evidence |
|---|---|
| Phase 5 backend code is live | `plan_not_sure`, `plan not chosen yet`, `normalizeService`, `attributionOf`, `SERVICE_NOT_SURE`, `serviceLabel`, `planBreakdown` all present in `/app/dist`; `enterprisePlanFunnel.js` exists, 6026 bytes, exporting `planBreakdown` |
| The PRE-Phase-5 code is gone | `left the service field empty` **0**, `does not yet constrain` **0**, `cannot be attributed to one of the` **0**. Those strings existed only in the old build |
| The form change is served | nginx bundle carries `not_sure` (4) and `Please pick one, or` (2), the latter a string that exists nowhere else in the tree |
| The harness was honest | positive controls > 0 and negative control 0, on both the backend dist and the nginx bundle |

### Verified through the deployed code, not by grep

Run read-only inside the container:

```
normalizeService('Not sure yet')            = "not_sure"
normalizeService('Build')                   = "build"
normalizeService('not sure, maybe training') = "not_sure"   <- the ordering trap, holding in prod
attributionOf('')                           = "unrecorded"
attributionOf('consulting')                 = "unreadable"
serviceLabel('build')                       = "A new build"

planBreakdown stage keys = plan_build, plan_guide, plan_train, plan_not_sure, plan_unattributed
  notSure=1 unrecorded=1 unreadable=1   caveats=2

plan_not_sure stage present: true   label: "Not sure yet"
  says "recorded answer, not a gap": true
plan_unattributed
  says "carry no service answer": true
  says "since R23 Phase 5":       true
  still says the OLD wording:     false
```

### The row Phase 4 verified against no longer exists

`enterprise_intakes` holds **0 rows**. `enterprise_deal_values` 0. No lead named "Acme Test"
anywhere. The test row that Phase 4 proved the flag against, at 19:18Z, was purged by someone
between then and 23:17Z.

Plausibly *because* Phase 4's flag identified it as a test row, which would be the flag doing
precisely its job. I cannot prove that causation and am not claiming it.

The consequence for this phase is honest and worth stating plainly: **the funnel's new
behaviour is verified at the code level and against synthetic rows run through the deployed
build, but not against a real intake row, because there is no longer one to verify against.**

### A second false control, caught the same way

The first data check used "leads with `form_type = demo_pilot_request`" as its control. That
returned **0**, same as the subject, so it distinguished nothing. A control that happens to be
zero is not a control. `SELECT COUNT(*) FROM leads` returning **25,702** is the one that
established the harness reads real data.

### Not verified

- Behaviour against a real intake row. The table is empty.
- An end-to-end submission through the new contract.
- The rendered page. The new radio values and the removed "optional" are proven present in the
  served bundle; nobody has loaded `/demo-pilot` in a browser.
- Every value-dependent branch, since `enterprise_deal_values` still holds 0 rows.
