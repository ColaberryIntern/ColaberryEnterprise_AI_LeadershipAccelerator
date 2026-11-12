# CC-20261109-k2w7 — Agent Tools, Phase 5: every action carries its tool

**Date:** 2026-11-12
**Ticket:** https://app.basecamp.com/3945211/buckets/7463955/todos/10500496471
**Follows:** Phases 1-3 merged; Phase 4 in PR #3937.

## What was asked

Ali: *"Every action should be tied to a tool."* Posture he chose: **record now, enforce later,
per agent.**

## What was actually missing

Six dispatch functions execute tools. Measured 2026-11-11, only two emitted anything at all:

| Dispatcher | Before |
|---|---|
| `executeMayaAction` (site chat) | emitted `tool.call` |
| Cory's `executeToolCall` | emitted `tool.call` |
| `executeMayaPortalTool` | **silent** |
| `executeReeseTool` | **silent** |
| `executeDaraTool` | **silent** |
| `executeDaraStaffTool` | **silent** |

So the same agent was observable on one surface and invisible on another, and "which tool did
this" was unanswerable for four of the six. None of the six consulted a grant before running.

## What this ships

One recorder, `withToolRecording`, wrapping all six. Each logs agent, tool, surface, duration and
outcome, and emits the telemetry event. The governance judgement lives in ONE place instead of
being reimplemented six times.

**Record now:** a tool the agent does not hold logs `tool_invocation_ungoverned` — its own event
name, so it can be alerted on without parsing a message — and still runs.

**Enforce later, per agent:** `TOOL_ENFORCEMENT_AGENTS`, a comma-separated allowlist read PER
CALL so a flip needs no redeploy and reverses in seconds. Default empty: everyone records, nobody
enforces. Same shape as the existing `AGENT_TOOLS_DISABLED` kill switch.

## Three properties made unbreakable

Three of the six are live visitor-facing surfaces, so the recorder must never become the thing
that breaks Maya's chat.

1. **Returns the result unchanged and rethrows the real error.** Never swallows.
2. **A telemetry failure cannot propagate.** If recording throws, the call still returns.
3. **An unreadable grant list is not "holds nothing".** `null` means *could not tell* and allows
   even under enforcement; `[]` means *holds nothing* and is a violation. Refusing live traffic
   because a lookup failed is a worse failure than the blindness being fixed.

Mutation-tested: making record mode refuse fails 2 tests, conflating null with empty fails 5,
swallowing the error fails 3.

## A real defect the FULL suite caught

The recorder first imported `aiEventService` at module top level. That transitively constructs a
real Sequelize at load, so importing it from six dispatchers put a database connection in the
import graph of every one — and three suites that had never needed a database
(`daraStaffTools`, `mayaCallbackService`, `mayaReplyService`) died at import with
`The "url" argument must be of type string`.

Mocking `aiEventService` in those three test files would have treated the symptom; the next suite
importing a dispatcher would break the same way. Fixed with a **lazy import**: telemetry loads
only when a tool runs, by which point the app has booted with a real database. That also keeps a
DB import out of the load path of six hot modules.

That change then correctly broke one of this suite's own tests: emission is fire-and-forget AND
lazily imported, so it lands a tick after the tool returns. The test now flushes and documents
why — a database write must never sit in the path of a chat reply.

A path-scoped run showed all green throughout. Only the full suite found it.

## Verification

- Backend typecheck: 0 errors in `src/`
- FULL backend suite: **43,418 passed**, back to the three known CRLF-only failures
- Recorder suite: **20 passed**
- Three mutations, all caught by their own tests
- Test-file typecheck ratchet: baseline matched exactly, both directions

## Still open

The **backfill** — 31 agents, 136 ungoverned holdings, 0 grant rows. Until that is done,
`TOOL_ENFORCEMENT_AGENTS` should stay empty: enforcing today would refuse live work on the first
tick, which is exactly why the posture is record-first.
