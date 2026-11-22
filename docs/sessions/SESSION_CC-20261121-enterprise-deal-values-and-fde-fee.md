# CC-20261120-b7k2: an enterprise deal gets a price, and the FDE fee was wrong by a factor of ten

Session `CC-20261120-b7k2`, work done 2026-11-21 (Central). Ticket:
[R23](https://app.basecamp.com/3945211/buckets/7463955/todos/10534796798).

| | |
|---|---|
| Phase 2, the deal value table | PR [#4283](https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/4283), merged `fcff93aff`, deployed and verified |
| The FDE fee + plan shapes | PR [#4294](https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/4294), merged `769eff204`, deployed as `756a5a58a` |

**TAKEAWAY: `enterprise_deal_values` now lets a signed enterprise deal carry a human-confirmed
figure, and a price that had been wrong by a factor of ten for five days is corrected on the
board Ram reads.**

---

## Phase 2: the price the funnel never had

Phase 1 put enterprise.colaberry.ai on the Revenue Flow board and it could only ever report
zero — not because nobody will buy, but because `enterprise_intakes` has no column that could
hold what a deal is worth.

This is the identical wall R16 hit on government bids, whose conclusion was recorded on that
ticket as **"SO THE ONLY MISSING PIECE IS PRICE"**. `gov_bid_values` answered it;
`enterprise_deal_values` is that answer applied here, deliberately the same shape, because the
problem is the same problem and a second pattern would be a second thing to learn.

### The name was checked against production before it was taken

Seven candidates queried in `information_schema.tables` with a **positive control**
(`gov_bid_values` returned 1); all seven returned 0, and the only neighbouring `%deal%` or
`%value%` table is `gov_bid_values` itself.

R14 is the retrospective for the day `evidence_links` collided with a table another feature
already owned: `CREATE TABLE IF NOT EXISTS` turned the collision into silence, every index
after it failed against someone else's columns, ten failures logged at `warn`, and nothing
looked broken until every Revenue Room drill-down began answering "Could not build the
drill-down." **`IF NOT EXISTS` protects a second RUN, not a second OWNER, and cannot tell them
apart.**

### A value is a human's claim, and here that is load bearing in a way it was not for gov

`confirmed_by` is NOT NULL, comes from the session, and is refused empty at the database as
well as in the service.

The reason is specific to this funnel: **the W28 intake is AI-driven end to end.** An agent
runs the interview, drafts the pilot options and drafts the proposal. A deal value written by
that same machinery would be the model's estimate of its own pipeline, printed on a board whose
headline is money.

### A different basis vocabulary from gov, on purpose

A bid is priced against a solicitation document or an award notice. A deal is priced against a
`signed_agreement`, a `statement_of_work`, an `accepted_proposal` or a `verbal_commitment`.
Reusing the gov list would have forced every enterprise deal into `human_estimate` and thrown
away the distinction the column exists for. `human_estimate` is still there, named as judgment,
so a guess can be recorded honestly rather than dressed up as something stronger.

### What can print a figure, and what still cannot

`enterprise_signed` flipped to `carriesValue: true` and two valuation events joined it. **The
other four stayed `false` permanently, not as a staging state** — an inquiry, an interview, a
sent proposal and a loss are not money and no table will make them so.

Two rules carried from the gov stream, which learned both the hard way:

- **The headline sums only priced deals.** An unpriced signed deal is reported *beside* the
  total, never folded into it and never as zero. "Nobody has priced this" and "this is worth
  nothing" are different statements.
- **A value on a deal that is not yet signed never reaches the headline.** Pipeline is not
  revenue, and this total sits next to booked membership revenue.

Corrections supersede rather than overwrite, in one transaction. The partial unique index on
`superseded_at IS NULL` is what lets the headline be a plain `SUM`.

---

## The FDE fee was wrong by a factor of ten, and it was live

`ideaFlow.ts` said **1%** of first year salary from 16 to 21 November, quoting Ali by date in
four places and asserting it in a test. On 21 November, describing the enterprise offer, he
priced the same motion at **10%**.

A tenfold difference in a stated price is not something to resolve by picking the more
plausible number — 10% is the industry norm for placement and 1% is implausibly low, but that
is an argument, not a source. It went back to him with both figures and their provenance; he
confirmed 10% and that the 1% was an error.

**The correction is written down rather than quiet**, for two reasons. The figure was live on a
board Ram reads, so "it has always said 10%" would be false. And a price attributed to a person
by date is a claim about what they said — if the attribution can be rewritten silently, the
date beside it stops meaning anything.

**The test now asserts the figure in both directions.** It asserted `/1%/` for five days while
the price was wrong, and a test that only checks the new number passes just as happily if
someone restores the old one. The superseded figure is named as something the stage must NOT
say, with `/\b1%/` rather than `/1%/` so the guard cannot be satisfied by the "10%" it guards.

---

## Plan A being a retainer exposed a foot-gun I had built in Phase 2

Ali, 2026-11-21: Plan A is *"more along what Will is going through right now with Middlesex. We
are looking at a retainer, a monthly fee."*

`deal_value_cents` holds the **total** and `period_months` the term. So somebody recording
Middlesex would type the figure they actually negotiated — the monthly fee — with a twelve-month
term, and the service would have stored **$4,500 as the whole engagement instead of $54,000**.
The mandatory basis text makes them *describe* the figure, which helps a reader afterwards and
prevents nothing at the moment of entry.

The input is now a discriminated union. A monthly retainer has its own field name
(`monthlyFeeCents`), its own **required** term, and the total is computed rather than typed.
`monthlyFeeCents` cannot be mistaken for a total the way a generic `dealValueCents` could, and
a retainer with no term is refused outright instead of silently becoming one month of itself.

`deal_value_cents` still always holds the total, so every `SUM` stays correct without the caller
knowing which shape produced a row — and the monthly figure is exactly recoverable, because
that is how the total was built.

Plans now carry an `EngagementShape`, so Plan A's retainer nature is data rather than folklore,
and is never inferred from the mere presence of a term.

### The fourth motion is recorded, and deliberately not a plan

*"We create our own Developers and they produce real projects that are all documented Case
Studies so when seeing who you want to hire. The cost is 10% of the 1st year annual salary."*

That is `FDE_PLACEMENT_NOTE`, and it belongs to the `hire_fde` stream rather than the three
plans. An enterprise plan is a company buying our work; a placement is a company hiring a
person we trained, with the case studies as the evidence they shop with. Counting one as the
other would overstate the plans and understate the hiring motion, and their funnels end in
different places — one at a signed engagement, the other at a hire.

---

## Verification

16 suites / 294 tests green across the DDL, the service, `revenueFlow`, `revenueRoom` and the
banned-word ratchet — run **proactively** this time, because it covers all of `backend/src` and
a narrowed run cannot surface it, which is how it caught Phase 1 in CI rather than locally.

**Eight mutations planted across the two PRs; six caught, one real gap found, one harness bug
found.**

| mutation | result |
|---|---|
| `measured_zero` → `unmeasurable` | caught |
| `planOf` defaulting a blank to `build` | caught |
| `enterprise_inquiry` claiming `carriesValue` | caught |
| the "nothing priced" branch made unreachable | caught |
| revert the FDE fee to 1% | caught |
| retainer stores the monthly fee as its total | caught |
| accept a termless retainer | caught |
| widen `signedRows` to every intake | **SURVIVED** — see below |

### The mutation that survived, and the smell behind it

Widening `signedRows` to include every intake — which puts an **unsigned** deal's value into a
revenue total — passed the entire suite. The headline short-circuits on the signed count, so
with nothing signed the scoping is never exercised.

The new test signs one deal and prices a second that is only at proposal: the total must be the
first alone, and reads $75,000 instead of $45,000 if the scoping breaks. Re-run against the
same mutation: 3 failed.

The smell behind it was duplication. "Signed" was derived twice from the same predicate — once
for the funnel count, once for the pricing scope — and that is what let the mutation hide: one
copy drifted while the other still read correctly. `reached.signed` now comes **from**
`signedRows`, so there is one definition and it cannot drift from itself.

---

## Three process failures of mine

### 1. I mutated before committing and lost the work

Every `git checkout --` in the mutation loop discarded three uncommitted source edits — the
price correction, the plan shapes and the retainer fix — leaving only the tests, which is why
the baseline suddenly read 6 failed / 34 passed. My own standing note says *commit before the
mutation check*; I ignored it.

Reapplied from context, committed, and only then mutated again. Cost: about twenty minutes and
no lost content, because the edits were still in the session. Had they not been, they would
have been gone.

### 2. Three mutations silently failed to apply

One multi-line `perl` substitution matched nothing against CRLF line endings. One `sed` used
`|` as its delimiter against a pattern containing `||`. One reapply script wrote a literal
newline into a string literal.

All three reported a green suite, **which reads exactly like coverage.** A mutation that does
not change the file proves nothing. Every mutation is now confirmed applied with a `grep`
before its result is believed, and that check is what turned a false pass into a real finding
twice.

### 3. Local `tsc` remains dead and nearly produced a false report

Unchanged from the Phase 1 record: a deliberately planted type error goes **undetected**
because the shared root `node_modules` carries a pre-existing `@types/d3-dispatch`
TypeScript-version breakage that aborts the compile before reaching any file in this work. The
memory note that said to filter the output and trust zero `src/` matches has been corrected,
because that technique produced a clean read with the control still in the file.

CI's Backend typecheck, Frontend typecheck and Frontend build are the authority for both PRs,
and both passed.

---

## Deploys

### Phase 2 — `fcff93aff`, 15:27Z

Both services `Recreated`. Backend `1fb07832983f` → `6e262bd75bac`, nginx `f251b5f588a1` →
`9a34c77b2926`.

**The boot DDL landed clean**, verified read-only with controls on both sides. The table did not
exist before (negative control 0, two positive controls 1). After:

| check | result |
|---|---|
| table | exists, 14 columns |
| `uq_..._live_intake` | `UNIQUE … WHERE (superseded_at IS NULL)` — genuinely partial |
| constraints | 6 CHECK + FK + PK |
| basis vocabulary | the five enterprise values, and **not** the gov ones |
| FK | `→ enterprise_intakes(id) ON DELETE CASCADE` |
| rows | 0, correct — no write path |
| boot-log DDL warnings | none |

### The fee correction — `756a5a58a`, 22:05Z

**Found a partial deploy already in progress and closed it.** Another session had deployed the
backend at 22:04:35Z, so the price correction was already live — but nginx was still on its
21:23:49Z image, forty minutes stale, leaving the frontend half of #4237 (the nginx upload
guard), #4293 and #4298 unshipped. Compose reported `backend Running` and `nginx Recreated`,
which is the honest record of exactly that.

Verified after: host HEAD matches, both running images match `:main`, and in the running backend
**10% present (1), 1% absent (0)**, the correction note present, plan shapes present, the
retainer guard present — with `foldLongTail` as a positive control at 1 and a bogus token as a
negative control at 0. The nginx bundle is fresh and the earlier `enterprise_site` and
`channel-other-toggle` work survived. Five surfaces 200. No new backend errors.

### Image builds were cancelled three times today

`7a5e0472c`, `6b47b1d30`, `769eff204` and `6bb7949a0` all had their **Build images** run
cancelled by a following merge — the documented mode where a registry deploy serves pre-merge
code and still reports success. Merges were landing faster than an eight-minute image build.

Each time the fix was the same and is not a workaround: wait for a later commit's build, prove
by `git merge-base --is-ancestor` that it contains the merge in question, and deploy that. Never
assume; the ancestry check is one command.

---

## What is NOT verified

- **The rendered card.** `/admin/revenue-flow` returns 200 but the route is auth-gated and
  nothing here logged in.
- **Every populated branch.** `enterprise_intakes` holds 0 rows and `enterprise_deal_values`
  holds 0, so the cumulative stages, the plan breakdown, the priced headline and the retainer
  round-trip are exercised only by tests. The first real inquiry is the first time production
  runs those paths.

## Still open on R23

**No write path exists.** Nothing in the product can record a deal value yet, so the stream
reads zero in production regardless of the table being there — exactly as R16 shipped
`gov_bid_values` before its pricing control. The service is the only sanctioned way in when a
route lands, and it takes `confirmedBy` from the session, never from a body.
