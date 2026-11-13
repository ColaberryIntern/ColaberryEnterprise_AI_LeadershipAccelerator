# Handoff - Services Upgrade SV1 (outside case-study intake, must-link rule, propose/promote)

**State:** built and tested, with a PR open. NOT merged, NOT deployed, NOT production-verified (owner hard limit for this run).

## Before the deploy (operator)
1. Run the migration on production BEFORE deploying the backend:
   `docker exec -i accelerator-db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < backend/src/seeds/migrations/20261113_add_case_study_external_imports.sql`
   Expected result: `BEGIN`, `CREATE TABLE`, three `CREATE INDEX`, `COMMIT`. A second run prints "already exists, skipping" notices.
2. The nginx block for the upload path is in this PR (merging approves it). Rebuild nginx with the backend, then confirm `nginx -t` passes inside the container. Until nginx is rebuilt, an upload larger than 1 MB returns a 413 HTML page at the edge. Drive imports are not affected.
3. Deploy with `scripts/deploy-prod.sh backend nginx`.
4. Know the must-link impact before deploying. A read-only count on 2026-11-13 found 18 published case studies, none with a confirmed service link (`case_study_service_links` was empty). Once SV1 is live, those 18 stay live, but none can be republished or edited until each has a confirmed link.

## Test steps after the deploy (production: https://enterprise.colaberry.ai)
Get `TOKEN` from a logged-in admin browser: DevTools > Application > Local Storage > `admin_token`.
`B=https://enterprise.colaberry.ai/api/admin/factory`

1. **Import the AgTech PDF.** Save it from the repo path `backend/src/services/caseStudy/__tests__/fixtures/outside-case-studies/` (465 KB, under the 1 MB edge limit), then run:
   `curl -s -H "Authorization: Bearer $TOKEN" -F files=@AgTech_-_Advanced_Econometric_Pricing_Model.pdf $B/case-studies/external`
   Expect: HTTP 200, `results[0].status = "created"`, `summary.created = 1`. Write down `results[0].caseStudyId` as `CS`.
2. **It is in Intake.** `curl -s -H "Authorization: Bearer $TOKEN" $B/case-studies/intake`
   Expect: an item with `id = CS`, `sourceKind = "outside"`, non-empty `keywords`, and usually at least one `suggestions[]` entry.
3. **Re-import does nothing.** Repeat step 1.
   Expect: HTTP 200, `results[0].status = "already_imported"`, `alreadyImported: true`, the same `caseStudyId`. The Intake count is unchanged.
4. **An outside record cannot publish.** In Admin > Case Studies, open the record and try Publish. The API equivalent is `POST /api/admin/case-studies/CS/publish`.
   Expect: refused. The blockers include `outside_case_study_internal_only` and `no_confirmed_service_link`.
5. **Propose a service from it.**
   `curl -s -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"name":"Pricing Optimization Analytics"}' $B/case-studies/CS/propose-service`
   Expect: HTTP 201, `service.status = "growth"`, `existing: false`, `link.state = "confirmed"`, `prefilledFromAnalysis.keywords = true`. Write down `service.id` as `SVC`.
6. **Idempotent by name.** Repeat step 5 with the name in lower case.
   Expect: HTTP 200, `existing: true`, the same `SVC`.
7. **The record left Intake.** Repeat step 2.
   Expect: `CS` is no longer listed.
8. **Promote is refused without proof.** Create a growth service that has no case study, using the existing Add service UI or `POST $B/services` with `{"name":"X","status":"growth"}`. Then call `POST $B/services/<id>/promote`.
   Expect: HTTP 409, `"This service has no confirmed case study yet. ..."`.
9. **Promote with proof.** `POST $B/services/SVC/promote`
   Expect: HTTP 200, `promoted: true`, `service.status = "active"`. Repeating it gives `promoted: false`.
10. **Upload over 1 MB** (after the nginx block lands). Upload any PDF larger than 1 MB.
    Expect: HTTP 200, not 413.
11. **A Drive file.** `-d '{"driveFileId":"<id of an AgTech PDF in the library>"}'`
    Expect: `status = "created"` (or `already_imported`) and `sourceType` `external_drive`.

## Regressions to watch
- **By design:** an existing case study with NO confirmed service link can no longer be (re)published on any surface, including Hire. Already-live publications are untouched. The fix is to confirm a link in Our Services > Evidence.
- The frontend does not yet know the two new blocker codes or the new routes (SV3). Blocker messages still render verbatim.

## Rollback
Revert the merge commit on `main` and redeploy. The table is additive and harmless if left in place. A full schema rollback is `DROP TABLE IF EXISTS case_study_external_imports;` (the drafts it points at remain; archive them in the admin if unwanted). To remove a mistaken growth service, use the existing retire route.

## Troubleshooting
- **503 "workspace is not configured":** the `refactored` tenant or the gov org/engagement is missing (`lookupGovContractsContainer`).
- **`analysisError` set:** check `OPENAI_API_KEY` on the backend. A scanned PDF has no text to extract; fill in the details by hand.
- **Drive `DriveNotConfigured` / `DriveForbidden`:** the service-account env vars are not set, or the file is not shared with the service account.
- **Logs:** grep the backend logs for `case_study_outside_import`, `case_study_outside_analysis_failed` and `case_study_service_link_facts_failed`.
