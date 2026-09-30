# Communication Map (Checkpoint A)

Scope: every real channel/pipe a manager could plausibly use to talk to, hear from, or receive updates about an AI agent, and what's actually generic vs. hardcoded in each.

## 1. Chat (turn-based, synchronous-feeling)

- `chatService.ts` + `ChatConversation`/`ChatMessage` models — Maya's admissions chat. Structurally generic column shapes (conversation id, sender, turn, timestamp), but **hard-FK'd to `visitors`**. Cannot host an `org_member ↔ ai_agent` conversation without a schema change.
- **Verdict:** pattern reusable (conversation/message split, turn ordering), code is not. Checkpoint C needs new `AgentManagerConversation`/`AgentManagerMessage` tables shaped similarly but keyed on real `org_members.id` and `ai_agents.id`.

## 2. Community rooms / DMs

- `RoomMessage`/`RoomMembership`/`dmService.ts` — keyed on `enrollment_id`. Reese already participates today, but only via a special-cased `getReeseEnrollmentId()` hack, and `assertSameCohort()` carries a narrow hardcoded Reese bypass.
- **Verdict:** real proof an AI agent CAN appear in a human-facing message surface, but the mechanism is an identity hack, not a generic path. Do not extend this system for manager↔agent conversation — it would mean giving every future agent its own fake-enrollment hack, multiplying the exact anti-pattern non-negotiable #7 (generic, not Reese-specific) warns against.

## 3. Notification / "needs attention" queues

No generic, identity-agnostic queue exists. Every real candidate is domain-bound:
- Basecamp todo assignment (BC-specific)
- Email inbox / `InboxReplyDraft` (email-specific)
- Community-member notification (community-specific)
- `ApprovalRequest` (shadow-mode only, nothing ever resolves it)

**Verdict:** `AgentManagerInboxItem` (per `DOMAIN_REUSE_MAP.md`) must be built new. It should be modeled on `ProposedAgentAction`'s real, enforced status lifecycle, not on any of the above.

## 4. Email

- `emailService.ts::sendRawEmail()` — generic `{to, subject, html, text, ...}`, Mandrill-backed, kill-switch aware. **This is the one channel that's genuinely ready to reuse as-is** for any manager-report or 1:1-summary send.
- `communicationSafetyService.ts::evaluateSend()` cannot gate these sends — its `SendRequest.leadId` is mandatory and every check resolves against lead tables. Internal notification paths already bypass this gate entirely (real precedent). A manager-report feature needs either a light internal-send gate of its own or an explicit, logged decision to bypass safety checks that don't apply to internal recipients — not a forced fit into the lead-facing gate.

## 5. Slack

- `slackSubscriber.ts` — code-complete but **never called** anywhere outside its own definition. No package dependency, no env var, no registration call.
- **Verdict:** dormant, not live. Any Checkpoint D UI must not render a Slack option as if it works — per the mission's explicit "do not render unsupported channels" rule and the STOP CONDITION on offering channels that don't function. Wiring Slack live is its own separate, unscoped piece of work.

## 6. Proactive agent-initiated contact (the agent reaching out, not the manager)

- `reeseAutonomousOutreachService.ts` + `initiateDm()` + cron-sweep — real, working precedent for an agent proactively messaging a human, but fixed-cadence (cron sweep), not per-manager-triggered, and Reese-specific in its current call sites.
- **Verdict:** the pattern (safety-railed proactive outreach — cadence cap, daily send cap, fail-closed eligible-population gate, escalation cap, all documented in `build-platform-agent/SKILL.md`) is exactly the rail set any agent-initiated manager contact (e.g., an agent escalating to its manager) should reuse. Not a data-model concern — a safety-rail concern.

## 7. Scheduling / cadence

**Confirmed absent: any per-user or per-manager timezone field.** Checked directly:
- `AdminUser.ts` — no timezone column.
- `OrgMember.ts` — no timezone column (full model read in `MANAGER_AUTHORIZATION_MAP.md`; confirmed absent).
- Every cron timezone option repo-wide is a hardcoded `'America/Chicago'` string literal.

**Verdict:** any feature that lets a manager pick "send my weekly Reese report Friday 4pm" needs a new timezone field on `OrgMember` (or wherever the manager identity ultimately resolves) before cadence scheduling can be timezone-safe. This is flagged as a hard prerequisite for Checkpoint D, not an optional nicety — the mission's own stop conditions explicitly forbid timezone-unsafe 1:1/report scheduling.

## Summary table

| Channel | Generic today? | Ready to reuse? | Action needed |
|---|---|---|---|
| Chat (Maya) | No (visitor-bound) | No | New tables, pattern reused |
| Community room/DM | No (enrollment hack) | No | Do not extend |
| Notification/inbox | No (none exists) | No | Build new, modeled on `ProposedAgentAction` |
| Email | Yes | **Yes** | Reuse `sendRawEmail()` directly |
| Slack | N/A — dormant | No | Do not surface in UI until wired |
| Proactive agent outreach | Partially (Reese-specific call sites) | Pattern only | Reuse safety-rail pattern, not code |
| Timezone-aware scheduling | No (confirmed absent) | No | New column required, hard prerequisite |
