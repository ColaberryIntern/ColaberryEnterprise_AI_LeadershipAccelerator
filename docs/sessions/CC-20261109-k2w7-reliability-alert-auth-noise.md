# CC-20261109-k2w7 — Reliability alert: authorization rejections counted as AI failures

- [x] Stop counting authorization rejections in the AI reliability error rate
  - Date: 2026-11-21
  - Session: CC-20261109-k2w7
  - What changed: `computeRollingErrorRate()` in `backend/src/services/reliabilityAlertingService.ts` now excludes six authorization-rejection event types from both the numerator and the denominator; six regression tests added that assert the SQL itself.
  - Verification: `npx jest src/__tests__/services/reliabilityAlertingService.test.ts` → **Test Suites: 1 passed, Tests: 11 passed**. Mutation-checked: removing the new `NOT IN` clause fails exactly the two SQL-asserting tests. `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` reported **only** a deliberately planted control error and nothing else, then the control was removed.
  - Notes: see below.

## What triggered it

A severity-8 alert at 2026-11-21 14:45 Central: *"Reliability Alert: 91% AI event failure rate (last 15m) — 20 of 22 ai_events rows failed."*

It was a false alarm. All 28 failures in the surrounding three hours carried `"message": "jwt expired"`. They came from two people: one admin session from origin `47.186.92.19` (Windows, Edge/Chrome 157) and one participant from `70.22.234.150` (Mac, Chrome 154). Every genuine AI operation in the same window succeeded — 38 `llm.call`, 3 `agent.authorization`, 1 `retrieval`, 1 `tool.call`, 41 of 41.

## Root cause

The error rate was computed over every row in `ai_events` with no filter on `event_type`.

Authorization-rejection event types are written **only** on rejection. They have no success row, so they are 100% "failures" by construction and nothing can ever pull the rate back down. Measured on production:

| event_type | rows | ok | fail |
|---|---:|---:|---:|
| `llm.call` | 188,691 | 188,171 | 520 |
| `admin_auth_failed` | 91,897 | 0 | 91,897 |
| `participant_auth_failed` | 7,196 | 0 | 7,196 |
| `sales_or_admin_auth_failed` | 163 | 0 | 163 |

`admin_auth_failed` is the second-largest event type in the table. Genuine AI failure rate is 520 / 188,691 = **0.28%**. The metric was dominated roughly **200:1** by the authorization layer working correctly.

A second effect compounds it: one expired session emits about twenty rows, because an open dashboard fans out parallel API calls and each rejected call logs its own. So the number measured page fan-out, not incidents. The existing `MIN_SAMPLE_SIZE = 20` guard, whose comment anticipates exactly this class of problem, was cleared by a denominator of 22.

It had been firing all day: hourly rates over the preceding 24 hours read 50%, 83%, 44%, 42%, 54%.

## The fix, and why it is an exclusion list

Six event types are excluded from both numerator and denominator: `admin_auth_failed`, `participant_auth_failed`, `sales_or_admin_auth_failed`, `delivery_client_auth_failed`, `gov_project_access_denied`, `delivery_client_link_no_membership`.

**Exclusion, not allowlist, on purpose.** An alert should fail *open*: an event type we have not seen must still be able to raise an alarm. An allowlist would silently drop new failure types, which is the worse direction to be wrong in on an alerting path.

**`basecamp_request_failed`, `ghl_request_failed` and `synthflow_call_failed` are deliberately left counting.** Those are real upstream failures (`TimeoutError`, `UpstreamUnavailable`). The line drawn is *"a rejection that is the correct outcome"* versus *"a call that did not work"*. A test pins this so nobody later quietens the channel by adding them.

The `IN (:excludedEventTypes)` form is used rather than `= ANY(:x)`, which does not bind an array correctly on this driver and throws at runtime. An explicit `event_type IS NULL OR` guard is present because `NOT IN` evaluates to NULL for a NULL `event_type` and would otherwise discard those rows from the denominator.

## Why the existing tests did not catch it

All five pre-existing tests passed throughout the incident. Every one of them mocks `sequelize.query` and asserts only on the returned numbers, so not one ever looked at the SQL. The six added tests assert the query text and its replacements directly.

Honest limit: the test named *"reproduces the 2026-11-21 false alarm"* still passes under mutation, because it feeds a mocked result rather than exercising the query. It documents the intended behavior. The two SQL-asserting tests are the actual regression guards, and those are the two the mutation check failed.

## Not changed

`MIN_SAMPLE_SIZE` stays at 20. With the auth rows removed, a quiet 15-minute window now falls below the floor and the check correctly declines to judge rather than publishing a rate from a handful of events.
