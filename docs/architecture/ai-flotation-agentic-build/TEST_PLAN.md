# Test Plan — Gate 0

- Date: 2026-09-03 · Session: CC-20260902-m8q4 · Base: `e99fdb35`

Baseline to measure against: **15,943 passing tests**, one suite unrunnable for a missing
local dependency. See `BASELINE_TEST_RESULTS.md`.

## How this repo tests, and why it matters here

Every delivery test runs **without a database**, because decisions were kept separable from
I/O — `clientAcceptanceService` decides, `clientAcceptance` persists;
`leadConversionPlan` decides, `leadConversion` persists.

This is the pattern for everything in this build. A Project AI whose decision-necessity
logic needs live Postgres to test is a Project AI whose gating is never tested.

Two environment facts constrain what local runs prove:

- **`jest -c jest.ci.config.ts` is the gate.** Scoped local runs miss contract suites.
- **Local `tsc` proves nothing.** The only resolvable TypeScript here is the root-hoisted 4.9.5, which dies on `@types/d3-dispatch` and `zod/v4` before reaching project code. CI's "Backend typecheck" is the authority.

## AI contract tests (§141)

LLM output is **schema validated at the tool boundary**, so malformed output cannot corrupt
project truth. Deterministic fixtures for: idea → structured intake; facts vs assumptions;
decision necessity; change impact; Blueprint; TBI mapping; design brief.

The assertion that matters is not "the model produced JSON" but **"an assumption did not
become a fact"** (§16).

## Client-safe projection tests (§142)

Canary internal fields asserted absent from the **HTTP payload**. A DOM-hidden test is
insufficient. Extend `clientAllowlistContract.test.ts` per new kind; preserve the
fail-closed tripwire.

Explicit canaries for this build: delivery cost figures, internal risk commentary, builder
scratchpads, repo `access_token_encrypted`, `webhook_secret`, other-tenant ids.

## Idempotency tests

The repo's non-negotiable. Already proved for lead conversion (replay creates nothing) and
for callbacks (`CALLBACK_DEDUP_WINDOW_MS` collapses a double-click into one phone call).

Owed for: billing webhooks (duplicate, out-of-order, replay), Synthflow webhooks
(duplicate, wrong session), repo initialization (second init is a no-op), decision
notifications (one decision → one notification, retry does not duplicate).

## Repo tests (§143)

Missing repo · malformed URL · inaccessible private repo · read-only repo · wrong
ownership · repo claimed elsewhere · empty repo · renamed repo · access revoked · missing
base branch · first init · **second init idempotent**.

`REPO_CONNECT_CONTRACT.md` already treats *revoked access as a normal state*; the tests
must too.

## Payment tests (§145)

Bad signature · duplicate event · out-of-order event · unknown price · **browser price
tampering** · success · failure · cancel · **activation failure after payment** ·
activation retry.

Price tampering is the one to write first: §27 requires the server to resolve plan → price,
and a test that posts a modified price is the only thing that proves it does.

## Voice tests (§144)

Invalid phone · no consent · provider rejection · provider timeout · invalid webhook ·
duplicate webhook · missing transcript · partial transcript · wrong session · resume after
call.

`CallbackStatus` already models `deduplicated | blocked | skipped | failed`, so several of
these have a defined expected value rather than needing one invented.

## Headless browser acceptance (§140)

Every UI gate requires a **real route**, real API contract, console-error check, desktop
**and** mobile screenshots, and loading/error/empty states. Component tests are not visual
proof.

The harness exists and is proven: `scripts/verifyAiFlotationPublic.js` runs 69 checks
including per-button contrast, and `scripts/captureHelpers.js` enforces safe capture
widths. Production was verified through it with 117 assertions on 2026-09-03.

**The lesson from that day belongs in this plan:** the site passed every assertion while
its primary call to action was unreadable at 2.48:1, and a consent checkbox rendered as a
44px square while every test stayed green. Both were caught by opening a screenshot. Gate
acceptance must include a human looking, not only a suite passing.

## E2E scenarios (§127–§138)

Eleven required flows. Three deserve emphasis because they assert an **absence**, which is
the kind of test that is easy to skip and expensive to lack:

- **§127** — no `DeliveryProject` exists before activation
- **§130** — paid + no repo → nothing executes
- **§133** — a chat message alone creates nothing

The last is the product's core safety promise (§40): only confirmation creates a structured
ChangeRequest.

## What cannot be tested yet

`§135` (missing TBI evidence blocks a release) is testable today — INPACT gates releases at
runtime. `§134` (Fast Lane cannot bypass gates) needs the decision-necessity policy to
exist first. `§130` needs the delivery-ready gate, which nothing owns yet
(`SECURITY_THREAT_MODEL.md`, risk 3).
