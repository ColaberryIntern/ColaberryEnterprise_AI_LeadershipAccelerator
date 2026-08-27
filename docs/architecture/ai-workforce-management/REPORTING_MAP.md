# Reporting Map (Checkpoint A)

Scope: what exists today for "generate and deliver a report about an agent to a human on a schedule" — the substrate for Checkpoint D's Report Subscriptions.

## Real precedent, none of it a generic subscription object

| Piece | What it does | Persists a report row? | Recipient/cadence config? | Reusable as-is? |
|---|---|---|---|---|
| `weeklyReportAgent.ts::runWeeklyReport()` | Generates + emails a weekly report via Mandrill | No | No — hardcoded call site | Send logic yes, structure no |
| `DepartmentReport` model (`department_reports`) | Persists `{department, report_type, summary, metrics, anomalies, recommendations, source_agent}` | **Yes** | No | Shape reference only |
| `reportingOrchestrationService.ts` | Coordinates system scans / daily digests / weekly strategic reports, pulls from `KPISnapshot` + `ReportingInsight` + `AiAgent` | Partially (via `KPISnapshot`) | No | Orchestration pattern reusable |
| `KPISnapshot` (`kpi_snapshots`) | Periodic metrics snapshot, `scope_type` includes `'agent'` | Yes (metrics only, no narrative) | No | Real, live, reusable for metric history |
| `CronScheduleConfig` | DB-driven schedule override | N/A | Agent-name-keyed only — no user, no timezone, no content-scope, no channel | Not reusable for per-manager scheduling |

**Confirmed absent:** any single object combining (a) what to report on, (b) who receives it, (c) how often, (d) in what timezone, (e) over which channel. Every dimension exists in isolation somewhere in the codebase; none are combined.

## Channel reality (full detail in `COMMUNICATION_MAP.md`)

- Email: real, generic, ready (`sendRawEmail()`).
- Slack: dormant — code exists, nothing calls it. **Must not appear as a selectable channel in any Checkpoint D UI until it's actually wired**, per the mission's "do not render unsupported channels" rule.

## Timezone prerequisite

**Confirmed absent:** no per-user/per-manager timezone field anywhere (`AdminUser.ts`, `OrgMember.ts` both checked directly). Every cron timezone value repo-wide is the literal `'America/Chicago'`. A report-subscription feature that lets a manager pick a delivery time is not timezone-safe until this is added — flagged as a hard Checkpoint D prerequisite, matching the mission's own stop condition on timezone-unsafe scheduling.

## Recommended shape for `AgentReportSubscription` / `AgentReportRun` (Checkpoint A proposal only, not built)

- `AgentReportSubscription`: `agent_id (FK ai_agents)`, `subscriber_org_member_id (FK org_members)`, `content_scope` (what sections — cost/activity/trust/tickets), `cadence` (daily/weekly/custom cron), `timezone`, `channel` (constrained to channels actually wired — email only at launch), `enabled`, audit columns. Authorization on create/edit: `requireAgentManagerOrAdmin` (see `MANAGER_AUTHORIZATION_MAP.md`).
- `AgentReportRun`: `subscription_id`, `generated_at`, `delivered_at`, `delivery_status`, `content_snapshot` (what was actually sent, for audit/replay) — mirrors `DepartmentReport`'s persisted-content pattern, but tied to a subscription rather than generated ad hoc.
- Send path: `AgentReportRun` creation → render → `sendRawEmail()`. Never call `communicationSafetyService.evaluateSend()` (wrong tool, requires a `leadId` — see `CURRENT_STATE.md` §G) — either build a light internal-recipient gate or explicitly log the deliberate bypass, matching the existing incident-subscriber precedent.
