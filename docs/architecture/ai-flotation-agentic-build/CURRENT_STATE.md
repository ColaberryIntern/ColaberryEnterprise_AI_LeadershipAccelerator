# AI Flotation Agentic Build — Gate 0 Current State

- Date: 2026-09-03
- Session: CC-20260902-m8q4
- Branch: `workstream/ai-flotation-gate0`
- Base: `e99fdb35` (`origin/main`), clean worktree, verified before any reading

Gate 0 is discovery only. No feature code was written. This document records what the
repository **actually contains today**, measured, because the master plan says the repo
changes frequently and every point must be re-verified before code.

The prior Gate 0 in this repo (`CC-20260823-r4k9`) found that a plan written against a
stale checkout would have been designed around a service that had not existed for
thousands of commits. That is why this starts from a fresh `origin/main` worktree.

---

## 1. Corrections to the master plan

Five of the plan's stated assumptions are wrong or incomplete against current main. Each
one changes work.

### 1.1 Synthflow already exists — the plan searched for the wrong spelling

§7 and §55 say *"Planning-time repo search found no `syntheflow` symbol. If still absent,
treat Syntheflow as a new provider adapter."*

**The vendor is spelled `Synthflow`, with no second `e`.** Searching for it finds
configuration already in `backend/src/config/env.ts`:

```
SYNTHFLOW_API_KEY
SYNTHFLOW_CALLBACK_AGENT_ID
SYNTHFLOW_INTEREST_AGENT_ID
SYNTHFLOW_WELCOME_AGENT_ID
```

Three configured voice agents, not zero. `backend/src/services/callbackRequestService.ts`
exists alongside them.

**Consequence:** Gate 3 is not a greenfield provider integration. It is an audit of what
those three agents already do, followed by a decision about whether the AI Flotation
intake call is a fourth agent or a reuse of the callback agent. Treating it as new work
would build a second voice integration beside a working one — precisely the parallel
system §150 forbids.

### 1.2 PaySimple is the payment provider, and it cannot do subscriptions

§24 says to inspect for an existing provider and, if none exists, introduce a
`BillingProvider` seam.

One exists: `backend/src/services/paysimpleService.ts`, with
`createCustomer`, `findCustomerByEmail`, `findOrCreateCustomer`, `createPaymentLink`
(hosted), `deletePaymentLink`, `getPayment`. There is also
`backend/src/services/billing/` holding `billingGatewayState.ts`, `billingHealthCheck.ts`
and `billingHealthReport.ts`.

**It exposes no recurring, subscription, schedule or plan function.** It is one-time
hosted payment links.

**Consequence:** the §25 `BuildPlan` model — `billing_period`, `external_price_id`,
`active_delivery_lanes` — has **no provider capable of running it today**. That is the
largest commercial gap in the plan, and introducing a provider that can is a governance
boundary requiring recorded approval. See ESCALATION-1.

### 1.3 The lead → delivery conversion exists, and shipped hours before this plan

§7 and §29 correctly state the chain exists on main. For the record of provenance: it
landed today in PR #2043 (`leadConversion.ts` + `leadConversionPlan.ts`), with the
operator surface in #2045. It is transactional, idempotent on `organizations.lead_id`
and `delivery_engagements.source_lead_id`, and was proved dry against production.

**Consequence:** Gate 8 is largely already met. What Gate 8 still needs is the *import of
free project truth* into the activated project, not the conversion chain itself.

### 1.4 Trust Before Intelligence is wired at runtime, not only in documents

Gate 0 question 20 asks which TBI scores are runtime versus architecture-doc only.

`backend/src/modules/delivery/inpact.ts` holds canonical `InpactDimension`,
`INPACT_DIMENSIONS`, `INPACT_MEANINGS` and a 1–6 scoring range. It is consumed by
**`deliveryTrustGate.ts`, `releaseGate.ts`, `deliveryStoryContract.ts` and
`deliveryOpportunityMap.ts`** — release-gating code paths, not documentation.

**Consequence:** §19 and §65 must read from this module. Any new trust score would
diverge from a working one, which §153 lists as a stop condition.

### 1.5 The existing chat model cannot host the Project Room

Gate 0 question 4 asks what powers client-scoped AI, and §41 says to reuse existing chat
if it is generic enough.

Five conversation models exist: `ChatConversation`, `MayaConversationOutcome`,
`MentorConversation`, `OpenclawConversation`, `AgentManagerConversation`.
`ChatConversation` — the closest candidate — is keyed on `visitor_id`, `lead_id`,
`session_id`, `page_url`, `page_category`, `trigger_type`.

**It is a marketing-site visitor conversation. It has no project dimension at all.**

**Consequence:** §41's fallback applies. A delivery-scoped message domain
(`DeliveryConversation` / `DeliveryMessage`) is required, and reusing `ChatConversation`
would attach client delivery discussion to a visitor session that ends.

---

## 2. What already exists and must be reused

Verified present on `e99fdb35`:

| Area | Evidence | Plan reference |
|---|---|---|
| AI Flotation public app | `apps/ai-flotation-public/` with stable slugs (`sourceSlug: ai-flotation`), shared `platformApiBase`, no tenant/brand UUID in the browser | §7 |
| Brand theming for clients | `frontend/src/theme/deliveryBrandThemes.ts`, keyed on `brands.default_theme_key` | §8 |
| Delivery graph | `models/Delivery*` — Engagement, Project, ProjectMember, Decision, Release, Evidence, ClientAcceptance, ChangeRequest, Contract, Event, Story, Discovery, Opportunity | §7, §34 |
| Client-safe projection | `modules/delivery/clientVisibility.ts` — an explicit field allowlist per object kind, fail-closed | §7, §142 |
| Client auth | `modules/delivery/clientAuth.ts`, `clientMagicLink.ts`; sign-in proves identity, membership grants access | §7 |
| Agentic execution seam | `services/delivery/execution/` — `executionProviderContract.ts`, `claudeAgentSdkProvider.ts`, `executionOrchestrator.ts`, `executionPolicy.ts`, `executionPromptEnvelope.ts`, `executionRunState.ts` | §34, §83 |
| Tenancy | `modules/tenancy/` — `tenantAuthorization.ts`, `tenantAccessGuards.ts`, `organizationScope.ts`, `leadContextService.ts`, `tenantAccessAudit.ts` | §100 |
| CRM / attribution | `models/Visitor.ts`, `PageEvent.ts`, `Lead.ts`, `LeadSource.ts`, `LeadTenantContext.ts` | §76, §78 |
| Repo connect | `models/GitHubConnection.ts`, `docs/REPO_CONNECT_CONTRACT.md`, `docs/BUILD_PIPELINE_REQUIREMENTS.md` | §31 |
| Preview hosting | `services/previewStackService.ts`, `previewStackReaper.ts` (a reaper implies TTL discipline already exists) | §21 |
| Communications | `models/CommunicationPreference.ts`, `SenderProfile.ts`, `ExecutiveNotificationPolicy.ts` | §62, §63 |
| Free-intake contracts | `services/sbp/` — `buildLabContract.ts`, `capabilityInventory.ts`, `capabilityRepoReader.ts`, `buildStoryPrompt.ts` and more | §9 Q2 |

---

## 3. The defect that blocks the whole funnel

`backend/src/controllers/leadIngestionController.ts` **stores a lead and notifies nobody.**
No email, no alert, no outbound webhook.

The live `/start/` page tells a visitor their details *"reach the team that reads them"*.
That is true only if a human goes looking in a database table.

Everything in §61 (notification philosophy), §77 (funnel events) and the entire free
experience assumes an inbound is noticed. Today it is not. This is live right now on
aiflotation.com.

### The full diagnosis — it fails in two places, and one of them lies

Traced 2026-09-03. `handleLeadIngest` delegates to `leadIngestionService.handleIngest`,
whose **step 11** calls `routingEngineService.evaluateAndDispatch(lead, …)` — an async
rules engine that does not block the response. Rules are **data** (`RoutingRule` rows),
evaluated against facts including `source_slug`, and dispatched through
`routingActionsService.runAction`.

So the plumbing exists. It fails twice:

**1. There are zero routing rules.** `select count(*) from routing_rules` on production
returns **0**. The engine runs on every lead and finds nothing to match.

**2. `notify_sales` is a stub that reports success.**

```js
const notifySales: ActionHandler = async (action, ctx) => {
  // Stub: emit an Activity row; real email/slack wiring arrives with
  // the sales notification service. Not blocking ingest.
  await logActivity({ ... });
  return { ok: true, detail: { channel: action.channel || 'email' } };
};
```

It writes an Activity row and returns `ok: true`. **Even with a rule in place, the system
would report a successful notification and send nothing.** `send_pdf` has the same shape.

That second point is the serious one. A missing handler is an absence someone eventually
notices; a handler that returns `ok` is a positive signal that is false, and it would be
believed by any dashboard, test or operator reading routing outcomes.

It is the same failure class this repo already legislates against elsewhere —
`not_run != pass`, `waived != pass` — applied to a side effect instead of a check.

### The fix has two parts

1. **Implement `notify_sales` for real** — send through the existing shared path
   (`SenderProfile` for brand-safe identity, `communicationSafetyService.evaluateSend()`,
   `communicationLogService`), dedup on the lead so a retry cannot double-send, and
   **return `ok: false` when it did not send** rather than logging an intent and claiming
   success.
2. **Seed a routing rule** matching `source_slug == 'ai-flotation'`.

Neither is large. The first is what makes the second true.

---

## 4. Baseline tests

Full CI suite (`npx jest -c jest.ci.config.ts`) was started against this branch. Result
recorded in `BASELINE_TEST_RESULTS.md` when complete. Scoped runs are not sufficient here:
the CI config is the gate, and scoped local runs miss contract suites.

Local backend `tsc` cannot be used as a signal — the only TypeScript resolvable on this
machine is the root-hoisted **4.9.5**, which fails to parse `@types/d3-dispatch` and
`zod/v4`. CI's "Backend typecheck" is the authority.

---

## 5. Escalations

**ESCALATION-1 — subscription billing has no provider.**
§25 sells recurring "active delivery lanes". PaySimple does one-time hosted links.
Introducing a subscription-capable provider is an external dependency and a governance
boundary under this repo's rules; it needs recorded approval before Gate 7. A second tab
was separately exploring Stripe as an international rail, so this decision may already be
half-made elsewhere and should be reconciled rather than decided twice.

**ESCALATION-2 — voice already exists and is owned by another surface.**
Three Synthflow agents are configured. Whether AI Flotation gets a fourth agent, or
reuses the callback agent, changes who owns the phone number and the consent record. This
is a product decision, not an implementation detail.

---

## 6. Recommendation on sequence

The plan's gate order is sound, with one insertion: **the lead-ingest notification should
land before Gate 1**, not inside Gate 12.

It is hours of work, it is live-broken today, and every gate above it assumes a captured
lead reaches a person. Building the free Project AI experience on top of an intake nobody
is told about would mean the first real customer of the new funnel is lost exactly as
quietly as one would be lost today.
