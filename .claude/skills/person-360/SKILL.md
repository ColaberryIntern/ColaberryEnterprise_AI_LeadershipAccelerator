---
name: person-360
description: Build, extend and audit the 360° person profile at /admin/people/<ref>. Use when adding a panel, when asked "does the 360 show X", when a person surface looks thin or repetitive, or on the quarterly drift audit. Carries the source registry, the person-shape matrix, and three re-runnable audits that catch missing sources, unreadable rows, and permission drift.
---

# The 360° person profile

One page that answers **everything we know about one human being**, from the first
anonymous page view to the last failed payment.

Ali, 2026-09-09: *"put all the pieces in it so we can make sure we pull a user's
eVERYTHING"* and *"make sure it tracks everything for everyone"*.

Those are two different requirements and they fail in different ways:

| | Fails when | Caught by |
|---|---|---|
| **everything** | a table holds person data nothing reads | Audit 1 — coverage |
| **everything** | a source IS read but renders unreadably | Audit 2 — render quality |
| **everyone** | it works for a student and breaks for a lead | Audit 3 — person shapes |

All three have already caught real defects. Run all three.

---

## The cardinal rule: absent is not zero

| State | Renders as | Means |
|---|---|---|
| `null` | "Not recorded" | We have no data. Do not infer. |
| `0` | `0` | We counted, and the answer is zero. |
| key absent | tab does not exist | The caller may not see this panel. |

A cohort that never took a register produces `attendanceRate: null`, **not** 0.
Rendering 0 there tells a reader nobody came, which is a different and false claim.
`?? 0` on a count is the commonest way this rule gets broken.

## The second rule: no row may be indistinguishable from another

A reader must never see the same line twice. Two ways this breaks:

1. **A NULL summary.** `student_skill_evidence` emitted `NULL AS summary`, so a
   card completion that credits 4 skills × 2 bands rendered as **eight identical
   lines** — 540 rows for one learner. They were never duplicates; the summary
   threw away the only thing that distinguished them.
2. **A genuine repeat.** Where a source really does record something N times,
   the row carries `occurrences` and renders `×N` rather than repeating.

**Every branch must emit a summary that distinguishes its rows.** A fan-out
(many rows from one action) must be grouped at the branch, on whatever column
ties it to the action — `source_ref`, `card_id`, a batch id.

---

## Architecture

```
backend/src/services/adminOs/
  personProfileService.ts     composer: permissions, id resolution, assembly
  personTimelineService.ts    the unified history (22 branches, deduped)
  personRef.ts                email | lead:123 | enrollment:<uuid> -> a person
  personScope.ts              lifecycle stage -> section row-level scope
  panels/
    acquisitionPanels.ts      lead record, appointments, automation
    journeyPanel.ts           the counts above the detail
    classPanels.ts            attendance, live rooms, curriculum progress
    workPanels.ts             projects, case studies, capstones, portfolio, cert
    accountPanels.ts          org ownership/membership, tenant, subscriptions
    growthPanels.ts           skills, AI mentor, content, community, context

frontend/src/adminOs/personTypes.ts      the payload contract
frontend/src/adminOs/personLink.ts       where a person's name links to
frontend/src/components/admin/person/    one component per tab, + PersonLink
```

**Panels are omitted server-side, never hidden in CSS.** A panel the caller may
not see is never queried and never serialised.

**A mentor is narrowed twice.** `personScope` says which lifecycle stages;
`visibleEnrollmentIds` says which specific learners. `null` means no filter (an
admin); `[]` means a mentor with no grants who must see nothing. Every
enrolment-keyed loader takes the **already-narrowed** id list.

---

## Audit 1 — coverage: is anything unread?

Finds every person-linked table holding rows, so a table added last quarter
shows up as a gap instead of silently missing.

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

**Diff the output against `references/source-registry.md`.** Any table with rows
that is not listed there is a gap: wire it, or record why it is excluded.

Two tables reach a person **indirectly** and this query cannot find them — check
by hand: `case_studies` → `projects.enrollment_id`, and `community_*` →
`community_members.enrollment_id`.

---

## Audit 2 — render quality: is anything unreadable?

Coverage says a source is read. This says a reader can actually use it.

**2a. Find fan-outs** — sources writing many rows per action:

```sql
-- Any source emitting >1 row per second for one person is a fan-out candidate.
-- Substitute the table and its timestamp column.
SELECT date_trunc('second', created_at) AS sec, COUNT(*) AS n
FROM student_skill_evidence
WHERE enrollment_id IN (SELECT id FROM enrollments WHERE lower(btrim(email)) = '<addr>')
GROUP BY 1 HAVING COUNT(*) > 1
ORDER BY 1 DESC LIMIT 10;
```

If `n > 1`, the branch **must** group on whatever ties those rows to one action,
and its summary must name what varied. `student_skill_evidence` groups on
`COALESCE(source_ref, id::text)` and lists the skills credited.

**2b. Find blank summaries** — grep the branches for the defect directly:

```bash
grep -n "NULL AS summary" backend/src/services/adminOs/personTimelineService.ts
```

Any hit is a defect. A branch with nothing worth summarising does not belong in
the timeline.

**2c. Confirm the reader sees no repeats — and measure it correctly.**

The test is **not** "no two adjacent rows look alike". Two GitHub-commit awards
two hours apart carry the same summary and are two real events; the timestamp
column tells them apart, and merging them would repeat the original defect of
discarding what distinguishes rows.

The test is **rows a reader cannot tell apart**: same second, same type, same
summary, and therefore nothing on screen to separate them.

```sql
-- Rows that would render indistinguishably. Anything > 1 is a defect.
SELECT occurred_at, source, type, summary, COUNT(*) AS occurrences
FROM ( <the branch union> ) t
GROUP BY date_trunc('second', occurred_at), domain, source, type, summary
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC LIMIT 10;
```

In the live check, the metric to drive to zero is **same-second identical rows**.
Adjacent rows minutes or hours apart with equal summaries are legitimate — judge
those by asking whether the summary carries what the reader needs, not by
counting them.

---

## Audit 3 — person shapes: does it work for EVERYONE?

The audit that built this profile used three enrolled students. That is not
everyone, and a profile that works for a student can break for a lead, a lapsed
member, or someone who enrolled without ever being a tracked lead.

**Pick one subject per row before claiming coverage.** Resolve them fresh — ids
go stale:

```sql
-- A live subject for each shape. Run this, then test each returned address.
-- Each branch is PARENTHESISED: LIMIT inside a bare UNION arm is a syntax error.
(SELECT 'enrolled_student' AS shape, e.email FROM enrollments e
  WHERE e.status::text = 'active' LIMIT 1)
UNION ALL
(SELECT 'lapsed_no_active', em FROM (
  SELECT lower(btrim(email)) AS em FROM enrollments GROUP BY 1
  HAVING bool_or(status::text='active') = false) x LIMIT 1)
UNION ALL
(SELECT 're_enrolled', em FROM (
  SELECT lower(btrim(email)) AS em FROM enrollments GROUP BY 1
  HAVING bool_or(status::text='active') AND bool_or(status::text='withdrawn')) y LIMIT 1)
UNION ALL
(SELECT 'pure_lead', l.email FROM leads l
  WHERE l.email IS NOT NULL AND NOT EXISTS (SELECT 1 FROM enrollments e2
    WHERE lower(btrim(e2.email)) = lower(btrim(l.email))) LIMIT 1)
UNION ALL
(SELECT 'enrolled_never_lead', e.email FROM enrollments e
  WHERE NOT EXISTS (SELECT 1 FROM leads l2
    WHERE lower(btrim(l2.email)) = lower(btrim(e.email))) LIMIT 1)
UNION ALL
(SELECT 'org_owner', e.email FROM organizations o
  JOIN enrollments e ON e.id = o.owner_enrollment_id LIMIT 1)
UNION ALL
(SELECT 'org_member', e.email FROM org_members om
  JOIN enrollments e ON e.id = om.enrollment_id LIMIT 1)
UNION ALL
(SELECT 'failing_payments', e.email FROM subscriptions s
  JOIN enrollments e ON e.id = s.enrollment_id
  WHERE s.status = 'failed' GROUP BY e.email HAVING COUNT(*) > 3 LIMIT 1)
UNION ALL
(SELECT 'heavy_learner', e.email FROM timeline_card_progress t
  JOIN enrollments e ON e.id = t.enrollment_id
  GROUP BY e.email ORDER BY COUNT(*) DESC LIMIT 1)
UNION ALL
(SELECT 'zero_activity', e.email FROM enrollments e
  WHERE NOT EXISTS (SELECT 1 FROM timeline_card_progress t2
    WHERE t2.enrollment_id = e.id) LIMIT 1);
```

**What each shape must prove:**

| Shape | Must show | Must NOT show |
|---|---|---|
| enrolled_student | all 10 programme panels | intent / temperature (suppressed post-conversion) |
| lapsed | stage `lapsed`, toned as a warning | — |
| re-enrolled | stage `enrolled_student` — **active outranks withdrawn** | `lapsed` |
| pure lead | acquisition, journey, intent | programme panels (null, not empty cards) |
| enrolled, never a lead | programme panels, `tracedToLead: false` | a fabricated acquisition story |
| organisation owner | `accountType: organisation_owner` | — |
| organisation member | `accountType: organisation_member` | — |
| failing payments | the subscription history | the red banner, **unless** failures follow the last success |
| heavy learner | a timeline with no repeated lines | identical adjacent rows |
| zero activity | stated gaps, "Not recorded" | zeros standing in for unknown |

Run each through the live endpoint:

```bash
ssh root@95.216.199.47 'docker exec accelerator-backend node -e "
const jwt=require(\"jsonwebtoken\");
const t=jwt.sign({sub:\"audit\",email:\"ali@colaberry.com\",role:\"admin\"},process.env.JWT_SECRET,{expiresIn:\"5m\"});
const panels=[\"classActivity\",\"curriculum\",\"work\",\"account\",\"billingDetail\",\"skills\",\"mentor\",\"content\",\"community\",\"profileContext\"];
(async()=>{ for (const ref of [/* addresses from the query above */]) {
  const r=await fetch(\"http://localhost:3001/api/admin/people/profile?ref=\"+encodeURIComponent(ref),{headers:{Authorization:\"Bearer \"+t}});
  const j=await r.json();
  console.log(ref,r.status,j.stage,\"panels:\",panels.filter(k=>j[k]).length,
    \"timeline:\",(j.timeline||[]).length,
    \"repeats:\",(j.timeline||[]).filter(e=>e.occurrences>1).length);
}})()"'
```

**Also test the permission shapes**, not only the person shapes: an admin, a
mentor with grants, a mentor with none (`[]` — must see nothing, not everything),
and a revenue-only identity. The mentor-with-no-grants case is the one that
silently shows the whole platform when it regresses.

---

## Adding a panel

1. **Measure first** (Audit 1). A panel over a table that is empty
   platform-wide will always look broken.
2. **Write the loader** in the fitting `panels/*.ts`, taking `enrollmentIds`
   (and `leadIds` where relevant). Return `null` for an empty id list.
3. **Guard the counts.** `null` when the source cannot answer.
4. **Gate it** in `PANEL_SECTIONS`. Do not invent a new section key.
5. **Add the type** to `frontend/src/adminOs/personTypes.ts` and `PersonProfile`.
6. **Build the tab** using `primitives.tsx` so empty states match.
7. **Register the tab**, conditional on the panel being present.
8. **Add timeline branches** for anything with a meaningful timestamp — with a
   distinguishing summary, grouped if it fans out (rule 2).
9. **Run all three audits.**

---

## Verification — required before shipping

Unit tests do not touch a database. **Run the SQL against production**, or you
are shipping unparsed strings.

- [ ] Query runs against production and returns rows for a real person
- [ ] Timing is sane (the KPI query once took 72 seconds — see the EXISTS trap)
- [ ] `npx -y -p typescript@5.7.3 tsc --noEmit` (bare `npx tsc` resolves a stale 4.9.5)
- [ ] `npx jest -c jest.ci.config.ts --ci` from `backend/`
- [ ] Audit 2: no `NULL AS summary`, no undiscovered fan-out
- [ ] Audit 3: every person shape returns the expected panels
- [ ] A panel with no data states a reason; it does not render a blank card
- [ ] A scoped role does **not** receive the panel in the payload

**Run one check per output file.** Two `tsc` runs writing the same file will
delete each other's output mid-write and leave an exit code with no errors
attached — which reads exactly like a clean run. This has happened.

---

## Traps this surface has already hit

**Sequelize array replacement.** `= ANY(:ids)` expands to `= ANY('a','b')` — a
syntax error. Always `IN (:ids)`. Thirteen unit tests passed on a query that
could not parse, because they mocked the query layer.

**`MAX(status)` is alphabetical.** `'withdrawn' > 'active'`, so a person who
re-enrolled read as lapsed — 29 of 53. Use `bool_or(status = 'active')`.

**Correlated `EXISTS` inside `COUNT(...) FILTER`.** Postgres evaluates per row:
68 ms in a `WHERE` became 72,418 ms inside the aggregate. Build the set, LEFT JOIN it.

**Sequelize write result shapes.** INSERT returns a number in `result[1]`;
UPDATE returns a pg result with `.rowCount`. Read both.

**A fan-out with no summary.** See rule 2. 540 rows rendered as identical lines.

**Import depth in generated edits.** A script inserting `../../` into a file
three directories deep produces a module that does not resolve. Audit every
generated import path, not the first one.

**CRA code-splits.** Grepping `main.*.js` for an admin string shows it absent
and looks like a failed deploy. Admin pages live in chunks.

---

## Known gaps — state them, never render them as zero

| Gap | Why |
|---|---|
| Graduation | `enrollments.status` supports `completed`, the profile reads it, nothing sets it. 0 as of 2026-09-09. |
| Placement / employment | Not tracked anywhere in this database. |
| Payment transactions | Subscription STATE is local; charges live in PaySimple, unjoined. |
| Attendance | Unreliable — many cohorts never took a register. Content consumption and curriculum progress are the trustworthy signals. |
| Cert prep | 3 sessions platform-wide, 0 responses. Barely used, not broken. |
| Identity beyond email | Exact normalised email only. Ambiguous matches are never silently merged. |

---

## References

- `references/source-registry.md` — every person-keyed table, its state, and why
- Lifecycle vocabulary and joinability: `backend/src/services/adminOs/lifecycle.ts`
- Metric trust levels: `backend/src/services/adminOs/metricRegistry.ts`
