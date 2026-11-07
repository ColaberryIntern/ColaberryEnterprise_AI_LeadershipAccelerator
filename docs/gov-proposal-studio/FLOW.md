# Gov Proposal Studio — Flow (v3)

The v3 operating model in one page. The AI **builds and judges** every document; a person
**supplies what only a person can** and gives **one Go** at the end. This replaces the v1
"narrative drawer + question list" model.

## The loop

```
   Blueprint ──▶ Build ──▶ Judge ──▶ Revise ──┐
   (cited        (outline   (6 checks,         │ below bar
    rulebook)     → section  independent       │
                  drafts)    evaluator/        ▼
                             proof/clarity)   a fact is missing?
                                              │
                        ┌─────────────────────┘
                        ▼
                   Needs you  ──(answer)──▶ auto-resume the unblocked docs
                        │
                        ▼
                 All docs pass ──▶ Gold Go / No-go (one human decision) ──▶ Package
```

## Who does what

| Step | Owner | What happens |
|---|---|---|
| Blueprint | Agent + human confirm | The solicitation ZIP becomes a cited rulebook (scoring, rules, forms, page limits). |
| Build | Agent | For a document with no draft, the create-path builds it: `buildOutline` → grounded `draftProposalSection` per section → assemble → save v1. No fact is invented; a missing one becomes a `[PLACEHOLDER]` **and** a need. |
| Judge | Agent | Six checks. Evaluator / proof / clarity run as **independent judge calls**; their run ids are recorded on the version. The AI gates (Pink / Red / White glove) are recorded automatically when their checks pass (`decided_by: 'ai_judge'`). |
| Revise | Agent | Below the bar (weighted < 95 or any check < 85), the agent rewrites only the failing sections, up to the iteration cap. |
| Needs you | Human | The one list of typed needs — fact, decision, file, signature, approval, confirm_rule, setting. Answering a need records it and **auto-resumes** every document it unblocked (bounded). |
| Gold | Human (admin) | One **Go / No-go** for the whole package, offered only when every document passes. Separation of duties: the approver cannot be the version's last author. No-go returns Gold with a note. |
| Package | Agent + human | Assemble the approved versions into PDFs + the sealed price file + the compliance matrix + a manifest. Exporting is not submitting. |

## The six checks

`coverage` (25) · `evaluator` (25) · `proof` (15) · `clarity` (15) · `format` (10) · `fact` (10).
Pass = weighted ≥ **95** and no check < **85**, no fatal finding, no open gap.

## Needs — the contract

Every finding carries a **resolver**: `agent` (fixed on the next pass, with a `fixHint`) or
`human` (carries a typed `need`). A `[PLACEHOLDER]` is always a need. The needs list is the
single source of "what a person must do"; the old question-only list is gone.

- **Intern projection drops pricing and ungivable approvals** — an intern never sees a price
  value or the Gold approval need.
- Resolving a need routes by kind (fact → library, decision → log, file/signature → upload,
  setting → setting store, approval → the Gold gate) and then drops it from the list.

## Build-all and auto-resume

- **Build all documents** (overview / document set) kicks a bounded cycle for every not-passed
  document in blueprint order.
- Answering a need auto-resumes the documents it unblocked. Both are bounded (one active run
  per document, a per-call cap) so nothing fans out without limit.

## Code map

- Create-path: `createProposalDraft.ts`, `buildOutline.ts`, `sectionDrafting.ts`, `runReviewCycle.ts`
- Judge: `documentChecks.ts`, `documentChecksAI.ts`, `judgeRuns.ts`, `runProposalDocumentChecks.ts`
- Needs: `proposalReviewTypes.ts`, `classifyFinding.ts`, `placeholderNeeds.ts`, `aggregateNeeds.ts`,
  `collectProjectNeeds.ts`, `resolveNeed.ts`, `resolveProjectNeed.ts`, `formsPrefill.ts`
- Gates: `proposalReviewConfig.ts`, `goldGate.ts`, `govProposalReviewStore.ts`
- Resume: `resumeCycles.ts`; human edit: `humanEdit.ts`; audit: `scripts/auditProposalNeeds.js`
- UI: `frontend/src/pages/portal/projects/proposalStudio/*` (shell, NeedsInbox, AgentPanel,
  WhereWeAre, DocumentSet, DraftVersions, ReviewGatesView, BuildEvidence, ContractBar, StageRail)
