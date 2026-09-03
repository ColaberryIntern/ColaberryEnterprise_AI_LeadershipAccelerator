# Customer Journey — Gate 0

- Date: 2026-09-03 · Session: CC-20260902-m8q4 · Base: `e99fdb35`

§11's target journey, measured against what the platform can actually do today. This is
the map that shows where the work is — and it is not evenly spread.

| # | Journey step (§11) | Today | Owner |
|---|---|---|---|
| 1 | Land on AI Flotation | **LIVE** — 7 pages on the design system, AA-clean, verified in production | — |
| 2 | Describe idea immediately | **MISSING** — `/start/` is a conventional form | Gate 1 |
| 3 | Project AI starts understanding | **MISSING** — the one genuinely new agent | Gate 2 |
| 4 | Choose chat or call me now | **HALF** — voice call exists end to end (`requestInstantCallback` → Synthflow → webhook); chat intake does not | Gate 3 |
| 5 | AI interview | **MISSING** for project discovery; the voice agent interviews for lead capture only | Gate 2/3 |
| 6 | Project understanding | **MISSING** — no transcript/chat → structured project truth | Gate 4 |
| 7 | Build Blueprint | **MISSING** — `services/sbp/*` has intake contracts but they are enrollment-shaped | Gate 4 |
| 8 | Trust Blueprint | **PARTIAL** — INPACT is wired and gates releases; no client-facing view | Gate 4/19 |
| 9 | Live UI concepts | **MISSING** — `previewStackService` + reaper exist as a host | Gate 5 |
| 10 | WOW → Start my build | **MISSING** | Gate 5 |
| 11 | Account / verify | **EXISTS** — `PlatformIdentity`, client auth, magic link | Gate 6 |
| 12 | Payment | **BLOCKED** — PaySimple has no recurring; see `BILLING_MAP.md` | Gate 7 · ESC-1 |
| 13 | Project activation | **EXISTS** — `leadConversion.ts`, idempotent, proved in production | Gate 8 |
| 14 | Boom screen | **MISSING** — needs the delivery-ready state (§32) | Gate 9 |
| 15 | Connect project repo | **BLOCKED** — `GitHubConnection.enrollment_id` is NOT NULL | Gate 9 · ESC-3 |
| 16 | AI builds | **EXISTS** — the execution seam runs | Gate 15 |
| 17 | Client decision only when needed | **MISSING** — decision lane; §44 policy inputs exist | Gate 11 |
| 18 | Project room: client + AI + PM | **MISSING** — `ChatConversation` cannot host it | Gate 10 |
| 19 | Preview | **PARTIAL** — preview stacks exist; client-safe exposure does not | Gate 13 |
| 20 | Prove | **EXISTS** — evidence, trust gate, release checks | Gate 17 |
| 21 | Release | **EXISTS** — `releaseGate`, `clientAcceptance` | Gate 17 |
| 22 | Operate / improve | **EXISTS** — `operateSignals` | Gate 20 |

## What the shape says

The journey is **strong at both ends and hollow in the middle.**

Landing, converting, building, proving, releasing and operating are real. Everything
between *"describe your idea"* and *"start my build"* — the entire free experience that
§12 calls the sales engine — does not exist yet.

That is the opposite of where a team would usually expect the risk to be, and it is good
news: the hard, slow, trust-bearing machinery is built. What is missing is the part that
makes a stranger want to use it.

## Two hard stops in the middle

Steps 12 and 15 are not "not built yet" — they are **blocked on decisions**:

- **Payment** needs a subscription-capable provider or an accepted manual-renewal model (ESCALATION-1)
- **Repo connect** needs a repo connection that can exist without an enrollment (ESCALATION-3)

A customer can be captured, understood, wowed and converted, and then hit a wall at
checkout and again at repo connection. Both walls are schema/provider decisions, not
implementation work, and both should be resolved before Gate 5 rather than discovered at
Gate 7.

## The step before step 1

`leadIngestionController` notifies nobody. A visitor who completes the journey's *current*
first step lands in a table in silence.

Every row above assumes someone notices an inbound. Fixing that is hours of work and
belongs before Gate 1 — see `CURRENT_STATE.md` §6.
