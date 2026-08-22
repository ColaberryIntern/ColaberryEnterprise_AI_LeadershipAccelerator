# Tracking Dependency Map

**Session:** CC-20260821-m6t4 · **Base:** `bb152ded`

---

## Current flow

```
frontend/public/v1/track.js   (data-site="<slug>")
        │
        ├── POST /api/t/event      eventLimiter
        ├── POST /api/t/batch      batchLimiter
        ├── POST /api/t/heartbeat  heartbeatLimiter
        └── POST /api/t/identify   eventLimiter
                │
                ▼
        trackingController.handleTrackEvent
                │  validateTrackEvent()   ← rejects unknown event_type
                │  normalizeSiteSlug()    ← data-site, else HOST_TO_SITE_SLUG, else 'unknown'
                ▼
        visitorTrackingService
                findOrCreateVisitor(fingerprint, {...utm, site_slug})
                getOrCreateSession(visitorId, {...})
                recordPageEvent(sessionId, visitorId, {...})
                resolveIdentity(visitorId, leadId)    ← backfills session + page_event lead_id
                │
                ▼
        detectSessionSignals → computeIntentScore → evaluateVisitorForTriggers
                (fire-and-forget, errors logged not thrown)
```

## Hard-coded host map (the thing plan §50 says to keep during migration)

`backend/src/controllers/trackingController.ts:81`

```
enterprise.colaberry.ai       → enterprise
colaberry.ai / www            → colaberry
advisor.colaberry.ai          → advisor
trustbeforeintelligence.ai    → trustbeforeintelligence
worldoftaxonomy.com / www     → worldoftaxonomy
```

**Not in the map:** `training.colaberry.com`, `myfreeaiclass.com`, `cpn.org`,
`aiflotation.com`, `refactored.ai`. Traffic from those hosts today resolves to `'unknown'`
unless the tracker snippet carries `data-site`.

Migration rule (plan §50): preserve the fallback, add DB-backed `brand_domains` resolution in
front of it, **log when the legacy map is used**, remove only after parity is proven. No flag
day.

## Identity assertion surfaces (the security-relevant part)

`handleTrackEvent` accepts two unauthenticated identity claims from the browser:

| Param | Behavior today | Risk |
|---|---|---|
| `email` | looks up `Lead` by lowercased email, links visitor → lead | anyone who knows an email can bind their browser to that lead's journey |
| `lid` | links visitor → `Lead` by raw numeric id | enumerable; anyone can claim any lead id |

Both only fire when `visitor.lead_id` is not already set, which limits but does not remove the
exposure. Plan §10.1 requires new cross-domain flows to use **signed opaque tokens**
(`journeyLinkService`) instead. This project adds the signed path; it does **not** remove
`email`/`lid`, because live sites depend on them (plan §76 rule 3: no removing public APIs
without a compatibility alias).

## Where tenant/brand context must be stamped

| Point | Column set | Failure mode |
|---|---|---|
| `getOrCreateSession` | `tenant_id`, `brand_id`, `source_id`, `entry_point_id`, `campaign_id`, `campaign_lead_id`, `organization_id` | null context, event still recorded |
| `recordPageEvent` | same set | null context, event still recorded |
| `resolveIdentity` | ensure `LeadTenantContext`, update last-touch | logged, never throws |

## Performance constraint (plan §57)

`page_events` is the highest-write table in the system. Resolving
`site_slug → LeadSource → tenant_id + brand_id` on every event via a database round trip
would add a synchronous query per pageview.

**Required:** a bounded in-process cache with a short TTL, keyed on `site_slug` and on
`hostname`, holding the resolved `{tenantId, brandId, sourceId}` triple. Cache misses resolve
from the database; resolution failure yields `null` context and the event is still written.

## Downstream consumers that must not regress

- `behavioralSignalService.detectSessionSignals(sessionId)`
- `intentScoringService.computeIntentScore(visitorId)`
- `behavioralTriggerService.evaluateVisitorForTriggers(visitorId)`
- `visitorAnalyticsService` (admin dashboards)
- `contextGraphService` — depends on `page_events.lead_id` existing (see the model comment)

All of these query by `session_id` / `visitor_id` / `lead_id`, none by `site_slug`. Adding
nullable columns does not change their result sets. That is why the tracking change is
additive-safe.
