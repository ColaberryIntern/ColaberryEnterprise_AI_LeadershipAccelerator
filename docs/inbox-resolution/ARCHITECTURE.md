# Inbox Intel — Case Resolution Engine: Architecture

Session: CC-20260731-x9q4. Extends the existing Inbox Chief of Staff (COS) at `/admin/inbox` — this is not a second system.

## 1. What already existed (reused, not duplicated)

| Concern | Existing code | Reused how |
|---|---|---|
| AI classification/drafting | `backend/src/services/openaiInstrumented.ts` (`getInstrumentedOpenAI`) — OpenAI, not Anthropic, despite comments saying "Claude" | Same factory, `workflow_id: 'inbox_case_*'`, for Assess/Teach/Ask (Phase 3) |
| Gmail | `backend/src/services/inbox/inboxSyncService.ts` (`getColaberryGmailClient`, `getPersonalGmailClient`, header/body parse helpers) | Same OAuth2 clients, read-only on-demand search, no new auth flow |
| Hotmail/Graph | `backend/src/services/inbox/graphMailService.ts` (the simpler client `inboxSyncService` itself prefers) | Same client, same interface shape |
| Basecamp | `backend/src/services/ops/basecampClient.ts` (`bcGet`/`bcPost` — shared retry/backoff/pacing/token-refresh), `OpsBcTodo` mirror | Same client imported directly; no second Basecamp auth |
| Schema init | `backend/src/db/ensureLiveSessionSchema.ts` pattern (idempotent raw-DDL, not `sequelize.sync`) | `ensureInboxCaseSchema.ts` follows the identical shape, hooked into `server.ts` boot alongside the others |
| Admin auth | `requireSection('inbox_content')` (router-mount) + `requireAdmin` (per-route) | New routes mounted under the same `/api/admin/inbox` prefix, inheriting both gates automatically |
| Frontend shell | `InboxCOSPage.tsx` (state-based tabs, not router-nested), `AdminLayout`, admin route registration | New "Resolve Work" tab added to the existing `TABS` array (Phase 6); no new admin nav entry needed |

## 2. What's new

Six additive tables, ~20 new backend service files under `backend/src/services/inboxCase/`, a new controller pair, a new route file, and (Phase 6) a new frontend tab. Nothing in the existing Inbox COS tables, services, routes, or scheduler was modified — this is purely additive.

## 3. Data model

```
InboxCase (1) ──< InboxCaseItem (evidence: email/sent_email/basecamp_todo/message/comment)
    │
    ├──< InboxCaseQuestion (consolidated blocking questions)
    ├──< InboxCaseAction (proposed external writes; item_id optional FK)
    └──< InboxCaseEvent (append-only audit trail)

InboxIdentityAlias — standalone, not case-scoped; persisted reusable person identity
  (canonical_name, alias_type, alias_value) — discovered, never hardcoded
```

See `backend/src/types/inboxCase.ts` for the full enum/contract set (case states, item dispositions, action types/statuses, match-reason taxonomy, thresholds) — this file is the single source of truth; Sequelize models, Zod schemas, and services all derive from it.

## 4. Case state machine

```
DISCOVERING → ASSESSING → {NEEDS_ALI ⇄ ASSESSING, READY_TO_PLAN}
READY_TO_PLAN → AWAITING_APPROVAL → EXECUTING → {WAITING, DELEGATED, RESOLVED, FAILED}
{WAITING, DELEGATED, RESOLVED} → REOPENED → ASSESSING   (via reopenCase(), not a normal transition)
FAILED → {ASSESSING, READY_TO_PLAN}
```

Every transition goes through `services/inboxCase/caseRepository.ts::transitionCase()`, which asserts validity against `CASE_STATE_TRANSITIONS` (`caseStateMachine.ts`) and writes an `InboxCaseEvent` row. An invalid transition throws `InvalidCaseTransitionError`, which the controller layer maps to HTTP 409. Nothing else in the codebase is permitted to write `InboxCase.state` directly.

## 5. Discover → Connect pipeline (Phases 1-2, built)

```
discoverCases(mode, query, window)
  │
  ├─ PERSON: identityResolver.resolveIdentity(query) → known emails/names/domains (persisted aliases, or a fresh cold-start seed)
  ├─ TOPIC:  topicExpansion.expandTopic(query) → normalized subject variants + known company domains
  │
  ├─ runAdapters(): gmailColaberryCaseSource + gmailPersonalCaseSource + hotmailCaseSource in parallel
  │     → extract Basecamp URL/recording-ID references found in email bodies
  │     → basecampCaseSource (exact-reference lookups first, then the OpsBcTodo local mirror)
  │
  ├─ countBasecampRefOccurrences(): cross-source corroboration counts (prevents an item's own
  │     Basecamp link from trivially "matching itself")
  │
  ├─ buildReasons() per candidate → matchScoring.scoreCandidate() (noisy-OR weighted combination;
  │     0.85+ auto-include, 0.65-0.84 candidate, <0.65 excluded-but-visible-for-manual-include)
  │
  ├─ caseGroupingService.groupCandidates(): union-find clustering on STRONG connectors only
  │     (thread id, reply-chain, shared Basecamp reference, or same-subject+shared-participant
  │     combo) — never on bare participant overlap alone, so "same person participated" cannot
  │     merge unrelated conversations
  │
  ├─ enrichWithParticipantCorroboration(): a participant recurring 2+ times WITHIN one cluster
  │     is genuine "same_participants" medium-signal evidence, applied per cluster (per-item
  │     scoring alone can't see repetition across siblings)
  │
  ├─ propagateClusterCorroboration(): last-resort — once a cluster has at least one
  │     candidate-or-better item, structurally-linked siblings with zero content overlap of
  │     their own (a terse "sure, will do" reply) still inherit inclusion rather than being
  │     silently dropped
  │
  └─ one InboxCase opened PER SURVIVING CLUSTER (a single "Kes" query can legitimately open
        3 distinct cases in one run), items persisted, aliases upserted, state → ASSESSING
```

## 6. Remaining phases (not yet built at time of writing / see PROGRESS.md for what has since landed)

- **Phase 3 (Assess/Teach/Ask):** structured, Zod-validated AI assessment via `getInstrumentedOpenAI`; consolidated case-level questions (never one per email); prompt-injection defense (evidence is data, never instructions).
- **Phase 4 (Plan/Approve):** action planner producing `InboxCaseAction` rows with previews, risk levels, idempotency keys; approval-first controls (`EXECUTE_APPROVED` is the production-safe default autonomy level).
- **Phase 5 (Execute/Verify/Close):** durable outbox-style executor (persist → approve → lock → idempotency-check → execute one external write → receipt → verify → unlock dependents), closure guard (10 conditions from the directive), archive actions always last, reopen-on-new-activity.
- **Phase 6 (Frontend):** new default "Resolve Work" tab in `InboxCOSPage.tsx`, three-pane case workspace, Playwright coverage.
- **Phase 7:** targeted break/harden pass on the scenarios listed in the directive.

## 7. Deliberate scope boundaries

- No new AI provider (OpenAI only, matching the existing stack).
- No second Gmail/Hotmail/Basecamp auth flow.
- No retroactive migration of existing `InboxEmail` rows into cases — case discovery reads them fresh, on demand.
- No live-credential integration testing in this environment (no Gmail/Basecamp/OpenAI credentials available locally) — adapters are correctly wired against the real client interfaces but validated via mocked-provider integration tests, per root CLAUDE.md's "integration tests may mock external providers" allowance.
