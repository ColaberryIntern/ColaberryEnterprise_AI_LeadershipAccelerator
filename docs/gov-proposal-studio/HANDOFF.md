# Gov Proposal Studio v3 — Handoff & Test Guide

How to test the v3 build by hand (no developer needed), what it does not yet do, and how to
roll it back. Acceptance contract: Saratoga Springs `3867b241-0761-4f1f-9a32-ffe3b47bf186`.

## Test it in five minutes (end to end)

1. **Open the contract's Studio.** The header shows the real stage, the proposal-ready meter,
   and — if anything needs you — a red/amber **Needs you N** chip.
2. **Build.** On *Where we are* (or *Document set*) press **Build all documents**. The agent
   panel's state moves Building → Judging → Revising. Documents in *Document set* move from
   *Not started* to a score; the per-document *Needs* column fills.
3. **Answer a need.** Open **Needs you** (left rail). Each card is one typed ask. Answer a
   `fact` inline and Save. Confirm the toast says the agent is resuming the document(s) it
   unblocked, and that the need leaves the list.
4. **Edit (admin).** Open a document → *Draft & versions* → **Edit**. Change a line, Save.
   Confirm a new version appears in the history and the checks re-run; if it is still below 95
   the agent keeps revising, if it passes it stops.
5. **Gold (admin).** When every document passes, go to **Review gates**. Pink / Red / White
   glove show as *approved · AI* on their own. Press **Go** on the Gold panel (you cannot Go on
   a version you last edited — try it, you will be refused). Then **Package & submit** assembles
   the files.
6. **Report a problem.** Click the bottom-right reporter, type a note, send. Confirm the Gov
   Studio inbox receives an email with the route + a screenshot.

## What to check at each step

- No invented facts: anywhere the agent lacked a fact it left a `[PLACEHOLDER]` **and** a need.
- Intern view: log in as an edit-shared intern — no pricing values, no Gold decision, the tour
  skips the Gold steps.
- Auto-resume is bounded: answering several needs at once never starts more than a handful of
  cycles; a document already building is not started twice.
- The read-only audit passes: `node backend/src/scripts/auditProposalNeeds.js <projectId>` prints
  PASS (every placeholder has an open need; every finding has a resolver; every human finding has
  a complete need).

## Limitations (known, deferred to a later pass)

- Editor polish: drag-to-reorder sections, margin-anchored findings, a structured diff that keeps
  headings, and in-browser **Preview PDF** are not wired yet (the Paper/Outline/Edit tabs and the
  text diff are). Parity screenshots are the T25 review step.
- Portal artifact **thumbnails** render for admins (authenticated image route); interns see a
  placeholder until a portal image route lands. The *Decide* button on an unverified capture is a
  prompt, not yet a one-click decision-need resolution.
- Screenshots in this handoff are captured after deploy (the branch is not deployed yet).

## Rollback

- Everything is additive. Schema changes are `ADD COLUMN IF NOT EXISTS` on already-created tables,
  so **rollback = redeploy the prior image**; old code ignores the new columns and rows read back
  null. No data migration to reverse.
- Code rollback: revert the merge of `workstream/proposal-studio-v3`, or redeploy the last
  known-good commit SHA with the standard deploy command. No runtime state depends on the new UI.

---

# Gov Proposal Studio v4 — Handoff & Test Guide (page-by-page design-fidelity pass)

v4 is a page-by-page fidelity round layered on v3: the same Studio, re-shaped to the approved
target design `docs/gov-proposal-studio/designs/proposal-studio-v4.html` and locked by a parity
harness. It ships on the same branch and the same PR as v3 (`workstream/proposal-studio-v3`,
PR #3727) — v3 + v4 deploy together. No behavior was removed; every stage view was evolved to the
v4 layout, copy, and `data-testid` contract, and the editor was rebuilt.

## How v4 is gated (the automated fidelity check)

- **`node tests/studio-parity.cjs`** renders every Studio view with fixtures and asserts that each
  required `data-testid` from the v4 demo is present, plus a global rule that **no button anywhere
  is named "Approve"** (the one human gate is "Go", not "Approve"). This is the pre-deploy fidelity
  gate — it passes green. The real assertions live in
  `frontend/src/pages/portal/projects/proposalStudio/__tests__/studioParity.test.tsx` (CI collects it).
- Frontend `tsc --noEmit` is clean for `src/`; the StudioTour suite is green.

## Test it by hand, view by view (no developer needed)

Open the contract's Studio. Walk the left rail top to bottom — **Needs you** sits at the top now.

1. **Where we are.** If any document is not started you see the build hero with **Build all
   documents**; the readiness panel lists each document with a stage and a score ("—" until first
   judged); "What you need to do" shows the top needs. Nothing here is guessed.
2. **Needs you.** Two always-present groups: **Blocks export** (fatal) and **Holds the score**.
   Each card is two columns — the ask + why on the left (with the quote it came from and the
   documents it's used in), the control on the right. Answer a `fact` inline; a file/signature need
   shows a real file picker. Confirm the card's control matches its kind and that answering removes
   it.
3. **Blueprint.** The solicitation as a cited rulebook: the analyze log with counts, the scoring
   weights as a stacked bar, the rules list, and the jurisdiction's state-forms tag. Each rule
   carries its quote; "needs a decision" links to the need.
4. **Document set.** Header offers **Add from library** + **Build all documents** while anything is
   not started. The table shows Document (with its real file name), Type, Stage, Needs, Pages,
   Reqs, Ver, Score — **no Gate column**. A not-started row has only **Build it**; a started row
   shows its stage pill and a "N from you" needs tag; Score is "—" until first judged.
5. **Build evidence.** Each verified capture is a card tagged with the requirements it proves and
   has its own **Insert into…** picker (document + section). An unverified capture shows **Decide**.
   A demo-URL field sits at the top. Interns now see the real thumbnail image (see the new portal
   image route below), not a placeholder.
6. **Draft & versions (the editor — the big v4 change).** Tabs are **Paper / Outline / Preview
   PDF**. Pick a document from the row of chips (each shows its stage). The Paper is a stack of
   section blocks: each block names the requirements it answers, and a drafted gap shows as an
   **amber chip**, never a raw `[PLACEHOLDER]`. **Re-judge & revise** appears only when a document
   is built and still below 95. The right rail has the Section plan (read-only for interns),
   the six checks, and the version history. **Preview PDF** renders the document as a paper sheet.
7. **Review gates.** Four team cards (Pink / Red / White glove / Gold) tagged AI / AI ×3 / AI /
   You. The matrix shows each document's six check scores, a bold weighted Score, and a Gates
   column of P/R/WG/Gold ✓ chips. Gold is the one human Go — and you cannot Go on a version you
   last authored (separation of duties).
8. **Package & submit.** The response-files tree (mono file names), the sealed price file in its
   gold admin-only envelope, and the before-export checklist (including "Nothing open in Needs
   you" and "Gold Go given"). **Export** is disabled until every document passes. Exporting is not
   submitting.

## Phone (≈400px)

Open any view narrow: the page never scrolls sideways, the process rail becomes a horizontal
scroller (Done steps hidden), the agent panel drops below the workspace, and the tour is a
centered card. Wide tables and the paper scroll inside their own frame.

## What v4 added on the backend (minimal, additive)

- **Portal artifact image route** `GET /api/portal/gov-projects/:projectId/artifacts/:artifactId/image`,
  gated by the standard portal pattern (participant + project read access + the artifact must belong
  to this project), streaming the same bytes the admin route serves — so interns see real build-
  evidence thumbnails. A non-member or wrong-project request is **404** (covered by a jest test).

## Limitations (known, deferred)

- **Screenshots pending first deploy.** The 1440/400 light+dark screenshot pass cannot run against
  production because this branch is intentionally not deployed yet (merge + deploy are the
  operator's call). The `data-testid` parity harness is the pre-deploy fidelity gate; capture the
  visual screenshots on the first deploy of this branch.
- Editor: section **drag-to-reorder** and **margin-anchored findings** are represented but not yet
  wired to a save; the **Preview PDF** is a faithful on-screen sheet, not the final print renderer
  (the real PDF is assembled in Package & submit).
- The **Decide** button on an unverified capture deep-links the decision, it is not yet a one-click
  resolve.

## Rollback

Same as v3: everything is additive (UI + one additive read-only route; schema unchanged by v4).
Rollback = redeploy the prior image / revert the branch merge. No v4 runtime state to reverse.
