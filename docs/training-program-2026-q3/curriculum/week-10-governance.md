# Week 10 Content Spec: Governance + AI Governance Engine

**Intensive:** 4 — Design AI That Scales  
**Theme:** Governance + AI Governance Engine  
**Type:** Colaberry-original (no dedicated Anthropic Skilljar course)  
**Background course:** Claude with the Anthropic API (Week 3 Skilljar course — already completed)  
**Architecture Day:** Monday 2026-09-28  
**Build Day:** Thursday 2026-10-01  
**BC list:** Curriculum (https://app.basecamp.com/3945211/buckets/47502609/todolists/9946468992), Week 10 group  
**Status:** Draft — pending Ali approval

---

## Purpose

Week 10 opens Intensive 4 (Design AI That Scales). Students arrive with a multi-agent system (Week 7), automation hooks (Week 8), and a reliability layer (Week 9) that validates inputs, retries transient failures, and scores output confidence. This week adds the governance layer that sits on top: every state-changing action is logged immutably, every high-risk action waits for a human before it executes, every low-confidence or policy-violating action escalates to a named human instead of failing silently, and repeated failures trip a circuit breaker instead of hammering a broken dependency forever.

This maps directly to the LOCKED Capstone Evaluation Rubric dimension "Governance layer (audit log, approval flow, escalation path)" (A12, `docs/training-program-2026-q3/launch-briefs/11-swati-curriculum-twc.md`) and to the TWC-filed Seminar 4 outcome "AI Governance Engine (audit logging, human approval flows, escalation paths)" (`docs/training-program-2026-q3/TWC_INTENSIVE_OUTCOMES.md`). Scope is locked to those three components plus the two items explicitly deferred from Week 9's Non-Goals: circuit breaker and transaction/rollback safety.

Anthropic has no Skilljar course on governance or audit architecture — this is Colaberry-original content. The read/watch layer draws on Anthropic's tool-use and agentic-workflow documentation for the mechanics of pausing an agent mid-action for approval; the governance *pattern* itself (audit log, approval gate, escalation, circuit breaker) is standard software architecture, not Claude-specific.

---

## Learning Objectives

By the end of Week 10, a student can:

1. Add an immutable audit log entry for every state-changing action in their system: actor, action, resource, before/after state, timestamp, and outcome — queryable, never overwritten or deleted.
2. Implement a human approval gate for at least one high-risk action class (e.g., sending an email to a real customer, writing to a production table, executing a payment): the action is queued, not executed, until an authorized human approves it through a defined mechanism.
3. Add an escalation path that fires on two trigger conditions: (a) a Week 9 confidence score below the student's documented threshold, and (b) a Week 10 action blocked by the approval gate or governance policy — both route to a named human or channel, never a silent drop.
4. Implement a circuit breaker (CLOSED → OPEN → HALF_OPEN → CLOSED) that stops calling a failing resource after N consecutive failures and requires a cooldown period or manual reset before resuming — deferred from Week 9's scope.
5. Wrap at least one multi-step state-changing operation in a transaction or compensating-action sequence so a failure partway through cannot leave persisted state inconsistent — deferred from Week 9's scope.

---

## Read/Watch Layer

Assign before Architecture Day. Estimated pre-class time: 35 min.

| # | Resource | URL | What to read |
|---|---|---|---|
| 1 | Tool Use Best Practices | https://docs.anthropic.com/en/docs/build-with-claude/tool-use | Section: "Error handling" — reread with a governance lens: which tool calls in your system are high-risk enough to need a human in the loop before they fire? |
| 2 | Building Reliable Agentic Systems | https://docs.anthropic.com/en/docs/build-with-claude/agents-and-tools/build-agents | Section: "Human-in-the-loop" and "Stopping conditions" — the mechanics of pausing an agent for approval before it takes an irreversible action |
| 3 | Anthropic API Errors | https://docs.anthropic.com/en/api/errors | Reread section on 5xx/429 — background for the circuit-breaker trigger condition (N consecutive upstream failures) |

**Instructor reference (not assigned to students):** this platform's own production circuit breaker (`backend/src/services/agents/openclaw/openclawCircuitBreaker.ts`) and ABAC/audit design (`docs/ai-governance/abac-design.md`) are the models this lab's simplified governance engine is scaled down from. Use them to keep the lab's acceptance criteria grounded in a real, working pattern rather than an abstract one — do not hand these internal files to students directly.

---

## Architecture Day — Monday 2026-09-28

**Format:** Live, instructor-led, 90 min

### Agenda

| Time | Block | Description |
|---|---|---|
| 0:00–0:15 | The unlogged action problem | Live demo: an agent writes to a database with no audit trail. Ask: who did this, when, and what did it overwrite? No answer exists. Then show the same write with an audit log entry: actor, action, resource, before/after state, timestamp. The diff is one function call. The outcome is a system you can investigate after the fact. |
| 0:15–0:35 | The approval gate | Instructor identifies a high-risk action (e.g., an email send to a real recipient) and shows the pattern: the action is queued in a pending-approval state instead of executing immediately; a human reviews and approves or rejects; only on approval does the action fire. Students identify one high-risk action class in their own project. |
| 0:35–0:55 | Escalation paths | Instructor wires two escalation triggers: a Week 9 confidence score below threshold, and a Week 10 approval-gate rejection. Both route to the same escalation function, which the student wires to a channel they control (Slack webhook, email, or a dashboard flag — student's choice, documented). Students add the escalation call to their existing confidence-scoring code from Week 9. |
| 0:55–1:15 | Circuit breaker | Instructor builds the CLOSED → OPEN → HALF_OPEN → CLOSED state machine live, using this platform's own `openclawCircuitBreaker.ts` as the reference pattern: track error count and total count in a rolling window, open the circuit past a threshold, allow limited test traffic through in HALF_OPEN, close it again on success. Students wire it to the external call they added retry logic to in Week 9. |
| 1:15–1:25 | Transaction safety | Instructor shows a multi-step write that fails partway through without a transaction (partial state), then the same operation wrapped in a database transaction or a compensating-action sequence (undo step 1 if step 2 fails). Students identify one multi-step operation in their project that needs this. |
| 1:25–1:30 | Build Day assignment | Instructor assigns: build the Governance Engine module (see Artifact Spec below). |

---

## Build Day — Thursday 2026-10-01

**Format:** Lab, live or async, 90 min

### Lab Assignment: AI Governance Engine v1.0

Students add a dedicated `governance/` module to their project, layered on top of the `reliability/` module from Week 9. At the end of Build Day, they demonstrate: one high-risk action blocked pending approval, one escalation firing on a low-confidence output, and the circuit breaker opening after a simulated failure streak.

---

## Tier-A Artifact: AI Governance Engine

### Directory structure in student project

```
governance/
  auditLog.ts        # append-only audit log: actor, action, resource, before/after state, timestamp, outcome
  approvalGate.ts     # queues a high-risk action; blocks execution until an authorized human approves or rejects
  escalation.ts       # routes low-confidence (Week 9) or blocked (Week 10) actions to a named human/channel
  circuitBreaker.ts   # CLOSED/OPEN/HALF_OPEN state machine per resource; N-failure threshold + cooldown
```

### Module contracts

**`auditLog.ts`**
```ts
// recordAction({ actor, action, resource_type, resource_id, before, after, outcome }): Promise<void>
// Append-only — no update or delete path exists on this table/store.
```

**`approvalGate.ts`**
```ts
// requestApproval({ actor, action, resource_type, resource_id, context }): Promise<{ status: 'pending' }>
// The caller MUST NOT execute the action after this call — it returns immediately with 'pending'.
// approveAction(requestId, approverId) / rejectAction(requestId, approverId, reason): only these
// transition a pending request to 'approved' | 'rejected'; the original caller's action executes
// only after an 'approved' transition is observed.
```

**`escalation.ts`**
```ts
// escalate({ reason: 'low_confidence' | 'blocked_action', context, channel }): Promise<void>
// channel is student-defined (Slack webhook / email / dashboard flag) — must be documented in the
// module header. Never silently drops — if the channel call fails, it falls back to the audit log
// with outcome 'escalation_failed' so the miss is at least visible.
```

**`circuitBreaker.ts`**
```ts
// evaluateCircuit(resourceKey, errorCount, totalCount, lastFailureAt, openedAt, config): CircuitState
// Pure function — same shape as this platform's openclawCircuitBreaker.ts: CLOSED (normal),
// OPEN (blocked, cooldown running), HALF_OPEN (limited test traffic). Default config: error
// threshold 50%, minimum sample size 5, cooldown 30 min — student may justify different values
// for their own system's risk profile.
```

### Acceptance criteria for Tier-A

- [ ] `governance/` directory present in the student's project repo with all four files, layered above the Week 9 `reliability/` module
- [ ] `auditLog.ts` records at least 2 distinct action types with actor, before/after state, and timestamp — student demonstrates the log is append-only (no update/delete method exists)
- [ ] `approvalGate.ts` is wired to at least 1 real high-risk action in the student's project; student demonstrates the action does NOT execute until an explicit approval call
- [ ] `escalation.ts` fires on both trigger conditions (a Week 9 low-confidence output and a Week 10 blocked/rejected action) and routes to a documented channel
- [ ] `circuitBreaker.ts` opens after the configured failure threshold on a simulated failure streak, and the student demonstrates the HALF_OPEN → CLOSED recovery path
- [ ] At least 1 multi-step state-changing operation is wrapped in a transaction or documented compensating-action sequence; student demonstrates a mid-sequence failure leaves no partial state
- [ ] Module committed at `governance/` with commit message: `feat(governance): AI governance engine v1.0`

---

## Assessment Hooks (for Swati's assessment pack)

### Warmup quiz (5 questions, before Architecture Day)

1. What is the difference between logging an action and auditing it? (Answer: a log is any diagnostic output; an audit log is append-only, attributes every entry to an actor, and is never overwritten or deleted — it exists to answer "who did what, when" after the fact)
2. In an approval-gate pattern, what must the caller do immediately after requesting approval? (Answer: stop — return a pending status and NOT execute the action; execution only happens after an explicit approval transition)
3. Name the three states in the circuit breaker pattern. (Answer: CLOSED, OPEN, HALF_OPEN)
4. Why does an escalation path need a fallback if the primary channel (e.g., Slack webhook) fails? (Answer: because a silently-dropped escalation is worse than a noisy one — the fallback, even just an audit log entry, keeps the miss visible instead of invisible)
5. What does "compensating action" mean in the context of a multi-step operation that fails partway through? (Answer: an explicit undo step for an already-completed prior step, used when the operation cannot be wrapped in a single database transaction — e.g., refunding a charge if the follow-up provisioning step fails)

### Post quiz (10 questions, after Build Day)

- Given an agent action with no audit trail, identify what fields are missing and add a correctly-shaped `recordAction` call
- Given a high-risk action currently executing immediately with no gate, refactor it to use `requestApproval` and show the corrected control flow
- Given a confidence score of 0.55 with a Week 9 threshold of 0.70, trace the call path through `escalation.ts` and state which channel receives the escalation
- Given error counts (7 failures / 10 total in the last window) and a 50% threshold, state the resulting circuit state (Answer: OPEN — 70% error rate exceeds the 50% threshold)
- Given a circuit in OPEN state, describe what must happen before it can return to CLOSED (Answer: cooldown period elapses, circuit moves to HALF_OPEN, a limited number of test calls succeed, circuit closes)
- Given a two-step write (create record, then send confirmation email) where the email send fails after the record is created, identify the governance gap and propose a compensating action
- A student's `approvalGate.ts` executes the action immediately and asks for approval afterward. Identify the defect. (Answer: this inverts the pattern — approval must gate execution, not follow it; the action already happened by the time approval is requested)
- Given an audit log implementation that includes an `updateEntry()` method, identify why this violates the append-only requirement and what to remove
- Name the two trigger conditions this week's escalation path must handle (Answer: Week 9 low-confidence output, and a Week 10 blocked/rejected action)
- Given a multi-step operation with no transaction and no compensating actions, and a failure on step 3 of 4, describe the resulting inconsistent state and the fix

### Week 10 feedback survey (4 questions)

1. "I can explain the difference between a log and an audit log to someone outside this program." (1-5 scale)
2. "The approval-gate pattern is clear enough that I could apply it to a new high-risk action without referencing the Architecture Day notes." (1-5 scale)
3. "I understand why a circuit breaker is different from a retry loop." (1-5 scale)
4. Open: "Which action in your system was hardest to classify as high-risk vs. safe-to-automate, and how did you decide?"

---

## NotebookLM Video Hooks (for Swati)

**One video, target length 12–15 min.**

| Segment | Duration | Content |
|---|---|---|
| The unanswerable question | 2 min | Open with the real cost: an AI system made a change, something went wrong, and nobody can say what happened, when, or why. Show the same scenario with an audit log: one query answers all three questions. |
| Building the approval gate | 4 min | Write `approvalGate.ts` live. Start with an action that executes immediately. Add the pending-request pattern. Add the approve/reject transition. Show the corrected system: the action provably does not execute until approved. |
| Escalation, not silence | 3 min | Wire `escalation.ts` to both trigger conditions. Show a low-confidence Week 9 output escalating. Show a rejected Week 10 action escalating. Show what happens when the channel itself fails — the fallback audit entry, not a silent drop. |
| The circuit breaker | 3 min | Walk through this platform's own `openclawCircuitBreaker.ts` as the reference. Simulate a failure streak, show the circuit opening, show the cooldown, show HALF_OPEN test traffic, show it closing again. |
| Transactions and compensating actions | 2 min | Show a two-step write failing partway through without protection, leaving inconsistent state. Show the same operation wrapped in a transaction. Show a case where a true DB transaction isn't available (e.g., an external API call) and a compensating action is used instead. |

**Source material:** the 3 read/watch resources above + the `governance/` module the student builds on Build Day + the instructor-reference files noted in Read/Watch Layer.

---

## Non-Goals (Week 10 scope boundary)

These are explicitly deferred:

| Deferred topic | Where it belongs |
|---|---|
| Full ABAC (attribute-based access control) with per-resource scoping and autonomy-level tiers | Post-program — this platform's own `docs/ai-governance/abac-design.md` is a production-grade reference, well beyond a one-week student lab |
| Consent capture and management for outbound communication channels | Post-program — see this platform's `docs/ai-governance/consent-capture-design.md` for the production pattern |
| System diagram, data flow, and security model documentation | Week 11 (Systems Architecture) — this week builds the governance code; next week documents the full system including this layer |
| Multi-tenant or per-department governance policy scoping | Post-program — requires an organizational model outside a single-student project |
| Formal compliance certification (SOC 2, ISO) | Post-program — outside program scope entirely |

---

## Done Criteria

This week is complete when ALL of the following are true:

- [ ] Ali approves this spec
- [ ] The 3 read/watch resources are accessible via the links above (Anthropic public docs — no login required)
- [ ] Swati has built the assessment pack (5-question warmup + 10-question post quiz + 4-question feedback survey) using the hooks above
- [ ] Swati has produced the NotebookLM video (12–15 min) from the source material above
- [ ] The `governance/` module template is embedded in the student portal Week 10 page (Design E dependency — deferred until portal week-detail pages land)
- [ ] Swati sign-off on full week as launch-ready
