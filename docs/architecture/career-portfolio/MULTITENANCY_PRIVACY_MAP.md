# MULTITENANCY_PRIVACY_MAP (Gate 0 · plan §2.8, §26, §56)

## Tenancy surface on main

Models: `Tenant`, `Brand`, `BrandDomain`, `PlatformIdentity`, `PlatformIdentityLink`,
`TenantMembership`, `TenantAccessAudit`, `Organization`, `LeadTenantContext`.
Prior analysis: `docs/architecture/multi-tenancy/`.

## Why the boundary is narrow for this increment

The general multi-tenant risk in the plan (§26, §31, §54-J/K) is about **publication**: a
confidential client project leaking into a public portfolio or the talent network.

This increment **publishes nothing**. There is no public route, no snapshot, no slug, no
talent card. The only reachable surface is authenticated and self-scoped.

## Isolation mechanism

Every route resolves the subject as `req.participant!.sub` — the caller's own enrollment id
from their verified session token, following `capePortalController`'s `eid(req)` convention.

**No route accepts an enrollment id, slug, or user id as a parameter.** There is no
`/api/portal/career/:enrollmentId` shaped endpoint. Cross-tenant read is therefore not merely
blocked by a check that could be bugged — it is unrepresentable in the URL space.

That directly answers plan §54-K ("foreign user → cannot read private career data → no
enumeration"): there is nothing to enumerate.

## Confidentiality states (plan §26)

`private` / `anonymized_public` / `public` are **not implemented**, because no project is
publishable in this increment. Every career projection is implicitly `private`.

When Gate 10 lands, this is the file that must gain the projection rules before any public
snapshot is minted — and the review gate (Gate 9) must be able to see and block on client
confidentiality warnings.

## What must never cross the boundary (for the record)

Uploaded resume bytes, `resume_text`, private repo URLs and contents, client names, internal
docs, secrets, unverified metrics, and any evidence sourced from a tenant the viewer does not
belong to. None of these is emitted by this increment: the API returns resume *presence and
filename*, never resume content.
