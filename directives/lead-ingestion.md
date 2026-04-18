# Lead Ingestion Directive

## Goal
Provide a single, source-agnostic lead ingestion pipeline that accepts form submissions and webhook deliveries from any Colaberry-owned property (colaberry.ai, trustbeforeintelligence.ai, advisor.colaberry.ai, future sites) and channels them through a consistent normalization, deduplication, attribution, and routing flow that terminates in the existing `leads` table and downstream automations.

## Non-Goals
- Do not replace `POST /api/leads` — it stays as the first-party contact form endpoint.
- Do not replace `POST /api/webhooks/advisory` — the advisor sync path already works and must keep working unchanged.
- Do not introduce a new sessions/attribution system. Reuse `Visitor` + `VisitorSession`.
- Do not introduce a new events table for per-lead events. Reuse `Activity` (with `metadata.subtype`) and `EventLedger`.

## Inputs
- HTTP POST to `POST /api/leads/ingest?source=<slug>&entry=<slug>`
- Body: JSON (preferred) or form-encoded. Any shape.
- Optional headers: `X-API-Key`, `X-Webhook-Signature: sha256=<hex>`, `X-Session-Id`.
- Visitor fingerprint / session ID (when the embed JS is present).
- Source + entry-point registry rows (`lead_sources`, `entry_points`, `form_definitions`).
- Routing rules (`routing_rules`).

## Outputs
- A row in `raw_lead_payloads` for every request (success or failure).
- A row in `leads` (new or upserted by email unique index).
- Activity entries (`type: 'system'`, `metadata.subtype`: `form_submit`, `routing_action`, `routing_action_failed`, `skipped_action`).
- Routing actions dispatched asynchronously (send PDF, enroll in campaign, notify sales, create deal, tag lead, trigger booking flow).
- 200 response with `{ success, lead_id, is_new_lead, normalized, routing_actions[] }`.

## Edge Cases
- **Unknown source/entry slug** → 400 with `raw_payload_id`; `raw_lead_payloads.status = 'rejected'`.
- **HMAC invalid** when source requires it → 403; `status = 'rejected'`.
- **Missing email AND phone** → 400; `status = 'rejected'`.
- **Concurrent same-email submits** → existing unique index on `LOWER(email)` handles it inside `leadService.createLead`.
- **Routing action failure** (SMTP / CRM 500) → ingest still returns 200; log `routing_action_failed` Activity; retried by scheduler.
- **Duplicate delivery** across `/api/webhooks/advisory` and `/api/leads/ingest` → distinct source slugs prevent overlap. Advisory path sets `advisory_session_id`; ingest path uses the `advisor` source only if the caller is a non-advisor-app integration.
- **PII in `raw_lead_payloads.body`** → 30-day retention; email/phone redactor runs after lead row confirmed.

## Safety Constraints
- Rate limiting: mirror the existing `POST /api/leads` rate limit (5 req / 15 min per IP). Per-source override via `lead_sources.rate_limit` (future).
- HMAC secrets live in env vars referenced by `lead_sources.hmac_secret` (column stores env var name, not the raw secret). `hmac_secret_prev` provides 24h rotation grace.
- Never log raw secrets, raw API keys, or raw bodies containing PII at INFO level.
- Autonomous mode `AUTONOMOUS_AUTOAPPLY=false` by default — suggested routing rules require human click to apply. Each applied suggestion writes an `EventLedger` entry.
- Purely additive database changes: new tables + nullable columns only. No destructive alter. No changes to `leadService.createLead`, `advisorySyncController`, or `leadController.submitLead`.

## Verification Expectations
- Unit tests for `leadIngestionService.normalize`, `routingEngineService.evaluate`, HMAC verifier, field-map applier.
- Integration test: end-to-end curl → `raw_lead_payloads` row + `leads` row + `activities` row.
- Regression test: advisory webhook flow still creates a lead with `advisory_session_id` set, routing rules do not double-fire.
- Manual e2e checklist per the Universal Lead Ingestion plan (see `.claude/plans/snappy-baking-tide.md`).

## Architecture Layer Placement
- **Layer 3 (Execution)**: `backend/src/services/{leadIngestionService,routingEngineService,routingActionsService,ingestStatsService}.ts`; `backend/src/controllers/{leadIngestionController,generatorController}.ts`; `backend/src/jobs/autonomousIngestInsights.ts`.
- **Layer 4 (Verification)**: Jest tests alongside each service/controller under `__tests__/`.
- **Layer 1 (Directives)**: This file.
- **Layer 2 (Orchestration)**: Claude, via the phased plan in `.claude/plans/snappy-baking-tide.md`.

## Owner
Ali Muwwakkil (ali@colaberry.com). Production runtime: `enterprise.colaberry.ai`.
