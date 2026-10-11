# Presentation Studio — production rehearsal

**Who this is for:** whoever runs the first real practice session on production — Ali,
an instructor, or a student being watched. No code knowledge needed for steps 1–4; the
checks in step 5 onward are copy-paste SQL.

**Why it exists.** Everything in the Studio's recording pipeline is proved by unit tests
and by code being present in the running container. **No real recording has ever been
through it.** As of 2026-10-06 production holds 24 presentation assignments, 1 attempt
and **0 recordings**. Until one real session completes, "it works" is an inference, not
an observation.

This runbook is the one thing that turns that inference into evidence. It takes about
25 minutes of wall-clock, most of it waiting for Zoom.

---

## Before you start

| Thing | Expected | How to check |
|---|---|---|
| Practice hosts | 7 enabled and verified | `SELECT COUNT(*) FROM zoom_hosts WHERE enabled AND verified_at IS NOT NULL;` |
| Studio flag | on | `docker exec accelerator-backend printenv PRESENTATION_STUDIO_ENABLED` |
| Zoom webhook | subscribed to `recording.completed` | Zoom Marketplace → the Server-to-Server app → Feature → Event Subscriptions |

The webhook is the step most likely to be quietly wrong, and it is the one that cannot
be inferred from inside this codebase. **If no webhook is subscribed, the recording will
never arrive and nothing in the app will tell you why** — it will simply sit at
"waiting for your recording" forever.

Run every SQL block below as:

```bash
ssh root@95.216.199.47
U=$(docker exec accelerator-backend printenv DB_USER)
docker exec accelerator-db psql -U "$U" -d accelerator_prod -c "<the query>"
```

---

## 1. Book a practice session

As a student with a build project, open a demo-prep task (PREP-2 is the natural one:
"record a first run-through") and book a practice room a few minutes out.

**Check it reserved a slot and a host:**

```sql
SELECT a.attempt_no, a.mode, a.attempt_state, a.recording_state, s.host_email, s.state
  FROM presentation_attempts a
  LEFT JOIN presentation_slot_reservations s ON s.attempt_id = a.id
 ORDER BY a.created_at DESC LIMIT 3;
```

Expect one row, `attempt_state = 'scheduled'`, `recording_state = 'expected'`, and a
`host_email` that is **not** `ali@refactored.ai` unless the other six are busy — that
account is priority 90 on purpose because classes run on it.

`occurrence_uuid` being NULL here is correct. It is stamped later, by the correlation,
when a recording actually arrives.

## 2. Join and present

Join from the task page. Talk for **at least two minutes** and **share your screen** —
both matter, because the platform now reports `has_audio` and `has_shared_screen` back
to the student, and a ten-second silent take is a worse test than no test.

Then **end the meeting for everyone.** Zoom does not finalise a cloud recording when the
host merely leaves.

## 3. Wait

Zoom usually delivers within 10–30 minutes for a short session. Make tea.

## 4. Check the recording arrived

```sql
SELECT r.id, r.attempt_id, r.part_no, r.ingest_status, r.ingest_provenance,
       r.has_audio, r.has_shared_screen, r.duration_seconds, r.review_reason
  FROM presentation_recordings r ORDER BY r.created_at DESC LIMIT 5;
```

**This is the assertion the whole phase rests on.** What each outcome means:

| What you see | What it means | What to do |
|---|---|---|
| One row, `ingest_status = 'ingested'`, `attempt_id` = your attempt | The pipeline works end to end. | Continue to step 5. |
| No rows at all | The webhook never fired, or never reached us. | Check the Marketplace subscription and the backend logs for `recording.completed`. |
| `ingest_status = 'review'` with a `review_reason` | It arrived but could not be attributed. | Read the reason — it names which rule declined. |
| `attempt_id = 00000000-...` | Parked, owned by nobody. Same as review. | As above. |
| Two rows with `part_no` 1 and 2 | Normal. Zoom split it because the host restarted. Both halves should be present. | Continue. |

Also confirm the attempt was stamped:

```sql
SELECT attempt_state, recording_state, occurrence_uuid IS NOT NULL AS stamped
  FROM presentation_attempts ORDER BY created_at DESC LIMIT 1;
```

`stamped` should now be `t` and `recording_state` should have moved off `expected`.

## 5. Hand it in from inside the platform

Back on the task, choose **"Use a Studio recording"**. Your take should be listed, with
its length, and a warning if it has no audio or no shared screen.

Pick it and submit. Then:

```sql
SELECT story_id, status, verified_by, verified_ref, verified_at
  FROM student_tasks WHERE verified_at IS NOT NULL AND story_id LIKE 'PREP-%'
 ORDER BY verified_at DESC LIMIT 3;
```

Expect `verified_by = 'demo_recording'` and a `verified_ref` of the form
`recording:<uuid>`. **A `verified_ref` that is a bare uuid or a URL is a bug** — report
it, because several surfaces read that column as a commit sha.

## 6. Check it paid once, and only once

```sql
SELECT event_type, event_key, points, created_at
  FROM student_points_events WHERE event_key LIKE 'project:%'
 ORDER BY created_at DESC LIMIT 5;
```

One row for this task. Now **submit again** from the UI. The page should say it is
already verified, award nothing, and the query above should still show exactly one row.
Two rows is a points faucet and is the single most important thing this step catches.

## 7. Check nothing else moved

```sql
SELECT verified_by, COUNT(*) FROM student_tasks
 WHERE story_id LIKE 'PREP-%' AND verified_at IS NOT NULL GROUP BY verified_by;
```

Before this rehearsal: **29 tasks, all `demo_evidence`.** Afterwards expect 29
`demo_evidence` plus your 1 `demo_recording`. Any change to the 29 means historical
completions were disturbed, which they must not be.

---

## If the recording never arrives

That is the case the recovery path exists for, and it is worth exercising deliberately
at least once:

- `POST /api/portal/projects/:projectId/tasks/:storyId/recording-recovery` with
  `{ attempt_id, url }` records where the student's own copy lives.
- It is **refused with 409** if a real recording already arrived — a link may never be
  pasted over a take we captured.
- The link must be publicly openable; localhost and private addresses are refused.
- The take is then marked *"your own link, not captured here"* wherever it is offered,
  so a reviewer always knows nobody verified it.

This has **no UI yet** — it is reachable only by API until the Studio panel work lands.

## Rollback

Nothing here writes to historical data, so there is no data rollback. To back the code
out, redeploy the previous commit with the same command:

```bash
cd /opt/colaberry-accelerator && git checkout <previous-sha> && \
  bash ./scripts/deploy-prod.sh backend nginx
```

## Known limits, so they are not mistaken for faults

- **A demo-day cohort recording never appears in a student's picker.** It belongs to the
  session, not to one presenter, and is deliberately stored owning no attempt. Each
  presenter gets a time range into it instead.
- **That range is an estimate** derived from the scheduled slot, never measured from the
  video, and it says so. There is no clipping pipeline, so no per-student file exists.
- **PREP-6 is marked by staff**, never by the student, and no recording changes that.
