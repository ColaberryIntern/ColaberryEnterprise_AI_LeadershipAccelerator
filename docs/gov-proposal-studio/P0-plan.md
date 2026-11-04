# P0 — Recon & plan (Gov Proposal Studio)

Recon done against the worktree at `main`-tip (branch `workstream/proposal-studio-p0`), 2026-11-04.
Verdict: **GAP_REPORT.md is accurate and the planned schema is additive to a clean base. Proceed to P1.**
No hard contradiction with the design.

## 1. GAP_REPORT confirmation (summary)

- **Keep (built & working):** all rows confirmed with file:line. Minor note: the named document set also
  emits `execution_offer` and `financial` beyond the row's parenthetical (`govProposalDocuments.ts`
  `DOCUMENT_RULES` L31-46).
- **Adjust (built but disconnected):** all 9 confirmed. The load-bearing one is **#1 two proposal models** —
  readiness/export read per-requirement **response slots** (`submissionPackage.ts`
  `evaluateSubmissionReadiness` L42, `buildPackageFiles` L99; route `routes/admin/govQualificationRoutes.ts`
  L948/L967/L970), while the cockpit drafts/accepts **named documents** (`gov_proposal_documents`). They never
  join.
- **Build (not built):** all confirmed absent. No schema/model/service exists for blueprint, version history,
  six-check scorer, gate reviews, screenshot capture, or company library. (`backend/src/db/ensure*Schema.ts`
  has gov tables only for qualification, source bundle, build-story assignment, proposal amendment, submission,
  proposal document.)

## 2. Open facts (resolved)

1. **Submission deadline** lives in `gov_qualifications.requirements_json.dossier.keyDates[]` (`{date,text}`),
   read via `services/factory/govCockpit.ts` `readGovProvenanceFacts` L118-128, projected as `keyDates`
   (`govProjectProjection.ts` L89-90/L256-258), parsed client-side by `frontend/src/pages/admin/govDeadline.ts`.
   `DeliveryProject` has **no** deadline column. **P2 reads/normalizes these keyDates; it must NOT add a
   second deadline store.**
2. **Delivery-project → stored ZIP** resolves through the qualification: `delivery_project_id` → latest
   `GovQualification` → `canonical_opportunity_id` (= the bundle's `qualification_key`) + `tenant_id` →
   `gov_source_bundles`. There is **no** direct `delivery_project_id` on the bundle
   (`govQualificationRoutes.ts` L1450/L1486-1488/L1543; `GovSourceBundle` scope `(tenant_id, qualification_key,
   sha256)`).
3. **Price-leak check**: `submissionPackage.ts` `detectPricingLeak` L27-33 (currency scan on non-`price`-bucket
   slots, only when a `price` bucket exists), emitted as the advisory warning `pricing_leak`. **P3's fatal
   price-leak check reuses `detectPricingLeak`.**
4. **Story-verified hook**: `services/sbp/verification/buildVerificationService.ts` `markTaskVerifiedComplete`
   false→true transition (L17-21; evidence recorded only on the transition), reached via `webhookRoutes.ts`
   step 4 → `handlePushForVerification`. **P4 enqueues `captureStoryArtifact` on that transition.**
5. **End-to-end contract `3867b241`** = "2026 Saratoga Springs Municipal Asset Management and Permitting
   Software Solution RFP" (tenant `a1ccf4d3…`). Latest qualification **v9**, `canonical_opportunity_id`
   `gws:cd578408-…`. **Its RFP ZIP bundle is stored with bytes** (`gov_source_bundles` row, sha256 `4bba36…`,
   `byte_size` column present) → P2 reanalyze is viable on it. Requirements were re-established 2026-11-03 (16).

## 3. Two seam hazards the spec understates (carry into P1/P3)

1. **Requirement keys differ.** Response slots identify a requirement by `ContractRequirement.id` (**UUID**,
   `responseSlots.ts` `deriveResponseSlots` L84/L90); named documents by `canonical_req_id` (**TEXT**,
   `govProposalDocuments.ts` `deriveProposalDocuments` L71/L80). Both columns exist and differ
   (`models/ContractRequirement.ts` id L35/L56 vs canonical_req_id L37/L58). **P1's migration and P3's coverage
   check need an explicit `id ↔ canonical_req_id` map — not a string join.**
2. **`scope` requirements have a slot but no document.** `deriveProposalDocuments` excludes `scope` (build-work)
   requirements (L75); `deriveResponseSlots` includes every requirement. **P1 must route those slots' content to
   the build track, not a proposal document** (and not silently drop it).

## 4. Per-phase change list, schema DDL, routes

### P1 — One proposal model (documents are the source)
- **Schema (additive):** new `gov_proposal_document_gaps` (`id, document_id, section_key, question, why,
  resolution ENUM open|answered|filler, answer_ref, created_at, resolved_by`); `gov_proposal_documents` +
  `sections_json jsonb` (sections `{sectionKey, heading, requirementIds[], order, plan?}`). New
  `ensureGovProposalDocumentGapsSchema.ts` registered in `server.ts`.
- **Code:** extend `govProposalDocuments.ts` to carry sections; migrate slot `content/figures/gaps` →
  document sections in a one-off idempotent script `backend/src/scripts/migrateSlotsToDocumentSections.ts`
  (dry-run) using an explicit `id↔canonical_req_id` map; `scope`-slot content → build-track note.
  `submissionPackage.ts` `evaluateSubmissionReadiness`/`buildPackageFiles` read documents; keep slot read paths
  as a deprecated read-through adapter. `govProjectProjection.ts` adds document sections/gaps (no pricing,
  no identities) + projection tests.
- **Tests:** migration idempotent; readiness-from-documents == slots on fixtures; projection drops pricing.

### P2 — Blueprint from the stored ZIP
- **Schema:** `gov_proposal_blueprints (id, delivery_project_id, version int, source_sha256, blueprint_json,
  created_at, created_by, UNIQUE(delivery_project_id, version))`; `gov_proposal_documents` +
  `doc_type, page_limit, file_name, blueprint_version`.
- **Code (pure first):** `backend/src/services/factory/proposal/buildProposalBlueprint.ts` (reuses
  `evaluationCriteria`, `rfpComplianceRules`, `eliminationRisk`, `documentClassifier`, `submittalBuckets`) +
  new deterministic Section-L detectors + `texasFormsRules.ts` (HSP / Execution of Offer / no-boycott 808,809,2274
  / TX-RAMP / Form 1295 / CIQ), each rule `{key,value,quote,sourceFile,page?,severity}` dropped+counted if the
  quote isn't literally present (`verifyQuotes`). `deriveProposalDocuments(blueprint)`. Deadline/due read from
  the qualification `keyDates` (fact 1) — no new store. Reanalyze resolves project→qualification→bundle (fact 2).
- **Route:** `POST /api/admin/gov-contracts/:projectId/blueprint/reanalyze` (enqueue via the
  `govExtractionJobService` pattern on the stored bundle; 409 "Solicitation package missing" if none);
  `GET …/blueprint`. UI: Blueprint + Document set views.
- **Tests:** table-driven Texas-forms with RESEARCH.md citations; every emitted rule's quote found in the ZIP text.

### P3 — Versions, checks, gates
- **Schema:** `gov_proposal_document_versions (id, document_id, version int, content_html, sections_json,
  author_kind agent|human, author_identity_id, change_summary, check_scores jsonb, findings jsonb, passes bool,
  created_at, UNIQUE(document_id,version))` **immutable**; `gov_proposal_documents + current_version_id`;
  `gov_proposal_gate_reviews (id, document_id, gate pink|red|gold|white_glove, version_id, status
  pending|approved|returned, reviewer_identity_id, note, decided_at)`.
- **Code:** `runDocumentChecks()` — `coverage` (deterministic, `data-req` anchors over the id↔canonical map),
  `format` (deterministic, Playwright PDF page count + blueprint font/size/order/headings/file name),
  `fact` (deterministic, open/filler gaps + unresolved markers), `evaluator` (AI ×3, median, 2+ spread→flag),
  `proof` (AI claims + deterministic join), `clarity` (AI). Pure `passes(scores,fatal,openGaps)` =
  weighted≥95 (25/25/15/15/10/10), no check<85, no open gap, no fatal; weights/thresholds in config. Fatal reuses
  `detectPricingLeak` (fact 3). `draftProposalDocument` + human edits create a version, never overwrite. Gate
  order; Gold = program-capable human + SoD. Server-side HTML-aware diff endpoint (small vetted dep, justified).
- **Routes:** version list/get, diff, run-checks, gate approve/return. UI: Draft & versions + Review gates.

### P4 — Build artifacts as proof
- **Schema:** `gov_build_artifacts (id, delivery_project_id, story_id, requirement_ids, commit_sha, file_path,
  sha256, captured_at, caption, status)`; build track + `demo_url` (https, host-allowlisted) + per-story
  `capture_path`.
- **Code:** enqueue `captureStoryArtifact` on the `markTaskVerifiedComplete` transition (fact 4) — Playwright,
  strict timeout, no creds, 1440×900, PNG to the uploads volume, idempotent per (story, commit) + manual
  Re-capture. Authenticated artifact serve route; projection includes artifacts (no identities). Insert-as-figure
  (deterministic numbering; `<figure data-artifact>`; extend `sanitizeProposalHtml` allowlist for `img` to the
  app's own artifact route). UI: Build evidence.

### P5 — Agent loop & company library
- **Schema:** `gov_company_facts (key, value, source, approved_by, updated_at)`,
  `gov_company_references (client, contact, phone, email, contract_value, dates, scope, approved)`,
  `gov_company_personnel (name, role, resume_html, approved)` — tenant-scoped.
- **Code:** pure grounding builder (blueprint weights/rules/order + requirements/sections/plans + inserted
  artifacts + approved facts; nothing else). Extend `govProposalDocumentDraftAI` to take grounding + return
  structured question gaps. `reviseDocument(version, findings, grounding)`. Review-cycle background job
  (`govExtractionJobService` pattern; `maxIterations` default 3; stop on pass/open-question; a version per
  iteration; token/cost budget; structured log). Agent panel replaces the copilot rail; **keep `govCopilot` as
  the deterministic fallback**. Interns run cycles + answer on edit-shared docs only (no gate approve, no pricing).

### P6 — Package & export
- **Code:** shared Playwright PDF renderer (page size/min font from blueprint; header/footer page numbers; real
  page count on the version) — **the renderer ships in P3's `format` check and P6 reuses it**. Forms prefill +
  signed-copy upload + per-signer signature tracking (unsigned required = fatal). Sealed pricing (exceljs
  passthrough, formulas preserved, never merged). Redacted public copy (admin redaction spans; fatal if required
  and absent). `buildProposalPackage` (blueprint file names/order + manifest {doc key, version, page count,
  sha256, blueprint version}; export blocked on any failing document / unapproved gate / fatal; "Exported is not
  submitted" unchanged). UI: Package & submit → existing record-submission flow.
- **Schema:** signature-tracking + redaction-span rows (small additive tables, DDL finalized in P6).

## 5. Deviations from PROMPT.md (with reason)

1. **Deadline & bundle resolve through `gov_qualifications`, not the delivery project.** P2 reads `keyDates`
   and resolves the bundle via `canonical_opportunity_id` (facts 1–2). No second deadline store; no
   project-scoped bundle key. (PROMPT left these as P0 open facts — now pinned.)
2. **Explicit `id ↔ canonical_req_id` mapping** is a first-class part of P1's migration and P3's coverage check
   (hazard 3.1). PROMPT's "`deriveProposalDocuments` already routes each requirement" is true but assumes one key.
3. **`scope` requirement slots route to the build track** in P1 (hazard 3.2), not a proposal document.
4. **The PDF renderer lands in P3** (the `format` check needs a real page count) and P6 reuses it, rather than
   first appearing in P6. PROMPT allows this ("P6 shares the renderer; ship the renderer here").
5. **PR target = `main` (not `staging`, despite the PROMPT).** Measured: `origin/main` is **5106 commits
   ahead** of `origin/staging` and `staging` is **3545 ahead** of `main` — long-diverged branches, not a
   mirror. A main-based branch PR'd into `staging` would carry a 5000+ commit diff, and `staging` does **not**
   contain the gov Build Cockpit code this work extends (all recent cockpit PRs — #3462, #3616, #3638 — merged
   to `main`). So every Proposal Studio branch targets protected `main` under the established 1-review + CI
   flow. The PROMPT's "PR into staging" is stale for this repo's current branch topology.

## 6. Status

P0 is recon-only (no product code). This plan + the placed package are the P0 deliverable. On approval, P1 begins.
