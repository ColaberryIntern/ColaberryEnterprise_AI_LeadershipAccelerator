---
name: person-360
description: Build, extend and audit the 360° person profile at /admin/people/<email>. Use when adding a panel, when asked "does the 360 show X", when a person surface looks thin, or on the quarterly drift audit. Carries the full source registry and a re-runnable query that finds person-linked tables the profile does not yet read.
---

# The 360° person profile

One page that answers **everything we know about one human being**, from the first
anonymous page view to the last failed payment.

Ali, 2026-09-09: *"put all the pieces in it so we can make sure we pull a user's
eVERYTHING."*

This skill exists because the profile shipped reading **14 sources** while production
held **163 person-keyed tables**, and nothing in the codebase made that gap visible.
The registry and the audit query below are the mechanism that stops it recurring.

---

## The cardinal rule: absent is not zero

Every panel obeys it, and most defects in this surface come from breaking it.

| State | Renders as | Means |
|---|---|---|
| `null` | "Not recorded" | We have no data. Do not infer. |
| `0` | `0` | We counted, and the answer is zero. |
| key absent | tab does not exist | The caller may not see this panel. |

A cohort that never took a register produces `attendanceRate: null`, **not** 0.
Rendering 0 there tells a reader nobody came, which is a different and false claim.

`?? 0` on a count is the single most common way this rule gets broken. Reach for it
only when zero is genuinely the measured answer.

---

## Architecture

```
backend/src/services/adminOs/
  personProfileService.ts     composer: permissions, id resolution, assembly
  personTimelineService.ts    the unified chronological history (22 branches)
  personScope.ts              lifecycle stage -> section row-level scope
  panels/
    acquisitionPanels.ts      lead record, appointments, automation
    journeyPanel.ts           the counts above the detail
    classPanels.ts            attendance, live rooms, curriculum progress
    workPanels.ts             projects, case studies, capstones, portfolio, cert
    accountPanels.ts          org ownership/membership, tenant, subscriptions
    growthPanels.ts           skills, AI mentor, content, community, context

frontend/src/adminOs/personTypes.ts               the payload contract
frontend/src/components/admin/person/*.tsx        one component per tab
frontend/src/pages/admin/PersonProfilePage.tsx    tab shell
```

**Panels are omitted server-side, never hidden in CSS.** A panel the caller may not
see is never queried and never serialised. Sending data and hiding it in the browser
is not access control.

**A mentor is narrowed twice.** `personScope` says which lifecycle stages;
`visibleEnrollmentIds` says which specific learners. `null` means no filter (an
admin); `[]` means a mentor with no grants who must see nothing. Collapsing those two
is how a scoped surface silently shows everything. Every enrolment-keyed loader takes
the **already-narrowed** id list so the narrowing cannot be forgotten one panel at a
time.

---

## The drift audit — run this before claiming coverage

Finds every person-linked table holding rows for real people, so a table added last
quarter shows up as a gap instead of silently missing.

```bash
# 1. Pick three people with different shapes: heavy learner, lapsed, commercial.
ssh root@95.216.199.47 "docker exec accelerator-db psql -U accelerator -d accelerator_prod \
  -t -A -F'|' -c \"SELECT email, id, status::text FROM enrollments \
  WHERE lower(btrim(email)) IN ('<a>','<b>','<c>');\""

# 2. Count every person-keyed table for those ids. Uses query_to_xml so one
#    statement counts across every table without generating SQL by hand.
```

```sql
WITH ids AS (
  SELECT ARRAY['<enrollment-uuid>', '...'] AS enr,
         ARRAY[<lead-id>, ...]            AS lead,
         ARRAY['<member-uuid>', '...']    AS mem
),
cand AS (
  SELECT c.table_name, c.column_name
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_name = c.table_name AND t.table_schema = 'public'
   AND t.table_type = 'BASE TABLE'
  WHERE c.table_schema = 'public'
    AND c.column_name IN ('enrollment_id', 'lead_id', 'member_id')
    AND c.table_name NOT LIKE '%backup%'
),
q AS (
  SELECT table_name, column_name,
    format('SELECT COUNT(*) AS c FROM public.%I WHERE %I::text = ANY(%L)',
      table_name, column_name,
      CASE column_name
        WHEN 'enrollment_id' THEN (SELECT enr FROM ids)::text
        WHEN 'member_id'     THEN (SELECT mem FROM ids)::text
        ELSE (SELECT lead FROM ids)::text END) AS sql
  FROM cand
)
SELECT table_name, column_name,
       (xpath('/row/c/text()', query_to_xml(sql, false, true, '')))[1]::text::bigint AS rows_found
FROM q
WHERE (xpath('/row/c/text()', query_to_xml(sql, false, true, '')))[1]::text::bigint > 0
ORDER BY rows_found DESC;
```

**Then diff that output against `references/source-registry.md`.** Any table with rows
that is not in the registry is a gap: either wire it, or record why it is excluded.

Two tables reach a person **indirectly** and this query will not find them — check
them by hand:

- `case_studies` → `projects.enrollment_id` (via `project_id`)
- `community_*` → `community_members.enrollment_id` (via `member_id`)

---

## Adding a panel

1. **Measure first.** Run the audit. A panel for a table with zero rows platform-wide
   is a panel that will always look broken.
2. **Write the loader** in the fitting `panels/*.ts`, taking `enrollmentIds: string[]`
   (and `leadIds: number[]` where relevant). Return `null` for an empty id list —
   never run a query with no keys.
3. **Guard the counts.** `null` when the source cannot answer; a number only when
   you counted.
4. **Gate it** in `PANEL_SECTIONS` in `personProfileService.ts`. Do not invent a new
   section key — map to the existing ones.
5. **Add the type** to `frontend/src/adminOs/personTypes.ts` and `PersonProfile`.
6. **Build the tab** in `frontend/src/components/admin/person/`, using `primitives.tsx`
   so fields and empty states match every other tab.
7. **Register the tab** in the `tabs` memo, conditional on the panel being present.
8. **Add timeline branches** for anything with a meaningful timestamp.
9. **Verify against production** (below). Tests mock `sequelize.query`, so a query
   that cannot parse still passes 13 of them. This has happened.

---

## Verification — required before shipping

Unit tests do not touch a database. **Run the SQL against production before you
ship**, or you are shipping unparsed strings.

```bash
# The real query, real ids, timed.
ssh root@95.216.199.47 "docker exec accelerator-db psql -U accelerator \
  -d accelerator_prod -c '\\timing on' -f /tmp/your-query.sql"

# Then the live endpoint, after deploy.
ssh root@95.216.199.47 "docker exec accelerator-backend node -e \"
  fetch('http://localhost:3001/api/admin/people/profile?email=<addr>', {
    headers: { Authorization: 'Bearer <token>' }
  }).then(r => r.json()).then(p => console.log(Object.keys(p)))\""
```

**Checklist:**

- [ ] Query runs against production and returns rows for a person you picked
- [ ] Timing is sane (the KPI query once took 72 seconds; see the EXISTS trap below)
- [ ] `tsc --noEmit` passes with the pinned compiler: `npx -y -p typescript@5.7.3 tsc --noEmit`
- [ ] `npx jest -c jest.ci.config.ts --ci` from `backend/`
- [ ] A panel with no data renders a stated reason, not a blank card
- [ ] A scoped role (mentor) does **not** receive the panel in the payload

---

## Traps this surface has already hit

**Sequelize array replacement.** `= ANY(:ids)` expands to `= ANY('a','b')` — a syntax
error. Always `IN (:ids)`. Thirteen unit tests passed on a query that could not parse,
because they mocked the query layer.

**`MAX(status)` is alphabetical.** `'withdrawn' > 'active'`, so a person who left a
cohort and re-enrolled read as lapsed. That mislabelled 29 of 53. Use
`bool_or(status = 'active')`, never `MAX`.

**Correlated `EXISTS` inside `COUNT(...) FILTER`.** Postgres evaluates it per row:
68 ms in a `WHERE` clause became 72,418 ms inside the aggregate. Build the set, then
LEFT JOIN it.

**Sequelize write result shapes.** INSERT returns a number in `result[1]`; UPDATE
returns a pg result object with `.rowCount`. Read both, or a backfill reports
`linked: 0` while linking 24,676 rows.

---

## Known gaps — state them, never render them as zero

| Gap | Why |
|---|---|
| Graduation | `enrollments.status` supports `completed`, the profile reads it, nothing ever sets it. 0 completed as of 2026-09-09. An empty graduate count means "not recorded". |
| Placement / employment | Not tracked anywhere in this database. |
| Payment transactions | Subscription STATE is local; the charges live in PaySimple, unjoined. A failed row proves a collection attempt failed, not how much was collected. |
| Attendance | Unreliable — many cohorts never took a register. Content consumption and curriculum progress are the trustworthy engagement signals. |
| Cert prep | 3 sessions platform-wide, 0 responses, 0 readiness snapshots. Barely used, not broken. |
| Identity beyond email | Exact normalised email only. Ambiguous matches are never silently merged. |

---

## References

- `references/source-registry.md` — every person-keyed table, its state, and why
- The brief: `ADMIN-OPERATING-SYSTEM-CONSOLIDATION-CLAUDE-CODE-PROMPT.md`
- Lifecycle vocabulary and joinability: `backend/src/services/adminOs/lifecycle.ts`
- Metric trust levels: `backend/src/services/adminOs/metricRegistry.ts`
