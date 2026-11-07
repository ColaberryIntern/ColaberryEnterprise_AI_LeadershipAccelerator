# L8.3 criterion 3 — mutation evidence for the replay entitlement filter

> Generated from `scripts/artifacts/tickets/l83Data.js`. **Do not hand-edit** — re-run
> `node scripts/artifacts/buildL83Artifacts.js`, which refuses to write if any test named below
> has stopped existing, or if the mutated function has changed since the run.

| | |
|---|---|
| **Ticket** | L8.3, criterion 3 |
| **Criterion** | *mutation evidence naming the test that fails when the filter is reversed* |
| **Filter** | `mayKnowAbout` in `backend/src/services/broadcast/broadcastDiscovery.ts` |
| **Applied by** | backend/src/services/broadcast/broadcastDiscovery.ts (projectDiscovery), called by getReplayBroadcasts in backend/src/controllers/broadcastController.ts |
| **Run on** | 2026-11-07 |

## Why this record exists

**An assertion nobody has watched fail is indistinguishable from a comment.** The replay list's
headline requirement is that a private class is **omitted** rather than shown-and-refused —
shown-and-refused leaks its existence — and that requirement is carried by one four-line function.
Until it is reversed and a named test goes red, "it is tested" is a claim about intent.

## The filter, as shipped

```ts
export function mayKnowAbout(entry: DiscoveryEntry): boolean {
  if (entry.occurrence.access_mode !== 'private') return true;
  return entry.roomEligible;
}
```

## Baseline

**Green: 3 suites, 101 tests, 23.5s.** A
mutation record against a red or unmeasured baseline proves nothing, so this is checked before
anything else.

Reproduce:

```
cd backend && node ../node_modules/jest/bin/jest.js --testPathPattern="src/(services/broadcast/__tests__/broadcastDiscovery|controllers/__tests__/broadcastController|routes/__tests__/broadcastRoutes)"
```

> **The flag is --testPathPattern (singular). The plural form is ignored and runs everything.** This matters: the first attempt used the plural form, which
> ran all 2,388 suites for 45 minutes and would have passed as a scoped green run to anyone who
> did not read the totals.

## The reversals

3 applied, **3 killed, 0 survived**,
across 13 distinct failing tests.

### DROPPED — the omission is removed entirely

Every private replay becomes visible to everyone, title and all.

```ts
export function mayKnowAbout(entry: DiscoveryEntry): boolean {
  return true;
}
```

**KILLED** — 7 failed, 94 passed, 101 total.

- ✕ `OMITS the whole item — the title never leaves the process`
- ✕ `omits it even when the decision somehow says full but the room says no`
- ✕ `decides per item, so one private broadcast does not hide a public one`
- ✕ `gates only on private`
- ✕ `NEVER sends a private title to an ineligible viewer`
- ✕ `NEVER sends a private replay title to an ineligible viewer`
- ✕ `dates every replay from its OWN class, even when entitlement omitted an earlier one`

### INVERTED — knowable only by someone NOT eligible for the room

Private replays leak to outsiders AND vanish for the cohort they belong to.

```ts
export function mayKnowAbout(entry: DiscoveryEntry): boolean {
  if (entry.occurrence.access_mode !== 'private') return true;
  return !entry.roomEligible;
}
```

**KILLED** — 13 failed, 88 passed, 101 total.

- ✕ `OMITS the whole item — the title never leaves the process`
- ✕ `includes it, with the title, for an eligible room member`
- ✕ `carries the class session when the broadcast has one, and null (never undefined) when it does not`
- ✕ `omits it even when the decision somehow says full but the room says no`
- ✕ `decides per item, so one private broadcast does not hide a public one`
- ✕ `sends epoch milliseconds, so no client does timezone arithmetic of its own`
- ✕ `carries no provider or policy fields — a badge has no business with them`
- ✕ `gates only on private`
- ✕ `NEVER sends a private title to an ineligible viewer`
- ✕ `sends it to an eligible room member`
- ✕ `NEVER sends a private replay title to an ineligible viewer`
- ✕ `CONTROL: sends that same replay to an eligible room member`
- ✕ `dates every replay from its OWN class, even when entitlement omitted an earlier one`

### SHOWN-NOT-OMITTED — gated on the access decision rather than on knowability

Still filtered, but on the wrong question. A private title reaches any viewer the access decision happens to allow — which is exactly the shown-and-refused behavior the requirement forbids, wearing the shape of a filter.

```ts
export function mayKnowAbout(entry: DiscoveryEntry): boolean {
  if (entry.occurrence.access_mode !== 'private') return true;
  return entry.decision.grant !== 'denied';
}
```

**KILLED** — 2 failed, 99 passed, 101 total.

- ✕ `omits it even when the decision somehow says full but the room says no`
- ✕ `gates only on private`

## The positive control

`CONTROL: sends that same replay to an eligible room member`

Fails under INVERTED and passes under DROPPED — so the suite discriminates direction, not merely change. A record built only on tests going red could not tell a sensitive assertion from a broken one.

## Finding — The replay-specific assertion does not catch the subtle reversal.

`NEVER sends a private replay title to an ineligible viewer` — the test that most obviously belongs to this ticket — fails under DROPPED and INVERTED but **passes** under SHOWN-NOT-OMITTED. In that fixture the ineligible viewer is also denied by the access decision, so a filter gated on the decision happens to omit the row for the same reason, and the assertion cannot tell the two rules apart.

What actually protects the replay list against that reversal are two tests one level down, in the discovery suite: `omits it even when the decision somehow says full but the room says no` — which exists precisely to separate knowability from entitlement — and `gates only on private`. **Those two are the load-bearing assertions for this criterion**, not the one with "replay" in its name.

That is not a defect to fix. The filter lives in the discovery layer and is correctly tested there. It is a fact about where the protection actually comes from, which is the thing a future reader of this ticket needs and could not have guessed.

## What this criterion is satisfied by

The named test that fails when the filter is reversed, for the record:

| Reversal | The test that catches it |
|---|---|
| DROPPED | `OMITS the whole item — the title never leaves the process` |
| INVERTED | `OMITS the whole item — the title never leaves the process` |
| SHOWN-NOT-OMITTED | `omits it even when the decision somehow says full but the room says no` |

All three reversals are caught. The narrowest is caught by 2 tests, both in
the discovery suite rather than the replay suite — see the finding above.
