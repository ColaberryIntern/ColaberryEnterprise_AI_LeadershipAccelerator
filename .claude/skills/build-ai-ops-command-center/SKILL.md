---
name: build-ai-ops-command-center
description: End-to-end recipe for building an "AI Ops Command Center" on top of any work-tracker (Basecamp, Linear, Jira, Asana, ClickUp) — a single-pane queue that mirrors active tasks, scores them deterministically, surfaces a per-task Claude Code prompt + structured suggestion, lets the operator decide inline with write-back to the source system, supports a "Run My Day" sequenced walk, captures skills, runs brand compliance preflight, and fires deterministic automation rules. Invoke when a client / project owner says "I want one place to triage everything assigned to me across all my projects, with the AI telling me what to do next on each one."
user-invocable: true
---

# Build an AI Ops Command Center — Portable Recipe

This is the recipe Colaberry shipped over **24 hours** for their CEO's queue across 50 Basecamp projects. It went from "no admin/ops surface" to a production-deployed Command Center with 5,657 todos scored, structured per-task suggestions, inline decide-and-write-back, Run My Day sequenced mode, skill capture, brand compliance preflight, and a 3-rule automation engine — without a single LLM API call. Every surface is **deterministic by design** so it can run cheaply and predictably.

## When to invoke

Invoke this skill when the user describes any variant of:
- "I want one place to see everything assigned to me across all my projects"
- "The work-tracker is fine but I waste 90 min every morning deciding what's urgent"
- "We need an exec triage page on top of Basecamp / Linear / Jira / Asana"
- "I want AI to tell me what to do next on each ticket, with the prompt ready to fire"

**Do NOT invoke for:**
- Simple project-dashboard requests (use a BI tool)
- Building a new work tracker from scratch (that's a different scope)
- Anything requiring autonomous outbound action without human-in-loop (the entire design philosophy here is human-decides, agent-executes-after-approval)

## Core doctrine — do not skip

These six principles ship before any code. If any are violated, the system loses operator trust within a week.

1. **LLMs are probabilistic. The Command Center is deterministic.** Rule-based scoring, rule-based compliance, rule-based automation. LLMs come ONLY in Phase 2+ as additive scorers running alongside the deterministic ones, never replacing them.
2. **Human decides, agent executes.** The Command Center proposes; the operator approves; only then do outbound actions happen. The Approval Workspace is THE central UX, not an afterthought.
3. **Every operator action is auditable.** Every decision lands a row in `ops_approval_queue`. Every score change lands a row in `ops_ai_assessments` with full breakdown. Replay is always possible.
4. **The local mirror is read-only against the source.** We sync the work-tracker IN. We never mutate upstream tickets without explicit operator decision routed through the approval flow. (Decisions DO write back as comments — that's the one explicit channel.)
5. **Idempotency is non-negotiable.** Sync runs every 2 minutes. The same row arriving twice must converge, not duplicate. Use `INSERT ... ON CONFLICT DO UPDATE` or model-level upserts.
6. **Freshness filter is mandatory.** Show only what was touched in the last N days (default 90). Ancient zombies blow up scoring + crush operator trust. The first time the operator sees a 2018 ticket scoring 80, the page loses credibility.

## The 6-layer stack

```
┌─────────────────────────────────────────────────────────────────┐
│ 6. Presentation: /admin/ops React surface                       │
│    Queue tabs · Project tree · Workspace · Run My Day · Tiles   │
├─────────────────────────────────────────────────────────────────┤
│ 5. Workflow: approval write-back · skill capture · prompt gen   │
├─────────────────────────────────────────────────────────────────┤
│ 4. Intelligence: rule-based priority engine · brand compliance  │
│                  automation rules engine                        │
├─────────────────────────────────────────────────────────────────┤
│ 3. Agents (Phase 2+): LLM scorer · meeting eliminator · etc.    │
├─────────────────────────────────────────────────────────────────┤
│ 2. Sync: poll source tracker every 2 min · upsert to mirror     │
├─────────────────────────────────────────────────────────────────┤
│ 1. Data: ops_* mirror tables in primary RDBMS                   │
└─────────────────────────────────────────────────────────────────┘
```

## The 6-table minimum schema (ships in Phase 0)

Field names in this schema map directly to what the Colaberry build uses. The four `ops_bc_*` names assume Basecamp; rename per source.

| Table | Purpose | Primary key | Key fields |
|---|---|---|---|
| `ops_<source>_projects` | Project mirror + per-project knobs | `bc_id` (source's id) | `name`, `is_cb_managed BOOLEAN`, `weight DECIMAL(3,2) DEFAULT 1.0`, `last_synced_at` |
| `ops_<source>_todos` | Task mirror enriched with scores | `bc_id` | `project_id`, `todolist_id`, `todolist_name`, `title`, `description`, `status`, `due_on`, `assignee_ids JSONB`, `bc_app_url`, `urgency_score`, `ai_opportunity_score`, `brand_score`, `category`, `is_dismissed BOOLEAN`, `bc_created_at`, `bc_updated_at`, `last_synced_at` |
| `ops_ai_assessments` | Score audit trail | UUID | `todo_bc_id`, `agent` (e.g. `priority_v1`), `agent_version`, `urgency_score`, `category`, `reasoning JSONB` (full breakdown), `llm_model`, `llm_cost_usd`, `computed_at` |
| `ops_approval_queue` | Decision audit trail | UUID | `todo_bc_id`, `summary`, `recommended_decision`, `confidence`, `urgency_snapshot`, `enqueued_at`, `decided_at`, `decision` (approve / approve_and_continue / approve_and_convert_to_skill / revise / reject / escalate), `decided_by`, `decision_reasoning`, `next_actions JSONB` |
| `ops_metrics_daily` | Pre-aggregated dashboard rollup | `date PRIMARY KEY` | `approvals_completed`, `approvals_avg_seconds`, `approvals_open_at_end`, `hours_saved_estimated`, `meetings_eliminated`, `skills_created`, `agent_total_cost_usd` |
| `ops_skills` | Captured patterns from Approve+skill | UUID | `name`, `action_kind` (reply / decision / meeting / research / default), `captured_from_todo_bc_id`, `reasoning`, `decision`, `is_active`, `use_count`, `created_by` |

Phase 4+ adds `ops_automation_rules (id, name, description, condition_jsonb, action_jsonb, is_active, last_fired_at, fire_count)`.

**Critical lesson from the Colaberry build**: `sequelize.sync({ alter: true })` may not reach your new tables on a mature prod DB because some unrelated pre-existing index conflict short-circuits the sync. Ship `CREATE TABLE IF NOT EXISTS` explicit DDL that runs BEFORE the sync. The lead-ingestion tables in this repo had the same problem; we use the same pattern.

## The 7-phase build order

Each phase is its own deploy. Each ends with tsc clean + git commit + push + monitor backend boot + verify endpoints + email the operator with what shipped. Do not bundle phases — granular rollback is the safety net.

### Phase 0 — Foundation (1-2 days)

**Goal**: tables exist, sync poller works, endpoint surface authenticates, page is reachable but empty.

Build:
- 4 core models (`OpsBcTodo`, `OpsAiAssessment`, `OpsApprovalQueueItem`, `OpsMetricsDaily`)
- Explicit `ensureOpsCommandCenterSchema()` with `CREATE TABLE IF NOT EXISTS` DDL running BEFORE `sequelize.sync()`
- `bcSyncService.runBcSync()` paginated: pull projects → todolists → todos, upsert by `bc_id`. Idempotent.
- Cron `*/2 * * * *` invoking the sync
- Admin route module mounted at `/api/admin/ops/*` gated by `requireAdmin`:
  - `GET /health` — `{ status, todos_mirrored, open_approvals, last_sync }`
  - `GET /todos`, `GET /metrics/today`, `POST /sync`
- Frontend page at `/admin/ops` with KPI tile row + Waiting on Human queue + System Health panel + manual Re-sync button
- Source-tracker auth: a single env var (e.g. `BASECAMP_ACCESS_TOKEN`). Do NOT commit tokens to repo.

**Exit criterion**: backend `/health` 200, `/api/admin/ops/health` 401 (gate working), all mirrored todos visible by source title in the queue.

**Pitfall we hit**: prod backend OOM'd at 512MB heap when the priority engine (next phase) loaded 374 Sequelize model instances + did per-row `Model.update()` + `Model.create()`. FIX: raw `sequelize.query(SELECT)` for read, raw `UPDATE` per row, `bulkCreate(chunks of 100, { validate: false })` for audit-row inserts. **On a mature prod heap, never use `Model.findAll() + per-row Model.update()` over more than ~50 rows.**

### Phase 1 — Priority Engine v0 (deterministic) (1-2 days)

**Goal**: every active todo gets `urgency_score` 0-100 + `category` written every sync.

Scorer (5 inputs, no LLM):
1. Due-date proximity (40pt max): overdue=40, today=35, +1d=28, +3d=20, +7d=12, +14d=6, else=0
2. Staleness since last update (20pt): >14d=20, 7-14d=12, 3-7d=6, else=0
3. Title/desc keyword tier (15pt): URGENT/ASAP/CRITICAL +15; HOT/PRIORITY/P0 +8; REVIEW/APPROVE/DECIDE +5
4. Assignee presence (15pt): assigned=15, orphaned=0
5. Per-project signal (10pt): default flat 5; replaced in Phase 1.4b by project weight

Sum capped at 100. Category derives: `human_required` if ≥60 + assigned, `waiting_dependency` if no due + >7d stale, else `unscored`. Categories `ai_can_finish` / `ai_can_prepare` / `can_eliminate` reserved for Phase 2.

Chain `runPriorityEngine()` after `runBcSync()` in the same cron handler. Write `ops_ai_assessments` row per pass with `reasoning: { breakdown, signals, raw_score, project_weight, weighted_score }`.

Frontend: score badges (red ≥70 / amber ≥40 / gray below) + category chips per queue item + Triage Breakdown tile in System Health drawer.

### Phase 1.1 — Scope-narrow + structured suggestion (2-3 days)

**This is where the page becomes useful, not just busy.**

- Add `ops_<source>_projects` table + `is_cb_managed BOOLEAN DEFAULT TRUE` flag + `weight DECIMAL(3,2) DEFAULT 1.0`
- Sync worker captures project name + description; sync worker passes `todolist_name` down to the todo upsert (denormalized for fast UI)
- Add `STALE_HIDE_DAYS = 90` constant (env-overridable). Apply to `/projects` open counts + `/my-queue` + Run My Day queries.
- `GET /api/admin/ops/projects` returns CB-managed projects with per-project assignee-open + assignee-red counts; drives a project tab nav
- `GET /api/admin/ops/my-queue[?project_id=X]` returns the operator's active assigned todos in CB-managed projects, grouped Project → Todolist → Task, sorted by urgency within each todolist
- **Critical discovery during build**: the BC token's JWT payload `user_ids:[X]` is the BOT account, NOT the operator. Look up the operator's actual id via `/people.json` filtering by email. We hardcoded `45321751` (CB System bot) for the first deploy and saw zero todos in Ali's queue. The real Ali at `17454835` (ali@colaberry.com / Managing Director) had 293.
- New service `runMyDayPromptService` exports `buildSuggestion(todo) → { action_kind, one_line, steps, resources: [{kind: tool|skill|agent|workflow|mcp, name, why}], stop_conditions, urgency_summary }` and `generatePrompt(todo) → full Claude Code prompt string`. Action recipes are keyed on title/desc regex (reply / decision / meeting / research / default).
- `GET /api/admin/ops/todos/:bc_id/workspace` — single round-trip bundle: `{ todo, suggestion, prompt, comments, decisions }` with a **5-second hard timeout** on the upstream comments fetch via `Promise.race`. Slow upstream ships empty comments + `comments_error` string instead of hanging.

Frontend completely refactors to a project-tab nav at top + Project → Todolist → Task tree + per-task "Open workspace" button. The workspace renders structured suggestion as primary content (action-kind badge + one-line summary + numbered steps + tool/skill/agent/workflow cards + amber stop-conditions list).

**`/my-queue` payload must be SLIM** — do NOT embed prompt bodies. ~225 tasks × ~3KB prompts = 700KB JSON = the page appears stuck loading. The Colaberry build hit this exact bug; the fix was to add a `has_suggestion` boolean to each task and fetch the full bundle only when the operator clicks Open Workspace.

### Phase 1.2 — Approval Workspace + write-back (2-3 days)

The Decide button next to Open Workspace expands an inline two-column workspace:

**Left column**: last 6 source-tracker comments stripped to plaintext (scrollable) + decision history block when present.

**Right column**: reasoning textarea + "Post back to source" checkbox + 6-button decision grid (Approve / Approve+next / Approve+skill / Revise / Reject / Escalate).

**Backend** `recordDecision(input)` does three things atomically (in this order):
1. Insert a row to `ops_approval_queue` (audit trail with `decided_at`, `decision`, `decided_by`, `decision_reasoning`, `urgency_snapshot`).
2. If `post_to_bc !== false`: build a color-coded HTML decision card + POST to the source comment endpoint (`/buckets/<project>/recordings/<todo>/comments.json` for Basecamp). Wrap in try/catch — the audit row stays even if upstream errors.
3. Return `{ queue_item_id, bc_comment_url, bc_post_error, compliance_warnings }`.

`Approve + next` auto-collapses current workspace + opens next task's workspace + smooth-scrolls to it. Designed for sweeping 20 decisions in 10 minutes.

Header gains rolling "Decisions today" tile pulling from `GET /api/admin/ops/decisions/today?mine=true`.

### Phase 1.3 — Run My Day + metrics rollup (1-2 days)

**Run My Day**: `GET /api/admin/ops/run-my-day?limit=5` returns the operator's top 5 highest-urgency todos NOT already decided today (`NOT EXISTS` against `ops_approval_queue` filtered by `decided_at >= date_trunc('day', NOW())` + `decided_by = req.admin.email`) with their full workspace bundles pre-loaded. Green "Run My Day" button at the top of the header opens a focused panel above the project tab nav, lists the 5 tasks stacked, all workspaces auto-expanded, Approve+next auto-advances + smooth-scrolls. Reload top 5 + Exit Run My Day controls.

**Metrics rollup**: `metricsDailyService.rollupToday()` aggregates `ops_approval_queue` for today into `ops_metrics_daily`: `approvals_completed` (count), `approvals_avg_seconds` (avg of `decided_at - enqueued_at`), `approvals_open_at_end`, `hours_saved_estimated` (count × 0.25h conservative). Idempotent `upsert`. 5-minute cron. Today's Pulse tile in the System Health drawer reads from `/metrics/today`.

### Phase 1.4 — Polish + freshness + auto-detect (1-2 days)

- **1.4a Hide-decided toggle**: header checkbox, client-side filter on queue + Run My Day
- **1.4b Per-project weight (0.0-2.0)**: number input per project in System Health drawer; priority engine multiplies raw urgency by weight before deriving category. Lets operator down-weight noisy admin projects (set to 0.4) without losing them
- **1.4c Stale review tab**: new `is_dismissed BOOLEAN` flag + `dismissed_at/by/reason` on `ops_<source>_todos`. `GET /api/admin/ops/stale-todos` returns >90d-no-activity set sorted oldest-first. `POST /api/admin/ops/todos/dismiss` bulk + `undismiss: true` reverses. Dedicated view-mode tab with bulk-select + Dismiss button. Reversible. Does NOT touch upstream.
- **1.4d Auto-detect CB-managed**: after each sync, `UPDATE projects SET is_cb_managed = (project has ANY todo with bc_updated_at >= NOW() - INTERVAL 'OPS_CB_DORMANT_DAYS days')`. Self-heals when a project revives. Replaces a manual double-click-to-dim hack.

### Phase 2-light — Skill extraction (1 day)

`ops_skills` table. In `recordDecision`, when `decision === 'approve_and_convert_to_skill'`, call `buildSuggestion(todo)` to get the `action_kind`, then `OpsSkill.create({ name, action_kind, captured_from_todo_bc_id, reasoning, decision, is_active: true, use_count: 0, created_by })`. Non-fatal: catch + console.warn so a skill-capture failure doesn't break the decision flow.

New view-mode tab "Captured skills" with action-kind filter + enable/disable toggle + delete. `GET /api/admin/ops/skills?include_inactive=true`, `POST /skills/:id/toggle`, `DELETE /skills/:id`.

### Phase 3-light — Brand compliance preflight (0.5 day)

New `brandComplianceService.checkCompliance(html, reasoning) → { ok, blockers, warnings }`. Pure regex.

**Blockers (HARD stop)** — secret-leak patterns:
- Basecamp access token (`BAhbB0kiAbB7[\w+/=]{200,}`)
- Mandrill API key (`md-[\w-]{20,}`)
- Bearer header (`Bearer\s+[\w.\-]{40,}`)
- Google OAuth refresh (`1/\/[\w-]{60,}`)
- JWT-shaped (`eyJ[a-zA-Z0-9_-]{15,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}`)
- AWS access key (`AKIA[0-9A-Z]{16}`)

**Warnings (non-blocking)** — style flags: em-dash (`[—–]`), "I hope this email finds you well", "just checking in", "leverage synergies", "circle back", "going forward", "low-hanging fruit".

Wires into `approvalService.recordDecision` BEFORE the upstream comment POST. Blockers → `bc_post_error = "Brand compliance blocked: ..."` and the comment is NOT posted (audit row still saved). Warnings → `compliance_warnings: string[]` in the response, surfaced in UI but the post still goes through.

### Phase 4-light — Automation rules (1 day)

`ops_automation_rules` table + `automationRulesService`.

Rule shape: `{ condition_jsonb, action_jsonb }`. v0 condition language: `match: 'stale_days_gt' | 'urgency_gte' | 'category_eq'`, optional combiners. v0 action language: `do: 'flag_for_archive' | 'tag_category' | 'noop_for_metrics'`.

Three seeded rules (idempotent `INSERT ... WHERE NOT EXISTS`):
1. "Flag for archive — no source activity > 180d" → `flag_for_archive`
2. "Alert — red urgency stale > 14d" → `noop_for_metrics` (counts only)
3. "Tag waiting_dependency — stale > 7d, no due" → `tag_category: 'waiting_dependency'`

Executor chains after priority engine on the 2-min cron. UI tab with toggle + Run-now + last-run summary showing fires per rule.

### Polish phase (final)

Keyboard shortcuts in Run My Day: A=approve+next, S=approve+skill, R=revise, X=reject, E=escalate. Implementation note: route through `useRef` so the keyboard `useEffect` has stable deps and doesn't need `// eslint-disable-line react-hooks/exhaustive-deps` — that comment breaks production builds when the project's eslint config doesn't have the react-hooks plugin loaded.

## Adapting to a different source tracker

The Colaberry build is Basecamp-specific. Mapping table:

| Concept | Basecamp | Linear | Jira | Asana | ClickUp |
|---|---|---|---|---|---|
| Project | `Project` | `Team` or `Project` | `Project` | `Project` | `Space` or `List` |
| Container | `Todolist` | `Cycle` or `Project` | `Sprint` or `Epic` | `Section` | `List` |
| Task | `Todo` | `Issue` | `Issue` | `Task` | `Task` |
| Sync pull | `/projects.json` → `/todoset.json` → `/todolists.json` → `/todos.json` | GraphQL `issues(filter: { team: ... })` | `/rest/api/3/search?jql=...` | `/projects/{gid}/tasks` | `/team/{team_id}/space` → list → tasks |
| Comment write-back | `POST /buckets/<project>/recordings/<todo>/comments.json` | GraphQL `commentCreate` | `POST /rest/api/3/issue/{key}/comment` | `POST /tasks/{gid}/stories` | `POST /task/{task_id}/comment` |
| User ID lookup | `/people.json` | `viewer` query | `/myself` | `/users/me` | `/user` |
| Tasks assigned to me filter | `assignee_ids @> [my_id]` | `assignee: { id: { eq: my_id } }` | JQL `assignee = currentUser()` | `assignee: me` | `assignees: [my_id]` |

**Rename `ops_bc_*` tables to `ops_<source>_*`** consistently. The `bc_id` primary key stays generic-named or becomes `source_id`.

**JWT vs OAuth**: Basecamp uses a long-lived rotating OAuth token. Linear / Jira / Asana / ClickUp use API keys. Either way, single env var, never in repo.

**Comment fetch latency varies wildly**: keep the 5-second `Promise.race` timeout on the comments fetch in the workspace endpoint regardless of source. Slow upstream must not hang the workspace render.

## Honest deferrals (NEVER ship these in Phase 0-4-light)

These belong in Phase 2+ once the operator trusts the v0 surface:

- **LLM-based scoring**. The AI Opportunity Agent that scores "could AI finish this?" needs prompt engineering + a cost ceiling + a hard-fallback to the deterministic scorer when LLM is unavailable. Don't ship without all three.
- **Autonomous outbound from a decision**. Approval is one thing; the agent actually firing the resulting email or BC comment without operator sign-off is another. The Approval Workspace's Approve button records the decision. A separate "Execute" step (Phase 2) actually fires.
- **Auto-archive on source**. The local `is_dismissed` flag does the right thing without ever touching the upstream ticket. If the operator says "actually mass-archive in BC," that's a separate explicit feature with confirmation.
- **Cross-operator queues**. Phase 1 builds the operator's personal queue. Phase 2 adds shared queues + delegation + handoff. Don't bake assumptions about multi-user into Phase 1.

## Tools / Skills / Agents / Workflows this skill leans on

| Kind | Name | Why |
|---|---|---|
| Tool | `sendWithBcAttach` (or equivalent wrapper per source) | Auto-attaches every email this skill sends + every produced artifact to the originating ticket per the auto-attach doctrine |
| Tool | `cb-context-walker.js` | Pulls full ticket context including comments + linked Vault docs + attached emails so the structured suggestion has real content to act on. The walker takes a BC URL and emits LLM-readable concatenated context. |
| Skill | `screenshot-review` | The capture-helpers + Playwright walk used to ship the per-phase walkthrough HTML doc + final email screenshots |
| Skill | `telemetry-emission` | After each phase deploy, emit a BuildManifest so the portal can rebuild its state map |
| Workflow | Per-phase deploy loop | tsc clean → commit → push → ssh prod → git pull → docker compose up -d --build → Monitor backend boot → curl new endpoints (expect 401) → email operator with what shipped |

## Build operating cadence (proven on Colaberry)

Phase 0 → 1 → 1.1 → 1.2 → 1.3 took ~10 days end-to-end with 3-4 hours of focused build per phase. Phase 1.4 + 2-light + 3-light + 4-light + polish bundled into one overnight autonomous run (~6 hours). The granular per-phase commits made every step independently reversible.

Always end a phase with: deployed to prod + email to operator stating "X is live, here are the verified counts, here's what's next, here's what's deferred." Operator-trust compounds; surprises kill it.

## How to invoke this skill

When a new client engagement starts that fits the "When to invoke" criteria above, paste this skill into a fresh repo's `.claude/skills/build-ai-ops-command-center/SKILL.md` and tell Claude Code: `/build-ai-ops-command-center`. The skill expects:

- A primary RDBMS (Postgres tested; SQLite would need DDL tweaks)
- A backend stack with an admin auth middleware (`requireAdmin` or equivalent JWT gate)
- A frontend stack that can render a React tree (the queue + workspace are React-specific; an equivalent Vue / Svelte port is straightforward)
- Source-tracker API access (single env var)
- The operator's actual user id IN the source tracker (look up via people endpoint — do NOT trust the API token's payload)

Each phase ends with: ship + deploy + verify + email + commit. The skill explicitly does NOT proceed phase-to-phase silently — operator approval gates between phases except in an explicit "complete overnight" run authorized by the operator. The overnight run still defers anything LLM-driven or destructive.

## Reference build

The original Colaberry build sits at:
- Repo: `ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator`
- Architecture brief: `docs/ai-ops-command-center-architecture-2026-06-02.html`
- Plan doc: `docs/ai-ops-overnight-plan-2026-06-02.md`
- Walkthrough: `docs/ai-ops-overnight-walkthrough-2026-06-02.html`
- Live: `enterprise.colaberry.ai/admin/ops`
- BC ticket: 9953889114 (AI_ProjectArchitect Overview)
- 11 phase emails on that ticket — read them in order to see how each phase landed + how the operator-feedback loop tightened the build

Session that built it: CC-20260602-9q4r over ~24h on 2026-06-02 → 2026-06-03.
