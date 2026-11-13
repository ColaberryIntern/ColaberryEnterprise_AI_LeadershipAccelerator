# CC-20261109-k2w7 — Agent Tools, Phase 3: through to handed over

**Date:** 2026-11-11
**Ticket:** https://app.basecamp.com/3945211/buckets/7463955/todos/10500496471
**Follows:** Phase 1 (PR #3911) and Phase 2 (PR #3929), both merged.

## What was asked

Ali: track a tool request *"until it is built out and handed over"*. Approval was the last thing
anything recorded, so a request read "approved" forever whether it shipped the next day or was
never started.

## The design call: not a wider status column

`agent_domain_change_requests.status` is the GOVERNANCE state — submitted, approved, declined,
withdrawn — with a transition machine in `agentChangeRequest.ts` and existing readers. Adding
`in_build` and `handed_over` to it would mean:

- every existing reader silently acquires two values it has never seen, and
- one column answers both *"was this allowed"* and *"did somebody do it"*.

Those are different questions with different authors: approval is Ali's, building is the
builder's. So delivery progress is an append-only log beside the status, the way the decision log
and the conversation already are. The approval machine is untouched.

## Two rules made structural

**A build event cannot route around approval.** Only a request whose status is already `approved`
can carry one, refused by name with the actual status in the message. Without this, the table
would be a way to mark something delivered that nobody allowed.

**Handover is terminal.** No second handover, and no "started building" after one. A later event
would make the sequence unreadable, and a correction after handover is a new request.

## Phase 2's placeholder is retired

Phase 2's derived sentence read *"Approved to build. Not yet tracked through to handover, which
Phase 3 adds."* It is now replaced by what actually happened, and a test asserts the string
"Phase 3" appears in no delivery sentence — a UI advertising unbuilt work is worse than one that
says nothing.

## Files

- `backend/src/db/ensureToolRequestBuildEventSchema.ts` (new) — append-only, two CHECK
  constraints pinning the event vocabulary
- `backend/src/models/AgentDomainToolRequestBuildEvent.ts` (new)
- `backend/src/services/agentDomain/toolRequestBuildProgressService.ts` (new)
- `backend/src/services/agentDomain/toolRequestConversationService.ts` — feeds build events into
  the derived sentence
- `backend/src/controllers/toolRequestConversationController.ts`,
  `backend/src/routes/admin/toolRequestConversationRoutes.ts` — two routes
- `backend/src/server.ts`, `backend/src/db/__tests__/...bootWiring.test.ts` — boot wiring, roster
  raised to 10
- `frontend/src/components/admin/agentDetailV2/AgentToolRequests.tsx`,
  `frontend/src/services/agentEffectiveAccessApi.ts` — the delivery panel and its controls

## Verification

- Frontend typecheck: clean · Backend typecheck: **0 errors in `src/`**
- Test-file typecheck ratchet: baseline matched exactly, both directions
- Backend unit tests: **47 passed** across the new suite, Phase 2's and the boot-wiring roster
- Full frontend suite: **9,386 passed**
- Mutation A, allowing build events on unapproved requests: **3 tests fail**
- Mutation B, making handover non-terminal: **2 tests fail**
- Both mutations confirmed applied by grep; service restored byte-identical

## Two failures caught during the build, both mine

1. The roster entry sorted wrong — the assertion compares a `.sort()`ed list and "BuildEvent"
   precedes "Decision".
2. The Phase 2 conversation suite began opening a real Postgres connection, because the service
   now imports a model that suite did not mock.

## An environment failure that was not a verdict

`npx react-scripts test` died with `'C:\Program' is not recognized` — a Windows path-with-spaces
failure invoking node, producing an empty result that could have been read as a pass. Re-run with
the invocation recorded in memory (`node ../node_modules/react-scripts/bin/react-scripts.js`) it
ran properly. An empty gate is never a green gate.

The one failing frontend test, `publicNextOpenHouseJs.test.ts`, is pre-existing and local-only: a
CRLF artifact against CI's LF, with main green on that suite.

## Still open

- **Phase 4** — the refusal rule tying a grant to its capability's `required_tools`
- **Phase 5** — tool identity on every action, record-now-enforce-later
- **Filing from the agent's page** still deliberately absent: `admissions` has no agent attached,
  so there is no honest domain to file against
