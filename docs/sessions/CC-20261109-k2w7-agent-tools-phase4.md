# CC-20261109-k2w7 — Agent Tools, Phase 4: the tool must be one the capability requires

**Date:** 2026-11-11
**Ticket:** https://app.basecamp.com/3945211/buckets/7463955/todos/10500496471
**Follows:** Phase 1 (#3911), Phase 2 (#3929), Phase 3 (#3932) — all merged.

## The gap this closes

Ali asked that capabilities be tied to tools and that it be "clear and evident what tool is
doing which of the agent's actions". A grant already recorded both halves — the tool AND the
capability it is for — and **nothing checked that the capability actually asks for that tool**.

`agentToolGrantContract` had nine refusal rules covering who approves, whether the tool is
registered, and whether the capability is confirmed. It had none covering the relationship
between the two. So `capability_id` on a grant was decoration: an intention recorded and never
verified, which is precisely why "every action is tied to a tool" could not be proved.

## What was added

Two rules, in the same style as the nine:

| Rule | Behaviour |
|---|---|
| `tool_not_required_by_capability` | The tool must appear in that capability's `required_tools`. The detail names what the capability *does* ask for, so the refusal is actionable. |
| `capability_required_tools_unreadable` | Fails **closed** when the record cannot be read, matching `tool_catalog_unreadable`. "I could not check" is not "it is fine". |

An EMPTY `required_tools` is deliberately a different outcome from an unreadable one: a
capability that asks for nothing cannot justify a tool, so it refuses via
`tool_not_required_by_capability` with "it lists no required tools at all".

**The rule does not pile on.** It is only evaluated once the tool name and capability id are
present and no other refusal applies. Telling somebody their tool is not required by a
capability that was rejected, or that they never named, is noise on top of the real refusal, and
a refusal list that cries wolf gets skimmed.

## Two fixtures were passing for the wrong reason

Adding a required field to `ProposedGrant` broke two positive controls, and that was correct:

- `agentToolGrantContract.test.ts`'s `clean()` built a grant with no `capabilityRequiredTools`.
- `agentToolGrantService.test.ts` mocked a capability with no `required_tools` at all.

Both now declare the tool being granted. Their own comments say why: without it, every refusal
asserted below them would be passing for the wrong reason.

## Files

- `backend/src/services/agentDomain/agentToolGrantContract.ts` — two rules, one new field
- `backend/src/services/agentDomain/agentToolGrantService.ts` — supplies the capability's
  `required_tools`, `null` only when the record is absent
- `backend/src/services/agentDomain/__tests__/agentToolGrantContract.test.ts` — 9 new tests
- `backend/src/services/agentDomain/__tests__/agentToolGrantService.test.ts` — fixture

## Verification

- Backend typecheck, full project
- **Full** backend suite — not path-scoped. Phase 3 shipped a copy-lint break to CI because a
  path-scoped run cannot see repo-wide convention checks.
- Grant suites: **86 passed** across all four
- Mutation A, dropping the tie: **4 tests fail**
- Mutation B, failing open on an unreadable list: **1 test fails**, the fail-closed one
- Both confirmed applied by grep; contract restored byte-identical

## What this will surface, honestly

`required_tools` names 276 distinct tools of which only 13 have an implementation, and the
vocabulary collides (`sandbox_database_read` / `sandbox_postgres_read` /
`read_platform_db_sandbox`). So some legitimate grants will now be refused until a capability's
`required_tools` is corrected and the capability re-confirmed.

That is the intended consequence rather than a side effect: it is the backfill ticket's work, and
it is why enforcement of ACTIONS stays record-only until conversion is done.

## Still open

- **Phase 5** — tool identity on every action, record-now-enforce-later
- **The backfill** — 31 agents, 136 ungoverned holdings, 0 grant rows
