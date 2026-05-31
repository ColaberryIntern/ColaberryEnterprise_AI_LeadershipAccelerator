# Build + Test Plan — 3 Tracks

**Drafted:** 2026-05-31 (CC-20260531-3track-plan)
**For:** Ali Muwwakkil
**Scope:** SMS+Voice alerting, Gov-bid-add-from-Opportunity-Pulse pipeline, AI auto-runner.

---

## TL;DR

Three buildable tracks, all approved as queued. Recommended sequencing keeps each one shippable in isolation, lets us hit operational wins in week 1 (Track A Phase 1 kills T-Mobile noise), and stacks the bigger sprints (auto-runner) after the foundation is in place.

| Track | Headline | First-ship target | Cost/mo |
|---|---|---|---|
| **A** | VIP SMS routing + Voice Q&A | Week 1 (VIP SMS Phase 1) | ~$3 SMS + Synthflow already paid |
| **B** | @CB add gov bid full pipeline (Opp Pulse → reply parser → finalize) | Week 2 | $0 |
| **C** | AI auto-runner (executes AI-tier tasks before pinging you) | Week 4 | OpenAI tokens (~$10-30/mo) |

**Recommended sequence:** A1 → B → C1+C2 → A2 → B4 + C3 → A3.

---

## Track A — SMS + Voice Alerting

### Status
Plan doc exists at `docs/sms-voice-alerting/PLAN.md` (shipped earlier this session). 6 open questions emailed to Ali. Phase split confirmed: VIP SMS (1 week) → Voice Q&A (2 weeks) → polish (3 days).

### Build steps — Phase 1: VIP SMS routing

| # | Step | Output | Test |
|---|---|---|---|
| A1.1 | Create `vip_contacts` Postgres table + Sequelize model | Migration shipped | `SELECT` returns seeded rows |
| A1.2 | Seed initial VIP list from Ali (or 90-day inbound suggestion) | ~15-20 rows | Manual review |
| A1.3 | Find + disable T-Mobile carrier email-to-SMS forwarder (currently the noise source) | Forwarder off | Send a non-VIP test email, no SMS arrives |
| A1.4 | Install `twilio` npm package, purchase number, wire env vars | `TWILIO_SID`, `TWILIO_TOKEN`, `TWILIO_NUMBER` in prod env | Test SMS via Node REPL to Ali's number |
| A1.5 | New `backend/src/services/vipSmsRouter.ts` — given inbound email, check VIP table, summarize with gpt-4o-mini, send SMS + forward to gmail | Module file + unit tests | Mock email payload through router, assert SMS body length ≤160 chars |
| A1.6 | Hook into Mandrill inbound webhook (`mandrillWebhookController.ts`) | Webhook updated | E2E test: send real email from a VIP test sender, SMS arrives within 30s |
| A1.7 | Cap enforcement against `communication_logs` table | New `lib/notificationCaps.js` | Send 8 VIP emails in one day, 7 fire, 8th is logged-deferred |
| A1.8 | New @CB tools: `vip_add`, `vip_remove`, `vip_list` | 3 tool definitions in handler | Tag @CB with each, verify VIP table updates |

### Build steps — Phase 2: Voice Q&A

| # | Step | Output | Test |
|---|---|---|---|
| A2.1 | Synthflow "CB Voice" agent setup with retrieval over CCPP + BC + email | Agent ID + prompts in Synthflow dashboard | Manual call: ask "what's the InternID for X" — agent retrieves + reads back |
| A2.2 | Critical-alert trigger registration: new helper that any service can call to fire a voice call | Module: `lib/criticalAlert.js` | Call `triggerCriticalAlert()` from test script, voice call lands |
| A2.3 | Cap enforcement (3/day) | Cap check inside criticalAlert | Fire 4 alerts in one day, 4th logs-deferred |
| A2.4 | `@CB trigger_critical_alert` tool for internal services | Tool wired in handler | Tag @CB, voice call lands |
| A2.5 | Voice Q&A retrieval handlers: CCPP query, BC query, email content fetch | 3 service methods, exposed to Synthflow via webhook | Manual: call, ask Q across each source, verify accurate retrieval |

### Build steps — Phase 3: Polish

| # | Step | Output | Test |
|---|---|---|---|
| A3.1 | `notifications_deferred` table for capped-out events | Migration + writer | Trip cap, verify row created |
| A3.2 | Daily 6am digest of deferred items (fold into Cory briefing) | Cory briefing updated | Run briefing, deferred items appear |
| A3.3 | `@CB mute_sms <hours>` for meeting windows | Tool wired | Mute, send VIP email, no SMS arrives during window |
| A3.4 | `/admin/notifications` page showing recent SMS + voice + deferred | New frontend page + backend route | Open in browser, sortable table loads |

### Risk + open questions
- 6 questions in the earlier email (VIP seed list, T-Mobile source, critical sources, voice Q&A priority, cap-overflow behavior, daily digest placement). **Cannot start Phase 1 without #1 and #2.**

---

## Track B — Gov Bid Add Pipeline (Opportunity Pulse → reply parser → finalize)

### Status
@CB tool `post_gov_bid_download_instructions` shipped this session with real Opportunity Pulse URLs. Half the pipeline is done — the other half (parse Ali's reply, call `add_gov_bid` per item, integrate with `processGovBid.js` for RFP zip handling) is the build target.

### Build steps — Phase B.1: Opportunity Pulse programmatic query (optional helper)

| # | Step | Output | Test |
|---|---|---|---|
| B1.1 | New `lib/opportunityPulse.js` — login + list strategic opportunities + fetch per-uuid detail | Module with `loginOP()`, `listStrategic(limit)`, `getOpportunity(uuid)` | Run `node -e "..."` to fetch top 5, JSON returned |
| B1.2 | New @CB tool `list_strategic_opportunities(count)` — calls OP, returns a summary that CB posts as a basecamp_reply | Tool wired | Tag @CB with "what are the top 5 opportunities" — list returned in-thread |

**Why optional:** Ali said the current flow is "you find them and give me the links" — this lets CB *actually* find them, not just point to the OP feed. If Ali wants the feed-driven flow only, skip B.1 entirely.

### Build steps — Phase B.2: Parse Ali's reply into structured bids

| # | Step | Output | Test |
|---|---|---|---|
| B2.1 | LLM-driven parser: when Ali replies on the MB instructions post tagging @CB with the bid list, the handler's system prompt teaches it to extract structured fields per bid (title, deadline, agency, uuid, bonfire URL, fit thesis) | Updated system prompt + new internal helper in handler | Smoke test with Ali's expected reply format — fields extracted correctly |
| B2.2 | Loop call `add_gov_bid` per extracted bid | Multi-call orchestration inside one @CB invocation | Smoke test with N=3 — 3 todolists created |
| B2.3 | Post a summary basecamp_reply: "Created N bids. Links: ..." | Format included in system prompt | Smoke test, reply text verified |

### Build steps — Phase B.3: RFP zip-aware finalize

| # | Step | Output | Test |
|---|---|---|---|
| B3.1 | New `add_gov_bid_from_zip({title, deadline, agency, zip_path, opp_uuid})` — extension of existing `addBid()` that calls `processGovBid.js` patterns: extract zip → upload to BC vault → create per-task descriptions referencing zip files | Module updated | Run with a sample zip (use Harris County's zip from Downloads) — vault folder populated, tasks reference real docs |
| B3.2 | Add UPLOADED-ZIP detection to MB-reply parsing: if Ali attached zips to his reply, CB downloads them via BC API and feeds to B3.1 | Updated handler | Reply with attached zip, verify CB downloads + populates |
| B3.3 | @CB tool `add_gov_bid` updated to optionally take `opportunity_uuid` and `bonfire_url` (already in instructions reply format) | Tool sig extended | Verified via parser flow |

### Build steps — Phase B.4: Auto-pull from Opportunity Pulse

| # | Step | Output | Test |
|---|---|---|---|
| B4.1 | When Ali provides opportunity UUIDs in his reply, CB calls `opportunityPulse.getOpportunity(uuid)` to pull agency + deadline + AI-tailored notes automatically (reduces Ali's typing burden) | Handler enhancement | Reply with just UUIDs, CB fills in title/deadline/agency from OP API |

### Testing strategy
- **Use a TEST bucket** instead of the live Gov Contracts project for early runs. Create a "Gov Contracts SANDBOX" project, point `PROJECT_ID` env override at it.
- After E2E works in sandbox, switch back to live.
- **Replay the original 5 LIKELY-SCRAP bids** (Harris County, SLCC, TDCJ, Southlake, Detroit) — they're in BC trash and recoverable. Use their real UUIDs/URLs from the historical scripts. Verify the pipeline produces equivalent todolists.

### Open questions
- B.Q1: Build B.1 (programmatic OP query) or keep the manual-paste flow?
- B.Q2: Where should uploaded zips live? Per-bid vault folder, or shared `RFPs/<uuid>/` folder?
- B.Q3: When Ali says "@CB ready" without details, should CB nudge him for the structured format or try to parse free-form?

---

## Track C — AI Auto-Runner

### Status
Not started. Today, the Your-Turn Notifier covers the email side ("you're up"). The execute side (CB actually running the next AI-doable task before pinging Ali) is the missing piece. Largest sprint of the three.

### Build steps — Phase C.1: Task executor framework

| # | Step | Output | Test |
|---|---|---|---|
| C1.1 | New `backend/src/services/aiTaskExecutor/` module — registry of task-type handlers keyed by task content pattern | Registry skeleton with 3 placeholder handlers | Unit test: `executeTask({content: "Draft executive summary", bid_context})` returns mock output |
| C1.2 | Handler: `draftExecutiveSummary(bidContext)` — gpt-4o, prompt loaded from `templates/exec-summary.md` | Working handler | Run against a real bid context, output is a 1-page summary |
| C1.3 | Handler: `extractRequirementsMatrix(bidContext, zipPath)` — reads RFP zip, uses gpt-4o to extract requirements per source doc | Working handler | Run against Harris County zip, matrix populated with row count > 50 |
| C1.4 | Handler: `respondToFunctionalRequirements(bidContext, matrixPath)` — per-row response (OOTB / Config / Customization / Cannot Meet) | Working handler | Run against extracted matrix, response file generated |
| C1.5 | Handler: `draftCapabilityStatement(bidContext)` — pulls from Colaberry standard capability deck | Working handler | Output is a 1-page capability statement |
| C1.6 | Handler: `respondToTechnicalRequirements(bidContext)` — Section 3 + reference architecture | Working handler | Output is a technical-response doc |
| C1.7 | Handler: `craftProposalNarrative(bidContext, allPriorArtifacts)` — composes the main proposal from all prior outputs | Working handler | Output is a multi-section narrative |
| C1.8 | Generic fallback: `genericAiTask(bidContext, taskContent)` — for tasks that don't match a specific handler | Working handler | Returns a draft + queues for Ali review |

### Build steps — Phase C.2: Cron loop + dry-run mode

| # | Step | Output | Test |
|---|---|---|---|
| C2.1 | New `backend/src/scripts/govContractsAiRunner.js` — runs every 10 min, for each bid: pull next-overall task, if AI-tier, execute via registry, post result as BC comment, mark complete | Cron-runnable script | First run: `--dry-run` flag shows what WOULD execute without writing |
| C2.2 | Integration with existing Your-Turn Notifier: when AI runner completes a task and next is HUMAN, the Your-Turn Notifier fires its email immediately | Notifier hook | E2E test: complete a human task, watch runner execute the next 2-3 AI tasks, then "[Your Turn]" email arrives |
| C2.3 | Add cron: `*/10 * * * * ... govContractsAiRunner.js` | Cron entry on VPS | Wait one cycle, check log |
| C2.4 | Audit log to `tmp/ops-engine/ai-runner-log.jsonl` per task: bid, task content, handler used, output preview, completion timestamp, error if any | JSONL written | Post-run, log contains entries |

### Build steps — Phase C.3: Human-in-the-loop review queue

| # | Step | Output | Test |
|---|---|---|---|
| C3.1 | When AI runner completes a task, it does NOT mark complete in BC — instead it posts the output as a BC comment with a `<!-- AI-DRAFT pending review -->` marker | Handler change | Run, BC comment posted, todo still open |
| C3.2 | New @CB tool `approve_ai_draft(todo_id)` — Ali tags @CB to approve, which marks the todo complete and removes the marker | Tool wired | Tag @CB, todo completes, marker gone |
| C3.3 | Daily 7am AI-Drafts-Pending digest — list of all open AI-tagged drafts awaiting Ali's review | New email script | Run, digest lists 0 first day, increments as drafts accumulate |
| C3.4 | Optional: auto-approve simple drafts after 24h with no Ali response (configurable per task type) | Cron + flag | Set auto-approve, wait 24h, draft moves to complete |

### Testing strategy
- **Per-handler tests:** unit-test each handler against a fixture bid context. Snapshot the output.
- **Dry-run cron:** runner in dry-run mode for the first week. Logs what it WOULD do. Ali reviews logs, signs off before turning on writes.
- **Sandbox bucket:** same pattern as Track B — write to a sandbox before live.
- **Rollback:** every AI-completed task is taggable as "rollback" via @CB if the output was wrong; that re-opens the todo and clears the comment.

### Open questions
- C.Q1: Auto-complete or human-review-queue default? (Per the existing Pattern I doctrine on outside-facing actions, I lean human-review for anything that will go in a proposal Ali signs.)
- C.Q2: Should the AI runner have access to Ali's voice (gpt-4o personalization), or stay neutral?
- C.Q3: When should the runner stop? At first HUMAN task in the sequence (current plan), or run all AI tasks across all bids in parallel?

---

## Recommended sequencing

| Week | Track | Phases | Why this order |
|---|---|---|---|
| 1 | A | A1.1 - A1.8 (VIP SMS Phase 1) | Immediate operational win: kills T-Mobile noise, makes important emails actionable. Independent of other tracks. |
| 2 | B | B.2.1 - B.2.3 + B.3.1 (reply parser + zip-aware finalize) | Builds on the dispatcher fix from this session. Lets Ali add new bids in 1 round-trip instead of 2. |
| 3-4 | C | C.1.1 - C.1.8 + C.2.1 - C.2.4 (executor framework + cron in dry-run) | Biggest unknowns - need 2 weeks. Dry-run for a week before live writes. |
| 5 | A | A2.1 - A2.5 (Voice Q&A) | Reasonable build, decoupled from C. |
| 5-6 | B | B.4.1 + B.1 (auto-pull from OP) | Polish. Lets the pipeline self-serve more. |
| 6 | C | C.3.1 - C.3.4 (review queue) | Risk control on top of C.2 cron. |
| 7 | A | A3.1 - A3.4 (polish + admin UI) | Final track A. |

**Total:** 7 weeks for everything. Track A Phase 1 lands at end of week 1.

---

## Risk register

| Risk | Track | Mitigation |
|---|---|---|
| 6 open questions block Track A start | A | Email already sent with questions. Need answers by end of this week. |
| Opportunity Pulse credentials change | B | Pull from CCPP secrets table at runtime; don't hardcode. |
| AI runner posts wrong content as Ali's | C | Dry-run for first week. Mandatory human review queue. Rollback @CB tool. |
| Twilio number blocked by carrier for high-volume | A | Capped at 7/day per Ali's rule. Well under any rate limit. |
| Synthflow Q&A latency too high | A | Pre-warm common queries (latest CCPP intern roster, active bids list) on a 5-min refresh cache. |
| 14-task template doesn't fit non-Bonfire RFPs | B + C | Add `template_id` field to bid metadata; default to `bonfire-14`, allow custom templates per route. |

---

## Decision needed from Ali to kick off

1. **Track A Q1-Q6** (in earlier email): VIP seed list, current SMS source, critical sources, voice Q&A priority, cap overflow behavior, daily digest placement.
2. **Track B Q1-Q3:** Build programmatic OP query or stay manual? Zip storage location? Free-form parsing acceptable?
3. **Track C Q1-Q3:** Auto-complete or review queue default? Voice personalization? Stop-at-human vs run-all-AI-parallel?

If you're OK with my recommended defaults (review-queue default for C, manual-paste for B for now, my answers for A available on request), reply "go with recommended defaults" and I'll kick off Track A Phase 1 next session.

---

*Plan drafted 2026-05-31 (CC-20260531-3track-plan). Total scope: 7 weeks for all three tracks + cushion. Independently shippable per track, no hard inter-dependencies that block parallel work.*
