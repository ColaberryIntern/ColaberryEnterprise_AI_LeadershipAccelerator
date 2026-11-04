# Build the Gov Proposal Studio

You are working in `ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator`. Follow `CLAUDE.md`, `backend/CLAUDE.md` and `MERGE_WORKFLOW.md` in full:
- One branch per phase (`workstream/proposal-studio-p<N>`), PR into `staging`.
- A brief-me block at the end of every reply.
- Never report a check you didn't run.

## Read first, in this order

1. `docs/gov-proposal-studio/README.md`, `FLOW.md`, `GAP_REPORT.md`, `RESEARCH.md`
2. `docs/gov-proposal-studio/designs/proposal-studio.html`: the **approved** UX. Open it and click through every view. Match its structure and behavior using this app's existing Bootstrap 5 + `ri-*` icons + `govCockpit.css` conventions, not its exact styling.
3. `docs/gov-pursuit-redesign/FLOW.md` and `OPERATOR_GUIDE.md`: the shipped rails you must keep.
4. The code listed in `GAP_REPORT.md`. Read it before changing it.

## Goal

The pilot build is complete on active pursuits. Make the proposal side finish the job. For each contract, the system must:

1. **Re-analyze** the stored solicitation ZIP into a **blueprint**: scoring, submission rules, Texas forms rules, required documents. Every rule is quoted and cited.
2. Derive the contract's **document set** from the blueprint.
3. Pull **screenshots from the verified build** in as proof.
4. Have an **agent draft and revise** each document. Every save is a **version** with stored **check scores**.
5. Score each version on **six checks** mapped to the **Shipley color teams**. Revise until it reaches **95%** (weighted ≥ 95, no check < 85, no open question, no fatal item) or needs a human answer.
6. Have **people approve every gate** (Pink, Red, Gold, White glove).
7. **Assemble the package**: PDFs with real page counts, the sealed pricing file, the redacted copy, a manifest. Then hand off to the existing Submit/record flow.

## Non-negotiables (from the shipped system, still binding)

- **Never fabricate.**
  - A blueprint rule without a literal quote found in the source text is dropped. Reuse `verifyQuotes`.
  - The agent never invents a fact. A missing fact becomes a typed **question** (a gap). It is never asserted.
- **The maker never approves its own work.** The agent can set `drafted`/scores, never `accepted` or a gate `approved`. Gold requires a program-capable human. Keep separation of duties: whoever approves Gold cannot be the last human author of that version, except with the existing master-admin override.
- **Pricing is admin-only, enforced at the API.**
  - The student projection drops pricing documents, pricing versions, pricing check results, and price text.
  - The price-leak scan runs on every non-pricing version.
- **The API is the trust boundary.** Add every new intern-visible field through `govProjectProjection.ts` and extend its tests (no identities, no pricing, no raw ids).
- **Determinism first.**
  - Schedule math, coverage, format, page counts, placeholder counts, the pass rule, readiness and the forms rules engine are **pure functions** with `now` injected, unit-tested.
  - The AI only does the evaluator score, claim extraction, clarity, drafting and revising. It is **fail-soft**: no key or an upstream error returns a clear message and never throws past the route.
- **Additive schema via the existing boot pattern** (`backend/src/db/ensure*Schema.ts`, registered in `server.ts`). Don't destructively alter `gov_proposal_documents`.
- `backend/CLAUDE.md`: Zod on every route, structured JSON logs with `error_class`, explicit timeouts on OpenAI and Playwright, no hardcoded hosts, a unit test for every new service function.
- **Exported is not submitted.** Keep the external-submission recording routes as the source of truth.
- **Sanitize model HTML** with the existing `sanitizeProposalHtml` allowlist. If figures need `<figure>/<figcaption>/<img>`, extend the allowlist so that `img` accepts only `src` matching this app's own artifact route. Add tests.

## Phases (one PR each)

### P0: Recon and plan (no product code)

- Confirm or correct every item in `GAP_REPORT.md` against the code, citing the file and line.
- Resolve its **Open facts**:
  - where the deadline lives
  - the delivery project → stored bundle lookup
  - whether existing pursuits have stored bytes
  - which project `3867b241-0761-4f1f-9a32-ffe3b47bf186` is (the end-to-end test contract)
- Find the existing price-leak check (`pricing_leak` in `submissionPackage.ts`) and the story-verified hook (`services/sbp/verification/*`, `webhookRoutes.ts` step 4).
- Write `docs/gov-proposal-studio/P0-plan.md`: a file-by-file change list per phase, the schema DDL, route list, and any deviation from this prompt with its reason.
- Proceed to P1 unless a finding contradicts the design. In that case stop and explain.

### P1: One proposal model (documents are the source)

Problem: export and readiness read response slots, while the cockpit works on documents.

- Make **named documents** the single proposal model. Each document holds **sections**: `{ sectionKey, heading, requirementIds[], order, plan? }`.
  - Response slots become sections inside the document their requirement routes to (`deriveProposalDocuments` already routes each requirement).
  - Existing slot content, figures and gaps migrate into the matching document as sections, idempotently, with no data loss. Write a one-off script under `backend/src/scripts/` per its naming rules, plus a dry-run mode.
- **Gaps move to documents**: `gov_proposal_document_gaps` (doc, section, question, why, resolution `open|answered|filler`, answer_ref, created_at, resolved_by). `[PLACEHOLDER: …]` markers in content map to gap rows. An open or filler gap blocks the document, as slot gaps block export today.
- `evaluateSubmissionReadiness` and package building read **documents**. Keep the slot read paths working as a read-through adapter until the UI no longer calls them; mark them deprecated.
- Tests:
  - migration is idempotent
  - readiness from documents gives the same verdict as today's slots on fixtures
  - no pricing in the student projection

### P2: Blueprint from the stored ZIP

- Table `gov_proposal_blueprints` (id, delivery_project_id, version int, source_sha256, blueprint_json, created_at, created_by), unique (project, version).
- **Pure** `buildProposalBlueprint(extractionPayload, opts) → Blueprint`. It reuses the existing detectors (`evaluationCriteria`, `rfpComplianceRules`, `eliminationRisk`, `documentClassifier`, `submittalBuckets`) and adds deterministic detectors for:
  - **Section L instructions:**
    - page limit per volume
    - minimum font size
    - page size
    - file format (searchable PDF, Excel)
    - required section order / numbering
    - file naming
    - number of copies
    - submission method and portal
    - due date/time
  - **Required forms** named by the solicitation (from `form`/`tax_form`/`pricing_form` roles + text).
  - **Addenda** to acknowledge.
  - Every rule is shaped `{ key, value, quote, sourceFile, page?, severity: 'fatal'|'curable'|'info' }`. A rule whose quote isn't found literally is dropped and counted.
- **Pure `texasFormsRules({ buyerType: 'state_agency'|'university'|'local_government'|'other', estimatedValue?, cloudSoftware?, subcontractingProbable?, governingBodyVote? })`** returns the required forms with trigger reason, timing (with proposal vs at award), and fatal/curable:
  - HSP: state/university, ≥ $100k, subcontracting probable → fatal; outreach timer of 7 working days before the due date
  - Execution of Offer when named
  - No-boycott certifications (Gov't Code 808, 809, 2274)
  - TX-RAMP for cloud software at a state agency
  - Form 1295: governing-body vote or ≥ $1M → at award, unless the solicitation asks for it at submission
  - CIQ: local government only

  Unknown inputs produce "needs input", never a guess. Table-driven tests with the citations in `RESEARCH.md`.
- `POST /api/admin/gov-contracts/:projectId/blueprint/reanalyze`: enqueue via the existing extraction job pattern on the **stored** bundle (no re-upload). It writes the next blueprint version and returns a diff from the previous one. A missing bundle returns 409 with "Solicitation package missing. Re-upload it on the Solicitation step."
- `deriveProposalDocuments` takes the blueprint. It adds form documents, our additions (Compliance Matrix = `generated`, Pilot Demonstration Exhibit = `build`, when the solicitation allows supplemental material or doesn't forbid it), page limits, and file names. Add `doc_type`, `page_limit`, `file_name`, `blueprint_version` columns. Sync rules stay source-derived only.
- UI: **Blueprint** view and **Document set** view, as in the demo.

### P3: Versions, checks, gates

- Table `gov_proposal_document_versions`:
  - columns: id, document_id, version int, content_html, sections_json, author_kind `agent|human`, author_identity_id, change_summary, check_scores jsonb, findings jsonb, passes bool, created_at
  - unique (document_id, version)
  - **Rows are immutable.**
  - `gov_proposal_documents` gains `current_version_id`. `draftProposalDocument` and human edits create a version and never overwrite.
- **Check runner** `runDocumentChecks(version, ctx) → { scores, findings, fatal[], passes }`, with each check behind an interface for testing:
  - `coverage` (deterministic): each mapped requirement cited by a section anchor.
  - `format` (deterministic): page count from a Playwright PDF render (P6 shares the renderer; ship the renderer here), font and page size from the blueprint, section order, required headings, file name.
  - `fact` (deterministic): open or filler gaps, and unresolved markers.
  - `evaluator` (AI): three independent calls with a scoresheet built from the blueprint's factors and weights. Store each score. Use the median, and flag a 2+ adjectival-level spread for a human.
  - `proof` (AI + deterministic): extract claims, then join each to an artifact, library fact or reference. An unbacked claim is a finding.
  - `clarity` (AI): theme statement per section, customer focus, readability band.
  - Fatal: over page limit, price leak (reuse the existing scan), missing required signature (forms), missing required form.
- **Pure `passes(scores, fatal, openGaps)`**: weighted (25/25/15/15/10/10) ≥ 95, no check < 85, no open gap, no fatal. Store weights and thresholds in config with these defaults; changing them is an admin setting, never per-intern.
- Table `gov_proposal_gate_reviews` (document_id, gate `pink|red|gold|white_glove`, version_id, status `pending|approved|returned`, reviewer_identity_id, note, decided_at):
  - Gates go in order; a gate opens only when the version passes the checks relevant to it.
  - Gold requires a program-capable human and separation of duties.
  - A new version after an approval reopens the later gates.
- Server-side **diff** endpoint between two versions (HTML-aware text diff; add a small vetted dependency if none exists, and justify it in the PR).
- UI: **Draft & versions** (working copy, section plan, checks, version history, diff toggle) and **Review gates** (team cards plus a documents × checks matrix), as in the demo.

### P4: Build artifacts as proof

- Add `demo_url` on the gov project's build track (admin-set, validated `https://`, host allowlisted from config) and per-story `capture_path` (optional, defaulting to the demo root).
- On **story verified** (the existing verification path), enqueue `captureStoryArtifact`:
  - Playwright (already in the image) with a strict timeout, no credentials, viewport 1440×900
  - PNG saved to the persistent uploads volume
  - row in `gov_build_artifacts` (project, story_id, requirement_ids, commit_sha, file path, sha256, captured_at, caption, status)
  - idempotent per (story, commit)
  - also a manual **Re-capture** action
- Serve artifacts through an authenticated route. The student projection includes artifacts for their project, minus any identity fields.
- **Insert as figure**: adds a figure block to a new version (`<figure data-artifact="<id>">` + caption `Figure N. <caption>, captured from the verified build on <date> (story <id>, commit <sha7>)`). Figure numbering is deterministic per document. Reuse the `ResponseFigure` shape.
- An unverified story has no capture. Show a decision card ("finish the build" vs "describe without a screenshot"). The choice is recorded and lowers `proof` when describing.
- UI: **Build evidence** view, as in the demo.

### P5: Agent loop and company library

- **Company library**, tenant-scoped:
  - `gov_company_facts` (key, value, source, approved_by, updated_at)
  - `gov_company_references` (client, contact, phone, email, contract_value, dates, scope, approved)
  - `gov_company_personnel` (name, role, resume_html, approved)
  - Answering a question saves to the library (after human confirmation) and resolves every gap that asked it. Admin pages to view and edit the library.
- **Grounding builder** (pure): blueprint (weights, rules, order, page budget), the document's requirements and sections with section plans (`hot button → feature → benefit → proof → discriminator`), inserted artifacts with captions, approved library facts. Nothing else. Extend `govProposalDocumentDraftAI` to take this grounding and to return gaps as structured questions.
- **`reviseDocument(version, findings, grounding)`**: a targeted revision of the failing sections only, with the same sanitize and no-fabrication rails.
- **Review cycle job** (background, kick off then poll, following the `govExtractionJobService` pattern):
  - loop as in `FLOW.md`, `maxIterations` default 3
  - stop on pass or on open questions
  - each iteration writes a version with a change summary derived from findings
  - token and cost budget per run from config
  - a structured log line per iteration
- **Agent panel** replaces the copilot rail:
  - activity log (persisted events)
  - **Needs your answer** list (open questions across documents, each with "why" and the affected documents)
  - quick actions
  - Keep `govCopilot` as the deterministic fallback answer source; don't delete it.
- Interns can run cycles and answer questions on documents shared with them at `edit` level. They can't approve gates or see pricing.

### P6: Package and export

- Render each document's **approved** version to PDF with the shared Playwright renderer:
  - page size and minimum font from the blueprint
  - running header and footer with page numbers
  - real page count recorded on the version
- Forms: prefill from the library where a template is available. Otherwise attach the blank, upload the **signed copy**, and track signature status per required signer. Unsigned required forms are fatal.
- Pricing: admin uploads or edits the agency pricing file (Excel passthrough with `exceljs`; formulas preserved). It stays in its own sealed file, never merged.
- Redacted public copy: the admin marks redaction spans per version, and the copy renders with `[REDACTED]`. If the blueprint requires one and none exists, that's fatal.
- `buildProposalPackage`:
  - file names and order from the blueprint
  - a manifest listing each file's document key, version, page count, sha256 and blueprint version
  - export blocked when any document fails `passes`, any gate is unapproved, or any fatal item remains
  - "Exported is not submitted" stays as is
- UI: **Package & submit** view, as in the demo. It hands off to the existing record-submission flow.

## Acceptance (end to end, on project `3867b241-…` or the P0-confirmed contract)

1. **Re-analyze** produces a blueprint whose every rule shows a quote that exists in the stored ZIP text. The Texas forms rules show the right required, not-required and at-award entries for this buyer.
2. The document set matches the blueprint, and pricing is invisible in the intern view (verified through the API response, not the screen).
3. A verified story's screenshot appears in the gallery within one job cycle and can be inserted as a numbered figure with a traceable caption.
4. **Run review cycle** on the technical document creates new versions, each with stored scores and a diff. It stops at a question when a fact is missing; answering it saves to the library, and the next cycle uses it.
5. A document can't reach Gold until it passes at 95 with no fatal items. The agent can't approve, and the same human can't author and approve Gold.
6. Export produces the PDFs with real page counts, the separate pricing file, the redacted copy and the manifest. Export refuses while anything is fatal or unapproved.

## Tests (required each phase)

- Pure functions: blueprint builder, Texas forms rules, pass rule, coverage, format (with a fixture PDF), fact count, figure numbering, readiness from documents. Table-driven.
- Services with mocked OpenAI and Playwright: fail-soft paths, timeouts, idempotency (capture per story+commit, versions, migrations).
- Projection: no pricing, no identities, new fields present.
- Routes: Zod 400s, 404 for non-members, 403 for intern gate approval, 409 for a missing bundle.
- Frontend: views render from fixtures; gate buttons only for permitted viewers; questions flow.

Run `npx tsc --noEmit` and `npx jest` in `backend/` and the frontend test suite, and report the real results.

## Open questions (ask once in P0 if the code doesn't answer them; otherwise use the default)

- **Pass thresholds**: default weighted 95, floor 85, weights 25/25/15/15/10/10.
- **Who approves Gold**: default is a program-capable admin, and never the last human author.
- **DOCX output**: some agencies require Word. Default: PDF only now, with DOCX listed as a follow-up.
- **E-signature integration**: out of scope; upload of the signed copy only.
