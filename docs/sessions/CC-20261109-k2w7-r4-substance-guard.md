# CC-20261109-k2w7 — R4 follow-up: the memory of a conversation that never happened

**Date:** 2026-11-11
**Ticket:** R4. Maya remembers a person, not a browser —
https://app.basecamp.com/3945211/buckets/7463955/todos/10455593471
**Follows:** PR #3855 (the sweep) and PR #3891 (the predicate fix), both merged and deployed.

## What this change does

1. Adds a substance guard to `saveConversationToMemory` so a conversation the visitor never
   spoke in is not written to memory at all.
2. Adds `stripEmptyConversationMemories.ts` to remove the entries already written.

## Why, measured rather than assumed

Closing a conversation calls `saveConversationToMemory`. That function had no substance guard,
so for a conversation with no `role='visitor'` message rows and no generated summary it still
incremented `conversation_count` and appended a summary entry reading literally
`"0 messages exchanged"`. `buildMemoryContext()` injects those entries verbatim into Maya's
system prompt, so she was being told about conversations in which nobody said anything.

The idle sweep began closing conversations on 2026-11-11, which is when this started firing.

Production, measured 2026-11-11 after the sweep's first run:

| Measure | Value |
|---|---|
| admissions_memory rows | 116 |
| rows with `conversation_count > 0` | 9 |
| rows holding at least one `"0 messages exchanged"` entry | **7** |
| rows holding **nothing else** | **5** |
| junk entries in total | **8** |

So of the 9 memory rows that gained any history, 5 gained nothing but an empty marker. The
earlier report of "memory now filling on 9 rows" overstated it: only 4 carry real content.

## The counter cannot be trusted, and that is the whole design of the guard

The obvious guard is `visitor_message_count > 0`. It is wrong. For the 17 conversations the
sweep closed:

| `visitor_message_count` says | actual `role='visitor'` rows | conversations |
|---|---|---|
| 0 | 0 | 4 |
| **1** | **0** | **3** |
| **2** | **0** | **1** |
| **3** | **0** | **1** |
| 1 to 4 | matching | 8 |

Five conversations carry a non-zero counter while having zero visitor message rows, and every
one of those five wrote a junk entry. A guard on the counter would have caught 3 of the 8.

**The guard therefore tests the message rows.** The rows are evidence; the counter is a claim.
A test drives the two apart on purpose so a future rewrite that reaches for the convenient
counter fails.

A generated summary still counts as substance, so a conversation the model found worth
summarizing is kept even if its transcript shape is unusual.

## What the strip script does and does not do

Removes only entries whose `summary` is exactly `"0 messages exchanged"`, by equality on that
field rather than a LIKE over the row, so a real summary mentioning the phrase is not matched.
Reduces `conversation_count` by the number of entries removed from that row, floored at zero.

It never deletes a memory row and never touches `lead_id`, `questions_asked` or `interests`.
Dry run is the default; `--confirm-production` requires `--ledger <path>`; `--invert` restores
only rows still holding the value the script wrote. The ledger is written **before** the
updates, so an undo exists even if the run dies partway.

## Files

- `backend/src/services/admissionsMemoryService.ts` — the guard
- `backend/src/services/__tests__/admissionsMemorySubstance.test.ts` (new) — 8 tests
- `backend/src/scripts/stripEmptyConversationMemories.ts` (new) — the cleanup

## Verification

- `npx tsc --noEmit`: 0 errors in `src/`, with a planted control error caught first
- Test-file typecheck ratchet: baseline matched exactly, both directions
- `npx jest -c jest.ci.config.ts --ci` on the new suite: **8 passed**
- Mutation A, removing the guard: **4 of 8 fail**, all four being the "refuses to remember"
  cases
- Mutation B, writing the guard against `visitor_message_count` instead of the message rows:
  **3 of 8 fail**, including exactly `writes nothing even when visitor_message_count CLAIMS the
  visitor spoke`. The suite distinguishes the correct fix from the tempting wrong one.
- Both mutations confirmed applied by grep, and the service restored byte-identical afterwards

## Still open on R4 after this

1. **Why the counter lies.** `visitor_message_count` is incremented in `sendMessage` alongside
   a `ChatMessage.create`, yet 5 conversations have the increment and no row. Either the create
   failed silently or the increment happens on a path that does not create one. Not chased
   here; this change makes the memory correct regardless, but the counter is still wrong and
   anything else reading it inherits the lie.
2. **The 128 greeting-only conversations** stay `active` on purpose. With this guard in place,
   closing them would no longer pollute memory, so that product decision is now reversible
   cheaply.
3. **84 memory rows can never be linked** to a person: their visitor names nobody.
