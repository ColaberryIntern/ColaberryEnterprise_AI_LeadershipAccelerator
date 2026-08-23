# Data Ownership Matrix

**Session:** CC-20260823-r4k9 · **Base:** `d1d46d1e` · **Gate:** 0

Answers the Gate 0 question *"Which tables inherit tenancy by parent?"* and fixes, before
any schema exists, where `tenant_id` lives and where it must not.

---

## The governing precedent: multi-tenancy D-05

The multi-tenancy Gate 0 recorded this finding:

> **D-05** — 17 of the 18 campaign tables are strict children of `campaigns` and should
> scope by join, not by their own `tenant_id`. The plan's literal reading would mean 17
> backfills and 17 drift risks.

The same reasoning applies here, and the delivery graph is deeper than the campaign one.
A literal reading of "everything is tenant-scoped" would put `tenant_id` on roughly
fourteen new tables, of which twelve are strict children of `DeliveryProject`.

**Rule adopted:**

> `tenant_id` / `brand_id` are stored **only** on rows that can be reached without their
> parent. Everything else scopes by join and is denormalization-free.

The cost of getting this wrong is not storage — it is **drift**. Two sources of truth for
"which tenant owns this design decision" eventually disagree, and the disagreement is
discovered by a client seeing another client's screen.

---

## Ownership tiers

### Tier A — Own `tenant_id` + `brand_id` (denormalized, deliberately)

| Table | Why it carries its own |
|---|---|
| `delivery_engagements` | Top of the delivery graph. Reachable directly from a tenant/brand listing |
| `delivery_projects` | Listed, searched and authorized directly. Every read of "my projects" starts here rather than from an engagement |

Both are also the only two tables a cross-tenant enumeration attack would target, so
denormalizing here is what makes the fail-closed check cheap and unconditional.

### Tier B — Scope by join to `delivery_projects` (no `tenant_id` column)

```
delivery_project_members        delivery_contracts
delivery_requirements           delivery_architecture_decisions
delivery_design_decisions       delivery_design_variants
delivery_agent_definitions      delivery_releases
delivery_stories                delivery_execution_runs
delivery_evidence               delivery_client_acceptances
delivery_operational_signals    delivery_decisions (ledger)
delivery_project_source_links   delivery_change_requests
```

Sixteen tables, zero `tenant_id` columns, zero backfills, zero drift risk. Every read
joins `delivery_projects` and passes through `tenantAuthorization` there.

### Tier C — Existing tables, unchanged

| Table | Relationship |
|---|---|
| `projects` | Referenced by `delivery_project_source_links.student_project_id`. **No new column on `projects`.** |
| `enrollments`, `program_blueprints` | Untouched |
| `evidence_records` | Untouched. Receives an optional derived row for builder credit only (C-03) |
| `tenants`, `brands`, `platform_identities`, `tenant_memberships` | Reused as-is |
| `organizations` | **One change** — C-02 nullability. See [SCHEMA_CONFLICTS.md](SCHEMA_CONFLICTS.md) |

### Tier D — Append-only audit

| Table | Property |
|---|---|
| `tenant_access_audits` | Existing. No FKs by design "so it outlives what it describes", no `updated_at`. Delivery denials write here rather than to a second audit table |

Adding a parallel `delivery_access_audits` would split the answer to "who tried to reach
what, and when" across two tables. One audit trail or none.

---

## Write ownership

Master plan §21 and root `CLAUDE.md` require the streams stay uncrossed.

| Stream | Owner | Notes |
|---|---|---|
| `delivery_*` tables | Refactored delivery services | Only the delivery module writes these |
| `evidence_records` | Progression services | Delivery writes **at most one derived row** per builder-credit event, via the shared idempotency key |
| `projects` and all student tables | Existing student services | Delivery **never** writes these |
| `tenant_access_audits` | `modules/tenancy` | Delivery calls the guard; it does not INSERT directly |
| `/system/**` state maps | Portal `SystemStateEngine` | Never hand-edited |
| `PROGRESS.md`, `/directives`, `CLAUDE.md`, BuildManifest | Claude Code | Per root `CLAUDE.md` |

---

## Source-of-truth for source code

Master plan §2.4 is unambiguous, and it is the single most important ownership rule here:

```
Customer GitHub  --clone-->  Ephemeral Workspace  --branch/commit/PR-->  Customer GitHub
```

Refactored stores **pointers, execution records, evidence, screenshots, approvals and
release history**. It does not store canonical source.

| Stored in Refactored | Never stored in Refactored |
|---|---|
| repo URL, base SHA, branch name, PR URL | working copies of client source |
| execution run events (normalized) | the ephemeral workspace itself (destroyed) |
| test output, screenshots, diffs-as-evidence | client secrets, `.env` contents |
| approvals, acceptances, decisions | anything the client has not agreed to retain |

The ephemeral workspace is destroyed after each run (master plan §Gate 8 flow). Retention
of what survives is defined at Gate 13 — see [MIGRATION_STRATEGY.md](MIGRATION_STRATEGY.md) §Retention.

---

## Data sensitivity classes

`DeliveryContract` carries a `data_sensitivity` field. It drives real behaviour, not
documentation:

| Class | Consequence |
|---|---|
| `public` | Case Study OS may consume approved facts without further approval |
| `internal` | Case Study requires client approval |
| `client_confidential` | No content in analytics payloads; no client facts in prompts beyond the project's own context; Case Study requires explicit written release |
| `regulated` (government / PII / PHI) | Adds the government `DeliveryProfile` requirement set; execution provider must be the isolated option; retention rules override defaults |

Master plan §15 (§"no client data in global analytics") and §Gate 15 ("do not put private
client facts in marketing analytics payloads") are enforced by this column plus a
projection allowlist at the Case Study adapter, **not** by reviewer discipline.

---

## Cross-tenant read paths that must fail closed

Enumerated now so Gate 1's tests are written against a list rather than improvised:

1. `GET /api/refactored/projects` — must return only the caller's tenant's projects
2. `GET /api/refactored/projects/:id` — foreign project ⇒ same response shape as not-found
3. Any child read (`/stories`, `/evidence`, `/decisions`) — must join through
   `delivery_projects` and re-check, never trust the path parameter
4. Engagement listing by organization — must verify the org's tenant, which today would
   pass unchecked because `orgService` has no tenant filter (see CURRENT_STATE §1)
5. Client acceptance — a client reviewer of tenant X must not accept a release of tenant Y
6. Execution run status — run IDs must not be enumerable across tenants
7. Case Study adapter — must not read across tenants even for a platform superadmin

Item 4 is the one that is currently broken upstream, and is why Organization scoping is a
Gate 1 prerequisite rather than a Gate 1 task.
