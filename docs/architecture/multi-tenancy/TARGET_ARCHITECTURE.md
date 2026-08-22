# Target Architecture

**Session:** CC-20260821-m6t4 · **Base:** `bb152ded`

---

## 1. Ecosystem tenant / brand map

```mermaid
graph TD
  P[Refactored.ai platform]
  P --> T1[Tenant: colaberry]
  P --> T2[Tenant: cpn]
  P --> T3[Tenant: ai-flotation]
  P --> T4[Tenant: refactored]

  T1 --> B1[Brand: colaberry-enterprise]
  T1 --> B2[Brand: colaberry-training]
  T2 --> B3[Brand: cpn]
  T3 --> B4[Brand: ai-flotation]
  T4 --> B5[Brand: refactored]

  B1 --> D1["enterprise.colaberry.ai (web)<br/>colaberry.com (email)"]
  B2 --> D2["training.colaberry.com (web)<br/>myfreeaiclass.com (web)"]
  B3 --> D3["cpn.org (web + email)<br/>links.cpn.org (tracking)"]
  B4 --> D4["aiflotation.com (web + email)<br/>links.aiflotation.com (tracking)"]
  B5 --> D5["refactored.ai (web + email)<br/>track.refactored.ai (tracking)"]
```

One tenant may own several brands. Colaberry does; the other three do not, yet. That is
exactly why tenant and brand are separate tables rather than one.

## 2. Identity model

```mermaid
graph LR
  PI[platform_identities<br/>one human]
  PI --> L1[link: lead]
  PI --> L2[link: enrollment]
  PI --> L3[link: admin_user]
  L1 --> LEAD[(leads)]
  L2 --> ENR[(enrollments)]
  L3 --> ADM[(admin_users)]
  PI --> TM[tenant_memberships<br/>tenant + brand + role]
  TM --> TEN[(tenants)]
```

The three existing identity tables are untouched. `platform_identity_links` bridges them,
with `UNIQUE(link_type, linked_entity_id)` so one lead can belong to exactly one human.

## 3. Lead + tenant context

```mermaid
graph TD
  LEAD["leads #12482<br/>jasmine@example.com<br/>ONE canonical person"]
  LEAD --> C1["lead_tenant_contexts<br/>cpn / cpn<br/>scholarship_applicant"]
  LEAD --> C2["lead_tenant_contexts<br/>colaberry / training<br/>learner"]
  LEAD --> C3["lead_tenant_contexts<br/>colaberry / enterprise<br/>participant"]
  C1 --> P1["consent, pipeline stage,<br/>first + last touch"]
  C2 --> P2["consent, pipeline stage,<br/>first + last touch"]
  C3 --> P3["consent, pipeline stage,<br/>first + last touch"]
```

Consent lives on the context, not the lead. Consenting to CPN scholar updates grants
AI Flotation nothing.

## 4. Anonymous visitor to identified lead

```mermaid
sequenceDiagram
  participant B as Browser
  participant T as /api/t/event
  participant R as tenantResolver
  participant V as visitorTrackingService
  participant I as /api/ingest
  participant LC as leadContextService

  B->>T: pageview + data-site="cpn"
  T->>R: resolve(site_slug) [cached, 5min TTL]
  R-->>T: {tenantId, brandId, sourceId}
  T->>V: getOrCreateSession(+context)
  T->>V: recordPageEvent(+context)
  Note over T: unresolved => null context,<br/>event still recorded (fail-soft)
  B->>I: form submit ?source=cpn&entry=scholarship_interest
  I->>I: RawLeadPayload, HMAC, normalize, createLead
  I->>LC: ensureLeadTenantContext(lead, tenant, brand)
  LC-->>I: context created, first-touch stamped
```

## 5. Cross-domain journey

```mermaid
sequenceDiagram
  participant O as cpn.org
  participant J as journeyLinkService
  participant D as training.colaberry.com
  participant S as /api/t/identify

  O->>J: createJourneyToken({visitor, lead, campaign, originBrand})
  J-->>O: base64url(payload).hmac  (NO email, 30 min TTL)
  O->>D: link ?jx=<token>
  D->>S: POST identify {jx}
  S->>J: verifyJourneyToken
  alt valid
    J-->>S: identifiers only
    S->>S: associate destination session, record transition
  else tampered / expired
    J-->>S: null
    S->>S: reject, no association
  end
```

The v1 `?email=` path still works for existing sites and is logged. New ecosystem flows
use `jx` only.

## 6. Campaign to Mandrill

```mermaid
graph TD
  C["campaigns<br/>tenant_id, brand_id, sender_profile_id"]
  C --> R{resolveCampaignSender}
  R -->|1| SP[sender_profile_id]
  R -->|2| BD["brand default<br/>(logged deprecated)"]
  R -->|3| LG["settings.sender_email<br/>(logged deprecated)"]
  R -->|4| PD["platform default<br/>(logged deprecated)"]
  SP --> X{cross-brand?}
  X -->|yes| ERR["SenderBrandMismatchError<br/>ContractViolation<br/>NO provider call"]
  X -->|no| PF{preflight}
  BD --> PF
  LG --> PF
  PD --> PF
  PF -->|live + fail| BLOCK["SenderPreflightError<br/>send blocked"]
  PF -->|test mode| OK
  PF -->|pass| OK[Mandrill adapter]
  OK --> MD["metadata:<br/>tenant, brand, campaign,<br/>lead, campaignLead, senderProfile"]
```

## 7. Tenant authorization request flow

```mermaid
graph TD
  REQ[request] --> ID{platform identity?}
  ID -->|no| DENY1["emptyContext<br/>tenantScopeWhere = tenant_id: null<br/>matches NOTHING"]
  ID -->|yes| M[load active tenant_memberships]
  M -->|db error| DENY2["fail closed<br/>no access"]
  M --> SEL{requested tenant}
  SEL -->|superadmin| ANY[any tenant]
  SEL -->|member| OK[that tenant]
  SEL -->|not a member| NULLT["tenantId = null"]
  OK --> ROLES["roles scoped to THAT tenant only<br/>(no cross-tenant role bleed)"]
  ROLES --> G{guard}
  G -->|foreign tenant row| E404["404 TenantIsolationViolation"]
  G -->|missing permission| E403["403 AuthorizationError"]
  G -->|ok| PROCEED
```

Resolution fails soft. Authorization fails closed. That asymmetry is the core invariant.

## 8. Extraction boundaries

```mermaid
graph LR
  subgraph apps
    A1[cpn-public]
    A2[ai-flotation-public]
    A3[refactored-public]
  end
  subgraph packages
    K1[app-build]
    K2[brand-system]
    K3[tracking-sdk]
  end
  BE[backend HTTP API]
  A1 --> K1 & K2 & K3
  A2 --> K1 & K2 & K3
  A3 --> K1 & K2 & K3
  A1 -.HTTP.-> BE
  A2 -.HTTP.-> BE
  A3 -.HTTP.-> BE
  A1 -x A2
  A1 -x BE
```

Enforced by `scripts/validate-app-boundaries.js`, which exits non-zero on a forbidden
edge. Verified to fail on a deliberately planted violation, not merely to pass.

## 9. Organization membership

```mermaid
graph TD
  T[(tenants)] --> O["organizations<br/>+ tenant_id, brand_id, organization_type"]
  O --> OM["org_members<br/>+ platform_identity_id"]
  O --> OC[org_cohorts]
  OM --> ENR[(enrollments)]
  OM --> PI[(platform_identities)]
  O -.unchanged.-> OE["owner_enrollment_id<br/>NOT NULL UNIQUE"]
```

`owner_enrollment_id` is deliberately untouched. Making organizations creatable without
an enrollment is real work on the registration path and belongs to the CPN product
project.

## 10. Intelligence tenant isolation

```mermaid
graph TD
  Q[intelligence query] --> CTX{allowed tenant context}
  CTX -->|absent| DENY[deny]
  CTX -->|tenant operator| SCOPED["filter: tenant_id IN authorized"]
  CTX -->|platform.cross_tenant| ALL[ecosystem-wide]
  SCOPED --> G1[graph nodes]
  SCOPED --> G2[graph edges]
  SCOPED --> G3[decision logs]
  ALL --> G1 & G2 & G3
```

Cross-tenant reasoning requires the explicit `platform.cross_tenant` permission, which
only `platform_super_admin` carries. Holding an admin token grants it nothing.
