# Colaberry Live — testing strategy and evidence matrix

> Generated from `scripts/artifacts/tickets/l115Data.js`. **Do not hand-edit** — change the data module and re-run `node scripts/artifacts/buildL115Artifacts.js`.
> Ticket L11.5 · measured 2026-11-02 · measured at origin/main 4c3d0df2

1,208 tests across 73 suites cover Colaberry Live. 99.6% of them are unit tests, **one** file is integration, and **no end-to-end test touches a broadcast**. This subsystem has shipped 4 complete, well-tested units that nothing called — which is what a unit-only pyramid buys: a unit test mocks its caller, so a missing caller is invisible to it.

## Read this first if you are about to add a feature here

Write the **wiring test** as well as the unit tests. It reads the source and asserts
the caller exists, and it is the only layer at which "nothing calls this" is visible.
See `backend/src/services/broadcast/__tests__/broadcastHealthLoop.wiring.test.ts` —
note that it tests its own comment stripper, because the first version passed while
the call was commented out.

## The counts, and how to re-derive them

| Scope | Suites | Tests | Command |
|---|---|---|---|
| Backend broadcast service tier (635 passed, 5 skipped — the skips are the DB-gated file) | 40 | 640 | `jest --testPathPattern="src/services/broadcast/__tests__"` |
| Backend controllers, routes, db, schemas (all passed) | 9 | 199 | `jest --testPathPattern="src/(controllers\|routes\|db\|schemas)/__tests__/.*[Bb]roadcast"` |
| Frontend portal, player, companion, producer, replays (all passed) | 24 | 369 | `react-scripts test --testPathPattern="(roadcast\|iveMiniPlayer\|ompanionDeck\|roducer\|eplay)"` |
| **Total** | **73** | **1208** | |

## The tiers

| Tier | Target | Actual | Tests | Verdict |
|---|---|---|---|---|
| Unit | ~70% | 99.6% | 1203 | over |
| Integration | ~20% | 0.4% | 5 | under |
| End-to-end | ~10% | 0% | 0 | absent |
| Wiring | not in CLAUDE.md | 5 files | 5 | invented |

### Unit

Pure policy modules, projections, formatters, state-machine decisions. Every service takes injectable deps so no test needs a database.

**Gap.** Not a fault in itself — but see the defect history. These cannot see a missing caller.

### Integration

Exactly one file: broadcastTelemetryAnchorRace.integration.test.ts, a real race against Postgres. It is `describe.skip` unless HAS_DB, so it runs in CI's "Integration tier (Postgres)" job and is silently skipped on every developer machine.

**Gap.** The whole tier is one file. Nothing exercises the heartbeat route against a real database, and nothing exercises the health loop against a real provider.

### End-to-end

None. Playwright exists at tests/systemV2 with eight flows, and none of them touch a broadcast.

**Gap.** Deliberate and recorded, not an oversight: campusFidelityViews.js:324 names the broadcast surface as "kept out on purpose, #3346" and notes the local seed has no broadcast with a class session to drive one. It is still the tier whose absence the defect history is written in.

### Wiring

A test that reads the SOURCE and asserts a caller exists — the only layer at which "nothing calls this" is visible at all. broadcastHealthLoop.wiring.test.ts asserts server.ts imports the loop, CALLS it in live code rather than in a comment, and guards the call in a try block.

**Gap.** It is a proxy for the integration coverage that does not exist. Cheap, and it caught what 1,200 unit tests could not — but it proves a call is written, never that it works.

## The four defects a green suite did not catch

### L4.6 — The heartbeat route shipped with no caller

- **Suite at the time:** 13 tests passing
- **Cost:** A real 20-minute airing with two viewers recorded ZERO telemetry — not a low number, zero rows in both tables, while nginx logged 16 playback grants and 103 discovery polls from two distinct clients.
- **Found by:** Only because an explicit telemetry criterion was added to the Test 2 plan two days before the test. It had been live and broken for five days.

### L7.1 — Occurrence creation shipped with no provider binding

- **Suite at the time:** creation tested
- **Cost:** The occurrence was real, correctly private, correctly roomed, correctly timed — and unplayable, because nothing set provider_session_id.
- **Found by:** By hand during a live test, when the field had to be set manually before anyone could watch.

### L5.5 — runProviderEvent: exported, tested, called by nothing

- **Suite at the time:** its own unit tests passing
- **Cost:** provider_health stayed permanently "unknown", so go_live always refused with ProviderNotReady and an engineer had to feed the event by hand after reading Cloudflare directly.
- **Found by:** By grep, with a control: runProducerCommand had real callers, runProviderEvent had exactly one occurrence in the backend — its own definition.

### L4.9 — The player never called the heartbeat endpoint

- **Suite at the time:** 13 tests on the route
- **Cost:** Every audience number for the first public airing would have been a confident zero, and "nobody watched" would have been indistinguishable from "collection is broken" — the precise failure L4.6 was built to prevent, shipped with that failure live.
- **Found by:** A grep of frontend/src for "heartbeat" returned only unrelated systems. The positive control: the frontend DOES call the playback endpoint.

## Practices worth keeping

- **Mutation-test the assertion, or it is a comment** — *proven by test* (6 broadcast test files carry mutation records). An assertion nobody has watched fail is indistinguishable from a comment. The wiring test is the case in point: its first version PASSED with the call commented out, and that was found by mutating server.ts and watching the test stay green.
- **Assert the SQL as text when behavior cannot see the difference** — *proven by test* (broadcastTelemetryQuery.test.ts). COUNT(DISTINCT enrollment_id) and COUNT(*) return the same number against a fixture with one viewer per person. They differ only when somebody opens a second tab — the case the design exists to get right.
- **Validate controls BOTH ways before believing a negative** — *seen in production* (the L5.5 grep, and the 401 probe during the 2 Nov deploy). An unauthenticated probe of a new route returned 401 — and so did /api/health and a deliberately bogus path, so the probe discriminated nothing. A negative with no validated positive control is not evidence.
- **Zero and we-do-not-know must never collapse** — *proven by test* (broadcastProducer.ts, broadcastDiscovery.ts, useBroadcastDiscovery.ts). The metrics dictionary calls a fabricated zero a defect rather than a cosmetic issue: it reads as "nobody watched" when the truth is "we do not know".
- **Inject dependencies so no unit test needs a database** — *proven by test* (every broadcast service takes a deps object). It is what keeps 1,200 tests fast enough to run on every change.
- **A fixture built by the code under test matches by construction** — *proven by test* (the backfill planner, run against exported production rows). If the fixture and the assertion come from the same function, the test passes whatever that function does.

## Merge gates

- `Backend typecheck` (contract)
- `Backend unit tests` (unit)
- `Test-file typecheck` (contract) — Per-file ratchet; tests are typechecked under --strict with no --allowJs, because ts-jest is transpile-only and a green suite proves nothing about types.
- `Frontend typecheck` (contract) — The authoritative frontend gate.
- `Frontend build` (contract)
- `Frontend unit tests` (unit)
- `Integration tier (Postgres)` (integration) — The only place the one integration file is not skipped.
- `Secret scan + route-auth lint` (security) — lint-route-auth.js: a route with no auth chain fails the build.
- `Static security scan` (security)
- `Scan new commits` (security)
- `Sweep full history` (security) — Skipped on ordinary PRs.

## What is NOT covered

Named explicitly rather than omitted. The generator refuses to run if this is empty.

### No end-to-end test touches a broadcast

Eight Playwright flows exist and none of them opens a player, joins a room, votes in a poll or watches a replay. Recorded as deliberate (#3346), but it means no test has ever walked the path a viewer walks.

### The integration tier is one DB-gated file

And it is skipped on every developer machine, so the only place it runs is one CI job. Nothing exercises the heartbeat route, the health loop or the playback grant against a real database or a real provider.

### Entitlement has never been exercised against a real viewer

L10.7 is open and P0 for this reason. The paywall is unit-tested and has never refused an actual person. Everything else assumes the right people can watch and the wrong people cannot.

### No test asserts what a viewer SEES during a failure

L10.4's failure drills are the plan for this and have not been run. The states exist in the machine; reconnecting, for example, could not be reached in production at all until the health loop was wired.

### Accessibility is covered for the player only

liveMiniPlayer.axe.test.tsx sweeps the player subtree for wcag2a/wcag2aa violations in both themes. The companion, the producer strip and the replay list have no axe sweep.

### Load and concurrency are untested

The telemetry tables are designed to be bounded by concurrent tabs rather than by elapsed time, and that property has never been measured under load. One real race test exists, for the telemetry anchor.

## The backlog this implies

In order: the paywall exercise already ticketed as **L10.7**, one end-to-end flow that
opens a player, and widening the integration tier beyond a single DB-gated file.
