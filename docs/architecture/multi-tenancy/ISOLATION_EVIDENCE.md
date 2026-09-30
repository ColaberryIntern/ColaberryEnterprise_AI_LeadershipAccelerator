# Tenant Isolation: Evidence of Control

**GENERATED FILE. Do not edit by hand.**

Produced by `backend/src/scripts/generateIsolationEvidence.js`, which runs the isolation tests and reports their real results. Every line below reflects a test that actually ran at the commit named here. If a test is removed its line disappears; if a test fails the document says so. It cannot drift from the behaviour it certifies, because it is not written independently of it.

- **Commit:** `bfbf66769aa142c13ab9fe83120e1d96979e7264`
- **Generated:** 2026-08-22T09:47:38.949Z
- **Checks passed:** 73
- **Checks failed:** 0

**Result: every isolation check passed at this commit.**

---

## Why this exists

Career Pathways Network is a separate legal entity, and its data isolation is a formal grant and donor commitment rather than an internal preference. A control that silently works produces no evidence that it worked. **The refusals are the evidence**: a record containing only successful reads would demonstrate nothing about a boundary.

## Controls and what each one asserts

### Access control

An operator can reach only the tenants they hold an active membership in. Roles do not carry from one tenant into another. Unclassified records are reachable only by a platform administrator. A request with no identity matches no records at all.

_21 checks passed, 0 failed._

- `PASS` buildRequestContext › gives an unauthenticated request no access at all
- `PASS` buildRequestContext › auto-selects the tenant when the identity belongs to exactly one
- `PASS` buildRequestContext › refuses to guess when the identity belongs to several tenants
- `PASS` buildRequestContext › ignores a requested tenant the identity has no membership in
- `PASS` buildRequestContext › does not carry roles from one tenant into another
- `PASS` buildRequestContext › lets a platform superadmin operate in a tenant they hold no membership in
- `PASS` buildRequestContext › fails closed when memberships cannot be read
- `PASS` buildRequestContext › honours a brand-scoped membership and refuses a brand outside it
- `PASS` buildRequestContext › treats a null brand_id membership as covering every brand in the tenant
- `PASS` tenantScopeWhere › is unrestricted for a platform superadmin
- `PASS` tenantScopeWhere › pins to the selected tenant
- `PASS` tenantScopeWhere › matches NOTHING for a context with no memberships
- `PASS` canAccessTenant › denies a row owned by another tenant
- `PASS` canAccessTenant › denies an unclassified (null-tenant) row to a normal operator
- `PASS` canAccessTenant › allows the platform superadmin to reach unclassified rows
- `PASS` guards › raises 404, not 403, for a foreign tenant’s row
- `PASS` guards › raises 403 for a missing permission inside an authorized tenant
- `PASS` guards › blocks a non-superadmin from ecosystem operations
- `PASS` guards › requireBrandAccess: foreign tenant is 404, wrong brand in own tenant is 403
- `PASS` role registry wiring › grants a marketer campaign.send but not sender.write
- `PASS` role registry wiring › grants an unknown role nothing

### Audit trail

Every boundary decision is recorded, refusals included, before any error is raised. Cross-tenant administrator access is recorded on the permitted path as well. The audit never changes an access outcome: if the audit store is unreachable the boundary still holds and the lost record is reported.

_13 checks passed, 0 failed._

- `PASS` the denials are the evidence › records a cross-tenant denial and still throws 404
- `PASS` the denials are the evidence › writes the audit row BEFORE throwing, so a swallowed error still leaves evidence
- `PASS` the denials are the evidence › records an unauthenticated attempt rather than ignoring it
- `PASS` the denials are the evidence › records a permission denial with the permission under test
- `PASS` allowed access is recorded too › records a permitted read
- `PASS` allowed access is recorded too › records a superadmin crossing tenants, which is the most sensitive allowed action
- `PASS` brand scope keeps isolation and permissions distinguishable › a foreign tenant is recorded as an isolation event
- `PASS` brand scope keeps isolation and permissions distinguishable › a wrong brand inside your own tenant is recorded as a permissions gap, not isolation
- `PASS` the audit can never change the outcome › still DENIES when the audit table is unreachable
- `PASS` the audit can never change the outcome › still ALLOWS legitimate work when the audit table is unreachable
- `PASS` the audit can never change the outcome › shouts when a row is dropped, carrying the record it could not persist
- `PASS` correlation and provenance › carries the correlation id, actor email and ip through to the row
- `PASS` correlation and provenance › stamps occurred_at on every row

### Contact confidentiality

One person may hold relationships with several brands without those relationships being visible to each other. Consent is recorded per brand and is never inherited across brands or silently withdrawn.

_14 checks passed, 0 failed._

- `PASS` ensureLeadTenantContext — creation › creates a context stamped with first AND last touch when none exists
- `PASS` ensureLeadTenantContext — creation › defaults consent to false — a new brand relationship never inherits consent
- `PASS` ensureLeadTenantContext — creation › records consent with its source when the form actually granted it
- `PASS` ensureLeadTenantContext — first touch is write-once › never overwrites a first-touch field that is already set
- `PASS` ensureLeadTenantContext — first touch is write-once › fills a first-touch field that is still null — completion is not overwriting
- `PASS` ensureLeadTenantContext — first touch is write-once › always advances last touch
- `PASS` ensureLeadTenantContext — idempotency › reuses the existing row rather than creating a second relationship
- `PASS` ensureLeadTenantContext — idempotency › reports a replayed identical call as not-updated
- `PASS` ensureLeadTenantContext — idempotency › never silently revokes consent when a later form omits the checkbox
- `PASS` getAuthorizedLeadContexts — cross-tenant confidentiality › hides another tenant’s relationship from a tenant-scoped operator
- `PASS` getAuthorizedLeadContexts — cross-tenant confidentiality › returns nothing for an operator with no memberships
- `PASS` getAuthorizedLeadContexts — cross-tenant confidentiality › returns every relationship to the platform superadmin
- `PASS` hasBrandRelationship › is true when a context row exists
- `PASS` hasBrandRelationship › is false when it does not

### Outbound identity

A campaign cannot send using another brand’s sending identity; the attempt is refused before any message reaches the provider. Live sending is refused until the sending domain is verified and the required legal footer details are present.

_15 checks passed, 0 failed._

- `PASS` resolveCampaignSender — resolution order › prefers the campaign’s explicit sender profile
- `PASS` resolveCampaignSender — resolution order › falls back to the brand default and logs the deprecation
- `PASS` resolveCampaignSender — resolution order › falls back to legacy JSONB settings — today’s campaigns keep working
- `PASS` resolveCampaignSender — resolution order › falls back to the platform default when nothing is configured
- `PASS` resolveCampaignSender — cross-brand rejection › refuses a sender profile belonging to another brand, before any provider call
- `PASS` resolveCampaignSender — cross-brand rejection › classifies the mismatch as a ContractViolation
- `PASS` preflightSender › passes for an active profile on a fully healthy domain
- `PASS` preflightSender › accepts a configured-but-not-passing DMARC (p=none is a valid rollout posture)
- `PASS` preflightSender › reports every failure at once, not just the first
- `PASS` preflightSender › fails a legacy-fallback sender — nothing about it has been verified
- `PASS` assertCanSendLive › blocks a live send when preflight fails
- `PASS` assertCanSendLive › permits a test-mode send and still reports the failures
- `PASS` assertCanSendLive › permits a live send when everything is healthy
- `PASS` buildProviderMetadata › carries every identifier the webhook needs to restore context
- `PASS` buildProviderMetadata › omits identifiers that are genuinely absent rather than emitting nulls

### Cross-site identification

Context passed between sites carries identifiers only and never an email address. Links expire, and altered or expired links are refused.

_10 checks passed, 0 failed._

- `PASS` createJourneyToken / verifyJourneyToken › round-trips every identifier
- `PASS` createJourneyToken / verifyJourneyToken › carries no email or other PII in the encoded payload
- `PASS` createJourneyToken / verifyJourneyToken › rejects a tampered payload
- `PASS` createJourneyToken / verifyJourneyToken › rejects a tampered signature
- `PASS` createJourneyToken / verifyJourneyToken › rejects an expired token
- `PASS` createJourneyToken / verifyJourneyToken › rejects malformed input without throwing
- `PASS` createJourneyToken / verifyJourneyToken › rejects a token whose payload is not valid JSON
- `PASS` createJourneyToken / verifyJourneyToken › defaults every identifier to null when nothing is supplied
- `PASS` buildJourneyUrl › appends the token as ?jx= and preserves existing query params
- `PASS` buildJourneyUrl › never puts an email in the URL

## Scope and limits, stated plainly

- These are automated checks of the enforcement logic. They are not a penetration test and they are not an independent audit.
- They cover the tenancy layer. They do not cover physical security, database administrator access, backup handling, or any control outside this application.
- The audit trail records decisions made through the audited guards. A code path that bypasses those guards would not appear here, which is why the guards are the single place a boundary decision is made.
- Whether any scholarship applicants are minors remains unanswered, and it carries retention and consent obligations that are separate from tenant isolation.
