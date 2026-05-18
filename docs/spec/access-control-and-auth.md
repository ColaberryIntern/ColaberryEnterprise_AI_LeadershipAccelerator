# Access Control & Authentication — Implementation Reference

> Source build-guide section: Chapter 4, "Access Control Model"
> ([Colaberry_Enterprise_AI_Leadership_Accelerator_Build_Guide_v1.md L367-392](../../Colaberry_Enterprise_AI_Leadership_Accelerator_Build_Guide_v1.md))
>
> Closes requirements: REQ-085, REQ-087, REQ-088, REQ-089, REQ-096, REQ-097,
> REQ-098, REQ-158, REQ-159, REQ-160. The build guide specified an
> illustrative auth scheme; this doc reconciles the spec with what shipped.

## Spec vs. shipped — the high-level reconciliation

The build guide proposed a generic `/api/auth/*` + `/api/users/*` surface with
a flat role list (Executive, IT Manager, Data Scientist, Corporate Trainer).
The shipped system is more specialized: it has **two trust planes** —
admin/operator (`/api/admin/*`) and participant/student (`/api/portal/*`) —
each with its own JWT issuance flow and middleware.

The build guide's roles are conceptual — they correspond to user-personas
in the marketing/onboarding flow, NOT to enforced backend role checks. The
shipped backend uses participant-vs-admin as the primary access boundary,
not the four executive roles.

| Build-guide spec | Shipped equivalent | Status |
| --- | --- | --- |
| `POST /api/auth/login` | `POST /api/admin/login` (operators) + participant token flow (students) | Implemented under different paths |
| `GET /api/users/roles` | Implicit in JWT payload (`role` claim from `requireAdmin` middleware) | Implemented as middleware, not a separate endpoint |
| `PUT /api/users/:id/roles` | Admin-only operations via `/api/admin/admins/*` | Implemented but scoped to operator admin management |
| Role-based access control | Two middlewares: `requireAdmin` + `requireParticipant`; route-level enforcement | Implemented |
| Audit logging of role changes | `activityService.logActivity()` on admin actions; full audit trail in `activities` table | Implemented |

## JWT authentication implementation (closes REQ-085)

JWT is the canonical session mechanism. Key facts:

- **Library:** [`jsonwebtoken`](https://www.npmjs.com/package/jsonwebtoken)
- **Secret:** `process.env.JWT_SECRET` (read at [backend/src/config/env.ts:19](../../backend/src/config/env.ts)). Falls back to `'dev-secret-change-me'` in dev. **Must be set in production.**
- **Expiry:** Token expiry is set at issuance time via `jwt.sign(payload, secret, { expiresIn })`. The build guide's `JWT_EXPIRY` env var is NOT used; expiry is currently set per-flow (admin sessions long-lived, participant tokens shorter). Track as TODO if a centralized expiry policy is needed.
- **Verification:** Centralized in [backend/src/middlewares/authMiddleware.ts](../../backend/src/middlewares/authMiddleware.ts). The `requireAdmin` middleware extracts the bearer token, calls `jwt.verify`, and attaches the decoded payload to `req.admin`.
- **Token shape:** `{ sub: string, email: string, role: string }` — see `AuthPayload` interface in the middleware.

### Required environment variables

| Variable | Purpose | Required in prod? |
| --- | --- | --- |
| `JWT_SECRET` | Signing secret for all JWTs | **Yes** — never deploy with the dev fallback |
| `JWT_EXPIRY` | (Build-guide spec; not currently consumed) | No — expiry is set per-flow |

## Auth endpoints (closes REQ-087, REQ-088, REQ-089)

| Build-guide endpoint | Shipped reality |
| --- | --- |
| `POST /api/auth/login` | `POST /api/admin/login` ([backend/src/routes/admin/authRoutes.ts](../../backend/src/routes/admin/authRoutes.ts)) — admin/operator path. Participant auth uses a separate token-issuance flow (no public `/api/auth/login` registered today). |
| `GET /api/users/roles` | No dedicated endpoint. The user's role lives in the JWT claim and is read by middleware. If a UI surface needs the role list, the canonical source is the same set of values the middleware accepts. |
| `PUT /api/users/:id/roles` | Admin-only via the admin user-management surface. Not a public endpoint by design — role changes are operator actions. |

The build-guide endpoints were illustrative. Building them as written would
duplicate the existing admin/participant flows. **No new endpoints needed.**

## RBAC implementation (closes REQ-096, REQ-097, REQ-158, REQ-159)

RBAC is enforced via middleware composition. Every protected route declares
its required trust plane:

- **`requireAdmin`** ([authMiddleware.ts](../../backend/src/middlewares/authMiddleware.ts)) — guards `/api/admin/*` routes
- **`requireParticipant`** ([backend/src/middlewares/participantMiddleware.ts](../../backend/src/middlewares/participantMiddleware.ts)) — guards `/api/portal/*` routes

Within the admin plane, fine-grained permission checks happen at the
controller level (e.g., super-admin vs regular admin for sensitive operations).
There is no separate "permissions array" table — the JWT's `role` claim plus
the route registration is the enforcement contract.

CRUD operations on roles (REQ-096, REQ-158) are deliberately scoped to
operator-only flows. End users don't manage their own roles.

## Role-change audit logging (closes REQ-098, REQ-160)

Role changes and all sensitive admin actions are logged via
`activityService.logActivity()`. The `activities` table is the canonical
audit log. Each entry captures: actor (`admin_id` from JWT), action,
target, timestamp, metadata. Queryable via the admin Activity Log surface.

## Error handling (informational — referenced by spec)

| Status | When | Implementation |
| --- | --- | --- |
| 401 Unauthorized | Token missing, invalid, or expired | `authMiddleware.ts` returns this directly |
| 403 Forbidden | Token valid but role insufficient | Per-controller checks return 403 |

## Known gaps (real, tracked)

1. **`JWT_EXPIRY` env var is documented in the spec but not consumed.** If we want centralized expiry policy, add a config read in `env.ts` and use it in token-issuance sites. Low priority — current per-flow expiry is intentional.
2. **No public `POST /api/auth/login`.** By design — the system is multi-tenant operator/participant, not single-flow public. If a future feature needs public self-service auth, this would be a real new build.

## How to extend

When adding a new protected route, use `requireAdmin` or `requireParticipant`
as the second argument to the route handler. Do not invent a third middleware
without a corresponding new trust plane.
