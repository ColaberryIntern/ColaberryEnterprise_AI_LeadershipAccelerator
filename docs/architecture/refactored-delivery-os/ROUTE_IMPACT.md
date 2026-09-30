# Route Impact

**Session:** CC-20260823-r4k9 · **Base:** `d1d46d1e` · **Gate:** 0

---

## 1. The namespace is clean

```
$ grep -rn "refactored" frontend/src/routes/*.tsx backend/src/routes/
(no matches)
```

`/refactored` and `/api/refactored/*` are unclaimed. Nothing to migrate, nothing to
rename, no collision.

---

## 2. Existing route trees

| Tree | File | Guard |
|---|---|---|
| Public | `frontend/src/routes/publicRoutes.tsx` | none |
| Portal (students) | `frontend/src/routes/portalRoutes.tsx` | `requireParticipant` |
| Admin / management | `frontend/src/routes/adminRoutes.tsx` | admin auth + `mgmtRole` / `canSection` |
| Referral | `frontend/src/routes/referralRoutes.tsx` | referral token |

A fifth tree — `refactoredRoutes.tsx` — is the conventional addition and matches the
existing shape. Master plan §9: *"Follow current router conventions."*

### Known ordering hazard

Project memory records a real production defect in this repo: **public routes registered
after `adminRoutes` inherited the admin auth guard and returned 401.** Express route
registration order is load-bearing here.

The delivery route tree must be registered where its guard cannot be inherited from a
neighbour, and the Gate 1 test set must include an unauthenticated request against a
delivery route asserting the *correct* rejection (403/404 by design), not merely
"not 200" — because inheriting the wrong guard also produces a non-200.

---

## 3. Frontend routes (master plan §9)

```
/refactored
/refactored/projects
/refactored/projects/:projectId

/refactored/projects/:projectId/command      Builder: attention queue, health
/refactored/projects/:projectId/plan         Contract, requirements, releases, stories
/refactored/projects/:projectId/design       Design decisions + variants
/refactored/projects/:projectId/build        Execution runs
/refactored/projects/:projectId/agents       Agent definitions + trust
/refactored/projects/:projectId/proof        Evidence + Quality OS
/refactored/projects/:projectId/releases     Release gates
/refactored/projects/:projectId/operate      Operational signals + GOALS
```

**Client views are role-aware on the same routes**, not a duplicated tree (master plan
§9: *"Client can use role-aware views rather than a duplicated backend"*). The client
nav — Overview · Decisions · Design · Preview · Changes · Releases · Results · Documents —
resolves to the same URLs rendering a different component set.

The **data**, however, is not shared: the client surface calls a client-shaped API
endpoint with a server-side projection, per
[CLIENT_PORTAL_MAP.md](CLIENT_PORTAL_MAP.md). Shared routes, separate serializers.

---

## 4. Backend API surface

New tree, `backend/src/routes/refactored/`, mounted at `/api/refactored`.

| Group | Endpoints (conceptual) |
|---|---|
| Engagements | `GET/POST /engagements`, `GET/PATCH /engagements/:id` |
| Projects | `GET/POST /projects`, `GET/PATCH /projects/:id`, `POST /projects/:id/archive` |
| Members | `GET/POST/DELETE /projects/:id/members` |
| Contract | `GET/POST /projects/:id/contract`, `POST /contract/:id/approve` |
| Requirements | `GET/POST/PATCH /projects/:id/requirements` |
| Decisions | `GET/POST /projects/:id/decisions`, `POST /decisions/:id/approve` |
| Design | `GET/POST /projects/:id/design-decisions`, `/variants`, `POST /:id/approve` |
| Agents | `GET/POST /projects/:id/agents`, `POST /agents/:id/approve` |
| Releases / stories | `GET/POST /projects/:id/releases`, `/stories`, `POST /stories/:id/execute` |
| Execution | `GET /runs/:id`, `GET /runs/:id/events`, `POST /runs/:id/cancel` |
| Evidence | `GET /projects/:id/evidence`, `POST /runs/:id/evidence` |
| Client | `GET /client/projects/:id`, `POST /client/releases/:id/accept`, `POST /client/change-requests` |
| Operate | `GET/POST /projects/:id/signals` |

Every route: Zod-validated input (root `CLAUDE.md` Contract Enforcement Layer), tenant
guard then delivery guard, fail closed, correlation ID propagated.

---

## 5. What must NOT change

| Surface | Requirement |
|---|---|
| `POST /api/portal/sbp/intake/questions` | unchanged |
| `POST /api/portal/sbp/builds` | unchanged |
| `GET /api/portal/sbp/builds/:projectId` | unchanged |
| `POST /api/portal/sbp/builds/:projectId/publish` | unchanged |
| `GET /api/portal/sbp/builds/:projectId/stories/:storyId/prompt` | unchanged |
| `/api/portal/projects/*` | unchanged |
| All admin routes | unchanged |
| `frontend/src/pages/portal/projects/*` | unchanged |

The delivery tree calls the *same underlying services* as SBP where they are shared
(Tier 1/2 in [SBP_INTEGRATION_MAP.md](SBP_INTEGRATION_MAP.md)); it does not modify the SBP
routes. Master plan §24's stop condition "student `Project` behavior regresses" is best
met by leaving that file untouched, and the diff should show it untouched.

---

## 6. Nginx / deployment

`/nginx` holds the production config. `/refactored` is an authenticated SPA route served
by the existing React bundle — **no new nginx location block is required**, since the SPA
catch-all already serves client-side routes.

`/api/refactored/*` is served by the existing backend container and needs no proxy change.

**This plan does not deploy** (master plan §20). Recorded so that Gate 1 does not
mistake "no nginx change needed" for "nothing to check at deploy time": a deploy that
touches nginx bounces the backend unless `--no-deps` is used, which is a known hazard in
this stack and out of scope here.

---

## 7. Route-level test requirements

Per route group, four tests minimum (master plan §19, root `CLAUDE.md` Security layer):

1. **Unauthenticated** ⇒ correct rejection status, asserted exactly
2. **Wrong tenant** ⇒ deny without enumeration, `tenant_access_audits` row written
3. **Right tenant, not a project member** ⇒ deny
4. **Right project, insufficient delivery role** ⇒ deny

Plus, for client routes: the response body assertion that internal fields (mentor notes,
builder assessment, agent scratchpad) are **absent from the payload**, not merely
unrendered.
