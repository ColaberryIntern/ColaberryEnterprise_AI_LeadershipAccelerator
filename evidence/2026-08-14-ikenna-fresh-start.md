# Evidence capture — Ikenna, fresh-start check

**Captured:** 2026-08-14, production (`accelerator-backend`, read-only queries)
**Reason:** Ali asked that Ikenna be put in a state where he can create a project from scratch on his ACTIVE enrollment.
**Outcome: NO WRITES WERE MADE.** The active enrollment was already in the required state; this file records the state as found, and the one residual risk.

Secrets redacted: `portal_token` values and JWTs are never recorded here. Email is referenced by enrollment id only.

---

## The two enrollments (same email, same cohort `1f1d86f4…` = Cohort - July 2026)

| | **WITHDRAWN** | **ACTIVE** |
|---|---|---|
| id | `e80982ab-56d7-4ac2-9f69-7e3d8e6f52ec` | `7920f925-9d58-43dc-881a-9ac53168a7aa` |
| full_name | Ikenna Nzeribe | Ikenna |
| status | `withdrawn` | `active` |
| payment_status | paid | paid |
| portal_enabled | true | true |
| `active_project_id` | `c16a410c-b6da-4ac6-89de-1d6148711da9` | **null** |
| intake_completed | false | false |
| created_at | 2026-07-07T19:51:33Z | 2026-07-16T23:30:35Z |
| enrolled_at | null | 2026-07-17T14:10:03Z |
| portal_token_expires_at | 2026-08-11T23:59:56Z (expired) | 2026-08-15T23:30:36Z |

## The half-built project (on the WITHDRAWN enrollment only)

`projects.id = c16a410c-b6da-4ac6-89de-1d6148711da9`, created **2026-08-14T02:15:03Z**.

It is an empty shell. Every content field is null: `name`, `organization_name`, `industry`, `primary_business_problem`, `selected_use_case`, `automation_goal`, `data_sources`, `system_model`, `requirements_document`, `claude_md_content`. `project_stage = 'discovery'`, `setup_status` all-false, `project_variables = {}`.

Related rows:

| Table | Count | Note |
|---|---|---|
| `build_intake` | **0** | confirms the intake never reached the server |
| `build_plans` | **0** | no plan was ever generated or published |
| `github_connections` | **0** | no repo connected |
| `student_tasks` | 10 | generic client-side template, story_ids `p1786673555636-t1…t10` |
| `student_task_lists` | 1 | `p1786673555636-L1` "Project DNA & Requirements" |

The 10 tasks are boilerplate identical for every student ("Implement the core action against a real source", "Record a 2-minute demo screencast", "Write the one-pager for reviewers"). **Nothing in this project encodes Ikenna's idea** — consistent with the finding that his intake never reached the server and his original idea is unrecoverable.

## Verification: the ACTIVE enrollment is already fresh

A 10-minute participant JWT was minted for the ACTIVE enrollment and used against the live backend:

```
GET /api/portal/projects/active   →  200  {"project":null}
GET /api/portal/projects          →  200  {"projects":[]}
```

`{"project":null}` is exactly the no-project state the portal renders the creation wizard from. No half-built project, no stale intake, wizard available.

Login resolution was confirmed in code, not assumed: `requestMagicLink` (`backend/src/services/participantService.ts:112`) filters `status:'active', portal_enabled:true` before `pickBestEnrollment`, and `verifyMagicLink` (`:162`) filters `status:'active'`. The withdrawn row is not a candidate, so a fresh sign-in lands on the ACTIVE enrollment. Only one active candidate exists, so the tiebreak never runs.

## Residual risk: a stale JWT bypasses all of that

`requireParticipant` (`backend/src/middlewares/participantAuth.ts:34-63`) verifies the token signature and **never reloads the enrollment** — it does not check `status`. Participant JWTs last **7 days** (`participantService.ts:15-26`).

Confirmed empirically — a JWT minted for the WITHDRAWN enrollment returns the shell project:

```
GET /api/portal/projects/active  (sub = e80982ab…)  →  200  {"id":"c16a410c…", "lists":[…]}
```

This explains how tonight's project came to exist on a withdrawn enrollment: the withdrawn row's magic-link token expired 2026-08-11, but a JWT minted on or before that date stays valid for 7 days — through ~2026-08-18 — and the project was created 2026-08-14T02:15Z under it.

**A fresh magic link was already issued against the ACTIVE enrollment on 2026-08-14T23:30Z** (its `portal_token_expires_at` is 24h later). If he used it, his browser now holds an ACTIVE-enrollment token and he is clean.

**Action needed:** none in the database. If Ikenna still sees the old half-built project, he is on the stale session — signing out and back in (or using the newest magic link) resolves it, and the stale token expires on its own by ~2026-08-18.

## What was deliberately NOT done

- The withdrawn enrollment was **not** deleted, withdrawn further, or modified.
- The shell project and its 10 tasks were **not** deleted.
- `active_project_id` was **not** cleared on the withdrawn row. It would not have helped: `getProjectByEnrollment` (`backend/src/services/projectService.ts:84`) falls back to the newest project for the enrollment when the pointer is null, so the shell would still resolve.

Making the stale-JWT path show the wizard would require deleting or detaching the shell project — a destructive edit to the withdrawn enrollment's history, which Ali's instruction ruled out. It is also unnecessary: the goal was stated as a fresh start **on his ACTIVE enrollment**, and that is verified.
