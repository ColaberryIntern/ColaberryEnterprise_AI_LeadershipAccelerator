# Handoff - Services Upgrade SV3 (Our Services rebuilt to the evidence mockup)

**State:** built and tested, with a PR open. NOT merged, NOT deployed, NOT production-verified (owner hard limit for
this run). Frontend only; it reads the SV1 and SV2 backend routes, which must be live first.

## Before the deploy (operator)
1. **SV1 and SV2 must already be deployed.** The page reads `GET /api/admin/factory/services/evidence-summary` (SV2)
   and links through the SV1 routes (`case-studies/external`, `propose-service`, `promote`). Without SV2 the page
   shows "Could not load the evidence summary" with a Retry button and no evidence numbers; nothing else breaks.
2. **No migration, no backend change, no env change.**
3. **Deploy:** the frontend is compiled into the nginx image (`nginx/Dockerfile`; there is no separate frontend
   service in `docker-compose.production.yml`), so this is `scripts/deploy-prod.sh nginx`.
   - Production runs in REGISTRY mode: it pulls the image CI publishes for the merge commit. Wait for the
     `build-images` workflow on the merge commit to finish (and not be cancelled by a later merge) before deploying,
     or the deploy serves the pre-merge bundle and still reports success.
   - A merged frontend route is not live until nginx is rebuilt or re-pulled.

## Test steps after the deploy (production: https://enterprise.colaberry.ai)
Log in as an admin and open **Admin > Program > Our Services** (`/admin/gov-services`).

1. **The page loads in mockup order.** Expect, top to bottom: six KPI tiles, "Decide now" (four cards), "How Our
   Services grows" (five steps + the lifecycle diagram), "Evidence by service" and "Where to invest next",
   "Evidence health" / "Catalog growth" / "Proof by service family", "Service catalog", "Service × industry
   coverage", "Case study intake", "Gaps from live proposals".
2. **Numbers match the API.** In DevTools > Network, open the `evidence-summary?status=all` response.
   - "Blocked case studies" equals `decideNow.blockedCaseStudies.count`, and the Intake badge says the same.
   - On 2026-11-13 production had 0 confirmed links, so expect: every service at score 0 / "No proof", "Linked case
     studies" 0, the evidence bar chart, family chart and heatmap showing "No confirmed case studies yet. Link one
     from Intake.", and every published case study waiting in Intake.
   - If `opportunityFeed.source` is not `live`, "Where to invest next" explains that matches are unavailable and the
     Gov matches column shows "—" (never 0).
3. **Catalog filter.** Click Active, Growth 🌱, Needs evidence ⚠️, All. Only the rows change; no new network call.
   Open a row: its confirmed case-study cards appear, or the dashed "No case study linked yet" note.
4. **Intake gate.** On an Intake card, untick every suggestion: the footer reads "🔒 Pick at least one service" and
   the Link button is disabled. Tick one: "🔓 Ready: 1 service selected". Click Link (& publish).
   Expect: a green notice, the card leaves Intake, the service's score and Inside/Outside count rise, and the
   Blocked KPI drops by one. In the Network tab the click is `POST /api/admin/factory/service-links/<id>/decide`
   with `{"state":"confirmed"}`, once per ticked suggestion.
5. **New service from Intake.** On another card click "🌱 New service", enter a name, "Create service & link".
   Expect: a notice naming the new Growth service; it appears under the Growth filter with Promote enabled.
6. **Promote.** Promote is disabled (with a tooltip) on a growth service that has no confirmed case study; enabled
   once it has one. Clicking it moves the service to Active.
7. **Outside import.** "📥 Add outside case study" > Upload file: pick the AgTech fixture PDF from
   `backend/src/services/caseStudy/__tests__/fixtures/outside-case-studies/`. Expect a per-file result ("Created"),
   then "Done: go to Intake" scrolls to the new card. Import the same file again: "Already imported".
   The Drive tab takes a file or folder id (manual import only).
8. **Proposal gaps.** Each open pursuit with Partly/New capabilities lists them with buyer and a Central-time
   deadline. "Re-assess fit" opens `/admin/gov-qualification?gws=<key>&tab=fit`.
9. **Fit step proof (SV3.5).** In a pursuit's Fit step, re-assess. "We have it" rows show "Proof:" chips (or "No
   confirmed case study is linked to this service yet"); Partly/New rows with `possibleProof` show "💡 Possible
   unlinked proof" with a link to `/admin/gov-services#intake`, which lands on the Intake section.
10. **Existing modal still works.** Add service, Edit (description prefilled), Retire, and Evidence (the existing
    per-service link panel; closing it refreshes the page's numbers).

## Regressions to watch
- The old page fetched `services?status=active|growth|all` per filter; the new one fetches `status=all` once and
  filters in the browser. Retired services appear only under "All", as before.
- Retire is now offered on growth services too (it was active-only). Retire is reversible through Edit.

## Rollback
Revert the merge commit on `main`, wait for the image build, and run `scripts/deploy-prod.sh nginx`. No data or
schema is involved; the page only reads, and every write it makes goes through the existing SV1/link routes.

## Troubleshooting
- **"The government contracts workspace is not configured."** The summary route returned 503: the `refactored`
  tenant or the gov org/engagement is missing (`lookupGovContractsContainer`).
- **Diagram shows "Diagram preview unavailable".** `MermaidDiagram` loads Mermaid from the jsDelivr CDN at runtime;
  a CSP or network block shows the fallback card. The five-step strip above it still carries the content.
- **A Link click shows an error on the card.** The decide route refused (for example, the link was already
  decided in another tab). Reload; the card reflects the server.
