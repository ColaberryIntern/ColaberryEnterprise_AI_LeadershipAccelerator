# Agent Factory, phase 2 — handoff

**Run** `20261007-school-agent-factory` · **Session** `CC-20261006-a4k7`

**Deployed commit** `fa7f636bc` (PR #3084, merged 8:08 AM CDT on 2026-10-14) · **Production verified** 2026-10-14, by querying the live database rather than by reading the deploy's exit code.

Ten AI employee domain projects exist in production as **plans**. Nothing is activated.

---

## What is live

| | |
|---|---|
| Domains provisioned | **10** |
| Releases | **30** (3 per domain) |
| Stories | **503** — 443 implementation, 50 research, 10 legacy-migration |
| Capabilities described | **443** |
| Capabilities a manager has validated | **0** |
| Build authorizations | **0** — all ten report `no_authorization` |
| Agents built or activated | **0** |
| Autonomy levels changed | **0** |
| Access grants | **0** |
| Projects total | 62 → **72** (exactly +10) |

Every project sits at lifecycle stage `discovery`, entry point `agent_domain_factory_provisioner`, on the **Internal AI Employee Operations** blueprint, owned by an `ai_staff` enrollment. Every story is `not_started` with `verified_at` NULL.

### Per domain

| Domain | Releases | Stories | Manager reachable | Intended builder | Existing agent |
|---|---|---|---|---|---|
| admissions | 3 | 53 | **no** — Taiwo Oludimimu | verified_active | — |
| curriculum | 3 | 44 | yes | **onboarding_pending** | Dara |
| executive | 3 | 95 | yes | unassigned | — |
| internship | 3 | 41 | yes | verified_active | — |
| learner_success | 3 | 43 | yes | unassigned | Reese |
| marketing | 3 | 70 | yes | verified_active | — |
| platform | 3 | 54 | **no** — Kesetebirhan Delele | verified_active | — |
| product_experience | 3 | 31 | **no** — Mohammed Abdul Aleem | verified_active | — |
| sales | 3 | 38 | **no** — Roselyn | verified_active | — |
| website | 3 | 34 | yes | unassigned | — |

Both existing agents (Reese, Dara) pre-date this work and were neither created nor modified.

---

## Where to look

- **https://enterprise.colaberry.ai/admin/projects** — the ten projects, in the admin page that already existed.
- **`GET /api/admin/agent-domains`** — the ten domains with reachability and blockers. Needs the `program` section.
- **`GET /api/admin/agent-domains-summary`** — counts and the coverage headline.
- **`GET /api/admin/agent-domains-authorization`** — build-authorization state, answered by the real gate.
- **`GET /api/admin/agent-domains/:domainKey/coverage`** — the capability → story matrix.
- **`GET /api/admin/agent-domains-builders`** — intern names. Needs the **`internship`** section, deliberately separate from `program`.

**There is no dedicated UI page.** Phase 2 shipped API routes only.

---

## Four decisions that are yours, not mine

1. **21 legacy agent rows belong to no domain.** Five are live production rows. They are tracked in `backend/src/services/agentDomain/capabilities/_unresolved.json`, each with a disposition of `unresolved` and a measured reason. They need an owner decision.
2. **Four managers cannot reach the admin surface.** Admissions needs *two* fixes together: Taiwo Oludimimu has no `admin_users` row, **and** no `/api/admin/admissions` prefix is mapped in `mgmtSectionGate`, which is deny-by-default — so a scoped login alone would still 403 him on all nine of his own routes.
3. **No capability is confirmed.** Every one of the 443 is `draft`. Promotion out of draft is a manager decision, and nothing in the system can make it on their behalf.
4. **Ruth Kumera is `onboarding_pending`.** Production shows `signed_documents_uploaded`, `updated_at` 4:19 PM CDT on 2026-10-07 — her own timestamp. She is not assignable and her onboarding has not been routed around.

---

## What the code refuses to do

These are enforced and mutation-proven, not described:

- **Progress confers no authority.** Completed stories, shipped releases and accumulated evidence are passed to `authorityFromMatrix` and refused. Authority comes only from a recorded approval.
- **The four-hour auto-approve timer cannot promote anything.** It is refused as an approver, as an evidence source, as an evaluator, and as a threshold acceptor. That timer wrote all 106 rows in `approval_requests`, which is why each channel is closed separately.
- **Autonomy is per capability.** One capability reaching a level cannot lift another, or the agent.
- **An empty confirmed set is reported, never dressed up.** The summary says "NO coverage to report", not a percentage.
- **An autonomy value cannot be written to a `risk_tier` column.** Both risk sinks fail *open* on an unrecognised value, so this would silently remove two guards.
- **Intern names sit behind their own section**, because an applicant's resume and phone number are a materially wider grant than editing curriculum.

---

## Rollback

The ten project ids are derived and printed by the provisioner's dry run. To undo, in this order — the models' foreign keys do **not** cascade:

```sql
DELETE FROM student_tasks            WHERE project_id         IN (<the ten>);
DELETE FROM student_task_lists       WHERE project_id         IN (<the ten>);
DELETE FROM agent_domain_projects    WHERE student_project_id IN (<the ten>);
DELETE FROM project_lifecycle_states WHERE student_project_id IN (<the ten>);
DELETE FROM projects                 WHERE id                 IN (<the ten>);
```

No legacy row was touched, so there is nothing else to restore. Re-running the provisioner is safe: every id is derived, so a second run writes nothing.

---

## What this phase does **not** establish

Stated so nobody infers more than was measured:

- **No agent works.** 503 stories describe work that has not started.
- **No capability is validated.** Zero managers have reviewed one.
- **Readiness is `unknown`, not zero.** It would require evidence that does not exist yet.
- **No browser coverage.** No Playwright spec touches this surface, and none is claimed.
- **Five tasks were remediated after their last verdict** (T07, T08, T09, T11, T14) and were not re-graded. T14's verdict specifically predates the rework that moved the provisioner onto the model path.

---

## Defects found and fixed during this phase

Recorded because each was silent, and each was found by a different mechanism:

| Defect | Found by |
|---|---|
| The provisioner would have attached ten projects to the **customer-facing accelerator** | querying production before writing |
| Capability data was absent from the runtime image (`tsc` does not copy `.json`) | the first provisioning run failing |
| The provisioner raw-inserted `projects`, bypassing the lifecycle hook | an upstream tripwire |
| The schema assert reported a table that exists as missing | running it against a real database |
| The four-hour timer could promote a capability, and accept a threshold | adversarial verification |
| `RISK_TIER_BEARING_MODELS` had no enforcement point | a verifier reading the list for callers |
| The boot registration could stop the backend binding its port | a verifier tracing the failure path |
| Anchor rows carried NULL where measured reachability belonged | verifying production after writing |

The pattern worth keeping: **every one of these passed a green test suite.** They were found by asking production, by adversarial review, and by tripwires other people wrote — not by the tests of the code that contained them.
