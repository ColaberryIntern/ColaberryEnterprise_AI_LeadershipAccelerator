# Our Services: run the evidence-backed catalog

**Status:** Phase 0 + 1A-1E built (SV1, Session CC-20261113-s9v4). Phase 1F (evidence summary), 1G (Fit
integration) and Phase 2 (the page) are later groups (SV2, SV3). Spec: Ali's design package
`our-services-upgrade/CLAUDE_CODE_PROMPT.md`; visual target `docs/design/our-services-evidence-mockup.html`
(illustrative sample data only - none of it ships).

## 1. Purpose

Every service in **Admin > Program > Our Services** should be backed by case studies that prove it, so a
government bid can answer "can we deliver this?" with records rather than prose. Case studies come from two
places: **inside** (our own builds, `case_studies.source_type` = `project` / `repo_collection`) and **outside**
(PDFs and decks from the Drive case-study library, turned into records by AI analysis). No case study may sit
unlinked: until a person attaches it to at least one service (or proposes a new one from it), it waits in the
**Intake queue** and cannot publish. A service proposed from a case study enters as `growth` and is promoted to
`active` only by a person, and only once it has at least one confirmed case study.

## 2. Owner decisions (Ali, 2026-11-13; do not re-ask)

As recorded for this build: "(1) promotion = at least 1 confirmed case study + human click; (2) Outside case
studies are INTERNAL ONLY -> add a publish blocker for outside source kinds; (3) Drive = manual import (no
scheduled sync); (4) evidence-score formula accepted as written." The table restates them with how each is enforced.

| # | Question in the package | Decision |
|---|---|---|
| 1 | Promotion rule for `growth` -> `active` | **At least 1 confirmed case study + a human click.** (Implementation reading: an outside-only confirmed link satisfies it, since the answer names no inside requirement.) |
| 2 | May an outside (Drive) case study ever become public? | **No. Outside case studies are INTERNAL ONLY** (Gov proposals, never the website). Enforced by the publish blocker `outside_case_study_internal_only`. |
| 3 | Drive scope / sync | **Manual import only.** No scheduled sync. A sync is a possible follow-up, not built. The package's other half of this question - which Drive folder id is the canonical library - is still UNANSWERED; the admin supplies a folder id per import. |
| 4 | Evidence score weights | **Formula accepted as written** (below). Built in SV2, recorded here so the number has one definition. |

Evidence score (SV2, `serviceEvidenceScore.ts`): `min(100, 18*inside + 11*outside + freshness + 4*distinctIndustries)`;
`freshness` = 20 if the newest confirmed proof is from this year or last, 8 if two years old, 0 otherwise; score
is 0 when a service has no confirmed links. Tiers: >=70 Proven, 40-69 Emerging, 1-39 Thin, 0 No proof. Inside
weighs more than outside on purpose: repo evidence is verified, an outside PDF is a claim.

## 3. Inputs

| Input | Where | Notes |
|---|---|---|
| Outside document upload | `POST /api/admin/factory/case-studies/external`, multipart field `files` | PDF, DOCX, PPTX only. 50 MB per file (the `config/upload.ts` cap), at most 4 files per request. |
| Drive file or folder | Same route, JSON `{ "driveFileId": "..." }` or `{ "driveFolderId": "..." }` | Manual import (decision 3). Folder import reads at most 50 supported files, one record per file. |
| Gov tenant | `lookupGovContractsContainer()` | Tenant whose `service_offerings` are linked. Unresolvable -> 503, never a cross-tenant read. |
| Env | `OPENAI_API_KEY`; the Google service-account vars `driveService.ts` already uses; optional `CASE_STUDY_EXTERNAL_DIR` (default `/app/uploads/case-study-external`, on the persistent `uploads` volume) | No new dependency. |
| Schema | `case_study_external_imports` | `backend/src/db/ensureCaseStudyExternalImportSchema.ts` at boot; `backend/src/seeds/migrations/20261113_add_case_study_external_imports.sql` on prod BEFORE the deploy. |

## 4. Steps

1. **Classify** (1A). `services/caseStudy/caseStudySourceKind.ts` maps `source_type` to inside/outside in one
   place. Unknown values map to inside and log `case_study_source_kind_unknown`. Success signal: unit suite
   `caseStudySourceKind.test.ts` green.
2. **Import** (1B). An admin uploads a file or names a Drive file/folder. For each file, in order:
   hash the bytes (sha256) -> if a row in `case_study_external_imports` already has that hash (or, for Drive, the
   same file id + modifiedTime), return it with `alreadyImported: true` and write nothing -> store the original at
   `<dir>/<sha256><ext>` -> extract text (pdf-parse for PDF, the existing officeparser extractor for DOCX/PPTX) ->
   AI analysis with the instrumented OpenAI client (document text fenced by `untrustedBlock`, 90 s timeout, one
   retry, content-hash cache) -> ONE transaction creates the draft `case_studies` row
   (`source_type` `external_document` or `external_drive`, `status=draft`, `visibility=private`, organization
   anonymized), a `case_study_artifacts` row for the original (`source_type=file`), a provenance row in
   `case_study_evidence` (`verification_class=pending`, `metadata.provenance=outside_document`), one
   `case_study_metrics` row per extracted metric (`verification_class=pending`, `publishable=false`), and the
   import row -> run `suggestLinksForCaseStudy` so the record lands in Intake with suggestions. Success signal:
   response `results[i].status = created`, the record appears in step 3's Intake list.
3. **Intake** (1C). `GET /api/admin/factory/case-studies/intake` lists every non-archived case study with
   **zero confirmed** links into the gov tenant's services, whatever its status. Suggested links do not count as
   linked. Each item carries its suggestions and, for outside records, the extracted keywords.
4. **Link** (existing). `POST /api/admin/factory/service-links/:id/decide` with `{"state":"confirmed"}` is the
   human act that takes a record out of Intake. Nothing in this feature ever confirms a link automatically, except
   step 5, which is itself a human action naming the service.
5. **Propose a service** (1D). `POST /api/admin/factory/case-studies/:caseStudyId/propose-service`
   `{ name, category?, description?, keywords?, naicsCodes? }`. In one transaction: create the service as
   `growth` (`created_by` = actor) and a `confirmed` link (`decided_by` = actor). Idempotent per
   `(tenant, lower(name))`: an existing service of that name is linked instead and the response says
   `existing: true`. Keywords/NAICS default to the case study's AI analysis when omitted.
6. **Promote** (1E). `POST /api/admin/factory/services/:serviceId/promote` moves `growth` -> `active` only when the
   service has at least one confirmed link to a non-archived case study (decision 1); otherwise 409 with a plain
   sentence. Already active -> 200, unchanged. Growth services stay out of Fit until promoted (Ali, 2026-10-16).
7. **Publish** (existing route, new rules). The fail-closed publish gate now also refuses
   `no_confirmed_service_link` (zero confirmed links in the gov tenant; an unresolvable tenant counts as zero) and
   `outside_case_study_internal_only` (any outside source kind, every surface). No override flag exists.

## 5. Outputs

- Rows: `case_studies` (draft, private), `case_study_artifacts`, `case_study_evidence`, `case_study_metrics`
  (pending), `case_study_external_imports`, `case_study_service_links` (`suggested` from the pass, `confirmed`
  from steps 4-5), `service_offerings` (`growth` from step 5, flipped to `active` by step 6).
- Files: originals under `CASE_STUDY_EXTERNAL_DIR`, named by content hash.
- Log events (JSON, stdout): `case_study_outside_import` (per file, `outcome` success/partial/failure,
  `error_class`), `case_study_outside_analysis_failed`, `case_study_outside_extract_failed`,
  `case_study_outside_drive_failed`, `case_study_outside_suggest_failed`, `service_proposed`,
  `service_promoted` / `service_promotion_refused`, `case_study_service_link_facts_failed`,
  `case_study_source_kind_unknown`.

## 6. Verification

- Unit + route suites (no DB): `cd backend && npx jest --config jest.ci.config.ts --ci caseStudySourceKind caseStudyOutside caseStudyPublishServiceLinkRule caseStudyServiceLinkGateFacts caseStudyIntakeQueue serviceProposal caseStudyOutsideIntakeRoutes serviceProposalRoutes`.
- Real parser against the fixture: `caseStudyOutsideExtract.realPdf.test.ts` (child Node process; asserts the
  AgTech text is read).
- Integration (opt-in, real Postgres): `DATABASE_URL=postgres://... npx jest -c jest.config.ts caseStudyOutsideIntake.integration serviceProposal.integration`.
  Skips loudly without `DATABASE_URL`; CI's `integration-tier` job runs it with a disposable database.
  Never point it at production.
- After a deploy: re-uploading the same file returns `alreadyImported: true` and
  `SELECT count(*) FROM case_study_external_imports WHERE content_hash = '<sha256>'` stays 1.

## 7. Edge cases and failure modes (per external boundary)

The four Failure-First questions (root CLAUDE.md) for each boundary:

| Boundary | What happens if it fails | Retry | Recovery when retries are exhausted | Handled / not handled |
|---|---|---|---|---|
| **Google Drive** (metadata, folder list, download) | That file's result is `status: failed` with a reason; other files continue. Nothing is written for it (there is no file to attach). | None automatic (googleapis default retry disabled by explicit options); 30 s timeout on metadata/list, 60 s on download, 50 MB byte cap. | Re-run the import: it is idempotent, so files that already landed return `alreadyImported`. Check the service account still has domain-wide delegation with `drive.readonly`. | Handled: not configured, 404/403, timeout, oversize, unsupported type, folder with > 50 files (first 50, reported). Not handled: shortcuts to files in other drives, Google-native Docs/Slides (not exported - export to PDF first). |
| **File parse** (pdf-parse, officeparser) | Fail-soft: the draft is still created with the original attached and `analysisError` set (e.g. "no extractable text - likely a scanned PDF"). It lands in Intake as "needs manual details". | None (a parse is deterministic; retrying returns the same result). 60 s timeout. | A person fills the fields in Case Study Studio, or re-exports the document as a text PDF and imports it (new hash -> new record; archive the old draft). | Handled: corrupt, encrypted, image-only, timeout, text over 60,000 chars (truncated, flagged). Not handled: OCR of scanned PDFs. |
| **LLM** (OpenAI via `getInstrumentedOpenAI`, workflow `case_study_outside_intake`) | Fail-soft: draft created with the original attached, title from the file name, and `analysisError`. No key, empty text, timeout, 5xx/429, or malformed JSON all take this path; nothing throws. | Client-level: 90 s timeout, `maxRetries: 1`. Identical text within an hour is served from the content-hash cache (no second call). | Re-import after the upstream recovers: the hash already exists, so the record is returned as `alreadyImported`; fill fields by hand, or archive the draft and re-import a re-saved copy. | Handled: invented/oversized fields (sanitizer clamps every field, drops non-strings, forces every metric `verified: false`), prompt injection in the document (fenced by `untrustedBlock`; output is data only, never instructions). Not handled: factual errors in the document itself - every outside claim stays unverified until a person confirms it. |
| **Database** | One file's transaction rolls back completely (no half-created case study). A unique violation on `content_hash` from a concurrent import is read as "already imported". Other files continue. | None automatic. | Re-run the import (idempotent). | Not handled: database down - the route returns per-file failures; nothing partial is written. |

Other edge cases:
- **Two admins import the same file at once:** the unique index decides; the loser returns `alreadyImported`.
- **Same name proposed twice / differently cased:** one service, `existing: true` on the second call (advisory
  transaction lock on `(tenant, lower(name))`).
- **Promote a service with only suggested links:** refused (409) - suggestions are not proof.
- **A case study confirmed only for ANOTHER tenant's service:** still in this tenant's Intake, and still blocked
  from publishing - links are counted inside the gov tenant only.
- **Existing inside case studies with no confirmed link:** can no longer be (re)published until linked. This is
  the intended effect of "no case study can sit unlinked"; already-live publications are not touched (the gate
  runs on publish, not retroactively).

## 8. Safety constraints

- **Outside records never publish** (decision 2). Their metrics are written `pending` and `publishable=false`,
  so even a reclassified record would still be refused by the existing pending-metric rule.
- **No automatic confirmation.** A link becomes `confirmed` only by a person (decide route or propose-service).
- **Idempotency:** imports keyed on sha256 content hash (UNIQUE), Drive pre-checked by file id + modifiedTime;
  propose-service keyed on `(tenant, lower(name))`; promote is a no-op when already active.
- **Tenancy:** every read resolves the gov tenant's services first and counts only links pointing into that set
  (`caseStudyServiceLinkStore` invariant).
- **Untrusted input:** document text only ever reaches the model inside `untrustedBlock`; Drive ids are validated
  by regex before they reach a Drive query string; uploads are allow-listed by MIME type and size.
- **No production access from tests.** Integration suites create their own tables and must never be pointed at
  production.
- **Public repository:** the design package's three context screenshots were NOT committed (they show staff
  names, a staff email address, browser tabs with personal names and a personal file explorer). The mockup's four
  sample titles naming a probable client ("ALLIN: ...") were replaced with "Financial client: ...". The AgTech
  fixture PDF was inspected (text, metadata, rendered pages): it names no client and no person.
