# CC-20261120-b7k2: enterprise.colaberry.ai becomes a revenue source, and reports zero

Session `CC-20261120-b7k2`, work done 2026-11-21 (Central). Ticket:
[R23](https://app.basecamp.com/3945211/buckets/7463955/todos/10534796798).
PR [#4275](https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/4275),
merged as `7a5e0472c`, deployed and verified in production as `fd07e9d8a`.

**TAKEAWAY: the enterprise site is now a stream on the Revenue Flow board, and the number it
reports is zero. The offer is public, the intake pipeline is live, and `enterprise_intakes`
holds 0 rows. A live offer that has produced no demand is a fact worth seeing; an absent card
was hiding it.**

---

## The ask, and how much of it already existed

Ali, 2026-11-21: *"I would like to add a Revenue source that is enterprise.colaberry.ai. With
3 plans. A New build, work with your team, training your team. With auto intake into
enterprise as Enterprise Client."*

Discovery found two thirds of that already built, so this change adds neither:

- **The three plans are the site's own services.** `frontend/src/config/v2Pricing.ts` has held
  `SERVICE_SHAPES` with the keys `build`, `guide` and `train` since `PricingV2` was rebuilt
  around Build / Guide / Train on 16 November, modeled on `docs/enterprise-site-v4/index.html`.
  "A new build", "work with your team" and "training your team" are those three in Ali's words.
  Nothing commercial was invented and no price was added.
- **The auto-intake is W28**, specified by Ali on 20 November and already live: the form, an AI
  interview by chat or voice, a per-client Basecamp list, company research, pilot options, an
  options email, a proposal, then signed or lost.

What was missing was only the revenue stream. That is the whole of this change.

## Measured in production before any design was written

Read-only, 2026-11-21:

| | |
|---|---|
| `enterprise_intakes` rows | **0** |
| interviewed / proposals sent / signed / lost | 0 / 0 / 0 / 0 |
| table exists and is correctly shaped | yes |
| `EnterpriseIntake.service` | free-form `STRING(50)`, default `''` |
| value / price / amount column | **none anywhere on the model** |

## Why a funnel of zeros is the honest answer here, and usually is not

`ideaFlow`'s header states the rule this inherits: *"a stage reading `0` asserts a measurement
that was never taken. The R2 finding this ladder keeps relearning is that a zero and an unknown
are different answers."*

Here the measurement genuinely was taken. The source exists, it is shaped correctly, and the
answer is 0. `TileStatus` already carried the exact word for that state — `measured_zero` — so
no new vocabulary was needed. A **missing** table is a different state and reports
`unmeasurable` with no funnel at all.

Both states are pinned by separate tests, because collapsing them is the specific mistake this
board has had to unlearn twice: R2's conversion rate that counted backwards, and R16's bids that
had no price.

## Nothing on the stream can print a dollar, and that is enforced rather than trusted

`enterprise_intakes` has no value, price, amount or contract column, so a signed deal carries
no figure and none can be derived.

This is the identical wall R16 hit on government bids. Its conclusion, recorded on that ticket,
was **"SO THE ONLY MISSING PIECE IS PRICE"** — the entire funnel existed except the number, and
`gov_bid_values` then supplied a human-confirmed value with a stated basis, a term, a named
confirmer and a partial unique index on `superseded_at IS NULL`. **The same table on the same
pattern is R23 Phase 2, and it is what turns this headline from an honest zero into a real
number.**

Until it exists, all five new classifications declare `carriesValue: false` and are listed in
`assertValueCarryingIsDeclaredHonestly`, so `revenueFlowService.enforceValueHonesty` *rejects*
any event that tries to carry a number instead of rendering it. `enterprise_signed` is the only
one that should ever change when Phase 2 lands.

## The plan vocabulary, and why a backend test reads frontend source

The pricing page owns how the offer is **sold**; `enterprisePlans.ts` owns how it is **counted**.
They agree on keys and nothing else, because a key has to survive a rewrite of the copy: if
"Guide" is renamed "Advisory" next month, every intake already recorded against `guide` must
keep counting, where a grouping key of the display name would silently split one plan into two.

The backend cannot import the frontend config, so `enterprisePlansMatchTheSite.test.ts` reads
`v2Pricing.ts` and fails if the three keys drift. It carries a **positive control**, so a parse
that returned nothing fails loudly rather than making the comparison vacuously true. This
follows an existing precedent rather than inventing one: `frontendTypographyLint.test.ts` is
likewise a backend test whose subject is frontend source.

`planOf` is lenient on input and strict on output. The `service` column is open text that the
W28 form does not constrain, so it reads the obvious phrasings and returns `null` rather than
defaulting a blank to Build. Unattributed inquiries are counted **beside** the three plans, with
blanks and unreadable answers tallied apart in the words — one is a form that never asked, the
other is an answer we could not read.

## Colour: the stream takes no new hue

`flowTokens.ts` splits paint by whether a stream **earns**, not by slot number, precisely so
added sources cannot walk onto the unvalidated end of the chart ramp. This stream earns nothing
yet, so it is muted and costs no hue. Taking the next free slot would have landed on
`--chart-3`, which **R17 measured at ΔE 1.8 from `--chart-4` for a protanope**.

Two signals then carry two different facts: the paint says it has earned nothing, the status says
it is wired and the answer is genuinely zero. It takes the next *validated* categorical slot on
the day it books revenue.

The existing frontend guard — *"gives a chart hue only to the streams that earn"* — passed
**unchanged**, because it was written generically to anticipate exactly this.

## Verification

- 19 new tests across two new suites. **13 suites / 235 tests** green across `revenueFlow` and
  `revenueRoom`. Frontend **3 suites / 44 tests** green.
- **Four mutations planted and all four caught**, then reverted: `measured_zero` →
  `unmeasurable` (1 failed), `planOf` defaulting a blank to `build` (3 failed),
  `enterprise_signed` claiming `carriesValue: true` (2 failed), the funnel made exclusive
  instead of cumulative (2 failed). Baseline restored to 35/35.
- The frontend guard was mutation-tested too: giving the non-earning stream `--chart-3` fails
  `gives a chart hue only to the streams that earn`. Reverted.
- `revenueClassifications.test.ts` **failed first, correctly**. Its `ALL_STREAMS` list is
  hardcoded on purpose so a stream added to `FlowStreamKey` without classifications cannot pass.
  It was extended rather than weakened, and its header now records that it did its job a second
  time (it had previously gone stale on `hire_fde`).
- All **10 required CI checks** passed on `e28d8117`.

## Three things that went wrong, all caught by guards rather than by me

### 1. Local `tsc` is useless in this worktree, and I nearly reported it as a pass

A type error planted deliberately in `enterpriseFlow.ts` went **undetected**. The shared root
`node_modules` carries a pre-existing `@types/d3-dispatch` TypeScript-version breakage
(`error TS1139: Type parameter declaration expected`) that aborts the compile before it reaches
any file in this change. Filtering the output to my own files produced nothing **with the
control planted**, which is what proved the check was dead rather than clean.

Had I not planted the control first, I would have reported "backend tsc clean" on the strength
of an empty grep. CI's Backend typecheck is the only authority for this change, and it passed.

### 2. CI's first run went red on the TWC banned-word ratchet

`bannedWordOutboundCopy` reported: *"services/revenueFlow/enterpriseFlow.ts: NEW file with 1
banned-word occurrence(s) in copy."* One string literal in a funnel stage definition used the
ordinary technical term for an unconstrained text field. The scanner covers every string literal
under `backend/src` and correctly cannot tell that term from advertising; 40 TAC 807.172(d) is a
hard ratchet, not a judgement call.

Reworded to "open-text", with a comment recording why the obvious word is not used there. This
is the same fix R16 made when `membershipFlow` said *"Comp plans are free."* in a provenance
string.

The sibling occurrence in `enterprisePlans.ts` sits in a **comment**, which the scanner does not
treat as copy, and was left alone rather than churned.

**Why the local run missed it:** I ran only the two suites I had touched. This ratchet covers all
of `backend/src`, so any new backend file can trip it and it can never appear in a narrowed run.
It passes locally now (17/17).

### 3. The image build for my own merge commit was cancelled

`7a5e0472c`'s **Build images** run was **cancelled** by the following merge (`fd07e9d8a`, PR
#4277). Three other builds that hour were cancelled the same way (`eeb820b6f`, `d4b752ee8`,
`8bc9c32ba`).

This is the documented failure mode where a registry-mode deploy serves pre-merge code and still
reports success. Deploying `7a5e0472c` would have found no published image. Because my merge is
an ancestor of `fd07e9d8a`, the fix was to wait for that commit's build (7 minutes) and deploy
it instead — verified with `git merge-base --is-ancestor` before deploying, not assumed.

## Deploy

`bash scripts/deploy-prod.sh` (no args, so backend and nginx together — the change touches both
stacks and a partial deploy is invisible), with
`EXPECT_MARKER=enterprise_site EXPECT_IN=backend:dist/services/revenueFlow/revenueClassifications.js`.

Registry mode confirmed both published images matched `sha-fd07e9d8a…` before recreating
anything.

| | before | after |
|---|---|---|
| host HEAD | `0adb1e78d` | `fd07e9d8a` |
| backend image | `1fb07832983f` | `af3adea77bd6` |
| backend started | 12:13:49Z | **13:09:53Z** |
| nginx image | `85cff48b83f7` | `170579452299` |
| nginx started | 12:46:14Z | **13:10:37Z** |

Compose printed `Running` rather than `Recreated` for both services, which is why the image ids
and start times are recorded here on both sides: those are what prove the containers actually
moved. The exit code and the word in the output would not have.

### Proved in the running containers

Backend `/app/dist`, with a positive control (`foldLongTail` = 1) and a negative control (a bogus
token = 0) so a zero is distinguishable from a broken matcher:

| check | result |
|---|---|
| `enterpriseFlow.js` present | yes |
| `enterprisePlans.js` present | yes |
| `enterprise_site` in `revenueClassifications.js` | 5 |
| `buildEnterpriseFlow` wired in `revenueFlowService.js` | 1 |
| `measured_zero` reachable in `enterpriseFlow.js` | 3 |
| the reworded copy present | 1 |

Served bundle, `*.map` excluded and controls included:
`enterprise_site` and `Enterprise site` both in `static/js/8074.e5846675.chunk.js`, fetched over
HTTPS at **200, 54,466 bytes**. Negative control 0.

Regression check on earlier work in this tab: `foldLongTail` still present twice in
`channelTruth.js`, and `channel-subrow-` still served.

Surfaces: `/`, `www.refactored.ai`, `/admin/revenue-room` and `/admin/revenue-flow` all 200.

### What this deploy also shipped

`fd07e9d8a` contains five other workstreams merged between my branch point and the deploy:
#4249 (Open House Zoom button), #4233 (retire LandJet), #4274 (v5 verification), #4276 (watch
beat retry backoff), #4278 (watch-gate artifact docs) and #4277 (story owner roster). None was
built or tested here; their owners should verify their own surfaces.

Worth noting in passing: `074f44e7f` — *"Check-in Zoom button: drop the play glyph (house style:
no emoji in product copy)"* — is someone else's fix for the exact `▶` emoji-lint violation
diagnosed in this tab on 20 November as the thing blocking #4249.

## What is NOT verified

- **The rendered card.** `/admin/revenue-flow` returns 200, but the route is auth-gated and
  nothing here logged in. The stream's own payload shape is covered by unit tests, not by a
  browser.
- **Behaviour with real data.** With 0 rows in `enterprise_intakes`, every populated-funnel path
  — the cumulative stages, the plan breakdown, the `live` status, the signed-with-no-value
  headline — is exercised only by tests. The first real inquiry is the first time production
  runs those branches.

## Still open on R23

- **Phase 2:** `enterprise_deal_values`, on the `gov_bid_values` pattern, so a signed deal can
  carry a human-confirmed figure. Until it lands this stream is structurally incapable of
  printing money, which is correct but is not the end state.
- **Phase 3, not this tab:** making the W28 intake form record which of the three plans a
  prospect chose. Until then the breakdown reads "Plan not recorded" rather than guessing.
