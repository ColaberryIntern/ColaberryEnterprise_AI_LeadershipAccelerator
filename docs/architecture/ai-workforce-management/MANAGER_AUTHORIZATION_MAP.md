# Manager Authorization Map (Checkpoint A)

The mission's non-negotiables require: manager instructions may only RESTRICT an agent, never expand its authority; every management action must be authorized server-side against a real "is this human actually this agent's manager" check — never frontend visibility alone. This document maps the real pieces that exist today and proposes (not yet builds) `requireAgentManagerOrAdmin`.

## What exists today

1. **The JWT.** `backend/src/middlewares/authMiddleware.ts:7-23` — `AuthPayload = { sub, email, role, mgmt_role?, portal_enrollment_id? }`. `sub` is `admin_users.id`. **No `org_members.id` is present in the token today**, on any login path.
2. **The flat gate.** Both agent-detail (`agentDetailRoutes.ts:9`) and agent-governance (`agentGovernanceRoutes.ts:21-42`) routes use only `requireAdmin` — `role ∈ {admin, super_admin}`. Any admin can act on any agent today.
3. **A real, narrower-than-admin RBAC precedent that already ships.** `services/access/mgmtRoles.ts` — `MGMT_ROLE_DEFS`, each role mapped to a `SectionKey[]`; `requireSection(section)` (`authMiddleware.ts:90-110`) enforces it server-side. This is the shape this repo already uses for "not full admin, but more than nothing" — the pattern to imitate, not the mechanism to reuse directly (agent-manager scoping is per-agent, not per-section).
4. **A real narrower-than-admin predicate-middleware precedent.** `requireCoryAuthorized` (`authMiddleware.ts:181-214`) — a bespoke server-side predicate closing a real prior hole (19 unauthenticated Cory routes). Confirms: when a route needs tighter scoping than `requireAdmin`, this repo writes a dedicated middleware function, not an ad hoc per-route check.
5. **The real chain-walker.** `orgChartHierarchyService.ts:110-141` — `resolveHumanDownstreamAgents(orgMemberId)` / `isAgentInHumanDownstream(orgMemberId, agentId)`. Walks `AiAgent.reports_to_type/reports_to_id` from a human down through leadership → staff, `MAX_DOWNWARD_DEPTH`-bounded. **Already used as a live 403 gate** in `orgChartTaskAssignmentService.ts::assignTaskToAgent()` — proven correct in production today, not theoretical.
6. **The identity bridge that looks tempting but is the wrong tool.** `PlatformIdentity`/`PlatformIdentityLink` + `OrgMember.platform_identity_id` (`CURRENT_STATE.md` §D) — real, but explicitly "NOT wired into any existing authentication path," built for multi-tenant CPN partner identity, not proven populated for internal `org_members`, and a two-hop indirection for a problem that has a one-hop answer (below).
7. **`OrgMember.email`** — real, unique per org, lower-cased. `platformIdentityService.ts:9-13` documents email as this repo's own canonical join key convention for exactly this kind of identity-linking problem.

## Gap

**No function or middleware today answers "is the calling admin this agent's actual manager (directly or via the reports-to chain), someone above them in the human chain, a platform superadmin, or an unrelated admin who should be blocked?"** — the exact four-way distinction the mission requires. Everything today collapses to a single `requireAdmin` bit.

## Proposed shape (Checkpoint A output only — NOT built, NOT authorized to build yet)

```
requireAgentManagerOrAdmin(agentIdParam: string) middleware:
  1. requireAdmin() first (existing, unchanged) — still must be a real admin login.
  2. If role is 'super_admin' (platform superadmin) → pass. (Matches existing
     ADMIN_ROLES / mgmt_role 'owner' precedent — owner/superadmin already see
     everything elsewhere in this repo.)
  3. Else: OrgMember.findOne({ where: { email: req.admin.email } })
     - not found → 403 ("no linked org member record")
     - found → isAgentInHumanDownstream(orgMember.id, agentIdParam)
       - true  → pass, tag req with the resolved orgMemberId for audit logging
       - false → 403 ("not in this agent's reporting chain")
```

Why this shape and not the `PlatformIdentity` bridge: fewer moving parts, reuses a join-key convention this repo has already chosen (`OrgMember.email` = `AuthPayload.email`), and reuses `isAgentInHumanDownstream` — a function already proven correct against real production data via `assignTaskToAgent`. It does not require `PlatformIdentity` rows to exist or be populated for staff, which is not currently guaranteed.

**Explicitly deferred to Checkpoint B, not decided here:** whether "someone above the direct manager in the human chain" (e.g., Ali, since everyone conceptually reports to him) should pass via the same `isAgentInHumanDownstream` walk starting from *their* `orgMemberId` (which it already would, since the chain walk is transitive) or needs an explicit escalation path. Initial recommendation, to be confirmed at Checkpoint B kickoff: the transitive walk already produces the right answer for "above the direct manager" with zero extra code — Ali's `orgMemberId` is upstream of every human who has agents reporting to them, so `isAgentInHumanDownstream` already returns true for him on every agent. This needs explicit confirmation against real `org_members` data before Checkpoint B, not assumed.

## Answering Gate A's "should initial management capability stay admin-only" question

**Yes, until `requireAgentManagerOrAdmin` ships and is verified.** Reasoning: no manager-vs-admin distinction exists anywhere today (point 2 above); shipping any new manager-facing write capability (directives, 1:1 outcomes, memory approval) gated only on `requireAdmin` would let any admin act as if they manage every agent, which directly conflicts with the mission's own authorization non-negotiable. Checkpoint B's first real task should be building and testing `requireAgentManagerOrAdmin` before any write-capable manager feature ships behind it.
