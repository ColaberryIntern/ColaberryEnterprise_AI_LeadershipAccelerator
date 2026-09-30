# Curriculum, Learning & Certification — Manager Access Plan (Phase 1)

**Owner:** Swati Raman, `swati@colaberry.com`, `org_members` `5db87b51…` (Operations). Confirmed by Ali 2026-09-15.

## The problem, verified in code

To open the employee's Agent Detail page or Talk tab, a manager's request must pass three things in order:

1. `requireAdmin` (`backend/src/middlewares/authMiddleware.ts:58`): the JWT `role` must be `admin` or `super_admin`. Swati has **no `admin_users` row**, so she cannot log in at all.
2. `mgmtSectionGate` (`backend/src/routes/adminRoutes.ts:127`, global): a scoped management role may only reach paths mapped in `PATH_SECTION` (`backend/src/middlewares/mgmtSectionGate.ts:59`); **`/api/admin/agents` is not mapped**, so a scoped role gets 403 on every agent route. `/api/admin/workforce` is mapped to `program`.
3. `requireAgentManagerOrAdmin` (`backend/src/middlewares/agentManagerAuthMiddleware.ts:50-94`): `org_members.email = JWT email`, then `isAgentInHumanDownstream(orgMember.id, agentId)`.

Today only full admins pass (1) and (2), which is why only Sohail, Tejesh, Ali and Dhee could manage an agent. Step (3) is already correct for Swati once (1) and (2) are solved.

## The plan (two small, testable changes; both Phase 4 of this employee)

| # | Change | Where | Test | Rollback |
|---|---|---|---|---|
| M1 | One `admin_users` row for `swati@colaberry.com`, `role: 'admin'`, `mgmt_role: 'curriculum'` (sections `dashboard`, `program` per `mgmtRoles.ts:51`), `is_ai_operated: false` | Created through the existing admin-user path, not a raw insert; approver: Ali | Login test with the minted token reaches `/api/admin/workforce` (mapped) | delete the row |
| M2 | Map the agent management API for scoped roles: add `['/api/admin/agents', 'program']` to `PATH_SECTION` | `backend/src/middlewares/mgmtSectionGate.ts:59` | An access test on the case-studies precedent (`caseStudyAdminRoutes.access.test.ts`): a `curriculum` token reaches `GET /api/admin/agents/:id` for an agent in its chain and is 403'd for one that is not | revert the one line |

Neither widens authority: M2 only lets the section gate hand the request on to `requireAgentManagerOrAdmin`, which still refuses any agent outside the manager's reporting chain. This is the same shape as the case-studies `PATH_SECTION` row that closed the identical half-working surface on 2026-09-11.

## Applies program-wide

Aleem, Taiwo, Kes and Roselyn are in the same position. M2 is done once; M1 repeats per owner at that employee's Phase 4, with Ali as approver each time.
