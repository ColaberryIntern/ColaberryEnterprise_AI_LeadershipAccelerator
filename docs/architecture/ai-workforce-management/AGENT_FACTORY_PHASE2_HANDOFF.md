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
| admissions | 3 | 53 | yes | verified_active | — |
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

> **CORRECTION, measured 2026-10-14.** An earlier version of this document said the ten
> projects are visible at `/admin/projects`. **They are not.** That page walks
> cohorts → enrollments (by `cohort_id`) → projects, and all ten are owned by one
> `ai_staff` enrollment whose `cohort_id` is **NULL** — so the page renders nothing about
> them. Verified by query, after the claim was questioned.

**There is no page for this work.** The only way to see it is the API below, or SQL.
- **`GET /api/admin/agent-domains`** — the ten domains with reachability and blockers. Needs the `program` section.
- **`GET /api/admin/agent-domains-summary`** — counts and the coverage headline.
- **`GET /api/admin/agent-domains-authorization`** — build-authorization state, answered by the real gate.
- **`GET /api/admin/agent-domains/:domainKey/coverage`** — the capability → story matrix.
- **`GET /api/admin/agent-domains-builders`** — intern names. Needs the **`internship`** section, deliberately separate from `program`.

**Phase 2 shipped API routes only, and no UI.** All seven routes were probed in production on
2026-10-14 and every one answered **401, not 404**, which confirms they are deployed and
guarded — including `/agent-domains/nonsense-domain`, because the section guard runs *before*
input validation. They are Bearer-token routes with no cookie fallback, so pasting a URL into
a browser tab returns 401; see **How to test** below.

---

## How to test

The routes need an admin Bearer token and there is no cookie fallback, so a URL pasted into a
browser tab returns 401. The quickest path is the browser console on a page where you are already
logged in, because it can read the token itself.

**1.** Log in at https://enterprise.colaberry.ai/admin
**2.** F12 → Console. Type `allow pasting` first (Chrome blocks the first paste).
**3.** Paste this. It walks all seven routes and prints a table.

```js
(async () => {
  const t = localStorage.getItem('admin_token');
  if (!t) return console.error('No admin_token - are you logged in as an admin?');
  const paths = [
    'agent-domains', 'agent-domains-summary', 'agent-domains-authorization',
    'agent-domains-builders', 'agent-domains/marketing',
    'agent-domains/marketing/coverage', 'agent-domains/marketing/authorization',
  ];
  for (const p of paths) {
    const r = await fetch('/api/admin/' + p, { headers: { Authorization: 'Bearer ' + t } });
    const body = await r.json().catch(() => null);
    console.log(r.status, p, body);
  }
})();
```

### What a correct answer looks like

Checked against production on 2026-10-14. If any of these differs, something regressed:

| Route | Expect |
|---|---|
| `agent-domains` | 10 domains; `manager_can_reach` false on **platform, product_experience and sales only**, each with a named `manager_blocker`; true on the other seven |
| `agent-domains-summary` | 503 stories, 443 capabilities, **0** confirmed, and the words **"NO coverage to report"** — not a percentage |
| `agent-domains-authorization` | all ten `authorized: false`, reason `no_authorization` |
| `agent-domains-builders` | the intern roster. **403 for a `program`-only role** — this one needs `internship` |
| `agent-domains/marketing` | the marketing domain, 70 stories |
| `agent-domains/marketing/coverage` | the capability → story matrix, every capability `draft` |
| `.../marketing/authorization` | `authorized: false` |

### Three things worth trying to break

1. **Ask for a domain that does not exist** — `agent-domains/not-a-domain` should be a clean 400 or 404, never a 500 and never an empty 200.
2. **Drop the token** — every route should be 401. It is also 401 for a nonsense domain, because the guard runs before validation.
3. **Use a curriculum- or support-scoped login on `agent-domains-builders`** — should be 403. Intern names are applicant data (resume, phone, interview transcript), which is why that route sits behind `internship` rather than `program`.

### Seeing it without a browser

```bash
ssh root@95.216.199.47 "docker exec accelerator-db psql -U accelerator -d accelerator_prod -c   \"SELECT domain_key, manager_can_reach, manager_blocker FROM agent_domain_projects ORDER BY domain_key\""
```

---

## The fleet, measured

Checked 2026-10-15. **Three different numbers, and only one of them is the useful one.**

| Figure | Value | What it counts |
|---|---|---|
| Rows in `ai_agents` | **257** | the registry, including disabled and never-run |
| Enabled | **175** | `enabled = true` |
| **Have ever executed anything** | **152** | distinct `agent_id` in `ai_agent_activity_logs` (4,470,103 rows) |
| Above `observe` | **2** | Reese and Dara, both `communicate` |

**"217" cannot be reproduced by any filter.** It was the true fleet size for about eight
milliseconds on 2026-08-13 at 15:10:05.865 UTC, during a bulk seed, and has not been accurate
since. The nearest single filter is `agent_group IS NULL` at **216** — one off, close enough to be
tempting, and not an explanation.

So the consolidation story should be **152 agents that have ever done anything, down to 10** — not
257 registry rows and not 217. A registry row is not a working agent, and 255 of the 257 are held
at `observe` deliberately.

---

## Four decisions that are yours, not mine

1. **21 legacy agent rows belong to no domain.** Five are live production rows. They are tracked in `backend/src/services/agentDomain/capabilities/_unresolved.json`, each with a disposition of `unresolved` and a measured reason. They need an owner decision.
2. **Three managers cannot reach the admin surface** — Kes Delele (platform), Aleem (product_experience) and Roselen (sales). Each has an `org_members` row and no `admin_users` row under *either* their work address or their org_members one, re-checked 2026-10-15.
> **CORRECTED 2026-10-15, was "four managers".** Admissions was listed here and is not blocked. Taiwo Oludimimu has `taiwo@colaberry.com`, role `admin` — a legacy full admin — so he
> reaches all nine admissions routes today. The false negative was an **email mismatch**: his
> `org_members` row carries his personal address while he signs in with the work one, so matching
> `org_members.email` against `admin_users.email` found nothing and that read as "no login". The
> reliable link is `org_members.enrollment_id` → `enrollments.email`, a real FK populated 29 of 29.
> Separately, mapping `/api/admin/admissions` in `mgmtSectionGate` would have changed nothing for
> anyone: all nine routes carry `requireAdmin`, not `requireSection`, and there is no `admissions`
> section key to map to.
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
