# CC-20261104-v7q2 — Maya composes from the quotable library

Ticket: [Maya's Email tab: read-only Explorer Growth preview, plus the marketing-asset column](https://app.basecamp.com/3945211/buckets/47502609/todos/10449182195)

Follows [CC-20261104-v7q2](CC-20261104-v7q2.md), which landed library A as a provider with no
caller. This gives it one.

- [x] Register the quotable library as Maya tools, and wire the compose path
  - Date: 2026-11-04
  - Session: CC-20261104-v7q2
  - What changed: new `backend/src/services/mayaQuoteComposer.ts`; two tools registered in
    `mayaActionService` (`list_quotable_marketing_assets`, `draft_marketing_email`) with their
    dispatch; Maya's `tools_granted` in `agentRegistrySeed` goes from 10 to 12.
  - Verification: 17 new tests; 56 green across the composer, the registration tripwire and the
    quotable suite; 58 more across five wider agent suites. Both new files typecheck clean on
    the backend's own tsc 5.9.3 under `--strict`. Mutation results in the commit body.
  - Notes: below.

## Nothing here can send, and it rests on four independent facts

Not on configuration, and not on Maya being disabled, because both are one database row from
changing. Each has its own test, so removing any one fails the build rather than quietly leaving
the others carrying a load they were not sized for.

1. **`sendAgentEmail` has no transport.** Its type admits `sent`, but no code path returns one.
   The branch where "everything lines up" returns `drafted` with reason `transport_not_wired`.
   The test extracts every `outcome:` literal from that file and asserts `sent` is not among
   them, with a control proving the extractor found real ones.
2. **This caller passes no `campaignId`.** That tool treats a missing campaign as missing brand
   scope and drafts on that ground alone, before reaching the branch above. So even if a
   transport were wired tomorrow, this path still drafts.
3. **The draft status is `agent_draft`**, and the scheduler only ever claims `pending`.
4. **Maya is deliberately not granted `send_email`.** `agentEmailTool` checks `tools_granted`
   for exactly that string before doing anything but draft. A test asserts the grant is absent
   and says why, because granting it would silently remove a layer nothing else announces.

## Why the gate runs on the composed message, not only on the assets

`quotableAssets` already refuses an asset whose own title or summary breaks a rule. The measured
failure is the other direction: `bannedCopyInstruction`'s docblock records a live Explorer render
refusing 8 of 12 drafts, every one for the same banned word, **in prose the model wrote
unprompted** from clean assets. So the composed subject and body are screened after the model
writes them. Subject and body together: a rule broken in the subject reaches the inbox list even
if the body is never opened.

## Why cited assets are re-resolved rather than trusted

A model that has seen a refused asset once can cite it later, and one that has seen nothing can
invent a plausible uuid. Both are refusals, and both name what went wrong instead of silently
dropping the citation — a draft that quietly lost its source looks finished, which is worse than
one that was refused. A test covers the nastiest case: an asset that was quotable when she was
shown it and is not any more.

## The tripwire, caught before CI this time

`mayaAgentRegistration.test.ts` pins Maya's `tools_granted` against the real `MAYA_TOOLS` names
as a set, fails in **both** directions, asserts an exact count, and carries a control asserting
the name extraction found exactly that many. Adding two tools therefore meant three coordinated
edits: the seed, the count, and the control.

This is the same class of guard as T208, which caught the M34 subject-prefix defect only after CI
went red. The lesson recorded there was to look for tripwires over the surface being changed
rather than declare into one and assume. Applied here: `git grep` for suites referencing
`MAYA_TOOLS`, `tools_granted`, `agentRegistrySeed` and `actionCategory` before writing anything,
then running all of them.

## What this does not do

- No frontend change. The panel's marketing-asset column still renders a **count**, not per-row
  titles; those live behind the per-decision endpoint and need a fetch per row.
- No library B. "Campaign templates" still has two candidate homes
  (`follow_up_sequences.steps[].body_template`, which the sender really uses, and
  `content_templates`, which has no consumer anywhere in `backend/src`). Ali names the table.
- No deploy. Maya's row is `enabled: false` and her chat is separately gated, so registering
  tools changes no running behaviour.
