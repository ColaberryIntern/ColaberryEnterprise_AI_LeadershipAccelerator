# Client identity — the Gate 2 question, answered

**Session:** CC-20260823-r4k9 · **Answered:** 2026-08-25 · **Handoff item 2**

---

## The question Gate 0 raised

> A client reviewer at an external company has no enrollment and no admin user. Whether
> `PlatformIdentity` + `PlatformIdentityLink` already support an identity linked to neither
> has **not been verified** — it needs a read of `modules/identity/platformIdentityService.ts`
> at Gate 2.
>
> — [CLIENT_PORTAL_MAP.md](CLIENT_PORTAL_MAP.md), Gate 0

Gate 2 did not close it. It stayed open through Gate 15 and blocked E2E scenario B.

## The answer: **YES. No schema change is needed.**

`PlatformIdentity` supports it today, and was designed for exactly this case.

### Evidence

**1. The model has no foreign key to either.**

```ts
primary_email: string;   // unique, the only required field
display_name?: string | null;
avatar_url?: string | null;
status?: 'active' | 'suspended';
```

No `enrollment_id`. No `admin_user_id`. Links live in a **separate child table**,
`PlatformIdentityLink`, whose `link_type` is `'lead' | 'enrollment' | 'admin_user'`. An
identity with **zero link rows is structurally valid** — nothing requires one to exist.

**2. The service creates one from an email alone.**

```ts
ensurePlatformIdentity({ email, displayName? })   // no enrollment, no admin user, no link
```

**3. Tenant access needs only the identity id.**

```ts
grantTenantMembership({ platformIdentityId, tenantId, brandId?, role })
```

**4. The model says so itself**, and names the motivating case:

> *"Critically, a PlatformIdentity does not require an Enrollment. `organizations` anchors on
> `owner_enrollment_id NOT NULL`, which is why a CPN community partner — who will never
> enroll in a course — cannot be modelled through the existing tables at all. That gap is
> the whole reason this table exists."*

A client reviewer at an external company is the same shape of person as that community
partner: real, authorized, and never a learner.

### So a client reviewer is representable end to end today

```
ensurePlatformIdentity({ email: 'reviewer@client.example' })    → standalone identity
grantTenantMembership({ platformIdentityId, tenantId, role })   → tenant access
DeliveryProjectMember (Gate 1) + CLIENT_REVIEWER (Gate 2)       → delivery-project access
```

Nothing in that chain touches `enrollments` or `admin_users`.

---

## The real blocker is narrower, and it is not this

**No authentication path authenticates a `PlatformIdentity`.** Verified: zero references to
`PlatformIdentity` or `platform_identity_id` anywhere in `backend/src/middlewares/`.

The model states this deliberately:

> *"This model is deliberately thin and deliberately NOT wired into any existing
> authentication path by this project. Introducing it additively means the identity graph
> can be populated and verified while every current login continues to work unchanged;
> making it a required participant in auth is a separate change with its own blast radius."*

So the accurate statement is:

| | Status |
|---|---|
| A client reviewer can be **represented** | ✅ today |
| A client reviewer can be **authorized** (tenant + delivery role) | ✅ today |
| A client reviewer can **log in** | ❌ no auth path resolves a `PlatformIdentity` |

**Gate 0's question is closed. A smaller, well-defined one replaces it:** how does a
`PlatformIdentity` with no enrollment and no admin user authenticate?

## Why that follow-on is not being built here

It modifies **authentication** — a governance boundary under root `CLAUDE.md`
("compliance or security posture"), and the model's own author called it "a separate change
with its own blast radius." Building it unilaterally as a side effect of a documentation
task would be exactly the wrong way to change how people log in.

### Options, for whoever takes it

| Option | Shape | Trade-off |
|---|---|---|
| **A. Magic-link to `primary_email`** | Client clicks a signed, expiring link; session carries `platform_identity_id` | No password to manage for an external party; depends on email deliverability, and §20 currently forbids live client invitations |
| **B. Google SSO** | Reuse the pattern `advisor.colaberry.ai` already uses for self-serve sign-in | No new credential store; assumes the reviewer has a Google identity |
| **C. Extend the admin session** to carry an optional `platform_identity_id` | Smallest diff | Risks conflating an operator session with a client one — the exact conflation Gate 10's projection exists to prevent |

**Recommendation: A or B, never C.** The client surface's whole safety property (Gate 10)
is that a client's session is not a builder's session. Making one session type able to be
either puts that property one boolean away from failing.

A second credential store is explicitly out — master plan §12: *"Do not create separate
Refactored usernames/passwords. Use PlatformIdentity."*

---

## Effect on the E2E scenarios

Scenario **B (AI Flotation client)** was listed as blocked on this question. It is now
blocked on something smaller and more concrete: **a login path for a linkless
`PlatformIdentity`**, plus the deploy that every scenario needs.

[E2E_SCENARIOS.md](E2E_SCENARIOS.md) should be read with that correction in mind.
