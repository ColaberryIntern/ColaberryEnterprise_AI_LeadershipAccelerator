# Week 9 Content Spec: Reliability Engineering + AI Quality Layer

**Intensive:** 3 — Connect AI To The Real World  
**Theme:** Reliability Engineering + AI Quality Layer  
**Type:** Colaberry-original (no dedicated Anthropic Skilljar course)  
**Background course:** Claude with the Anthropic API (Week 3 Skilljar course — already completed)  
**Architecture Day:** Monday 2026-09-21  
**Build Day:** Thursday 2026-09-24  
**BC ticket:** https://app.basecamp.com/3945211/buckets/47502609/todos/9984356522  
**Status:** Pending Ali approval

---

## Purpose

Week 9 closes Intensive 3 (Connect AI To The Real World). Students arrive with a multi-agent system (Week 7) and automated development workflows (Week 8). This week adds the reliability layer: input validation at every external boundary, retry logic with exponential backoff, confidence scoring on agent outputs, and structured error classification.

The question this week answers is: does your AI system survive real conditions? A system that works once in a demo is not production-ready. A system that validates its inputs, retries transient failures, scores its own confidence, and logs every exception with a stable error class is.

Anthropic has no dedicated Skilljar course on AI reliability engineering. The read/watch layer is sourced from Anthropic's public API documentation and error-handling reference. The Week 3 Skilljar course (Claude with the Anthropic API) is pre-requisite background; students do not retake it this week.

---

## Learning Objectives

By the end of Week 9, a student can:

1. Identify every external boundary in their AI system (Claude API calls, MCP tool calls, external API calls) and add input schema validation that rejects malformed input with a descriptive error before it reaches business logic.
2. Write a retry wrapper with exponential backoff — 3 attempts maximum, 1 s → 2 s → 4 s delay — that retries on 429 (rate limit) and 5xx (server error) responses and fails fast on 4xx (client error).
3. Add a confidence score (0.0–1.0 float, documented threshold for human escalation) to at least one agent output in their project.
4. Tag every caught exception in their system with a stable `error_class` string (one of: `TimeoutError`, `RateLimitError`, `AuthError`, `ValidationError`, `UpstreamUnavailable`, `ContractViolation`) before logging or re-throwing.
5. Demonstrate idempotency: running the same agent operation twice with the same inputs produces the same end state and does not duplicate side effects (emails sent, rows inserted, API writes triggered).

---

## Read/Watch Layer

Assign before Architecture Day. Estimated pre-class time: 45 min.

| # | Resource | URL | What to read |
|---|---|---|---|
| 1 | Anthropic API Errors | https://docs.anthropic.com/en/api/errors | Full page — error codes, response shapes, which errors are retryable (429, 529) vs. not (400, 401, 403) |
| 2 | Anthropic Rate Limits | https://docs.anthropic.com/en/api/rate-limits | Full page — rate limit headers (`retry-after`, `x-ratelimit-*`), how to read the backoff signal |
| 3 | Tool Use Best Practices | https://docs.anthropic.com/en/docs/build-with-claude/tool-use | Section: "Error handling" and "Chaining tool calls" — reliability patterns for agentic calls |
| 4 | Building Reliable Agentic Systems | https://docs.anthropic.com/en/docs/build-with-claude/agents-and-tools/build-agents | Sections on error handling, human-in-the-loop, and stopping conditions |

**Background only (not re-assigned):** Claude with the Anthropic API — https://anthropic.skilljar.com/claude-with-the-anthropic-api (completed Week 3)

---

## Architecture Day — Monday 2026-09-21

**Format:** Live, instructor-led, 90 min

### Agenda

| Time | Block | Description |
|---|---|---|
| 0:00–0:15 | The silent failure demo | Live demo: an agent call that catches an exception and does nothing (`try { ... } catch (e) {}`). Show the user experience: nothing happens, no log, no retry, no recovery. Then show the same call with structured error handling: the exception is caught, tagged `RateLimitError`, logged as JSON, retried with backoff, and the result is returned. The diff is 12 lines. The outcome is a system you can debug. |
| 0:15–0:35 | Validation at the boundary | Instructor shows the input validation pattern: define the expected shape of every external input (JSON schema or Zod), parse and reject at the entry point with a descriptive error message, never let malformed input reach business logic. Walk through a live example: an agent that accepts a company name and a document URL; show what happens when the URL is missing. Students identify one external boundary in their own project. |
| 0:35–0:55 | Retry with exponential backoff | Instructor writes a retry wrapper live in Claude Code. Start with the simplest case: a function that calls the Claude API and retries on 429. Add backoff (1s, 2s, 4s). Add attempt cap (3). Add `error_class` tag. Students copy the pattern and adapt it to their own API call. |
| 0:55–1:10 | Confidence scoring | Instructor shows how to add a confidence field to an agent output: instead of returning a bare string, return `{ result: "...", confidence: 0.87, escalate: false }`. Define the threshold (below 0.70 → `escalate: true`). Show how this enables the human-in-the-loop pattern: when confidence is low, route to a human review queue instead of proceeding automatically. Students define their own threshold for their project's primary agent. |
| 1:10–1:25 | Error classification | Introduce the 6 stable error class strings. Show each one in context: `TimeoutError` (API call exceeds 30s), `RateLimitError` (429 response), `AuthError` (401/403), `ValidationError` (malformed input rejected at boundary), `UpstreamUnavailable` (5xx after all retries exhausted), `ContractViolation` (API returned success but the response shape does not match the declared type). Students map their system's known failure modes to these classes. |
| 1:25–1:30 | Build Day assignment | Instructor assigns: build the Reliability Layer module (see Artifact Spec below). Students leave with the module structure pre-scaffolded in their project. |

---

## Build Day — Thursday 2026-09-24

**Format:** Lab, live or async, 90 min

### Lab Assignment: AI Reliability Layer v1.0

Students add a dedicated `reliability/` module to their project. Every external boundary in their system is wrapped in the validation, retry, and logging patterns from Architecture Day. At the end of Build Day, they demonstrate that running their primary agent operation twice produces the same end state.

---

## Tier-A Artifact: AI Reliability Layer

### Directory structure in student project

```
reliability/
  validate.ts       # input schema validation functions — one per external boundary
  retry.ts          # retry wrapper: exponential backoff, 3 attempts max, error_class tagging
  confidence.ts     # confidence scoring wrapper for agent outputs (0.0–1.0 float + escalate flag)
  logger.ts         # structured JSON logger: timestamp, level, service, event, error_class, outcome
```

### Module contracts

**`validate.ts`**
```ts
// validateInput(schema, input): returns { valid: true, data } | { valid: false, error: string }
// Caller must check valid before proceeding. Invalid inputs are never passed to business logic.
```

**`retry.ts`**
```ts
// withRetry(fn, options): wraps any async function with retry + backoff
// options: { maxAttempts: 3, baseDelayMs: 1000, retryOn: ['RateLimitError', 'UpstreamUnavailable'] }
// Non-retryable errors (AuthError, ValidationError, ContractViolation) throw immediately.
```

**`confidence.ts`**
```ts
// scoreOutput(result, scorer): returns { result, confidence: 0.0–1.0, escalate: boolean }
// scorer: a function the student writes for their agent's output domain
// escalate is true when confidence < threshold (student-defined, documented in module header)
```

**`logger.ts`**
```ts
// log(level, event, context): emits one JSON line to stdout
// Required fields: timestamp (ISO-8601), level, service, event, outcome, error_class (if outcome=failure)
```

### Acceptance criteria for Tier-A

- [ ] `reliability/` directory present in the student's project repo with all four files
- [ ] `validate.ts` covers at least 2 external boundaries in the student's project (Claude API call + at least one MCP tool call or external API call)
- [ ] `retry.ts` implements exactly 3 attempts, 1 s → 2 s → 4 s backoff, and retries only on `RateLimitError` and `UpstreamUnavailable`
- [ ] `confidence.ts` is wired to the student's primary agent output with a documented threshold and an `escalate` flag
- [ ] `logger.ts` produces valid JSON on every call — instructor pipes output through `JSON.parse` to verify
- [ ] Every `catch` block in the student's existing codebase is updated to tag the exception with one of the 6 `error_class` strings before logging
- [ ] Student demonstrates idempotency: runs their primary agent operation twice with the same input and shows the end state is identical (same DB row, no duplicate side effect, same output)
- [ ] Module committed at `reliability/` with commit message: `feat(reliability): AI reliability layer v1.0`

---

## Assessment Hooks (for Swati's assessment pack)

### Warmup quiz (5 questions, before Architecture Day)

1. Which HTTP status code signals a rate limit from the Anthropic API? (Answer: 429)
2. What does exponential backoff mean? (Answer: the delay between retries doubles on each attempt — e.g., 1s, 2s, 4s — so a burst of failures does not immediately hammer the upstream again)
3. A `try { ... } catch (e) {}` block with no body is problematic because: (Answer: the exception is silently swallowed — no log, no retry, no recovery, and the caller has no indication that anything failed)
4. What is the purpose of a confidence score on an agent output? (Answer: it signals how certain the model is, enabling the system to route low-confidence results to human review rather than proceeding automatically)
5. Name one difference between a `ValidationError` and an `UpstreamUnavailable` error. (Answer: `ValidationError` means the input was malformed before the call was made — the system should reject immediately and not retry; `UpstreamUnavailable` means the external service failed — the system should retry with backoff)

### Post quiz (10 questions, after Build Day)

Questions test practical application, not recall:
- Given a code block with a bare `catch (e) {}`, identify what is missing and rewrite it with the correct `error_class` tag and structured log line
- Given an API call with no retry logic that fails on 429, write the `withRetry` wrapper call that fixes it
- Given a confidence score of 0.62 and a threshold of 0.70, state what the system should do next (escalate to human review — do not proceed automatically)
- Given two agent outputs (one with `confidence: 0.91`, one with `confidence: 0.54`), explain what each confidence value implies and what action the system takes for each
- Given a scenario where an operation is run twice (e.g., inserting a student record from a webhook), identify the idempotency risk and write the check that prevents a duplicate insert
- Given a log line that is missing `error_class` and `outcome`, rewrite it as a valid structured log entry
- Name the 3 conditions under which the retry wrapper should NOT retry (Answer: `AuthError`, `ValidationError`, `ContractViolation` — these are caller-side errors that will not resolve on retry)
- Given a broken `validate.ts` that passes malformed input to business logic, identify the point of failure and add the missing boundary check
- Given an agent that returns a bare string, refactor the return signature to include `confidence` and `escalate` fields
- A student's retry wrapper uses `maxAttempts: 10` and no delay. Identify both problems and state the correct values. (Answer: 10 attempts exceeds the 3-attempt cap; no delay creates a tight retry loop that amplifies rate limit pressure — fix: 3 attempts, 1s/2s/4s backoff)

### Week 9 feedback survey (4 questions)

1. "I can identify every external boundary in my AI system and know which ones need validation." (1-5 scale)
2. "The retry wrapper pattern is clear enough that I could apply it to a new API call without referencing the Architecture Day notes." (1-5 scale)
3. "I understand why confidence scoring matters for production AI systems, not just as an academic concept." (1-5 scale)
4. Open: "Which part of your system was hardest to make idempotent, and what did you change to fix it?"

---

## NotebookLM Video Hooks (for Swati)

**One video, target length 12–15 min.**

| Segment | Duration | Content |
|---|---|---|
| The silent failure cost | 2 min | Open with the real-world consequence: an AI system that silently fails looks to the user like it worked. No error, no retry, no log — just the wrong outcome persisted to the database. Show a 30-second demo of this. Then show the same code with the reliability layer: the failure is caught, tagged, logged, retried, and — if all retries fail — surfaced clearly to the caller. |
| Validation at the boundary | 3 min | Walk through `validate.ts`. Show the schema definition for one external boundary. Show what happens when the validation catches a malformed input: a descriptive error is returned, the call is not made, the error is logged. Run it live against a bad input and a good input. |
| Building the retry wrapper | 4 min | Write `retry.ts` live. Start with the naive version (no retry). Add the first retry. Add backoff. Add the attempt cap. Add `error_class` tagging. Run it against a simulated 429 response and show the 3-attempt, 1s/2s/4s pattern executing in the terminal output. |
| Confidence scoring in practice | 3 min | Wire `confidence.ts` to a live agent call. Show the output before (`{ result: "..." }`) and after (`{ result: "...", confidence: 0.83, escalate: false }`). Lower the threshold to trigger `escalate: true`. Explain the routing decision that `escalate: true` enables: human review queue, Slack alert, or dashboard flag — the student chooses the mechanism for their project. |
| Idempotency check | 2 min | Run the same agent operation twice. Show the end state is identical. Explain the pattern: check for an existing record by idempotency key before inserting; use `INSERT ... ON CONFLICT DO NOTHING` for database writes. Students see that idempotency is a design choice, not an accident. |

**Source material:** the 4 read/watch resources above + the `reliability/` module the student builds on Build Day.

---

## Non-Goals (Week 9 scope boundary)

These are explicitly deferred:

| Deferred topic | Where it belongs |
|---|---|
| Circuit breaker implementation (N-failure threshold + cooldown window) | Week 10 (Governance) — governance layer wraps reliability layer |
| Distributed tracing across multiple services | Post-program (requires infrastructure not available in the Architect Workspace) |
| Load and stress testing | Post-program — requires a staging environment with production-representative traffic |
| Database transaction reliability and rollback strategies | Week 10 (Governance) — audit log + approval flow require transaction guarantees |
| Prompt-level caching for cost optimization | Week 3 (Claude API) — already covered as API optimization pattern |
| Building a dead-letter queue for failed jobs | Post-program — requires a message broker (SQS, RabbitMQ) outside current stack |

---

## Done Criteria

This week is complete when ALL of the following are true:

- [ ] Ali approves this spec
- [ ] The 4 read/watch resources are accessible via the links above (Anthropic public docs — no login required)
- [ ] Swati has built the assessment pack (5-question warmup + 10-question post quiz + 4-question feedback survey) using the hooks above
- [ ] Swati has produced the NotebookLM video (12–15 min) from the source material above
- [ ] The `reliability/` module template is embedded in the student portal Week 9 page (Design E dependency — deferred until portal week-detail pages land)
- [ ] Swati sign-off on full week as launch-ready
