# Claude Code Mission: Consolidate the AI Workforce into Reese-Level AI Employees

## Invocation

Run this mission from the repository root:

```text
/loop-architect Execute the AI Employee Consolidation Program defined in this file. Build and release exactly one AI employee at a time. Stop for Ali's approval at every employee macro-phase checkpoint and never begin the next employee until the current employee has passed production verification and Ali explicitly authorizes continuation.
```

Repository:

```text
https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator
```

---

# 1. Mission

The current AI workforce contains more than 200 registered agents, but most of those records are specialized processes, cron jobs, scanners, evaluators, or one-purpose automations rather than accountable AI employees.

Reese represents the new standard. Consolidate the current fleet into no more than ten durable, always-online AI employees. Each employee must:

- Have a unique identity, personality, voice, judgment style, and role charter.
- Be represented as a real employee using the same employee identity pattern as Reese.
- Report through a verified chain to one real human who is ultimately accountable.
- Own business outcomes, not merely execute a single process.
- Own a clearly mapped set of capabilities, tools, workflows, scheduled jobs, data sources, tickets, and outcome metrics.
- Be conversational and available to its manager through the Agent Detail/Talk experience.
- Be shown as always online using shared presence infrastructure.
- Maintain plans, commitments, checklists, memory, tickets, evidence, cost attribution, and an auditable work ledger.
- Use authorization and risk controls before every real write, outbound message, external side effect, or irreversible action.
- Receive new, genuinely callable tools when its job requires capabilities the platform does not yet provide.

Do not turn the legacy processes into ten enormous prompts. The employee is the accountable intelligence layer. Existing cron jobs, workers, scanners, evaluators, and automations become tools or owned behaviors beneath an employee.

---

# 2. Required instructions and repository skills

Before planning or editing code, read these files in full:

1. Root `CLAUDE.md` and every nested `CLAUDE.md` governing changed files.
2. `.claude/skills/loop-architect/SKILL.md` and every reference it requires for this run.
3. `.claude/skills/onboard-ai-agent/SKILL.md`.
4. `.claude/skills/build-platform-agent/SKILL.md`.
5. `docs/architecture/ai-workforce-management/CURRENT_STATE.md`.
6. `docs/architecture/ai-workforce-management/TARGET_ARCHITECTURE.md`.
7. `docs/architecture/ai-workforce-management/DOMAIN_REUSE_MAP.md`.
8. `docs/architecture/ai-workforce-management/MIGRATION_STRATEGY.md`.
9. `docs/architecture/ai-workforce-management/MANAGER_AUTHORIZATION_MAP.md`.
10. `backend/src/services/agentRegistrySeed.ts` and the complete Reese implementation under `backend/src/services/reese/`.

Use `/loop-architect` as the execution controller, but apply the consultation override in Section 3. User instructions in this mission override the skill's normal no-pause behavior.

Do not create another AI-agent registry. `AiAgent` remains canonical.

---

# 3. Consultation override: only one consultation per macro-phase

This mission intentionally changes `/loop-architect`'s normal progress behavior.

## Mandatory rules

1. Work on exactly one AI employee at a time.
2. Complete all work inside the current macro-phase autonomously.
3. Do not interrupt Ali with file-level questions, implementation choices, routine approvals, or status narration.
4. Resolve discoverable facts from the repository, tests, current database-safe read paths, and existing documentation.
5. Record non-blocking assumptions in the execution contract.
6. At the end of each macro-phase, produce one concise decision packet and STOP.
7. Ask only the decisions that genuinely require Ali's authority or business judgment.
8. Do not begin the next macro-phase until Ali explicitly approves the current one.
9. Do not deploy an employee until the pre-production phase has been approved.
10. After production deployment and verification, STOP again. Do not start another employee until Ali explicitly says to proceed.

The employee macro-phases in Section 10 are the only normal consultation boundaries. Genuine security, credential, destructive-data, paid-service, production-safety, or strategic-decision hard stops still stop immediately.

At each checkpoint, provide:

- Phase name and employee name.
- What was completed.
- Evidence and test results.
- Risks, gaps, or assumptions.
- Exactly what Ali should inspect.
- One recommended decision.
- A small set of explicit choices plus free-entry support.
- The exact resume command.

Do not ask Ali to approve individual files.

---

# 4. Target employee roster

Treat these as the proposed employee domains. Verify existing names and identity collisions before creating anything. Do not silently create duplicate identities.

| # | AI employee domain | Accountable human | Primary ownership |
|---|---|---|---|
| 1 | Reese — Learner Success | Resolve and verify current accountable human; do not guess | Student mentoring, learner health, intervention, engagement, retention, support, community follow-through |
| 2 | Marketing Intelligence & Brand | Sohail | Marketing strategy, campaigns, content, social publishing, audience intelligence, brand performance |
| 3 | Product Experience & UI/UX | Aleem | Product experience, UI/UX quality, accessibility, usability, design consistency, experience recommendations |
| 4 | Curriculum, Learning & Certification | Swait | Curriculum, lesson quality, certification preparation, projects, learning evidence, instructional improvement |
| 5 | Admissions & Applicant Experience | Taiwo | Applicant journey, lead qualification, admissions communications, appointments, interviews, admissions conversion |
| 6 | Sales, Enrollment & Subscriptions | Roselyn | Sales, enrollment completion, offers, payments handoff, subscriptions, renewal and revenue follow-through |
| 7 | Internship & Career Readiness | Dhee | Internship intake, interviews, onboarding, project placement, progress, completion and employment readiness |
| 8 | Website Portfolio & Conversion | Tejesh | Company websites, uptime coordination, content integrity, broken journeys, conversion paths, website improvement |
| 9 | Platform Automation & Reliability | Kes | Platform architecture, automation, orchestration, deployment, reliability, security, agent infrastructure |
| 10 | Executive Intelligence & Governance | Resolve with Ali before building; do not assume | Cross-domain strategy, company health, reporting, finance intelligence, risk, governance and executive decision support |

`Swait` is intentionally preserved exactly as provided. Resolve the actual employee record by verified repository/database identity rather than silently changing or guessing the name.

An accountable human may oversee more than one employee, but every AI employee must have exactly one direct accountable human in its reports-to chain.

## Recommended first employee

After Reese is audited against the strengthened standard, build **Curriculum, Learning & Certification** first because it has a named owner and lower external-side-effect risk than admissions, sales, marketing, or platform automation.

If Ali chooses another first employee at the Phase 0 checkpoint, follow that decision.

---

# 5. Personality standard

Every employee must have a genuinely distinct personality appropriate to its job. Do not copy Reese and change only the name.

For each employee, create a versioned Personality & Judgment Profile containing:

- Employee name and role title.
- Mission and professional identity.
- Voice, tone, warmth, pace, and communication density.
- Temperament under normal, urgent, ambiguous, and adversarial conditions.
- Decision-making style.
- How the employee challenges weak assumptions.
- How it communicates uncertainty and missing evidence.
- How it delivers bad news.
- How it escalates to its human manager.
- Preferred structure for recommendations and reports.
- Relationship style with students, managers, customers, or staff.
- Domain vocabulary it should and should not use.
- Signature behaviors that make the employee recognizable.
- Anti-patterns and prohibited behaviors.
- Disclosure that it is an AI employee; it must never pretend to be human.
- Neutral and respectful language requirements.
- Conflict and handoff behavior with the other AI employees.
- Examples of at least five representative interactions.
- Persona version and change history.

Personality must affect communication and judgment presentation, but never override policy, evidence, authorization, risk controls, human directives, or truthfulness.

At the Personality & Charter checkpoint, present one recommended personality, why it fits the role, and two short alternative directions. Ali approves or edits the profile once at that phase boundary.

---

# 6. Reese Employee Standard 2.0

An employee is not complete merely because it has an `AGENT_REGISTRY` entry or a page that renders. Each employee must satisfy all obligations below.

## Identity and presence

- Canonical `AiAgent` record.
- Real `AdminUser`, `Enrollment`, and `CommunityMember` identity linkage using the proven Reese/generic seed pattern.
- Verified `reports_to_type` and `reports_to_id` resolving to a real accountable human.
- Employee avatar/profile metadata where the existing system supports it.
- Shared always-online presence heartbeat with current activity/last-action truthfulness.
- Agent Detail page with all applicable tabs working.
- Talk experience using the employee's real prompt and approved memory.

"Always online" means available and represented as online through shared presence infrastructure. It does not mean uncontrolled autonomous action. Availability and authority are separate.

## Role and accountability

- Approved role charter.
- Mission, responsibilities, boundaries, KPIs and service-level expectations.
- Owned business outcomes.
- Named human manager.
- Escalation policy.
- Inter-agent handoff contract.
- Manager directives and 1:1 capability.
- Report subscriptions and commitments.

## Intelligence and evidence

- Domain-specific context assembly.
- Source provenance and freshness.
- Evidence reliability states.
- Metric quarantine: broken or unreliable metrics cannot influence decisions.
- Explicit uncertainty.
- Stateful work plans and mandatory checklists.
- Approved memory only; an employee cannot approve its own durable memory.

## Tools and execution

- Structured, real tools mapped to implementation paths.
- Authorization before every write or external side effect.
- Risk tier based on the most consequential real action.
- Autonomy classification derived from actual tools and permissions.
- Activity logging for success and failure.
- Per-call LLM cost attribution using the correct agent id.
- ProofDesk/ticket visibility for meaningful work.
- Idempotency, retry safety, deduplication and rollback.
- Individual kill switches for owned behaviors.

## Verification

- Real Talk exchange.
- Representative read action.
- Representative proposed action.
- Representative authorized write or communication action when the role includes one.
- Activity, ticket, cost and authorization evidence.
- Production smoke test by the responsible human.

Use `.claude/skills/onboard-ai-agent/SKILL.md` as the minimum checklist, then extend it to enforce this 2.0 standard.

---

# 7. Legacy fleet consolidation model

Do not delete or bulk-disable the legacy fleet at the beginning.

Classify every registered item as one of:

- `employee`: durable identity, personality, manager, charter and owned outcomes.
- `behavior`: cron, worker, event handler, scanner, evaluator or independently pausable process owned by an employee.
- `tool`: callable capability available to one or more employees.
- `duplicate`: redundant implementation to merge safely.
- `retire`: unused, superseded or dead behavior with evidence supporting retirement.
- `unresolved`: cannot yet be classified safely.

Keep `AiAgent` canonical. Prefer additive fields/relationships over a replacement registry. Proposed concepts must be validated against existing schema before implementation:

- `record_kind`.
- `parent_agent_id` or equivalent owned-by relationship.
- `migration_status`.
- `legacy_alias_of`.
- `human_owner_id` or the verified existing reports-to relationship.

Preserve individual behavior kill switches and observability even when those behaviors no longer appear as separate employees in the workforce UI.

Each active legacy item must eventually map to:

1. One accountable employee.
2. One business capability.
3. One source implementation.
4. One trigger or schedule.
5. Its input data and permissions.
6. Its output and external effects.
7. Its risk tier.
8. Its authorization chokepoint.
9. Its activity/cost/ticket evidence.
10. Its success metric.
11. Its kill switch and rollback path.

Do not migrate all legacy items at once. Move only the behaviors belonging to the current employee.

---

# 8. Tool discovery and tool-building policy

The goal is not merely to document existing tools. Make each employee excellent at its job.

For the current employee:

1. Read every assigned legacy process and its real source implementation.
2. Inventory current tools, APIs, MCP tools, services, database reads, write paths, communications and external systems.
3. Compare the employee's approved responsibilities with what those tools actually enable.
4. Produce a capability-gap analysis.
5. Reuse a real tool when it already satisfies the need.
6. Build a new tool when a required capability does not exist.
7. Do not invent a tool name without implementing the callable behavior.

Every new tool must include:

- Stable tool id and human-readable name.
- Business purpose.
- Owning employee and allowed additional employees.
- Input and output schema.
- Real implementation path.
- Data sources and data freshness requirements.
- Read/write/external-side-effect classification.
- Risk tier and permission requirements.
- Authorization policy.
- Approval/HITL behavior.
- Idempotency and deduplication design.
- Timeout, retry and failure behavior.
- Audit/activity/cost/ticket emission.
- Unit, integration and authorization tests.
- Transparency-page documentation of what it reads and produces.

Tools must be exposed to an employee through a structured mapping, not only a free-text prompt declaration. Extend existing tool/capability infrastructure rather than creating an unrelated duplicate system.

Examples of domain-enhancing tools to evaluate, not blindly implement:

- Marketing: campaign diagnosis, content calendar, channel performance, brand compliance, experiment planning.
- UI/UX: accessibility inspection, design-system drift, screenshot comparison, usability issue creation, experience scoring.
- Curriculum: lesson coverage, assessment alignment, certification gap analysis, curriculum QA, lab validation.
- Admissions: lead 360, intent synthesis, appointment orchestration, document readiness, compliant communications.
- Sales: offer configuration, enrollment readiness, subscription health, renewal risk, revenue follow-up.
- Internship: eligibility, interview evidence, placement matching, progress monitoring, completion readiness.
- Websites: broken-path detection, conversion-funnel inspection, content freshness, form health, safe repair proposal.
- Platform: job health, dependency mapping, deployment diagnostics, automation design, incident coordination.
- Executive: company health synthesis, evidence-backed prioritization, cross-domain conflict detection, risk briefing.

Any tool involving paid services, new external vendors, new credentials, security-boundary changes, or strategic architecture is a hard stop requiring Ali's approval at the phase checkpoint.

---

# 9. Human ownership and authorization

Resolve names to real employee/org records before writing reports-to relationships. Do not silently guess based on first names.

The required ownership supplied for this mission is:

- Sohail owns Marketing.
- Aleem owns UI/UX.
- Swait owns Curriculum.
- Taiwo owns Admissions.
- Roselyn owns Sales, Enrollments and Subscriptions.
- Dhee owns Internship.
- Tejesh owns the Websites.
- Kes is the Automation Architect and owns the Platform.

At Phase 0, resolve and show the exact matching records. Ask once if any identity is ambiguous or absent. Do not repeatedly ask in later phases after identity has been resolved.

Management writes must be authorized server-side against the real reports-to chain. Frontend visibility is not authorization.

Manager instructions may restrict an employee but may not expand its underlying platform authority. Authority expansion requires a separately approved permission/tool change.

---

# 10. Employee macro-phases

Run the following phases for one employee. Each phase ends with the mandatory checkpoint described in Section 3.

## Phase 0 — Program foundation and first-employee selection

This phase runs once for the program.

- Inspect the complete agent registry and current workforce-management implementation.
- Reconcile actual fleet counts instead of relying on comments or stale documentation.
- Detect employee-like identities versus behavior-like entries.
- Resolve the named human owners to real records.
- Verify Reese's current owner and identify the owner required for Executive Intelligence & Governance.
- Confirm or adjust the ten-employee roster.
- Upgrade the program's migration matrix without changing runtime behavior.
- Recommend the first employee; default to Curriculum, Learning & Certification.

Deliverables:

- `AI_EMPLOYEE_ROSTER.md`.
- `LEGACY_AGENT_CLASSIFICATION.csv`.
- `HUMAN_OWNERSHIP_MAP.md`.
- Program execution contract and dependency-aware plan.

STOP for Ali's approval.

## Phase 1 — Current employee discovery and coverage contract

- Inspect the current employee domain's registry entries, source files, schedules, tools, tickets, data, external effects and tests.
- Identify duplicates, dead paths, missing registrations and cross-domain overlaps.
- Define exactly which legacy behaviors this employee will absorb in this release.
- Define what remains out of scope.
- Establish baseline behavior and production metrics.
- Create the rollback and duplicate-action prevention plan.

Deliverables:

- Employee discovery report.
- Capability/behavior coverage matrix.
- Baseline and regression contract.
- Risk register.

STOP for Ali's approval.

## Phase 2 — Employee charter, personality and accountability

- Draft the employee's role charter.
- Draft its unique Personality & Judgment Profile.
- Present one recommendation and two brief alternatives.
- Confirm human manager, escalation path and inter-agent handoffs.
- Define KPIs and honest `UNMEASURED` states.
- Define authority boundaries and prohibited actions.

No production identity is created in this phase.

STOP for Ali's approval of the employee itself.

## Phase 3 — Capability and tool design

- Map existing tools to approved responsibilities.
- Identify missing capabilities.
- Design the minimum set of new real tools needed to make the employee excellent.
- Define schemas, authorization, risk, audit, idempotency, cost attribution and tests.
- Separate tools from behaviors and employee identity.
- Run the independent plan audit required by `/loop-architect`.

Deliverables:

- Tool and capability map.
- New-tool specifications.
- Implementation plan with acceptance tests.
- Plan-audit score and findings.

STOP for Ali's approval before implementation.

## Phase 4 — Build the employee in non-production

- Build the real Reese-style employee identity using shared generic infrastructure.
- Implement the approved personality/system prompt and role charter.
- Implement missing approved tools.
- Connect existing tools and behaviors.
- Add authorization, activity logging, cost attribution, tickets, checklists and work ledger.
- Add always-online presence using shared infrastructure.
- Add manager conversation, directives, approved memory and reports where supported.
- Update the Agent Detail experience without hardcoding the employee.
- Add migrations additively and idempotently.
- Run focused tests and task-verifier loops.

Do not deploy to production.

STOP with a non-production review package and exact test instructions.

## Phase 5 — Shadow validation and release readiness

- Run the new employee in disabled, preview, observe or shadow mode as appropriate.
- Compare its results against current legacy behavior.
- Prove no duplicate external actions can occur.
- Exercise representative Talk, read, propose and authorized-action paths.
- Verify reports-to, risk tier, autonomy source, tools, activity, costs, tickets and authorization evidence.
- Run full quality gates required by the repository.
- Complete screenshot review for changed UI.
- Prepare production deployment and rollback instructions.

Do not deploy to production until Ali approves this checkpoint.

STOP for production go/no-go.

## Phase 6 — Production deployment and verification

Only enter after explicit Phase 5 approval.

- Use the repository's documented PR, CI, merge and deployment process.
- Deploy only the current employee's approved scope.
- Verify the production commit SHA and application health.
- Run the `/loop-production-verifier` against the live system.
- Have the employee's responsible human perform or receive a plain-English production test guide.
- Confirm existing behaviors continue or are safely superseded.
- Verify there are no duplicate messages, writes, tickets or scheduled actions.
- Capture evidence, limitations, rollback and support instructions.

STOP after production verification. Do not begin another employee.

## Phase 7 — Employee acceptance and next-employee authorization

- Present the final production handoff.
- Show outcome coverage, tools, personality, manager, current commitments, risks, cost visibility and production evidence.
- List any legacy items not yet migrated.
- Ask Ali whether to keep observing, correct this employee, or approve it and select the next employee.

Possible decisions:

- `OBSERVE`: keep the employee in production without starting another.
- `CORRECT`: create a scoped correction run for this employee.
- `ACCEPT`: mark the employee accepted, but still wait for a separate next-employee selection.
- `NEXT <employee>`: explicitly authorize the next employee's Phase 1.

Never infer `NEXT` from `ACCEPT`.

---

# 11. Production safety and migration rules

- No batch migration of all employees.
- No automatic enabling of outbound/autonomous behavior.
- No fabricated history, goals, evidence, metrics or memory.
- No destructive schema migration.
- No removal of legacy behavior until the replacement passes production verification.
- No simultaneous legacy and replacement external side effects.
- Every behavior retains a specific kill switch.
- Every employee release has a last-known-good rollback SHA and procedure.
- A broken or unreliable data source is quarantined from reasoning.
- A failed authorization path fails closed.
- Missing manager/reporting identity blocks release.
- Missing activity, cost or ticket attribution blocks release.
- Missing real implementation behind a declared tool blocks release.
- Unsupported communication channels must not appear as available.

If Reese contains a known gap, fix or compensate for it before using that pattern in another employee. Reese is the reference architecture, not permission to duplicate known defects.

---

# 12. Required testing

For the current employee, require at minimum:

- Model and migration tests.
- Identity-seed idempotency tests.
- Reports-to resolution and authorization tests.
- Personality/system-prompt assembly tests.
- Tool schema and implementation tests.
- Tool-denial and approval-path tests.
- Activity logging on success and failure.
- LLM cost attribution test.
- Ticket visibility and deduplication tests.
- Presence/heartbeat truthfulness test.
- Metric-quarantine test.
- Memory-approval enforcement test.
- Legacy-versus-new shadow comparison.
- Duplicate external-action prevention test.
- Backend and frontend type checking.
- Relevant Jest and Playwright coverage.
- Visual verification of Agent Detail and workforce UI.
- Production smoke and rollback-readiness verification.

Do not call a page that renders successfully a completed employee. Exercise real representative behavior and inspect persisted evidence.

---

# 13. Workforce user experience

The main workforce UI should ultimately show the accountable employees, not hundreds of equal-looking process cards.

Each employee should display:

- Identity, personality summary and role.
- Responsible human manager.
- Online/current-status indicator.
- Mission and owned outcomes.
- Current work, plans, commitments and blockers.
- Capabilities and tools.
- Owned behaviors and their kill switches.
- Trust, risk, autonomy and authorization status.
- Cost and activity.
- Tickets and decisions.
- Goals and honest measurement state.
- Reports, directives, memory and charter.
- Production version and recent changes.

Legacy workflows should appear inside the employee's `Capabilities & Automations` area, not as peers pretending to be separate employees.

Do not redesign the full workforce UI during the first employee unless the minimum reusable shell is required. Build generic components incrementally and verify them with each employee.

---

# 14. Completion criteria for the full program

The full consolidation program is complete only when:

1. The workforce roster contains no more than ten accountable AI employees.
2. Every active legacy behavior maps to exactly one accountable employee.
3. Every employee has a verified human manager.
4. Every employee has a distinct approved personality and role charter.
5. Every employee is represented as a real, always-online staff identity.
6. Every declared tool has a real implementation and structured assignment.
7. Missing tools required by approved responsibilities have been implemented and tested.
8. Every write/outbound action uses authorization and audit controls.
9. Every meaningful action emits employee-specific activity, cost and ticket evidence.
10. Every employee has passed an individual production deployment and verification cycle.
11. Ali explicitly accepted each employee before the next employee began.
12. The workforce UI distinguishes employees from owned automations.
13. Duplicate and retired legacy entries are archived safely without losing history.
14. CI prevents future non-compliant employee identities from being added.

---

# 15. Start instruction

Begin with `/loop-architect` Phase A discovery, then execute only **Program Phase 0** from Section 10.

Do not write runtime code, create employee identities, migrate behaviors, or deploy during Program Phase 0.

At the end of Phase 0, show Ali the reconciled roster, exact human identity matches, current Reese ownership, unresolved Executive ownership, legacy classification summary, recommended first employee, risks, and the decision required to begin that employee's Phase 1.

Then STOP.
