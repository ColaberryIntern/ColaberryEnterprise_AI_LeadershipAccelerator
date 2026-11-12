# CC-20261109-k2w7 — Agent Tools, Phase 2: the request pipeline and its conversation

**Date:** 2026-11-11
**Ticket:** Agent dashboard Tools section —
https://app.basecamp.com/3945211/buckets/7463955/todos/10500496471
**Follows:** Phase 1 (PR #3911), merged and deployed at `c911f953`.

## What was asked

Ali: *"They can request and manage communication between me on the request and keeping track
until it is built out and handed over and we should track everything associated so all parties
can see what's going on."*

## What was missing, and what was not

The AF11 request-to-grant spine already exists and is good. Two things it does not have:

1. **A read keyed by AGENT.** The existing reads are by status (the approver's queue) or by
   request id (the review console). Neither answers "what is in flight for Maya", which is the
   question her dashboard asks. The parent request is keyed by DOMAIN, and most domains have no
   agent attached — `admissions` has `agent_id: null`, so Maya's domain cannot answer it either.
   `agent_domain_tool_request_details.agent_id` is the only place a tool request names an agent.
2. **A conversation.** `agent_domain_tool_request_decisions` records the four verbs. A verb is
   not a conversation: a question and its answer are neither an approval nor a denial, and had
   nowhere to live, so they happened in chat and were lost to everyone not in that chat.

## What this ships

- `backend/src/db/ensureToolRequestMessageSchema.ts` (new) — the conversation table, append-only,
  with CHECK constraints refusing a blank body and a blank author
- `backend/src/models/AgentDomainToolRequestMessage.ts` (new)
- `backend/src/services/agentDomain/toolRequestConversationService.ts` (new) — the per-agent
  pipeline read, the conversation read, and the posting contract
- `backend/src/controllers/toolRequestConversationController.ts` (new)
- `backend/src/routes/admin/toolRequestConversationRoutes.ts` (new) — three routes
- `backend/src/routes/adminRoutes.ts`, `backend/src/server.ts` — mount and boot wiring
- `backend/src/db/__tests__/...bootWiring.test.ts` — roster raised to 9 with its reason
- `frontend/src/components/admin/agentDetailV2/AgentToolRequests.tsx` (new) — the section
- `frontend/src/components/admin/agentDetailV2/AgentToolsTab.tsx`,
  `frontend/src/services/agentEffectiveAccessApi.ts`

## Two constraints built in deliberately

**Discussion cannot decide.** Posting writes a message and nothing else. A test asserts the
written row's exact keys and that `verb`, `status`, `tools_granted`, `autonomy_level`, `enabled`
and `assigned_tool_name` appear on none of them. The AF11 doc's instruction is *"There is already
an approval spine. Do not build a second one"*, and a conversation that could approve something
would be one. Because the table has nowhere to put a status, it can never disagree with
`agent_domain_change_requests.status` about whether a request is open.

**"Approved" never reads as "done".** The derived sentence is *"Approved to build. Not yet
tracked through to handover, which Phase 3 adds."* A test fails if it ever starts claiming
completion. Tracking through handover is exactly what Ali asked for and exactly what does not
exist yet, so the UI must not imply it.

**The author is the caller, never the payload.** The POST body schema is `.strict()` and has no
`author_identity` field, so sending one is refused by name. The server reads `req.admin.email`,
matching how `toolRequestDecisionController` resolves `decided_by_identity`, so a message and a
decision on the same request attribute to the same string. The service also refuses a blank
identity, so a caller that skips the controller still cannot post anonymously.

## A correction made during the build

I first wrote the controller to read the actor from `req.user?.email` / `req.adminUser?.email`.
Both are wrong: `requireAdmin` attaches `req.admin`. Checked against
`toolRequestDecisionController` rather than shipped as a guess.

I also first wrote the schema `assert` with hand-rolled queries — binding the column list, and
reading `pg_constraint` instead of `information_schema`. Replaced with the sibling's exact shape,
which is the form proven against this driver; `normalizeNameRows` exists because the returned
shapes are not uniform, and a variant that silently returns nothing would read as a clean schema.

## Verification

- Frontend typecheck: clean
- Backend typecheck, full project: **0 errors in `src/`**
- Backend unit tests: **41 passed** across the new suite, the boot-wiring roster and Phase 1's
- Mutation A, dropping the author guard: fails exactly *"refuses an unattributed message"*
- Mutation B, letting approved read as done: fails exactly *"says approved to build"*
- Both mutations confirmed applied by grep; the service restored byte-identical afterwards
- Test-file typecheck ratchet and the FULL frontend suite: run before pushing this time, after
  Phase 1 shipped a tab-count break to CI because only the frontend typecheck had been run

## Still open

1. **Phase 3** — the states past `approved`: in build, handed over. The sentence above is written
   to be replaced by it.
2. **Phase 4** — the missing refusal rule tying a grant to its capability's `required_tools`.
3. **Phase 5** — tool identity on every action, under the record-now-enforce-later posture.
4. **Filing from the agent's page** is still not possible, and should not be faked: filing is
   keyed by `domain_key`, and `admissions` has no agent attached, so there is no honest domain to
   file against from Maya's dashboard. Attaching agents to domains is its own decision.
