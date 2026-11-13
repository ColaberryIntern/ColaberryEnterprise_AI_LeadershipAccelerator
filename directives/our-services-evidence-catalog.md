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
  sample titles naming a probable client were replaced with "Financial client: ...". The AgTech
  fixture PDF was inspected (text, metadata, rendered pages): it names no client and no person.

## 9. SV2: evidence score, the summary feed, Fit cites proof, before/after regression

Built in group SV2 (session CC-20261113-s9v4). Backend only; the page that reads the feed is SV3.

### 9.1 Evidence score
`backend/src/services/factory/serviceEvidenceScore.ts` implements the formula in section 2 exactly. It is pure, and
the caller passes the current year. Only CONFIRMED links to case studies that are NOT archived count as proof. A
case study's year is the outside analysis `year` when it is plausible; otherwise it is the year of `approved_at`,
or failing that the year of `created_at`.

### 9.2 Summary feed
`GET /api/admin/factory/services/evidence-summary?status=active|growth|all` (default `active`):
- The route is read-only and uses `requireSection('program')`.
- The tenant comes from `lookupGovContractsContainer`. If that cannot be resolved, the route returns 503.
- A bad `status` returns 400.
- The response is validated against `EvidenceSummarySchema` before it is sent. In dev and test, a mismatch fails loud with a 500. In production it is logged and the response is still served.

The response contains:
- `services[]`: counts, `evidenceScore` and tier, industries, case-study cards, and `openOpportunityMatches`.
- `intake[]`: the Intake set, with each item's top 3 suggestions.
- `industryMatrix`.
- `growthSeries`: built from real `created_at` and `decided_at` values only, covering at most the last 12 quarters.
- `decideNow`, with four parts:
  - blocked case studies (the same set as Intake);
  - demand without proof (services that open opportunities match but that have a score of 0);
  - stale services (services with proof, but none from this year or last);
  - open Fit gaps (taken from the latest completed `gov_ai_vettings` row for each pursuit whose close date is today or later).
- `opportunityFeed`.

**Null means unknown, never zero:**
- `openOpportunityMatches` is null unless the live Opportunity Pulse feed answered. The snapshot fallback also gives null.
- An opportunity with no close date does not count as open.
- `openFitGaps.count` is null when the vetting read fails.

### 9.3 Fit cites proof (package 1G)
The Fit route and the ZIP vetting both call `govCapabilityFitWithProof.ts`. Vetting applies it before go/no-go and coverage, so the route, the saved `fit_json` and the verdict all see the same capabilities.
- **Every `have`** carries `evidence[]`: the matched service's confirmed case studies, at most 5, inside records first. An empty array means no case study is linked yet.
- **Every `partial`/`new`** carries `possibleProof[]`. These are found by deterministic keyword overlap, with no LLM call:
  - at least 2 distinct meaningful shared words;
  - at most 3 results;
  - a case study already confirmed for the capability's own service is excluded;
  - `linkedElsewhere` marks a case study that is confirmed for another of this tenant's services.
- **The prompt** includes confirmed case-study titles inside their own untrusted block, capped at 3 per service, 100 characters per title and 6,000 characters overall. When no service has a confirmed case study, the prompt is byte-identical to the pre-SV2 prompt. A test pins this against a fixture captured from the base commit.
- **The downgrade.** An unproven `have` becomes `partial`, with `downgradeReason` "service has no linked case study". This runs ONLY when `ENABLE_GOV_FIT_REQUIRE_PROOF=true` (`FLAGS.govFitRequireProof`), which is **off by default**.
  - Why it ships off: on 2026-11-13 production had 18 published case studies and 0 confirmed links, so turning it on would flip every `have`.
  - Turn it on once services have confirmed links: set the env var on the backend and restart it.
  - It is never applied when proof could not be loaded.
- **Additive only.** `sanitizeCapabilities`, the 80-service cap, the assessment vocabulary and every existing field are unchanged. The result gains `proof: { available, requireProof }`.

### 9.4 Before/after regression (SV2.3, code half)
`backend/src/scripts/compareCapabilityFitBaseline.ts` takes the SV0.1 `capability_fit_fresh_*.json` and
`catalog_*.json` files as input.
- **What it does:**
  - re-runs the SV2 Fit `RUNS` times per pursuit (default 3);
  - applies the proof rules with the flag off and on to the same model output;
  - writes `capability_fit_regression_<date>.json` and a matching `.summary.txt`.
- **Where it writes:** only to `OUT_DIR`, which must be outside the working directory (default `/tmp/svc-regression`).
- **Majority rule:** a service counts as `have` after only when 2 of 3 runs agree.
- **Explanations:** every `have` that is lost gets exactly one reason: `service-no-longer-active`, `downgraded-no-proof` or `model-reassessed`.
- **Never in the repo:** the output contains pursuit titles and Gov AI verdicts, and the repository is public.

### 9.5 Failure modes (SV2 boundaries)

| Boundary | What happens if it fails | Retry | Recovery | Handled / not handled |
|---|---|---|---|---|
| **Opportunity Pulse feed** (summary) | `openOpportunityMatches` null, `opportunityFeed.source` `unavailable` or `snapshot`; the rest of the page loads. | Client: 8 s timeout, one retry, snapshot fallback. | The page re-requests; nothing to repair. | Handled: throw, snapshot, malformed rows. Not handled: a live feed that is stale upstream. |
| **Vetting read** (summary decideNow) | `openFitGaps.count` null; the rest of the page loads. | None (GET; re-request). | Re-request. | Handled: query failure. |
| **Catalog / link / case-study reads** (summary) | 500 with a fixed sentence; logged `service_evidence_summary_failed`. | None. | Re-request after the DB recovers. | Not handled: a partial page; without these there is no honest page. |
| **Proof loader** (Fit) | Logged `gov_fit_proof_load_failed`; the Fit runs exactly as before SV2 (no titles, no proof fields, no downgrade). | None (next Fit call re-reads). | Re-assess Fit. | Handled: any DB error. |
| **Regression script** | Bad args or unreadable baseline: exits 1 before any DB access. Wrong tenant or no successful run: exits 1, nothing written. A missing pursuit is recorded as `pursuit_not_found`. | The Fit client's single retry. | Re-run (read-only; overwrites its own output files). | Handled: per-run Fit errors (excluded from the vote, counted). |
