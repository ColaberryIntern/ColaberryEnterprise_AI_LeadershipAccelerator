# Task Worker — Prompt Pack

Ready-to-run Claude Code prompts for the AI-doable tasks in Ali's Basecamp queue.
Paste any block below into a Claude Code session opened in this repo and it runs
end-to-end (reads the ticket, works on a branch, tests, opens a PR).

This is a **static snapshot** (2026-07-05). The `runTaskPromptWorker.js` worker
generates the same shape of prompt dynamically from the live queue 3×/day.

---

## Already done this session (todos 9931484201, 9931484238)

`chapterQualityService.ts` (per-section confidence scoring) + `chapterOnTopicGuard.ts`
(drift detection + corrective re-prompt), wired into `contentGenerationService.ts`,
20/20 tests green. To ship:

```
In the Colaberry Enterprise AI Leadership Accelerator repo, the working tree on branch
workstream/student-build-sync contains new files chapterQualityService.ts,
chapterOnTopicGuard.ts (backend/src/services/) + their tests + wiring in
contentGenerationService.ts, implementing Basecamp todos 9931484201 and 9931484238.
Move ONLY those chapter-quality files onto a fresh branch workstream/chapter-quality off
origin/main, run tsc --noEmit + jest for them, open a PR titled "AI Pathway:
chapter-output quality scoring + on-topic guard". Do not touch the unrelated
student-sync changes. Do not deploy.
```

---

## 1 — Set up daily automated dashboard update
Ticket: https://app.basecamp.com/3945211/buckets/47502609/todos/9946497986

```
You are a Claude Code agent in the Colaberry Enterprise AI Leadership Accelerator repo (Node/Express/TS).

TICKET "Set up daily automated dashboard update": https://app.basecamp.com/3945211/buckets/47502609/todos/9946497986
(project: AI Systems Architect Accelerator; list: "Launch Readiness Dashboard")

STEP 0 - real spec: the ticket body is a generic placeholder. Read its comment thread + the linked
briefs in the project Vault (05-cb-pmo-contract.md, 19-ali-decisions.md) for what the Launch Readiness
Dashboard tracks.

GOAL: a deterministic script that runs once daily and sends/updates the Launch Readiness Dashboard.

WHERE:
- New backend/src/scripts/dailyLaunchReadinessDashboard.js, mirroring backend/src/scripts/dailyClientProjectsReport.js.
- Register it in backend/src/scripts/lib/reportingRegistry.js (cadence:'daily', sendHourUTC, recipients,
  projectId '47502609'); it is then run by runReportingAuditAndSend.js.
- Source readiness data from the Launch Readiness Dashboard todos via the ops_bc_todos mirror.

ACCEPTANCE: registered report fires on its hour; idempotent (keyed on date+recipient); jest test for the
metric computation + daily dedupe.

CONTRACT (CLAUDE.md): tsc --noEmit clean for touched files; jest happy + idempotency; update PROGRESS.md
with a fresh Session ID; branch workstream/launch-readiness-daily; open a PR; DO NOT deploy; no real emails
(use the reporting test-mode flag); no secrets.

REPORT: files changed, test output, PR link; confirm nothing was emailed/posted for real.
```

## 2 — Implement escalation rules in the dashboard
Ticket: https://app.basecamp.com/3945211/buckets/47502609/todos/9946497989

```
You are a Claude Code agent in the Colaberry Enterprise AI Leadership Accelerator repo.

TICKET "Implement escalation rules in dashboard": https://app.basecamp.com/3945211/buckets/47502609/todos/9946497989

STEP 0 - read the ticket thread + the CB System PMO Operating Contract brief (05-cb-pmo-contract.md) for
what should escalate and to whom.

GOAL: a configurable, DETERMINISTIC escalation ruleset evaluated against Launch Readiness signals (task
overdue > N days, blocked, red status), surfaced on the dashboard and raised to Ali.

WHERE:
- New backend/src/models/EscalationRule.ts (signal, operator, threshold, action) + register in models/index.ts.
- New backend/src/services/escalationRulesService.ts (pure evaluate(rules, signals) -> escalations; no LLM).
- Admin CRUD routes mirroring backend/src/controllers/adminCampaignController.ts + routes/admin/campaignRoutes.ts;
  expose GET /api/admin/dashboard/escalations.
- Reuse the existing Alert/AlertEvent models for raising, and the /tmp/escalation.json + owner-notify
  convention in CLAUDE.md.

ACCEPTANCE: rules stored + editable; evaluation deterministic + unit-tested (happy + boundary + no-match);
idempotent (same signals -> same escalations, no duplicate alerts).

CONTRACT (CLAUDE.md): tsc clean; jest happy+failure+boundary+idempotency; PROGRESS.md entry w/ fresh Session
ID; branch workstream/escalation-rules; open a PR; DO NOT deploy; no secrets.

REPORT: files, tests, PR link.
```

## 3 — Integrate curriculum % tracking
Ticket: https://app.basecamp.com/3945211/buckets/47502609/todos/9946498008

```
You are a Claude Code agent in the Colaberry Enterprise AI Leadership Accelerator repo.

TICKET "Integrate curriculum % tracking": https://app.basecamp.com/3945211/buckets/47502609/todos/9946498008

GOAL: compute and expose curriculum completion % (overall + per module) for an enrollment, surfaced on the
dashboard. The frontend already expects this shape.

WHERE:
- New backend/src/services/curriculumProgressService.ts: getEnrollmentProgress(enrollmentId) queries
  LessonInstance (status completed/in_progress) grouped by module against CurriculumLesson to compute
  completed/total + %; mirror the aggregation style of backend/src/services/dashboardService.ts.
- Route GET /api/portal/curriculum returning { overall_progress, total_lessons, completed_lessons,
  modules:[{completed_lessons,total_lessons,...}] } - the exact shape frontend/src/pages/portal/
  PortalDashboardPage.tsx already consumes. Add admin variant GET /api/admin/enrollments/:id/curriculum-progress.
- Models already exist: Enrollment, CurriculumLesson, CurriculumModule, LessonInstance.

ACCEPTANCE: % matches LessonInstance data; deterministic; handles empty (0%) and all-complete (100%); jest
tests (happy + empty + boundary + idempotency); response matches the frontend contract exactly.

CONTRACT (CLAUDE.md): tsc clean; jest; PROGRESS.md entry w/ fresh Session ID; branch
workstream/curriculum-progress; open a PR; DO NOT deploy.

REPORT: files, tests, PR link.
```

## 4 — Build human eval set (+ its parameters)
Tickets: https://app.basecamp.com/3945211/buckets/46697389/todos/9946674473 (parameters) and
https://app.basecamp.com/3945211/buckets/46697389/todos/9946674477 (build)

```
You are a Claude Code agent in the Colaberry Enterprise AI Leadership Accelerator repo.

TICKETS:
- Parameters: https://app.basecamp.com/3945211/buckets/46697389/todos/9946674473 (dimensions, 5-8 max:
  accuracy, depth, tone, scaffolding, examples, exercises, ROI, role-relevance)
- Build: https://app.basecamp.com/3945211/buckets/46697389/todos/9946674477

STEP 0 - read both threads (Luda's May 31 asks) for the final dimension list.

GOAL: a small fixed eval set of generated lessons that humans grade on the agreed dimensions, stored and
comparable against the automatic chapterQualityService scores.

WHERE:
- New models backend/src/models/EvalSetLesson.ts + backend/src/models/HumanEvalGrade.ts (grader_id,
  per-dimension scores, grade A-F, comments, graded_at, the ContentGenerationLog version graded); register
  in models/index.ts; create tables via an idempotent ensure-schema (mirror ensureStudentTaskSchema in server.ts).
- New backend/src/services/evalSetService.ts (list eval lessons + their chapterQualityService auto-scores;
  record a grade) + aggregation (mean grade per lesson, distribution, correlation to auto-confidence).
- Admin routes backend/src/routes/admin/evalRoutes.ts: GET /api/admin/eval-set/lessons, GET .../lessons/:id,
  POST .../lessons/:id/grade, GET .../results; mirror adminCampaignController + campaignRoutes.
- Seed ~20-30 lessons spanning lesson_type and 2-3 modules; include some low-confidence lessons.
- Reuse: chapterQualityService.ts, qualityScoringService.ts, ContentGenerationLog.

ACCEPTANCE: grading idempotent per (lesson, grader, content-version); results endpoint returns
mean/distribution/correlation; jest tests (happy + failure + boundary + idempotency).

CONTRACT (CLAUDE.md): tsc clean; jest; PROGRESS.md entry w/ fresh Session ID; branch workstream/human-eval-set;
open a PR; DO NOT deploy; no secrets.

REPORT: files, tests, PR link.
```

---

## Not code fixes (a prompt won't do these — they're yours)
- **Read Ram's 3 white papers & reply** (9946674468) — needs the `.docx` files + your design judgment.
- **DECISION: native community** (9985688801) — your strategic call.
- **The "Approve X" queue** (sales materials, viral videos, websites, cohort size, …) — human sign-offs.
