# Gap report: current state vs the Proposal Studio

From reading `main` at `71e71d37` (Nov 4, 2026). Verify every path before relying on it. Code moves.

## Keep: built and working

| Capability | Where |
|---|---|
| Solicitation ZIP bytes stored (idempotent by sha256 per tenant + qualification) | `backend/src/services/factory/proposal/govSourceBundleStore.ts` |
| Background extraction job (kick off, then poll); result in `result_json` | `.../proposal/govExtractionJobService.ts`, `proposalExtractor.ts` |
| Structure-aware .docx/.xlsx text extraction | `.../proposal/ooxmlText.ts` |
| File-role classification (solicitation, addendum, contract_terms, form, tax_form, pricing_form, reference) | `.../proposal/documentClassifier.ts` |
| AI requirement candidates kept only if their quote appears literally in the source | `.../proposal/verifyQuotes.ts`, `govRequirementExtractAI.ts` |
| Evaluation criteria detection (basis of award, weighted factors, total points), each with a quote | `.../proposal/evaluationCriteria.ts` |
| Submission-mechanics rules: separate cost file, redacted copy, validity period | `.../proposal/rfpComplianceRules.ts` |
| Elimination-risk flag on requirements | `.../proposal/eliminationRisk.ts` |
| Submittal buckets (volume/tab model) | `.../proposal/submittalBuckets.ts` |
| Named document set derived from requirements (cover letter, execution of offer, reps & certs, pricing, HUB, past performance, management, compliance matrix, terms, technical) | `.../proposal/govProposalDocuments.ts` |
| Document persistence: draft / comment / request changes / accept; acceptance only by a reviewer | `.../proposal/govProposalDocumentStore.ts`, `govProposalDocumentActions.ts`, `backend/src/db/ensureGovProposalDocumentSchema.ts`, `backend/src/models/GovProposalDocument.ts` |
| Draft-with-AI for a whole document; HTML sanitized to an allowlist; `[PLACEHOLDER: …]` instead of invented facts | `.../proposal/govProposalDocumentDraftAI.ts` (uses `getInstrumentedOpenAI`) |
| Build cockpit: releases → stories, commit feed, verified evidence, overall % | `frontend/src/pages/portal/projects/govCockpit/*`, `backend/src/services/factory/govProjectProjection.ts` |
| Admin view of the same cockpit, with copilot and document actions | `frontend/src/pages/admin/AdminGovContractCockpitPage.tsx`, `backend/src/routes/admin/govContractsRoutes.ts` |
| Deterministic 5-intent copilot | `backend/src/services/factory/govCopilot.ts`, `govCockpit/CopilotRail.tsx` |
| Rails: pricing admin-only at the API; separation of duties on bid approval; `filler` gap blocks export; non-member gets 404 | see `docs/gov-pursuit-redesign/FLOW.md` |
| Playwright + Chromium in the backend image | `backend/Dockerfile` (lines ~50–51), root `package.json` |
| `exceljs` available (pricing passthrough, compliance matrix export) | root `package.json` |

## Adjust: built but disconnected

1. **Two proposal models.** Readiness and export (`submissionPackage.ts` → `evaluateSubmissionReadiness`, `buildPackageFiles`; route in `routes/admin/govQualificationRoutes.ts` ~L967) read **per-requirement response slots** (`responseSlots.ts`). The cockpit drafts and accepts **named documents** (`gov_proposal_documents`). An accepted document never reaches the export, and slot gaps never reach documents.
2. **Under-grounded drafting.** `govProposalDocumentDraftAI` gets only `{ docKey, title, requirements[], opportunity/buyer/agency }`. It doesn't get evaluation weights, Section L rules, section order, build evidence, or company facts.
3. **Evaluation criteria and compliance rules** are shown only on the admin qualification page (`AdminGovQualificationPage.tsx`, `govWorkspace/proposalSubmittal.tsx`). Drafting, review and the cockpit don't use them.
4. **`version` is a counter.** `draftProposalDocument` overwrites `content_html` and increments `version`. There is no history, diff or rollback.
5. **PDF is a browser print** of the HTML (`ProposalDocumentDrawer.tsx`, `printDocument`). There is no agency format, no page numbers, no real page count, and no page-limit check.
6. **`[PLACEHOLDER: …]` in documents is untracked.** Slot gaps block export; document placeholders don't.
7. **Export is markdown**, one `RESPONSE-<id>.md` per requirement plus a README. That is not a proposal package.
8. **Figures exist only on slots** (`ResponseFigure { commit, ref, caption }`). No screenshot is ever produced.
9. **The copilot can't act.** It answers by keyword and can't run a revision or ask for a missing fact.

## Build: not built yet

- A **blueprint** per contract: Section L rules (page limits per volume, font, page size, file format, section order, file naming, copies), the required forms list, and a **Texas forms rules engine**. Every rule is quoted and cited, and flagged fatal or curable.
- **Version history** with per-version check scores and server-side diff.
- The **six-check scorer**, color-team **gates**, the **95% rule**, and the agent **revise loop**.
- A per-contract **demo URL** and **screenshot capture** of verified stories, stored as artifacts tagged with requirement IDs, insertable as figures.
- A **company library** (facts, references, key personnel) fed by human answers, so a question is asked once.
- **Forms**: prefill, plus signed-copy upload and tracking.
- **Package assembly**: one PDF per approved document with a real page count, the sealed pricing file, a redacted public copy, blueprint file names, and a manifest with version + sha256.

## Open facts to confirm in P0

- Where the submission deadline lives for a gov delivery project (the countdown already reads it somewhere; find it, don't add a second one).
- The bundle lookup key from a delivery project to its stored ZIP (`govSourceBundleStore` is scoped by tenant + `qualification_key`).
- Whether pursuits created before ZIP storage shipped have bytes. If not, the UI must say "solicitation package missing, re-upload" and never fake a blueprint.
- Which project `3867b241-0761-4f1f-9a32-ffe3b47bf186` is (the contract the user is working on now). Use it as the end-to-end test case.
