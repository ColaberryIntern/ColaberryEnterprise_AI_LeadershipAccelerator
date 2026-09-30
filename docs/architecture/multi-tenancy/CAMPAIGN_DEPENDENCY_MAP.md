# Campaign Dependency Map

**Session:** CC-20260821-m6t4 · **Base:** `bb152ded`

Plan §14 requires every campaign-owning or campaign-processing table to be inventoried and
classified. This is that inventory, verified present in `backend/src/models/` at `bb152ded`.

---

## Classification

| Model / table | Class | Scope path | Change required |
|---|---|---|---|
| `Campaign` | **BRAND-OWNED** | `tenant_id` + `brand_id` | add `tenant_id`, `brand_id`, `organization_id`, `sender_profile_id` |
| `CampaignLead` | CAMPAIGN-DERIVED | → `campaign_id` | scope by join |
| `ScheduledEmail` | CAMPAIGN-DERIVED | → `campaign_id` | scope by join; sender resolved at send time |
| `CommunicationLog` | CAMPAIGN-DERIVED + LEAD-DERIVED | → `campaign_id`, `lead_id` | scope by join |
| `InteractionOutcome` | LEAD-DERIVED | → `lead_id`, `campaign_id` | scope by join |
| `CampaignHealth` | CAMPAIGN-DERIVED | → `campaign_id` | scope by join |
| `CampaignError` | CAMPAIGN-DERIVED | → `campaign_id` | scope by join |
| `CampaignVariant` | CAMPAIGN-DERIVED | → `campaign_id` | scope by join |
| `CampaignInsight` | CAMPAIGN-DERIVED | → `campaign_id` | scope by join |
| `CampaignTestRun` | CAMPAIGN-DERIVED | → `campaign_id` | scope by join |
| `CampaignTestStep` | CAMPAIGN-DERIVED | → `test_run_id` → `campaign_id` | scope by join |
| `CampaignSimulation` | CAMPAIGN-DERIVED | → `campaign_id` | scope by join |
| `CampaignSimulationStep` | CAMPAIGN-DERIVED | → `simulation_id` → `campaign_id` | scope by join |
| `CampaignExperiment` | CAMPAIGN-DERIVED | → `campaign_id` | scope by join |
| `CampaignDeployment` | CAMPAIGN-DERIVED | → `campaign_id` | scope by join |
| `CampaignGovernanceConfig` | CAMPAIGN-DERIVED | → `campaign_id` | scope by join |
| `LeadRecommendation` | CAMPAIGN-DERIVED | → `campaign_id` | scope by join |
| `FollowUpSequence` | **TENANT-OWNED (reusable content)** | `tenant_id` | add nullable `tenant_id`; `NULL` = shared platform library |
| `UnsubscribeEvent` | **GLOBAL PLATFORM DATA** | `lead_id` | **no change** — infrastructure suppression is address-level, not brand-level |
| `communication_preferences` | **BRAND-OWNED** | `tenant_id` + `brand_id` | NEW table |

**No `EmailSuppression` model exists.** Suppression is `UnsubscribeEvent` +
`unsubscribeRoutes.ts` + bounce handling in `mandrillWebhookController.ts`.

## Why only `Campaign` gets tenancy columns

Seventeen of the tables above are children of `campaigns`. Stamping `tenant_id` on each would
mean seventeen backfills and seventeen opportunities for a child row's tenant to drift out of
sync with its parent's. A campaign's tenant is immutable once assigned, so the join is both
cheaper and safer than duplication. `FollowUpSequence` is the exception because a sequence is
reusable content that can exist without a campaign.

## Current sender resolution (the thing being replaced)

```
backend/src/services/schedulerService.ts:879-893

  const campaign = await Campaign.findByPk(action.campaign_id,
                     { attributes: ['channel','type','settings'] });
  const settings = campaign.settings || {};
  if (settings.sender_email) senderEmail = settings.sender_email;
  if (settings.sender_name)  senderName  = settings.sender_name;
```

That is the whole per-campaign sender story. Untyped JSONB, read at send time, with a
module-level default when absent. No verification of any kind.

## Target resolution (plan §15.1)

```
Campaign(tenant_id, brand_id, sender_profile_id)
        │
        ▼
senderProfileService.resolveForCampaign(campaign)
        │  1. sender_profile_id present?  → load
        │  2. else default profile for (tenant, brand)?  → load + log deprecation
        │  3. else legacy settings.sender_email?          → synthesize + log deprecation
        │  4. else module default                          → log deprecation
        ▼
preflight(profile):  status==='active'
                     sending domain verification_status==='verified'
                     spf/dkim pass, dmarc configured
                     unsubscribe_url present
                     physical_mailing_address present
        │
        ├── live send + preflight fail  → BLOCK (fail closed)
        └── test-mode send              → allowed, preflight recorded not enforced
        ▼
Mandrill adapter — attaches metadata tenant/brand/campaign/lead/campaignLead
```

Steps 2–4 are the compatibility ramp plan §51 mandates: prefer `sender_profile_id`, demote the
legacy JSONB read to a logged fallback, remove the fallback in a later project once usage is
zero. **Not a flag day.**

## Webhook attribution (plan §15.3, §27.5)

`mandrillWebhookController` currently maps provider events back to `lead_id` /
`scheduled_email_id` via Mandrill metadata. Adding `tenant`, `brand`, `campaign`,
`campaignLead` and `senderProfile` tags at send time lets the webhook restore full ecosystem
context before writing activity. Existing metadata keys must be preserved — the webhook must
keep working for messages already in flight that carry only the old keys.

## Cross-brand negative test (plan §39)

`CPN campaign + AI Flotation SenderProfile` must fail **before** the provider call, in the
resolver, with a `ContractViolation` error class — not at Mandrill, and not silently.
