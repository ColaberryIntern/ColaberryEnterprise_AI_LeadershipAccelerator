# CC-20261109-k2w7 — MR4: Maya's welcome audience, and two corrections to the ticket

**Date:** 2026-11-12
**Branch:** `workstream/mr4-maya-welcome-audience-and-delivery` off `origin/main` @ `62fa624fb`
**Ticket:** MR4, https://3.basecamp.com/3945211/buckets/7463955/todos/10503714694

## Two things the ticket got wrong

I wrote MR4 myself, and investigating it showed two of its claims were overstated. Recording
that here because the corrections are more useful than the original claims.

**Wrong: "there is no delivery target... nothing on this path opens one."** `defaultDeps().sendDm`
calls `openDm`, which is a `findOrCreate` on the canonical `dm-<a>-<b>` slug and creates both
room memberships idempotently. The room is created on demand. Nothing was missing.

**Wrong: "shadow mode never exercises it, so the first live run is the first time that code is
tried."** `mayaWelcomeService.test.ts` already drove the live branch and asserted the send, the
delivered flag and the no-double-send guard. The service logic was covered.

**What the empty `room_id` actually meant.** It is correct for shadow mode, which by design
records and never delivers. I read evidence of shadow working as evidence of a broken delivery
path. Also checked, because it is the one thing that could genuinely throw on the live path:
Maya is exempt from the DM cohort gate in both directions (`dmEligibility.ts:66`), so `openDm`
will not refuse her.

**What was genuinely untested:** the dep itself. Every existing test passes a stubbed `sendDm`,
so the glue from an enrollment id through `getMayaEnrollmentId` to `openDm` to `sendDmMessage`
had no coverage at all. That glue is exactly what runs for the first time on promotion day.

## The real defect, which stands

Maya composed a welcome for a synthetic account every day. Measured 2026-11-12:
`maya_welcome_ledger` held 13 rows and **three were for "Points Smoke"**, a fixture an
end-to-end job creates daily at 13:30 UTC. The body read "Welcome to Colaberry, Points." The
audience filter was `enrollment_type='explorer'` plus a 24 hour window, and a probe satisfies
both.

## What changed

**`backend/src/services/email/reservedDomains.ts`** (new) — `isNonRoutableAddress()`. Excludes
addresses in namespaces the IETF reserves so they cannot resolve: `.local` (RFC 6762),
`.test`, `.invalid`, `.example` (RFC 2606 §2), and `example.com/.net/.org` (RFC 2606 §3).

A domain rule rather than a name match, because skipping enrollments called "Points Smoke"
fixes one fixture and the next probe gets a different name.

Measured before writing it: the rule matches **135 enrollment rows across 4 domains** —
`colaberry-test.local` (118), `northwind-demo.example` (8), `colaberry.test` (6) and
`example.com`. Every one is a fixture: Points Smoke (93), C107 through C115 Probe, "E2E
Prospect (Claude)", "Close Check", a demo persona. **Zero real people.**

It deliberately does **not** match the substring "test". 84 explorer enrollments contain it and
most are real people. Over-matching silences a real prospect, which is the worse failure.

It returns **false** for a blank or malformed address. Reporting "we have no address" as
non-routable would let a caller treat it as a test account and skip a real person.

**`backend/src/services/maya/mayaWelcomeService.ts`** — reads `email` on the enrollment, adds
outcome `not_routable`, and checks it **before the ledger claim** so a probe leaves no row at
all rather than one that looks like a suppressed greeting. Also exposes
`__mayaWelcomeDepsForTests()` so the real delivery glue can be covered.

## Verification

- `tsc --noEmit`: 0 errors, proven by a planted control error reported at
  `reservedDomains.ts(70,7)` before reverting.
- Test-file typecheck ratchet, the real CI gate at 8192MB: **baseline matched exactly, both
  directions.**
- `reservedDomains.test.ts` (new, 24 cases) + `mayaWelcomeService.test.ts` (extended) =
  **53 passed**. `mayaWelcomeDelivery.test.ts` (new, 7) covers the real wiring.
- **Mutation tested in both directions**, which matters here because a false positive and a
  false negative both cost something real:
  - rule never fires → **18 tests fail**
  - rule matches the substring "test" (would silence real people) → **9 fail**
  - blank address treated as non-routable (would drop a real person) → **8 fail**
  - restored → 53 passed

## A mistake worth recording

`mayaWelcomeDelivery.test.ts` first stubbed `config/database` as `{ sequelize: { query } }`.
The suite failed to load with "Cannot read properties of undefined (reading 'define')", because
a transitively imported model calls `Model.init` against the real instance. `env.databaseUrl`
has a default, so Sequelize constructs without connecting and the mock was never needed. The
tell was a **suite FAIL with zero failed tests**, which is always a load error and never an
assertion.
