# T206 - the brand relationship, written at registration

**Session:** CC-20261109-k2w7
**Date:** 2026-11-24
**Branch:** `workstream/explorer-brand-context-at-registration`

## What this is

A defect in the work this session shipped, found by checking the delivered outcome rather
than the delivered code.

The Growth Journey workstream ended with a backfill that gave all 1,221 Explorer profiles a
`lead_tenant_contexts` row, so every one of them resolved to Colaberry Training. That
satisfied Ali's requirement as written. It did not keep satisfying it.

## The measurement

Read-only against production, 2026-11-24:

| | |
|---|---|
| `explorer_journey_profiles` | **1,247** |
| with a `lead_tenant_contexts` row | 1,221 |
| **without one** | **26** |
| created 2026-11-24 | 19 |
| created 2026-11-23 | 7 |
| created before the backfill | **0** |
| of the 26, `lead_id` present | **26** (0 null) |
| control: `lead_tenant_contexts` rows | 1,281 (so the join works) |

Every contextless profile was created after the backfill ran, and none before it. The 26 all
have a `lead_id`, so this was never an unkeyable profile: the row was simply never written.

By door: **25 `open_house`**, 1 `ccpp_winback`. For contrast, all 561 `free_signup` profiles
have a context, and the 530 `open_house` profiles that have one got it from the backfill
rather than from the door.

At roughly 12 new Explorers a day, the gap reopens as fast as it was closed.

## Why it happened

Three doors create an Explorer profile, and only one of them wrote the relationship:

| Door | GHL `ai-explorer` tag | Brand relationship |
|---|---|---|
| `enrollmentService` (open_house) | yes | **no** |
| `freeSignupService` | yes | yes |
| `openHouseCreditService` | no GHL contact at all | **no** |

The tag column is there because the same question was open for Kes's audit and the answer
turned out to be different: `enrollmentService` tags through a local `pushLeadToGhl` helper
that passes `EXPLORER_SIGNUP_TAGS`, and `openHouseCreditService` makes no GHL call anywhere in
the file, so it cannot create an untagged contact. **The tagging is sound; only the
relationship was missing.** Worth recording, because the first reading of
`createExplorerEnrollment` looked like an untagged GHL push and was not.

## The fix

In `bridgeExplorerProfileAtRegistration`, the one choke point all three doors already call.
Every door gets it, and so does the next one anybody adds.

That placement also avoids editing `enrollmentService.ts`, which is 580 lines and therefore
over CLAUDE.md's 500-line hard ceiling. The rule says split before adding, and a three-line
bookkeeping fix is a bad reason to move a function that sends welcome email.

New `explorerBrandRelationship.ts` does the write. `explorerIdentity` gained
`resolveExplorerBrandContext`, which returns the tenant and brand id from ONE lookup;
`resolveExplorerBrandId` now delegates to it, so the two ids cannot drift apart.

## Why it cannot change who may be contacted

This is the load-bearing claim, and it is provable rather than cautious.
`brandPreferenceGate` resolves the context and then returns:

```
context.consent_contact ? allowed:'relationship_consent'
                        : blocked:'no_consent'
```

and with no context at all, `blocked:'no_relationship'`. **A row with consent false and no row
are the same answer to the only question that gate asks: both block.** Writing these rows
moves nobody from blocked to allowed.

It cannot downgrade anybody either. `ensureLeadTenantContext` only grants consent on an
existing row (`if (input.consentContact && !existing.consent_contact)`), so passing false adds
nothing to the patch. Safe in either order against the real consent `freeSignupService`
records moments earlier on the portal path.

## Verification

**Backend typecheck:** 0 errors. Proven by planting `const CONTROL_TYPE_ERROR: number =
"..."` first, which produced exactly 1 error naming this file at line 121. The run before
that reported 10+ phantom `Cannot find module 'axios'` errors until the ROOT dependencies
were installed, which is the documented quirk and not a real failure.

**Tests:** 12 new cells. Suites: 2 passed, 24 tests, including the pre-existing bridge suite
that governs the file being changed.

**Mutation tested**, because a green suite proves nothing on its own:

| Mutation | Cells killed | Which |
|---|---|---|
| `consentContact` false to true | **1** of 13 | the consent safety test, alone |
| wiring call removed from the bridge | **1** of 24 | the real-path wiring test, alone |
| `tenantId` taken from `brandId` | **2** of 13 | same-resolution + wiring, both of which assert the tenant |

Each mutation killed a different minimal set and none killed everything, so the tests
discriminate rather than being coupled to one another.

**`brands.tenant_id` is NOT NULL** with 0 nulls in production, and the Explorer brand resolves
to exactly 1 row, so the new null-tenant guard cannot change what the four existing
`resolveExplorerBrandId` call sites see.

## The 26 were backfilled, on Ali's instruction

Ali, 2026-11-24: **"backfill the 26"**. Run the same afternoon, before this PR merged, so
the forward fix and the history repair are independent of one another.

It reused the script that wrote the 939 rows on 11-23 rather than a fresh one, because that
script already carries the guards this write needed: it goes through `ensureLeadTenantContext`
(the declared sole writer, so the rows cannot drift from how the product makes them), it is
dry-run by default, it aborts if its own control comes back zero, and it never passes consent.

Dry run first: 26 to write, control 1,221 already holding one. Then the write:
`created=26 existing=0 failed=0`.

**Verified independently afterwards, not taken from the script's own report:**

| Check | Result |
|---|---|
| Explorer profiles with a context | **1,247 of 1,247**, 0 missing |
| rows created today granting consent | **0** |
| with `consent_at` set | **0** |
| with `consent_source` set | **0** |
| tenant / brand / relationship of all 26 | one group: `colaberry` / `colaberry-training` / `learner` |
| `lead_tenant_contexts` total | 1,281 to **1,307**, exactly +26 |
| **control:** consented rows exist all-time | **222**, so the zeros above are real and not an unpopulated column |
| idempotency: second run | finds **0** to do, control 1,247 |
| all five sub-flags / master flag | unset / exactly `true` |
| control: `printenv` works | `NODE_ENV=production` |
| AD-1: Explorer Growth still mounted | yes |

The control row is the one that matters. Without it, "0 rows granted consent" is equally
consistent with a consent column nobody ever writes, and the safety claim would rest on
nothing.

## What this still does not do

It does not address the single `ccpp_winback` row's *cause*. That row now has a context like
the rest, but its door reaches `ensureLeadTenantContext` through `leadIngestionService`, so
why it arrived without one is a different question from the 25 and is not diagnosed here. If
a contextless `ccpp_winback` profile appears again after this PR ships, that is the thread to
pull.
