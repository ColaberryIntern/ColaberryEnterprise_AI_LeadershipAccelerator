# Admissions & Academic Ops Command Center: spec

Source: Taiwo's blueprint (kept in Basecamp, not committed: this repository is public) and the HTML demo (`demo/`).
Where the two disagree, the blueprint is the requirement and the demo is the proposed design.

## 1. Purpose

Taiwo's work spans admissions, enrollment, academic operations, retention, payments,
reconciliation, compliance, support and reporting. The information sits in eight systems. A single
student question can take several logins and manual cross-checking.

The Command Center is the one place she works. It does five things:

1. **Finds** any student across every system.
2. **Explains** what is going on, with sources, and says what it does not know.
3. **Flags** what needs attention, by exception, so she does not review every record.
4. **Prepares** the next step: a reply, a letter, a report, a reconciliation.
5. **Acts** only inside approved limits, and logs everything.

Tagline from the blueprint: One student. One profile. One workspace.

## 2. Navigation

### 2.1 Sidebar

One entry: **Admissions & Ops**. This follows the Marketing consolidation, where eight rail rows
became one and the page became the navigation.

Existing pages that the demo assumes are reached from inside the hub, with their routes kept live:
Student Story, My Day, Leads, Pipeline, Opportunities, Funnel, Refunds, Communications, Placement,
Reports. This list is a proposal. Ali approves each one. Phase 0 removes nothing.

### 2.2 Section bar (inside the workspace, on every screen)

Work sections, left: Today, Admissions, Students, Academics, Payments, Support, Communications, Compliance, Reports.

Tools, right: Ask AURA, Approvals (with a count), Knowledge, Setup.

### 2.3 Agent dock (inside the workspace, on every screen except Ask AURA)

A dark bar under the section bar. It shows the agent's mode, takes an instruction, and offers three
suggestions that fit the current screen. See `AGENT_CONTROL_SURFACE.md`.

### 2.4 Routes

Proposed. Confirm against `adminRoutes.tsx` conventions.

| Screen | Route | Demo file |
|---|---|---|
| Today | `/admin/admissions-ops` | `index.html` |
| Admissions | `/admin/admissions-ops/admissions` | `Admissions.html` |
| Students | `/admin/admissions-ops/students` | `Students.html` |
| Student 360 | `/admin/admissions-ops/students/:ref` | `Student360.html` |
| Academics | `/admin/admissions-ops/academics` | `Academics.html` |
| Payments | `/admin/admissions-ops/payments` | `Payments.html` |
| TFC audit | `/admin/admissions-ops/payments/tfc-audit` | `TFCAudit.html` |
| Support | `/admin/admissions-ops/support` | `Support.html` |
| Communications | `/admin/admissions-ops/communications` | `Communications.html` |
| Compliance | `/admin/admissions-ops/compliance` | `Compliance.html` |
| Reports | `/admin/admissions-ops/reports` | `Reports.html` |
| Weekly Opportunity Report | `/admin/admissions-ops/reports/weekly-opportunity` | `WeeklyReport.html` |
| Ask AURA | `/admin/admissions-ops/agent` | `Agent.html` |
| Approvals | `/admin/admissions-ops/approvals` | `Approvals.html` |
| Knowledge | `/admin/admissions-ops/knowledge` | `Knowledge.html` |
| Setup | `/admin/admissions-ops/setup` | `Setup.html` |

One layout route with child routes, so a refresh keeps the screen. Student 360 should reuse or
extend the existing person profile at `/admin/people/:ref` rather than duplicate it. Decide in recon.

## 3. Access

Recommendation: a new section key, `admissions_ops`.

Reason: the workspace shows payment history, contract status and workforce compliance documents
together. That is a wider grant than `students`, `leads` or `revenue` alone, and the repo already
splits sections on that basis (see the `internship` comment in `mgmtRoles.ts`).

What that requires:

- `SECTION_KEYS` in `backend/src/services/access/mgmtRoles.ts`, plus role grants. Owner and admin hold it. Whether the `admissions` role holds it or Taiwo gets it as an extra section is Ali's call.
- A `PATH_SECTION` row in `backend/src/middlewares/mgmtSectionGate.ts` for `/api/admin/admissions-ops`.
- The nav entry in `adminNav.ts` carrying `section: 'admissions_ops'`.
- The existing test that asserts nav and gate agree, extended to cover it.

Inside the workspace, three things are stricter than the section:

- Compliance documents open only for named staff.
- Level 5 actions (section 5 of the agent doc) need a leadership approver, not just the section.
- Card data is never returned by any endpoint.

## 4. Screens

Each screen below lists what it shows, where the data comes from, and what a person can do. The
demo file shows the layout. "Agent actions" are what the screen publishes to the agent registry.

### 4.1 Today (`index.html`)

- **Morning briefing** from the agent: how many things need her today and which to start with.
- **Enrollment target**: confirmed paid against target, daily requirement, prospects needed at an assumed conversion rate.
- **Section filters** over one queue: Everything, Admissions, Communications, Student ops, Payments, Compliance, Events. Each shows a count and the systems that feed it.
- **Needs attention queue**: one row per exception. Trigger, who or what, why, which systems were checked, the next step, and whether that step needs approval.
- **Ask AURA** quick card, **What AURA may do**, **Connected systems** with freshness, and **Reports that build themselves**.

Triggers (from the blueprint, section VIII): paid but not activated, registered but unpaid,
recurring payment failure, student inactivity, cancelled contract with active student, formal
dispute, overdue support ticket, upcoming renewal, unanswered important email, upcoming workforce
deadline, target behind schedule, CRM revenue mismatch.

Agent actions: read queue, filter by section, open item, explain item.

### 4.2 Admissions (`Admissions.html`)

- Opportunity counts: total, open, lost, won, CRM revenue. Won and revenue link to payment verification.
- Lifecycle: free registration, qualifying, application, plan selected, paid, activated, onboarded. Each stage names its source system.
- Exceptions: registered not paid, paid without access, incomplete applications, unresponsive.
- Follow-ups due: prospect, stage, last contact with channel and gist, barrier, suggested step. The last conversation is always checked first so nobody gets a repeated or contradictory message.
- Open House: registered, attended, no-shows, attended and not enrolled, with separate follow-up tracks.
- Lost reasons and re-engagement.

Sources: GHL (lead and opportunity status), app.colaberry (registration, activation), PaySimple (payment).

Agent actions: list follow-ups, draft outreach, create follow-up task, build opportunity report.

### 4.3 Students (`Students.html`)

- Universal search by name, email, phone, student ID, GHL contact ID or TFC contract number.
- Filters: program, cohort, status, payment plan, date range, priority, assigned staff.
- One row per person with **academic, contract, financial and placement in separate columns**, last contact, and what needs attention.
- Possible duplicates queue. Matching is on email, phone or ID. A name alone never merges two people.
- Saved views.

Agent actions: search, filter, open profile.

### 4.4 Student 360 (`Student360.html`)

The highest-value screen per the blueprint.

- Identity and how the match was made.
- Four status cards, each with its own source and sync time: academic, contract, financial, placement.
- The agent's read: what is verified (with source), what is not known yet, and next steps.
- One history across systems (email, text, calls, tickets, contract events, payments, academic events), filterable by source.
- Draft reply waiting for approval, with a note on what it deliberately does not promise.
- Open items, compliance status, internal notes, approved exceptions.

Blueprint fields to cover: identity, enrollment, academic, Job Readiness and placement, financial,
contracts, communications, support, compliance, administrative, AI summary.

Agent actions: summarize, show history, add note (level 4), draft message (level 3), open linked ticket or audit row.

### 4.5 Academics (`Academics.html`)

- Cohorts: program, students, average completion, attendance, not started, at risk.
- Students who need a nudge: what changed, last activity, one suggested step.
- Status mix: active, completed, withdrawn, suspended, re-enrolling.
- AI membership: welcome and community, help sessions, billing anniversaries (from each conversion date, not the cohort date), renewals.
- Completion, certificate eligibility, re-enrollment, legacy transitions, unplaced graduates.

Programs: AI Systems Architect Accelerator, legacy Data Analytics, Job Readiness (IPBC and CAP).

Agent actions: list at-risk, draft check-in, draft cohort announcement.

### 4.6 Payments (`Payments.html`)

- Counts: failed payments, outstanding balances, renewals due, items waiting on approval.
- **Reconciliation checks**, each comparing two systems: GHL Won against PaySimple, TFC contracts against academic status, paid against activated, workforce invoices against payments, recurring schedules against memberships.
- Failed recurring payments with a suggested step.
- Plan mix: AI monthly, AI annual, Flex through TFC, Subscription, direct arrangements.
- Decisions needed: refunds, contract recalls, extensions. All route to Approvals.
- Extensions and special cases.

Agent actions: run reconciliation, list failures, draft payment-assistance message. No write to any payment system.

### 4.7 TFC audit (`TFCAudit.html`)

- Accounts by category: completed, withdrawn (Colaberry-initiated at student request), cancelled (TFC-initiated for nonpayment).
- Exceptions: still active in IPBC, no withdrawal request found, previously extended.
- Account table with separate columns for contract status, initiating party, reason, academic status, payment history, charge-off, exception.
- A standing notice that default, charge-off and Colaberry exposure are unconfirmed until TFC says so in writing.

Agent actions: classify accounts, export, draft inquiry to TFC (level 3).

### 4.8 Support (`Support.html`)

- Open tickets by type: enrollment, payment, access, academics, technical.
- For each ticket: what the agent checked and a recommended resolution.
- The paid-without-access procedure: payment, enrollment, activation, then reply.
- Rule: an existing ticket is always shown before anyone replies through another channel.

Agent actions: find tickets, check records, draft reply, route.

### 4.9 Communications (`Communications.html`)

- One inbox across Gmail, GHL texts, call history and Zendesk, with filters for unanswered, agencies, drafts ready, scheduled.
- Selected thread: agent summary, messages in order across channels, draft reply.
- Before-you-send panel: prior commitments, other open conversations, consent and opt-out, policy check.
- Campaigns and scheduled outreach. Anything to more than one person waits for approval.
- WhatsApp is announcements and invitations only. Full group conversation access is not assumed.

Agent actions: search threads, summarize, draft email or text or call script, schedule (level 3), never send.

### 4.10 Compliance (`Compliance.html`)

- Agency requests (TWC, Workforce Solutions): what was asked, received, due, status.
- Workforce invoices: sent, age, payment found.
- Missing documents by student.
- Verification letter drafted from verified records, with fields filled from attendance data, never typed from memory.
- Workforce-funded students.

Agent actions: find requests, build letter from records, draft invoice reminder.

### 4.11 Reports (`Reports.html`)

The 13 reports and their cadence, from the blueprint (section VII): opportunity pipeline (weekly),
enrollment and conversion (daily and weekly), AI free-to-paid conversion (weekly), monthly AI
cohorts (weekly and monthly), DA cohort completion and IPBC progress (weekly), payment plan
enrollment (weekly), failed and outstanding payments (daily and weekly), TFC reconciliation (on
demand and monthly), withdrawals and suspensions (weekly and monthly), TWC and WIOA financial
reports (on demand), student support performance (weekly), membership retention and renewals
(monthly), executive operations recap (weekly).

Enrollment target tracker. Leadership sets target and period. It distinguishes registrations,
confirmed paid enrollments, activated memberships and academically engaged students.

- Remaining = target minus confirmed paid, minimum zero.
- Daily requirement = remaining divided by days remaining, rounded up.
- Prospects needed = remaining divided by the assumed conversion rate, rounded up.
- It is a planning scenario, not a forecast. The assumed rate is always shown.

Agent actions: build report, compare periods, schedule.

### 4.12 Weekly Opportunity Report (`WeeklyReport.html`)

The report as leadership would receive it: counts with last week's, what happened, decisions needed,
target, sources and upcoming deadlines. A check-before-sending notice sits at the top when the
agent has found a mismatch. Sending is an approval.

### 4.13 Ask AURA (`Agent.html`)

- Request library by area: admissions, academic, financial, communications, compliance, reporting.
- Conversation with a visible investigation. The ten steps from the blueprint: match identity, contract, academics, placement, direct payments, correspondence, support, audit notes, reconcile, deliver.
- Agent mode selector: Answer, Guide, Operate. And the last run as a trail of screens.
- The five permission levels and what was done today.

### 4.14 Approvals (`Approvals.html`)

Everything the agent prepared and will not do alone. Each item: kind, channel, what and why, a link
to the screen it came from, Approve and Hold. Approving records the person's name.

### 4.15 Knowledge (`Knowledge.html`)

- Versioned policies and procedures with effective dates and status.
- Approved templates, leadership decisions, saved findings.
- Rule: current approved policy wins. Historical email never overrides it. If it is not here, the agent says it does not know.

### 4.16 Setup (`Setup.html`)

- Connected systems: what each is the record for, how it connects, what the agent can read, what it can change with approval, last sync.
- What the agent can control, per screen.
- Alerts and their thresholds. All editable.
- Roles, audit log, morning briefing schedule.

## 5. Data and integrations

### 5.1 Source of truth (from the blueprint; data owners must confirm)

| Data | System of record |
|---|---|
| Lead and opportunity status | GHL |
| Academic progress | app.colaberry or the designated academic database |
| Internal administration | Retool and its underlying database |
| TFC contract status | TFC |
| Transactions | PaySimple |
| Email | Gmail |
| Support tickets | Zendesk |
| Supplementary tracking | Google Sheets |
| Approved policies | Enterprise knowledge base |
| Consolidated profile | Enterprise, referencing the sources above |

### 5.2 Integration preference order (from the blueprint)

1. Direct authorized APIs and approved shared internal databases.
2. The agent using authorized tools and connectors.
3. Embedded applications, scheduled sync or approved exports.
4. Permitted secure browser automation where no API exists.
5. Single sign-on or deep links, as the minimum fallback.

None of these has been verified. Build one `SourceAdapter` interface with a fixture adapter per
system first, then replace fixtures one system at a time as access is confirmed.

Each adapter exposes at least: `health()`, `lastSyncedAt()`, and typed read methods. Each has an
explicit timeout, a retry policy and an error class, per `backend/CLAUDE.md`.

### 5.3 Things Enterprise needs to store (proposed, confirm in recon)

| Record | Why |
|---|---|
| Identity links | One Enterprise student ID mapped to each system's ID, with how the match was made and a confidence. Uncertain matches queue for a person. |
| Source sync state | Per system: last successful sync, status, error. Drives every freshness label. |
| Alerts | The exception queue. Trigger, subject, reason, sources checked, status, assignee. |
| Approvals | What was prepared, by whom or what, level, payload, decision, decider, time. |
| Agent action log | Every agent call: actor, on behalf of, screen, action, parameters, sources read, result. Append only. |
| Knowledge documents | Policy, version, effective date, status, body. |
| Saved findings | An investigation's conclusion and open questions, attached to a student. |
| Report runs | Report, period, figures with sources, status, who approved distribution. |
| Thresholds and targets | Alert thresholds, enrollment target, period, assumed conversion rate. |

Enterprise stores links and derived records. It does not copy and then own another system's fields.
No silent overwrites: if two sources disagree, show both and flag it.

## 6. Phases

From the blueprint, section IX. The phases are an order, not committed dates.

| Phase | Scope |
|---|---|
| 0. Shell | Nav entry, layout, section bar, agent dock, all routes, Today on fixtures, control-surface skeleton, access. |
| 1. Visibility and retrieval | Universal search, Student 360, source adapters, freshness, read-only agent, source-linked answers. |
| 2. Admissions and communications | Lead pipeline, Gmail and GHL access, enrollment tracking, follow-up queues, templates, agent drafts, Approvals. |
| 3. Financial and academic operations | Reconciliation, TFC audit, academic progress, cohorts, onboarding, compliance. |
| 4. Reporting and automation | Scheduled reports, proactive alerts, morning briefing, analytics, controlled execution, Operate mode. |

Minimum viable product, in Taiwo's words: one Enterprise login, universal search, Student 360,
cross-platform retrieval, Gmail and GHL access, TFC and PaySimple visibility, daily priority
dashboard, weekly executive reporting, source references and freshness indicators, role-based
permissions and audit logs.

## 7. Acceptance checks that apply to every phase

- A person without the section cannot see the link and gets a 403 from the API.
- Every figure shows its source and pull time. A down source is shown as down.
- Academic, contract, financial and placement status are never merged or inferred from each other.
- No endpoint returns card numbers or full bank details.
- Nothing is sent, changed or promised without a recorded human approval where the level requires one.
- Every agent action appears in the audit log with the records it read.
- The agent states what it does not know. It does not describe a balance as forgiven or charged off without written confirmation from TFC.
- Baselines are captured before launch (investigation time, logins per task, response time, follow-up completion, report preparation time) so improvement can be measured.

## 8. Demo conventions worth keeping

- Dark panel = the agent speaking. White card = records. Red tag = today. Grey tag = this week.
- Primary red button = the one action that needs a person. White button = navigation or a safe action.
- Every agent statement is followed by where it looked.
- Sample data is labelled on every screen. Keep that label on any environment that is not production.
