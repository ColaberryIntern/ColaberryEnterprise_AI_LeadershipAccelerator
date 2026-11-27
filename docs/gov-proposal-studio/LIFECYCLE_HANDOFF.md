# Gov Proposal Studio — New-Build Lifecycle: Handoff & Test Guide

How to test the whole gov new-build lifecycle by hand (no developer needed), what it does not
yet do on its own, how it rolls back, and what to check if something looks off.

This covers the **lifecycle** shipped in milestones M1–M6 (spine + Command Center + connected
demo, the three-release ladder, the P1–P8 proposal stories, the four engines, the live
management screen + Revenue Room, and auto-pickup). It is separate from `HANDOFF.md`, which
covers the v3 proposal **Studio** (documents, needs, review gates, gold).

- **Live site:** https://enterprise.colaberry.ai
- **Where the lifecycle is driven from:** the admin gov area. A gov contract's live management
  screen is at `/admin/internship/gov-contract/<projectId>`.
- **Shipped:** M1–M5 are live and production-verified. M6 is this handoff + the auto-pickup
  acceptance.

---

## The one-paragraph version

When you assign a gov pursuit to an intern, the platform now stands up the **entire** build on
its own: a Command Center and a connected demo in the first release, a three-release ladder
(R0 Foundation auto-built, R1 Proposal active with eight stories, R2 Full build-out parked
until you win), and the demo wired to the contract. The intern works R1 (orient → rapport →
draft → collect from Sharath → review gates → human QA → submit-to-Sharath → mark-submitted).
You watch and close it out from one **live management screen**, which also exports the package
and, on mark-submitted, writes a Revenue Room **potential-win** with the solicitation's close
date and — only when a human has actually priced the bid — its dollar value. Assigning a
**second** gov pursuit to the same intern repeats the whole thing independently.

---

## Test it end to end (no developer needed)

Do these in order. Each step says what you should see.

1. **Assign a new gov project.** In the admin gov area, assign a qualified gov pursuit to an
   intern. This is the single action that starts everything — there is no separate "set up the
   build" step.

2. **Confirm the spine built.** Open the intern's gov project. You should see a **Command
   Center** story and a **Connected Demo** story in the first release (the demo is blocked by
   the Command Center until it is ready). Once the demo's page URL is recorded, its screens
   auto-capture into **Build Evidence → Step 6**, and the demo URL is published as the
   contract's public link.
   - *Note:* publishing the demo URL stays dormant in production until `github.io` is added to
     the demo-host allowlist — that is a deliberate operator switch, your call, not a bug.

3. **Confirm the demo + Command Center are linked to the contract.** On the contract view you
   should see both a **demo link** and a **Command Center link**.

4. **Confirm the three-release ladder.** The project should show **R0 Foundation** (auto-built),
   **R1 Proposal** (active, with the eight proposal stories), and **R2 Full build-out**
   (**parked** — visible but gated until the bid is won). Any stories from a prior build are
   preserved intact inside R2.

5. **Confirm auto-pickup + multi-project.** Assign a **second** gov pursuit to the **same**
   intern. It should pick up its **own** full ladder independently — the intern now owns two
   gov projects at once, each with its own R0/R1/R2. (Re-assigning the *same* pursuit changes
   nothing — it reuses the existing project.)

6. **Walk R1 (the eight proposal stories).** In R1 the intern moves through: orient → build
   rapport with the authorized client contact → draft → run the Sharath collection loop →
   review gates → the human QA checklist → submit-to-Sharath handoff → mark-submitted.

7. **Run the engines.** Generate the **Sharath collection form** (an HTML form), ingest an
   answer, and confirm the **global dossier** read shows facts collected across *all* gov
   projects, not just this one. Confirm the scoring engine keeps proposing improvements until
   the target score is reached (it never "runs out" early), and that a detected defect sends
   the self-healing brief email to Ali.

8. **Open the live management screen** at `/admin/internship/gov-contract/<projectId>`. You
   should see, on one screen: the releases (with **R2 shown parked**), the submission state,
   the dossier counts, and the **open-need count**. From here:
   - **Export package** — assembles the proposal package (reuses the existing assembler).
   - **Mark submitted** — enter the external receipt reference and submit. This is an
     admin-only money action (it requires a full administrator, not just gov-section access).

9. **Confirm the Revenue Room potential-win.** After mark-submitted, the Revenue Room shows the
   bid as a **potential-win** with the solicitation's **close date**. The **dollar value**
   appears **only if a human has priced the bid** in the bid values; an unpriced bid shows the
   close date and **"value pending."** No dollar amount is ever invented.

---

## What it does on its own vs. what still needs a human

- **On its own:** stands up the spine, the demo, and the full R0/R1/R2 ladder the moment a gov
  project is assigned; keeps the scoring loop improving to target; captures demo screens into
  Build Evidence; publishes the demo link (once the host allowlist is set); writes the Revenue
  Room potential-win on mark-submitted.
- **Needs a human:** turning the `github.io` demo-host allowlist on; **pricing** a bid (the
  platform never invents a dollar value); the **Mark submitted** money action (full admin);
  activating **R2** when a bid is won.

---

## Limitations (honest)

- The dollar value on a potential-win is shown **only** when a person has priced the bid. This
  is deliberate — the platform will show "value pending" rather than guess.
- The close date is read from the solicitation (manual override → stored snapshot → the
  AI-vetting opportunity). If none of those carry a date, the close date is left blank rather
  than fabricated.
- The live management screen is an **admin** surface, not a student/portal page.
- Demo-URL publishing is allowlist-gated in production (dormant until `github.io` is added).

---

## Rollback

Each milestone shipped as its own PR, so a problem rolls back by reverting that milestone's
merge, letting CI publish, and redeploying registry-mode. The only schema change in the whole
lifecycle is **one additive, nullable column** (`gov_submission.close_date`, added with
`ADD COLUMN IF NOT EXISTS`) — it is harmless to leave in place on a rollback. Previous
good gov-surface commit before M5 = `f431c941b` (M4).

Deploy command (operator): `scripts/deploy-prod.sh backend nginx` in registry mode on the
production host, which verifies the published image digest matches the target commit before
recreating containers.

## Troubleshooting

- **Intern's gov cockpit 404s after assignment.** Materialize grants the assignee the builder
  role on the delivery project; if the cockpit 404s, re-run the assignment (it is idempotent and
  re-grants access) rather than editing roles by hand.
- **Demo link not public.** Confirm `github.io` is in the demo-host allowlist — publishing is
  intentionally gated off until it is.
- **"value pending" where you expected a dollar amount.** The bid has not been priced by a
  person yet. Price it in the bid values; the amount then appears on the potential-win.
- **Management screen shows R2 as active.** R2 should be parked by default; if it is active, a
  release was activated deliberately (winning the bid) — check the project's parked-releases
  variable.
- **Second gov project did not pick up the ladder.** Confirm the second pursuit is actually
  *qualified* and was assigned through the gov assignment flow (not created some other way); the
  lifecycle fires from that assignment path.

---

## How the auto-pickup is proven

The "assign another gov project → the whole process picks up automatically" behavior is proven
deterministically by the test suites `govProjectMaterialization.test.ts` and
`govReleaseLadder.test.ts` (34 assertions, green on the deployed commit), including the exact
cases *"a fresh gov assignment picks up the whole ladder in ONE call: R0 spine + R1 active + R2
parked"* and *"assigning a SECOND gov project to the same intern picks up its OWN full ladder,
independently."* The **live** first-fire happens on the next real gov pursuit you assign — it is
not simulated with throwaway production data.
