# Session CC-20261102-k9r4 — ADS-7's missing protective test, and a third source shape

- [x] ADS-7: verify the canonicalization in production and close the coverage gap
  - Date: 2026-11-11
  - Session: CC-20261102-k9r4
  - What changed: added a `one campaign reads as one row (ADS-7)` block to
    `acquisitionFunnel.test.ts`, which had no coverage of the canonicalization at all.
  - Verification: 11/11 behavioural assertions against production through the deployed
    image (controls included); the new block parses clean, proven with a control.
  - Notes: found a third source shape the ticket never mentions — see below.

## ADS-7 verified behaviourally, which the merge watcher explicitly had not done

The watcher's own comment said "This is not behavioural verification. It establishes that
the code shipped, not that the feature works." So it was run against production data
through the deployed backend. 11 assertions, 0 failures:

| Claim | Result |
|---|---|
| `canonicalUtmSource('fb\|paid')` → `fb` | pass |
| `canonicalUtmSource('ig\|paid')` → `ig` | pass |
| funnel `campaigns`: no piped source survives | pass — 3 rows, 3 distinct (`fb`, `ig`, untagged) |
| a `fb\|paid` lead tags `utm-fb` | pass — `["brand-other","src-ad","utm-fb","camp-nov-launch"]` |
| and NOT `utm-fb-paid` | pass |
| a plain `fb` lead tags the same | pass |

The load-bearing control: the raw column **still holds both shapes** — `fb` 315,
`fb|paid` 43, `ig` 131, `ig|paid` 30. Without that, every check above would pass
trivially on data that no longer contains the defect.

Also controlled against over-reach: `google` is not rewritten to `fb`, and `null` stays
falsy so an untagged lead stays untagged.

## The coverage gap this fixes

ADS-7's third done-criterion is "both test suites cover the split".

- `ghlProvenanceTags.test.ts` — 2 references to `fb|paid`. Covered.
- `acquisitionFunnel.test.ts` — **0**. Not covered, at all: no reference to the pipe, to
  `split_part`, to `canonical`, or even to `utm_source`. Its tests are about stages, the
  permission gate, unmeasurable pages, the empty state and the window.

That is the suite guarding items 1 to 3 of the ticket — the `GROUP BY`, the donut and the
campaign table. The canonicalization could have been reverted in `acquisitionFunnel.ts`
and every test there would have stayed green, which is CLAUDE.md's own definition of a
contract too weak to be worth having.

The new block asserts the SQL canonicalizes in **both** the SELECT and the GROUP BY, never
groups by the raw column, and still groups by campaign so the fix did not flatten distinct
campaigns together. It follows the posture of the `IN`/`ANY` block already in that file: a
mocked `sequelize.query` cannot exercise a collapse that happens inside the statement, so
this is a regression guard, not a substitute for running the query — and the collapse
itself was verified against production above.

## A third Facebook shape, which ADS-7 never addressed

Found while reading the raw distribution for the control:

```
canonicalUtmSource('fb')       -> 'fb'
canonicalUtmSource('fb|paid')  -> 'fb'
canonicalUtmSource('facebook') -> 'facebook'   <- still its own key
canonicalUtmSource('Facebook') -> 'facebook'
```

So **two canonical keys still mean Facebook**: `fb` (358) and `facebook` (35). The GHL
tags diverge too — `utm-fb` versus `utm-facebook` — which is the same "a smart list on one
silently drops the other" damage the ticket described for the piped shape. `instagram`
behaves the same way, with 0 rows.

**Severity is limited and that is the honest framing.** The newest `facebook` lead is
2026-08-05 and there are **0 in the last 30 days**, so today's 30-day Performance report
cannot show this split: the donut and campaign table are correct right now. The 35
affected contacts are historical, and cleaning up already-mis-tagged GHL contacts was
explicitly out of ADS-7's scope.

Not fixed here, deliberately. Widening `canonicalUtmSource` would change a shared
canonicalizer that the spend report and `PLACEMENT_FOR_SOURCE` also read, for zero
present-day benefit, and the spend side types the source as `fb`. It is worth its own
ticket if a writer can still emit the spelled-out form; if nothing does, it is a
historical artifact and the right answer may be to leave it alone.
