# Authorization Matrix

**Session:** CC-20260823-r4k9 · **Base:** `d1d46d1e` · **Gate:** 0

Answers the Gate 0 question *"How will project roles coexist with tenant roles?"* and
maps master plan Gate 2 onto what already enforces authorization on `main`.

---

## 1. What exists: two separate systems, both real

### 1a. Tenant roles — `backend/src/modules/tenancy/tenantRoles.ts`

Five roles, sixteen permissions. The module's header states the design rule:

> Roles are compared here and nowhere else. Scattered `role === 'admin'` comparisons in
> controllers are how authorization drifts apart in a codebase this size.

```ts
PLATFORM_SUPER_ADMIN  // the ONLY role carrying platform.cross_tenant
TENANT_ADMIN          // one tenant, all its brands
BRAND_ADMIN           // one brand
BRAND_MARKETER        // build + send campaigns, cannot change senders or domains
TENANT_VIEWER         // read-only across a tenant
```

```ts
type TenantPermission =
  | 'tenant.read' | 'tenant.write'
  | 'brand.read'  | 'brand.write'
  | 'lead.read'   | 'lead.write'
  | 'campaign.read' | 'campaign.write' | 'campaign.send'
  | 'sender.read' | 'sender.write'
  | 'organization.read' | 'organization.write'
  | 'journey.read'
  | 'platform.cross_tenant';
```

Enforcement: `tenantAuthorization.ts`, `tenantAccessGuards.ts`, with denials written to
`tenant_access_audits` **before** the error is thrown — because a denial that throws first
loses its record the moment anything upstream swallows the exception.

The header also states the constraint this plan must respect: adding a role is "a one-line
change here plus a membership row… deliberately NOT a code change anywhere else."

### 1b. Agent autonomy and approvals — already an R0–R4 model

Master plan Gate 2 proposes R0–R5 as if new. `backend/src/services/agentAutonomy.ts`:

```ts
export type AutonomyLevel = 'observe' | 'suggest' | 'act_audited' | 'communicate';
export const AUTONOMY_ORDER: AutonomyLevel[] = [...];
// per-action R0-R4 risk tier (already on tickets.risk_tier / work_ledger_events.risk_tier)
```

`models/ApprovalRequest.ts`:

```ts
type ApprovalVerdict = 'would_allow' | 'would_require_approval' | 'would_block';
type ApprovalStatus  = 'shadow_logged' | 'pending' | 'approved' | 'rejected' | 'expired';

risk_tier · autonomy_level · prepared_action · approval_scope
expires_at · decided_by · decided_at · decision_channel
```

Plus `agentAuthorizationService.ts`, `agentPermissionService.ts`,
`models/OpsApprovalQueueItem.ts`, `db/ensureApprovalRequestsSchema.ts`.

**`shadow_logged` is the important one.** The platform already knows how to run an
authorization model in observe-only mode, recording what it *would* have decided, before
it enforces anything. Delivery risk levels should ship the same way.

---

## 2. The coexistence rule

Master plan §4: *"Tenant roles remain tenant roles. Do not jam delivery roles into
`tenantRoles.ts` unless they truly grant tenant-wide authority."*

Adopted, with the reasoning made explicit:

| | Tenant roles | Delivery roles |
|---|---|---|
| Scope | A whole tenant or brand | One `DeliveryProject` / `DeliveryEngagement` |
| Answers | "May this identity act inside this tenant at all?" | "May this identity approve *this* design decision?" |
| Storage | `TenantMembership` | `DeliveryProjectMember` (new) |
| Registry | `modules/tenancy/tenantRoles.ts` | `modules/delivery/deliveryRoles.ts` (new, same shape) |
| Cardinality | Few, slow-changing | Many, per project |

**Both must pass.** A delivery permission is necessary but never sufficient:

```
allow(identity, action, project) =
      tenantGuard(identity, project.tenant_id, project.brand_id)   // fail closed
  AND deliveryGuard(identity, action, project.id)                  // fail closed
```

The order matters. Tenant first means a cross-tenant caller is denied — and audited to
`tenant_access_audits` — **before** the delivery layer discloses whether the project
exists. That is what master plan §8 scenario F ("denied without enumeration") requires.

`platform.cross_tenant` does **not** imply any delivery permission. A platform superadmin
can see that a project exists; approving a client's design decision on their behalf is a
different act and is not granted by being an operator.

---

## 3. Delivery permissions (master plan Gate 2)

```
project.read              project.write
contract.read             contract.approve
requirement.read          requirement.write         requirement.approve
architecture.read         architecture.write        architecture.approve
design.read               design.comment            design.approve
story.read                story.write               story.execute        story.review
agent.read                agent.write               agent.approve
evidence.read             evidence.verify
release.read              release.approve           release.deploy
client.accept
operations.read           operations.write
project.manage_members    project.manage_authority
```

**Unknown roles grant nothing** — same fail-closed default as `tenantRoles.roleGrants()`.

### Role → permission grants

`R` read · `W` write · `A` approve · `—` none

| Permission group | delivery owner | delivery lead | architect | builder | assoc. builder / intern | mentor | QA rev. | security rev. | design rev. | client owner | client reviewer | client acceptance owner | observer |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| project | RW | RW | R | R | R | R | R | R | R | R | R | R | R |
| contract | RA | RA | R | R | R | R | R | R | — | RA | R | RA | — |
| requirement | RWA | RWA | RWA | RW | RW | R | R | R | — | R | R | R | — |
| architecture | RWA | RA | RWA | RW | R | R | R | RA | — | — | — | — | — |
| design | RA | RA | R | RW | RW | R | R | — | RWA | RA | R+comment | RA | R |
| story | RW+review | RW+review | RW | RW+execute | RW+execute¹ | R+review | R+review | R | — | R | R | R | R |
| agent | RWA | RA | RWA | RW | RW | R | R | RA | — | R | R | — | — |
| evidence | R+verify | R+verify | R | R | R | R+verify | R+verify | R+verify | R | R | R | R | R |
| release | RA+deploy² | RA | R | R | — | R | RA | RA | — | R | R | RA | R |
| client.accept | — | — | — | — | — | — | — | — | — | ✅ | — | ✅ | — |
| operations | RW | RW | R | R | — | R | R | R | — | R | R | — | R |
| manage_members | ✅ | ✅ | — | — | — | — | — | — | — | — | — | — | — |
| manage_authority | ✅ | — | — | — | — | ✅ | — | — | — | — | — | — | — |

¹ `story.execute` for an associate builder is additionally capped by their Builder
Authority Profile `max_risk_without_review` — see §5.

² `release.deploy` is listed for completeness. **This plan does not authorize production
deployment** (master plan §20); the permission exists but no `DeploymentProvider` is built.

### Client roles are deliberately narrow

A client owner cannot write requirements, cannot touch architecture, and cannot execute a
story. They approve, comment, and accept. That is the master plan's core rule —
"the client talks to Project AI, not directly to the coding worker" (§5.1) — expressed as
permissions rather than as UI.

---

## 4. Risk levels — extend the existing vocabulary

Master plan Gate 2 defines R0–R5. The platform already has R0–R4 on `tickets.risk_tier`
and `work_ledger_events.risk_tier`.

| Plan level | Meaning | Existing tier | Action |
|---|---|---|---|
| R0 | read_only | R0 | reuse |
| R1 | reversible_content | R1 | reuse |
| R2 | code_change | R2 | reuse |
| R3 | schema / security / external side effect | R3 | reuse |
| R4 | production_release | R4 | reuse |
| R5 | destructive / high consequence | **absent** | **add** |

Adding R5 touches `agentAutonomy.ts`'s `isHighRiskTier()` and the `TIER_TO_LEVEL` map.
That is a change to a live authorization path for the ops agent fleet, so it ships
**shadow-logged first** (`ApprovalRequest.status = 'shadow_logged'`, verdict recorded, no
enforcement) and is promoted only once the recorded verdicts are reviewed.

Every consequential delivery action declares, per master plan Gate 2:

```
risk_level · required_permission · required_approver · project/tenant constraints
```

**and this applies identically to humans and AI workers.** An execution run requesting an
R3 action is subject to the same gate as a builder requesting it.

---

## 5. Builder Authority Profile

```
builder_level · allowed_project_classes · max_parallel_projects
max_risk_without_review · client_interaction_allowed · release_authority
last_evaluated_at
```

Master plan: *"No authority based solely on time-in-program."* The profile must therefore
be derived from `DeliveryEvidence` (Gate 11's Experience Ledger), not from enrollment
duration or cohort week.

Interaction with the permission table: the profile **caps** what a granted permission can
do. It never grants. An intern holding `story.execute` with
`max_risk_without_review = R1` may execute R0 and R1 stories, and an R2 story becomes a
review request rather than a refusal.

---

## 6. Enforcement requirements

1. **One registry.** `modules/delivery/deliveryRoles.ts` mirrors `tenantRoles.ts`.
   No `role === 'client'` comparisons in controllers or React.
2. **Fail closed.** Unknown role, unknown permission, unresolved membership ⇒ deny.
3. **Audited.** Delivery denials write to `tenant_access_audits` on the same
   write-before-throw discipline, so a client's refused approval attempt is evidence.
4. **No enumeration.** Cross-tenant access returns the same shape as not-found.
5. **Server-side only.** Client-role UI hiding (master plan Gate 10's "do NOT expose raw
   agent scratchpad / internal mentor notes") is a **projection concern, not a
   permission**: the client API returns a different shape, rather than the full shape
   filtered in React. Filtering in the browser is how private mentor notes reach a client.
6. **Tested.** Every route gets an unauthenticated test, a wrong-tenant test, a
   wrong-project test, and a right-project-wrong-role test. Master plan §11 and root
   `CLAUDE.md`'s Security Enforcement Layer both require the auth path be tested, not
   just the happy path.

---

## 7. Open question for Gate 2

`PlatformIdentity` is the identity spine (master plan §12: "Do not create separate
Refactored usernames/passwords"). A **client reviewer at an external company** has no
enrollment and no admin user. Whether `PlatformIdentity` + `PlatformIdentityLink` already
support an identity with neither is not yet verified — it needs a read of
`platformIdentityService.ts` at Gate 2. Recorded rather than assumed.
