# Verification queries — the evidence, not the vibe

Every command here answers a question with a fact. Run them against the real database,
not against the poll response — the poll returns the **latest** plan, not the published
one (`getPlan()` with no version is `ORDER BY version DESC LIMIT 1`), so it will happily
report a draft on a project that also has a published v1.

## Getting a shell

```bash
ssh root@95.216.199.47
docker exec accelerator-db psql -U accelerator -d accelerator_prod -c "SELECT 1"
```

The backend container is `accelerator-backend`; its port 3001 is **not** published on the
host, so health checks go through `docker exec` and the image has no `wget` — use
`node -e "fetch(...)"`. The DB container is `accelerator-db`, user `accelerator`, database
`accelerator_prod` (defaults from `docker-compose.production.yml:4-12`; read the real
values out of `/opt/colaberry-accelerator/.env` if they were overridden).

Read-only queries are safe at any hour. Anything that writes waits for after hours.

---

## Q1 — THE query. Is this student genuinely ready?

One row, one boolean. `ready = true` means: the plan is published, STORY-000 exists,
there is at least one task, every task is dated, and the project is the one the
enrollment points at.

```sql
SELECT
  p.id                                             AS project_id,
  e.id                                             AS enrollment_id,
  bp.version                                            AS plan_version,
  COALESCE(bp.status = 'published', false)              AS plan_published,
  COUNT(st.id)                                          AS tasks,
  COALESCE(BOOL_OR(st.story_id = 'STORY-000'), false)   AS has_story_000,
  COUNT(st.id) FILTER (WHERE st.due_on IS NULL)         AS undated_tasks,
  COALESCE(e.active_project_id = p.id, false)           AS is_active_project,
  (
        COALESCE(bp.status = 'published', false)
    AND COALESCE(BOOL_OR(st.story_id = 'STORY-000'), false)
    AND COUNT(st.id) > 0
    AND COUNT(st.id) FILTER (WHERE st.due_on IS NULL) = 0
    AND COALESCE(e.active_project_id = p.id, false)
  )                                                     AS ready
FROM projects p
JOIN enrollments e   ON e.id = p.enrollment_id
LEFT JOIN build_plans bp
       ON bp.project_id = p.id AND bp.status = 'published'
LEFT JOIN student_tasks st
       ON st.project_id = p.id
WHERE p.id = :project_id
GROUP BY p.id, e.id, bp.version, bp.status;
```

Note every join is on `project_id`. Never join `student_tasks` on `story_id` alone —
`STORY-001` exists in every plan in the database (H-6).

## Q1b — the same question for a whole cohort, which is how you find the ones nobody reported

```sql
SELECT e.id                                          AS enrollment_id,
       p.id                                          AS project_id,
       COALESCE(bp.status, '(no published plan)')    AS plan_status,
       COUNT(st.id)                                        AS tasks,
       COALESCE(BOOL_OR(st.story_id = 'STORY-000'), false) AS story_000,
       COUNT(st.id) FILTER (WHERE st.due_on IS NULL)       AS undated,
       COALESCE(e.active_project_id = p.id, false)         AS active
FROM enrollments e
JOIN cohorts c            ON c.id = e.cohort_id
LEFT JOIN projects p      ON p.enrollment_id = e.id
LEFT JOIN build_plans bp  ON bp.project_id = p.id AND bp.status = 'published'
LEFT JOIN student_tasks st ON st.project_id = p.id
WHERE c.id = :cohort_id
GROUP BY e.id, p.id, bp.status
ORDER BY plan_status, tasks;
```

Sort puts the broken ones at the top. `(no published plan)` with a non-zero task count
means those tasks came from somewhere other than publish — almost certainly a
localStorage import.

---

## Q2 — the draft sweep (H-1). Run this before every class.

Plans that were generated and never published. Each row is a student who will open the
portal to nothing.

```sql
SELECT bp.project_id,
       bp.version,
       bp.gate_ok,
       bp.created_at,
       p.enrollment_id,
       (SELECT COUNT(*) FROM student_tasks st WHERE st.project_id = bp.project_id) AS tasks
FROM build_plans bp
JOIN projects p ON p.id = bp.project_id
WHERE bp.status = 'draft'
  AND NOT EXISTS (
        SELECT 1 FROM build_plans x
         WHERE x.project_id = bp.project_id AND x.status = 'published')
ORDER BY bp.created_at DESC;
```

`tasks = 0` on one of these confirms it: generated, gate-clean, never materialized.

## Q3 — intake status, when there is no plan row at all

```sql
SELECT project_id, enrollment_id, status, correlation_id, created_at, updated_at,
       length(idea) AS idea_chars,
       jsonb_array_length(COALESCE(answers, '[]'::jsonb)) AS answers
FROM build_intake
WHERE project_id = :project_id;
```

`generating` for more than ~10 minutes is a lost job (a restart drops the in-memory
queue; the intake is deliberately replayable, so re-POST the build). `failed` means
generation itself threw — find the reason by correlation id, Q7.

## Q4 — does the cohort have a start date? (H-4)

```sql
SELECT c.id, c.name, c.start_date
FROM enrollments e JOIN cohorts c ON c.id = e.cohort_id
WHERE e.id = :enrollment_id;
```

`start_date IS NULL` ⇒ `scheduleFor()` returns null ⇒ every task materializes with
`due_on = NULL` and the whole demo-prep list (PREP-1..PREP-6) is absent. Fix the cohort,
then republish; materialize is idempotent and will backfill the dates.

## Q5 — what actually got materialized

```sql
SELECT l.cluster, l.title, l.position,
       COUNT(t.id) AS tasks,
       MIN(t.due_on) AS first_due,
       MAX(t.due_on) AS last_due
FROM student_task_lists l
LEFT JOIN student_tasks t ON t.task_list_id = l.id
WHERE l.project_id = :project_id
GROUP BY l.id, l.cluster, l.title, l.position
ORDER BY l.position;
```

Healthy shape: clusters `r0, r1, … rN, prep`; titles `Release N · <name>` and
`Demo prep · the dedicated week`. **Cluster values that are UUIDs are localStorage
release ids** — that project has been written by the browser import path, not by
publish.

## Q6 — completion vs verification (H-8)

```sql
SELECT story_id, title, status, verified_at, verified_by
FROM student_tasks
WHERE project_id = :project_id AND (status = 'complete' OR verified_at IS NOT NULL)
ORDER BY position;
```

`status='complete'` with `verified_at IS NULL` earns no points. That combination is
legitimate only for rows that predate the verification columns; anything new means
something wrote `complete` down a path that is not `markTaskVerifiedComplete`.

## Q7 — the logs, by correlation id

Every SBP log line is JSON with a `correlation_id` you can get from Q3 or from the
`POST /builds` response.

```bash
docker logs accelerator-backend --since 60m 2>&1 | grep '"service":"sbp-orchestrator"'
docker logs accelerator-backend --since 60m 2>&1 | grep '<correlation-id>'
```

Events worth knowing by name:

| Event | Means |
|---|---|
| `sbp_build_started` | intake persisted, job queued |
| `sbp_build_repairing` | gate found violations, repair attempt N running |
| `sbp_build_generated` | plan written as **draft** — note this is not published |
| `sbp_build_failed` | generation threw; `error_class` says which boundary |
| `sbp_build_queue_failed` | the job never ran |
| `sbp_schedule_skipped` | **no cohort start_date** — tasks will be undated |
| `sbp_schedule_built` | dates computed; carries `buildWeeks`, `capacity`, `demoDay` |
| `sbp_agents_scope_failed` / `_unusable` / `_rejected_placeholder` | scoping fell back; plan keeps original owners |
| `sbp_build_published` / `sbp_build_published_no_repo` | publish completed |
| `sbp_active_project_set` / `_noop` / `_failed` | the visibility pointer |
| `sbp_repo_write_committed` / `_noop` / `_failed` | the GitHub write |
| `project_import_skipped_published` | the H-6 guard refusing a stale tab |
| `task_status_client_complete_refused` | H-8 guard firing (expect a lot of these) |
| `sbp_schema_incomplete` | **DDL did not land** — read the `missing` array |

## Q8 — schema post-condition (H-7)

Never trust that `ensureSbpSchema` ran. It swallows every statement failure.

```sql
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (table_name, column_name) IN (
      ('build_intake','answers'),
      ('student_tasks','due_on'),
      ('student_tasks','due_baseline_on'),
      ('student_tasks','verified_at'),
      ('student_tasks','verified_by'))
ORDER BY 1, 2;
```

Five rows expected. Fewer means an `ALTER` was skipped and the code is writing values
Postgres is silently dropping. Also check the tables and indexes:

```sql
SELECT tablename FROM pg_tables
 WHERE schemaname='public' AND tablename IN ('build_intake','build_plans');
SELECT indexname FROM pg_indexes
 WHERE schemaname='public'
   AND indexname IN ('build_intake_unique_project','build_plans_unique_project_version');
```

And the boot log:

```bash
docker logs accelerator-backend 2>&1 | grep -E "sbp schema stmt skipped|sbp_schema_incomplete|SBP schema ensured"
```

---

## HTTP verification

All SBP endpoints are participant-scoped: the enrollment comes from the JWT and never
from the body, and a project that is not yours answers **404**, not 403, so it cannot be
probed. Mint a participant JWT the way this program's other deploy verifications do.

```bash
# The flag. All five endpoints answer 404 without it.
docker exec accelerator-backend printenv | grep -E 'SBP_PIPELINE_ENABLED|PROJECT_API_ENABLED|SBP_AGENT_SCOPING|SBP_PROVISION_CONCURRENCY'

# Poll a build
curl -s -H "Authorization: Bearer $JWT" \
  https://enterprise.colaberry.ai/api/portal/sbp/builds/$PROJECT_ID | jq '.status, .plan.version, .gate.ok'

# Publish it
curl -s -X POST -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' \
  -d '{}' \
  https://enterprise.colaberry.ai/api/portal/sbp/builds/$PROJECT_ID/publish | jq

# What the student's portal will actually render
curl -s -H "Authorization: Bearer $JWT" \
  https://enterprise.colaberry.ai/api/portal/projects/active \
  | jq '{id, lists: [.lists[] | {cluster, title, n: (.tasks|length)}]}'
```

`GET /api/portal/projects/active` returns `200 {"project": null}` — **not** a 404 — when
there is no active project. A `null` there with a published plan in the database is
`makeActiveProject` having failed; check for `sbp_active_project_failed`.

Publish response decoder:

| Field | Healthy | Meaning if not |
|---|---|---|
| `status` | `published`, or `awaiting_repo` | `awaiting_repo` is fine and expected with no `GITHUB_TOKEN` / no repo — tasks still materialized |
| `planVersion` | the version you reviewed | a different number means you published a plan nobody looked at |
| `commitSha` | a sha, or `null` when `awaiting_repo` | `null` with `status: published` is impossible |
| `filesWritten` | ~16-19 | 0 with a repo means the write no-opped |

Publish failure codes: **404** no plan to publish · **409** blocking gate violations
(the message names them) · **409** hash mismatch when `expected_sha256` was supplied and
the row changed · **503** queue full.
