# Handoff - Services Upgrade SV2 (evidence score + summary feed, Gov Fit cites proof, before/after regression)

**State:** built and tested, with a PR open. NOT merged, NOT deployed, NOT production-verified (owner hard limit for
this run). Backend only; the Our Services page that reads the feed is SV3.

## Before the deploy (operator)
1. **No migration.** SV2 adds no table, column or index. It only reads tables SV1 already created.
2. **Leave `ENABLE_GOV_FIT_REQUIRE_PROOF` unset (off).** On 2026-11-13 production had 18 published case studies and 0 confirmed service links, so turning it on would downgrade every "have" to "partial" and move live go/no-go.
3. **Deploy:** `scripts/deploy-prod.sh backend`. No nginx change is needed.

## Test steps after the deploy (production: https://enterprise.colaberry.ai)
Get `TOKEN` from a logged-in admin browser: DevTools > Application > Local Storage > `admin_token`.
`B=https://enterprise.colaberry.ai/api/admin/factory`

1. **The summary feed answers.** Run `curl -s -H "Authorization: Bearer $TOKEN" "$B/services/evidence-summary"`.
   Expect:
   - HTTP 200.
   - Top-level keys `status` (`active`), `generatedAt`, `services`, `intake`, `industryMatrix`, `growthSeries`, `decideNow` and `opportunityFeed`.
   - Every `services[i].openOpportunityMatches` is a number or `null`. It is `null` exactly when `opportunityFeed.source` is not `live`.
   - Today every service shows `evidenceScore: 0` and `evidenceTier: "none"`, because no links are confirmed yet.
   - `decideNow.blockedCaseStudies.count` equals the length of `intake`.
2. **The status filter works.** Repeat step 1 with `?status=growth` and then `?status=all`.
   Expect: 200, and every `services[i].status` matches the filter. `all` also includes retired services.
   With `?status=bogus`, expect a 400 and `{"error":"status must be active, growth or all."}`.
3. **It is protected.** Run the step 1 command without the `Authorization` header.
   Expect: 401.
4. **Fit cites proof (flag off).** Open a pursuit in Gov Contracts > Qualify, Step 3 Fit, and click Re-assess. The API equivalent is `POST $B/qualification/<canonicalOpportunityId>/capability-fit` with the requirements body.
   Expect:
   - The response has `proof: {"available": true, "requireProof": false}`.
   - Every capability with `assessment: "have"` carries `evidence` (an empty array today).
   - Every `partial`/`new` carries `possibleProof`, an array with up to 3 items (each with `caseStudyId`, `title`, `sourceKind`, `matchedTerms` and `linkedElsewhere`).
   - No capability has `downgradedFrom`.
   - The panel still renders as before; the new fields are not shown until SV3.
5. **Confirm a link, see it cited.** In Our Services > Evidence, confirm one suggested link for a service the pursuit matches as "have". Then re-assess Fit.
   Expect: that capability's `evidence` lists the confirmed case study. The summary feed (step 1) now shows that service with `insideCount` or `outsideCount` at 1 and a non-zero `evidenceScore`.
6. **The downgrade (only when Ali decides).** Set `ENABLE_GOV_FIT_REQUIRE_PROOF=true` in the backend environment and restart the backend. Re-assess Fit.
   Expect:
   - `proof.requireProof: true`.
   - A "have" on a service with no confirmed case study comes back as `assessment: "partial"`, `downgradedFrom: "have"` and `downgradeReason: "service has no linked case study"`.
   - A "have" with a confirmed case study stays "have".
   To roll back: unset the variable and restart.
7. **The before/after regression (SV2.3 ops half).** Copy the SV0.1 baseline files into the container, then run the script:
   ```
   docker cp catalog_2026-11-13.json accelerator-backend:/tmp/svc-baseline/
   docker cp capability_fit_fresh_2026-11-13.json accelerator-backend:/tmp/svc-baseline/
   docker exec -e OUT_DIR=/tmp/svc-regression accelerator-backend node dist/scripts/compareCapabilityFitBaseline.js \
     --baseline-fit /tmp/svc-baseline/capability_fit_fresh_2026-11-13.json --baseline-catalog /tmp/svc-baseline/catalog_2026-11-13.json
   ```
   (`docker exec accelerator-backend mkdir -p /tmp/svc-baseline` first if the folder is missing.)
   Expect:
   - It prints a summary with BEFORE, AFTER flag off and AFTER flag on totals, plus one line per pursuit with the reason for every "have" lost.
   - It writes `/tmp/svc-regression/capability_fit_regression_<date>.json` (the full report, which contains pursuit titles) and `/tmp/svc-regression/capability_fit_regression_<date>.summary.txt` (ids and counts only).
   - It makes 3 LLM calls per pursuit; set `RUNS=1` for a quick check.
   - It writes nothing to the business tables. Each LLM call writes its usual `ai_events` telemetry row.
   - Copy the files out with `docker cp`. Keep them in Basecamp, never in the repo, because the repository is public.
8. **The SV0 baseline script no longer drops telemetry.** Run `docker exec -e OUT_DIR=/tmp/x accelerator-backend node dist/scripts/snapshotServiceCatalogBaseline.js --catalog-only`.
   Expect: no "[emitAiEvent] Failed to persist ai_event" line. That mode makes no LLM call, so the full mode is the real test: run it without `--catalog-only`, and the line should be gone there too.

## Regressions to watch
- **Saved vettings:** `gov_ai_vettings.fit_json` gains the additive keys `proof`, `evidence` and `possibleProof`. Existing readers ignore them: go/no-go reads name and assessment, coverage reads assessment, the frontend panel reads id, name, assessment and matchedServiceId, and the SV0 baseline reads the same four fields.
- **Prompt:** with zero confirmed links the Fit prompt is byte-identical to the pre-SV2 prompt (a test pins this against a fixture captured from the base commit). Once links are confirmed, their titles enter the prompt, which can change what the model says. That is the intended effect, and step 7 measures it.
- **Feed latency:** the feed calls Opportunity Pulse (8 s timeout, one retry). If the feed is slow, the page's demand column is `null`, not 0.

## Rollback
Revert the merge commit on `main` and redeploy. No schema to undo. To undo only the downgrade, unset
`ENABLE_GOV_FIT_REQUIRE_PROOF` and restart the backend.

## Troubleshooting
- **503 "workspace is not configured":** the `refactored` tenant or the gov org/engagement is missing (`lookupGovContractsContainer`).
- **`opportunityFeed.source = "snapshot"`:** `OPPORTUNITY_PULSE_API_KEY` is unset or Opportunity Pulse failed. Grep the logs for `opp-pulse`.
- **`proof.available = false` on a Fit:** grep the backend logs for `gov_fit_proof_load_failed`. The Fit ran as before SV2.
- **500 `ContractViolation`:** this only happens with APP_ENV=dev or under test; production logs `service_evidence_summary_contract_violation` and still serves the response.
- **Regression exits 1:** the log line `svc_regression_failed` names the class:
  - `RegressionArgsError`: bad arguments, or OUT_DIR inside the working directory.
  - `RegressionRunError`: no container, the baseline was taken for another tenant, or no run succeeded.
  - `ZodError`: the baseline file is invalid.
