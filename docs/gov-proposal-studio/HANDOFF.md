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
