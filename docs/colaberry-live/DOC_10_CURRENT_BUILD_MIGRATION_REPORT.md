# COLABERRY LIVE — CURRENT BUILD MIGRATION REPORT

**DOC 10** · ticket L0.5 ([10497219341](https://app.basecamp.com/3945211/buckets/49210714/todos/10497219341)) · owner Ali Muwwakkil · built 2026-11-10 · session CC-20261015-t6q2

> **This report is late, and that changes how it should be read.** Bootstrap §17 requires it with the words "Before starting new implementation create a report". It was not created. Implementation ran from mid-September to 10 November 2026 without it, and 22 of the 87 todos on this board were completed before this report existed. This is a retrospective ledger, not the pre-flight gate §17 intended. Nothing in it was used to decide what to build. Its value is as a true statement of where the build actually stands on 10 November 2026, and it should not be cited as evidence that the §17 gate was honored.

## How to read this report

Not every part of this document carries the same weight, so each part says which it is.

| Part | Status | How it was produced |
|---|---|---|
| Section A | Measured | Read from `git` during the build that wrote this file. |
| Section B paths | Measured | All 40 file and test paths are `stat`'ed on every build; a path that does not exist fails the build. |
| Section B prose | Surveyed | A read-only pass over the repository, 10 November 2026. |
| Sections C and D | Measured | The 87-row Basecamp census pulled from production on 2026-11-10, committed at `scripts/artifacts/tickets/l05BoardCensus.json` so the counts can be re-run. |
| The 56-task reconciliation | **Judged** | The one judged part. Constrained from both directions by the self-check, but the mapping itself is an opinion. |
| Section F | Derived | A stated rule applied to the census, not a preference. |

The phase definitions are **not** in the bootstrap. §17 asks section B to cover "every known Phase 1-7 area" without defining the phases; the authoritative table is `docs/requirements/CLAUDE_CODE_COLABERRY_LIVE_7_PHASE_BUILD.md` §5, which names 56 parent tasks P1-01 through P7-08.

A note on the count: this report describes 87 todos, and L0.5 — the ticket that produced it — is not among them. The census was measured before this ticket existed. It is the 88th.

## A. Current tab

| Field | Value |
|---|---|
| Session ID | `CC-20261015-t6q2` |
| Branch | `workstream/l05-doc10-migration-report` |
| Worktree | `C:/Users/ali_m/Downloads/acc-doc10-wt` |
| HEAD | `e3ba19283` |
| `origin/main` | `e3ba19283` |
| Merge base | `e3ba19283` |
| Captured at | 2026-11-11T01:33:34.147Z |
| Current plan | Close the one coverage gap the L11.8 pass found: write DOC 10 to bootstrap §17, generated from a data module with a mutation-tested self-check, and give it the ticket it never had. |
| Current task | L0.5 - DOC 10, this document |
| Commits on this branch | none at build time |
| Uncommitted files | `?? docs/colaberry-live/DOC_10_CURRENT_BUILD_MIGRATION_REPORT.md`<br>`?? scripts/artifacts/buildL05Artifacts.js`<br>`?? scripts/artifacts/tickets/l05BoardCensus.json`<br>`?? scripts/artifacts/tickets/l05Data.js`<br>`?? scripts/artifacts/tickets/l05Document.js`<br>`?? scripts/artifacts/tickets/l05Phases.js`<br>`?? scripts/artifacts/tickets/l05Visual.js` |
| PR | Held deliberately. PR #3828 (L11.2 and L11.4) is open with all eleven checks green and edits the same documents ledger this work edits. Opening a second PR against that file while the first awaits review is how an approval gets lost to a conflict, so this branch is pushed and its PR opens once #3828 merges. |

*Captured 2026-11-11T01:33:34.147Z. Section A is a snapshot of the tab that performed the migration, not live repository state: a rebuild is not a new migration and does not claim a new section A. The uncommitted list is what was in flight at capture, which necessarily includes the files that became this document.*

## B. Broadcast system current state

§17 asks for six attributes per phase: what exists, files, tests, deployed or not, flag state, blockers. All six appear for all seven phases below. Flag entries name **variables only, never values**.

| Phase | Tasks | Covered | Partial | No ticket |
|---|---|---|---|---|
| **1. Discover, prove feasibility, and lock the plan** | 8 | 3 | 3 | **2** |
| **2. Broadcast identity, lifecycle, and protected access** | 8 | 6 | 2 | 0 |
| **3. In-app player, live discovery, and audience measurement** | 8 | 5 | 2 | **1** |
| **4. Broadcast Studio and live participation** | 8 | 2 | 2 | **4** |
| **5. Invitations, subscriptions, recurring shows, and AI support** | 8 | 0 | 2 | **6** |
| **6. Replays, learning continuity, and distribution** | 8 | 3 | 3 | **2** |
| **7. Harden, release, verify production, and hand off** | 8 | 2 | 3 | **3** |

### Phase 1 — Discover, prove feasibility, and lock the plan

*Dependencies: none. Exit: independently audited plan plus a real provider feasibility result.*

**What exists.** Provider feasibility is resolved: Cloudflare Stream Live was chosen and is implemented behind an adapter, so the decision is embodied in code rather than only written down. A metrics dictionary and the state contracts exist.

**Files.** `backend/src/services/broadcast/providers/cloudflareStreamProvider.ts` · `backend/src/services/broadcast/broadcastMetrics.ts` · `backend/src/services/broadcast/broadcastStateMachine.ts`

**Tests.** `backend/src/services/broadcast/providers/__tests__/cloudflareStreamProvider.test.ts` · `backend/src/services/broadcast/__tests__/broadcastMetrics.test.ts` · `backend/src/services/broadcast/__tests__/broadcastStateMachine.test.ts`

**Deployed.** Code deployed. Provider configuration present in the production environment (L1.3 completed).

**Flag state.** `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_STREAM_SUBDOMAIN`, `CLOUDFLARE_STREAM_TOKEN`, `CLOUDFLARE_STREAM_SIGNING_KEY_ID`, `CLOUDFLARE_STREAM_SIGNING_KEY_PEM` — Read together by readCloudflareStreamConfig, which returns null when any is unset. Fail-closed: absent configuration disables the provider rather than degrading it.

**Blockers.** No load test and no measured p95 against the planning scenarios, so the capacity half of the feasibility result does not exist. The studio hardware spike was never run.

### Phase 2 — Broadcast identity, lifecycle, and protected access

*Dependencies: Phase 1 architecture and provider feasibility passed. Exit: independent integration check of schema, state, access and the regression suite.*

**What exists.** The most complete area. Canonical broadcast_series, broadcast_occurrences and broadcast_source_refs tables created additively; a versioned state machine with concurrency control; producer commands; fail-closed entitlement across free, paid, preview and private; a 900-second preview clock; signed short-lived playback grants with rate limits; and a dry-run-first backfill.

**Files.** `backend/src/db/ensureBroadcastSchema.ts` · `backend/src/models/BroadcastOccurrence.ts` · `backend/src/services/broadcast/broadcastIdentity.ts` · `backend/src/services/broadcast/broadcastEntitlement.ts` · `backend/src/services/broadcast/broadcastPlaybackGrant.ts` · `backend/src/services/broadcast/broadcastCommandService.ts` · `backend/src/routes/broadcastRoutes.ts`

**Tests.** `backend/src/routes/__tests__/broadcastRoutes.test.ts` · `backend/src/db/__tests__/ensureBroadcastSchema.test.ts` · `backend/src/controllers/__tests__/broadcastController.test.ts`

**Deployed.** Code deployed. Schema bootstrapped at server start.

**Flag state.** `BROADCAST_ENABLED`, `COMMUNITY_ROOMS_ENABLED` — Both are read in backend/src/config/env.ts and both default to false in code, so the routes answer 404 until they are set. They are separate switches, but broadcast_occurrences.room_id points at a community room, so room-scoped access needs both on.

**Blockers.** Only two creation paths exist: historical backfill, and ensureOccurrenceForSession called from the Accelerator session flow. The cancelled state is a one-way door with no outbound transition, so a cancelled class can never air again.

### Phase 3 — In-app player, live discovery, and audience measurement

*Dependencies: Phase 2 canonical identity and access contracts. Exit: independent viewer-journey check with real screenshots on desktop and mobile.*

**What exists.** A Cloudflare playback adapter; a persistent mini-player mounted beside the router outlet so media survives navigation; a shared discovery poller on a server-defined cadence; the live badge and Watch action; heartbeats with server-side aggregation.

**Files.** `frontend/src/services/broadcastPlaybackAdapter.ts` · `frontend/src/services/broadcastHeartbeat.ts` · `frontend/src/components/portal/LiveMiniPlayer.tsx` · `frontend/src/contexts/BroadcastPlayerContext.tsx` · `backend/src/services/broadcast/broadcastTelemetryService.ts`

**Tests.** `frontend/src/routes/__tests__/portalRoutesPlayerMount.test.tsx` · `frontend/src/services/__tests__/broadcastPlaybackAdapter.security.test.ts`

**Deployed.** Code deployed. Never exercised with the flag on in production.

**Flag state.** `BROADCAST_ENABLED`, `BROADCAST_DISCOVERY_POLL_MS` — Clients learn the feature is off by receiving a 404 from discovery, which is why a dark deployment looks identical to a broken one from the browser.

**Blockers.** Community placement is deferred by decision (L4.8). No test asserts what a viewer actually sees end to end, which is recorded in the DOC 12 diagram data as an unbuilt node. With no flag-on environment there are no screenshots and no contrast evidence.

### Phase 4 — Broadcast Studio and live participation

*Dependencies: Phases 2-3; reuse room services and existing staff permissions. Exit: independent two-role rehearsal with a producer, a moderator and viewers.*

**What exists.** Half of it. The producer control strip exists - backstage, content-started, go live, end with confirmation and a version check - plus a segment rundown, producer state and live-audience reads, and a stream health loop with an auto-end safety net.

**Files.** `frontend/src/components/portal/ProducerStrip.tsx` · `frontend/src/components/portal/ProducerRundown.tsx` · `frontend/src/components/portal/LiveWorkspace.tsx` · `backend/src/services/broadcast/broadcastHealthLoop.ts` · `backend/src/services/broadcast/broadcastAutoEndPolicy.ts`

**Tests.** `frontend/src/components/portal/__tests__/ProducerRundown.test.tsx` · `backend/src/services/broadcast/__tests__/broadcastAutoEndPolicy.test.ts`

**Deployed.** The producer half is deployed. The participation half does not exist to deploy.

**Flag state.** `BROADCAST_ENABLED`, `BROADCAST_INPUT_STRATEGY`, `CLOUDFLARE_STREAM_LIVE_INPUT_UID`, `BROADCAST_AUTO_END_WINDOW_SECONDS` — BROADCAST_INPUT_STRATEGY selects shared-default, per-occurrence or per-series input binding.

**Blockers.** There is no Studio setup screen at all: room, host, series, audience, access and artwork cannot be set after creation. Structured Q&A, polls, reactions, pinned resources and the moderated stage request flow are entirely absent - a repository-wide search for stage-request identifiers returns nothing. This is the largest unbuilt surface that the plan treats as required.

### Phase 5 — Invitations, subscriptions, recurring shows, and AI support

*Dependencies: identity, player, participation and metric contracts stable. Exit: independent free-to-preview-to-checkout-to-view journey on sandbox billing.*

**What exists.** Nothing beyond the broadcast_series table and a series_id foreign key. The phase is unbuilt, not partially built.

**Files.** `backend/src/db/ensureBroadcastSchema.ts`

**Tests.** **None.** See blockers.

**Deployed.** Not built.

**Flag state.** No flag. — No flag exists for this area, because there is nothing to gate.

**Blockers.** No follow or subscription model, no series lineup, no T-10 / actual-live / replay-ready notification triggers, no campaign preview or approval, no suppress-if-watching, no funnel reporting, and no wiring to the existing marketing agents. All eight tasks are outstanding and, as section D records, the board has no ticket for any of them.

### Phase 6 — Replays, learning continuity, and distribution

*Dependencies: broadcast occurrence, recording provider, access and campaign contracts. Exit: independent end-to-replay rehearsal including a recording delay and a two-part episode.*

**What exists.** Recordings are bound to occurrences by observed provider video id; a replay promotion loop and readiness policy exist; a replay list route and a Replays page with nav gating; clip markers and a CSV clip-list export.

**Files.** `backend/src/services/broadcast/broadcastRecordingBinding.ts` · `backend/src/services/broadcast/broadcastReplayPolicy.ts` · `backend/src/services/broadcast/broadcastClipListExport.ts` · `frontend/src/pages/portal/replays/ReplaysPage.tsx` · `frontend/src/components/portal/replaysNavGate.ts`

**Tests.** `backend/src/services/broadcast/__tests__/broadcastRecordingBinding.test.ts` · `backend/src/services/broadcast/__tests__/broadcastReplayPolicy.test.ts`

**Deployed.** Code deployed.

**Flag state.** `BROADCAST_ENABLED` — Same switch as the rest of the broadcast surface.

**Blockers.** The whole media-production chain downstream of the recording is unbuilt: transcript, chapters and description, the long-form edit, the short clips, and any publish to YouTube or social. There is no resume-watching or cross-device progress, no chapter navigation, no AI summaries, and no unanswered-question continuity. The signed media route for a stored copy exists but its recording resolver is never registered outside its own test, so the route has no source in production.

### Phase 7 — Harden, release, verify production, and hand off

*Dependencies: all prior required tasks passed. Exit: production evidence passed, with a handoff and a final dashboard.*

**What exists.** Repository-wide quality gates exist and run in CI across both TypeScript stacks, Jest, lint and an integration tier. A broadcast test-evidence script exists.

**Files.** `backend/src/scripts/broadcastTestEvidence.js` · `scripts/deploy-prod.sh`

**Tests.** **None.** See blockers.

**Deployed.** The CODE is deployed. The FEATURE is dark: the release switch is not set anywhere in the deployment path, so every broadcast route answers 404 in production. Deployed and enabled are two different states and this report refuses to collapse them.

**Flag state.** `BROADCAST_ENABLED` — This is the release switch, and it is declared in exactly one place outside of tests: backend/.env.example. It appears in no docker-compose file, no deploy script and no CI workflow. Nothing in the repository turns it on.

**Blockers.** No security, accessibility, browser or failure matrix has been run. No load test. No production verification of a broadcast, and therefore no handoff.

## C. Work already completed

22 of 87 todos are complete. Each is a Basecamp id, which is the evidence §17 asks for: the completion and its comment thread live on the ticket.

| Todo | Group | Title | Comments |
|---|---|---|---|
| [10392808152](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808152) | 05 - Studio, Equipment and OBS | L6.1 - Research and approve the studio equipment list, with live pricing | 5 |
| [10392808167](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808167) | 02 - Live Provider Spine | L5.1 - Cloudflare Stream Live provider adapter behind the existing grant contract | 3 |
| [10392808184](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808184) | 01 - External Prerequisites and Accounts | L1.3 - Install Cloudflare Stream credentials into the production environment | 2 |
| [10392808194](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808194) | 02 - Live Provider Spine | L5.2 - Connect Zoom custom RTMP to a Cloudflare live input | 4 |
| [10392808249](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808249) | 03 - Session, Occurrence and Timeline | L7.1 - Create a broadcast occurrence from the Accelerator Session setup flow | 4 |
| [10392808256](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808256) | 03 - Session, Occurrence and Timeline | L7.2 - Generate the live workspace URL, companion URL and QR at session readiness | 2 |
| [10392808352](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808352) | 01 - External Prerequisites and Accounts | L1.1 - Zoom: verify Live Streaming to a Custom Service is enabled | 0 |
| [10392808360](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808360) | 01 - External Prerequisites and Accounts | L1.2 - Cloudflare: enable Stream and mint a scoped API token | 0 |
| [10392808371](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808371) | 02 - Live Provider Spine | L2.1 - Replay playback adapter with mid-playback credential renewal | 0 |
| [10392808383](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808383) | 02 - Live Provider Spine | L2.2 - Signed inline Range playback transport (/bm/) | 0 |
| [10392808393](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808393) | 03 - Session, Occurrence and Timeline | L3.1 - Canonical broadcast occurrence schema and identity | 0 |
| [10392808414](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808414) | 03 - Session, Occurrence and Timeline | L3.2 - Lifecycle state machine and producer commands | 0 |
| [10392808421](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808421) | 03 - Session, Occurrence and Timeline | L3.3 - Fail-closed entitlement and deadline-bounded playback grant | 0 |
| [10392808429](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808429) | 03 - Session, Occurrence and Timeline | L3.4 - Validated routes with RBAC and rate limits | 0 |
| [10392808433](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808433) | 03 - Session, Occurrence and Timeline | L3.5 - Event-to-occurrence backfill, dry-run first and batch-reversible | 0 |
| [10392808436](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808436) | 04 - Viewer, Companion and Discovery | L4.1 - Persistent mini-player that survives portal navigation | 0 |
| [10392808439](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808439) | 04 - Viewer, Companion and Discovery | L4.2 - Accessibility: theater, fullscreen, captions, keyboard order, SR status, reduced motion | 0 |
| [10392808451](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808451) | 04 - Viewer, Companion and Discovery | L4.3 - Live-now badge with multi-live rows and persisted dismissal | 0 |
| [10392808459](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808459) | 04 - Viewer, Companion and Discovery | L4.4 - Launch cue: synthesised chime, opt-in, once per occurrence | 0 |
| [10392808466](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808466) | 04 - Viewer, Companion and Discovery | L4.5 - In-room Watch hand-off keyed on room_id | 0 |
| [10393697543](https://app.basecamp.com/3945211/buckets/49210714/todos/10393697543) | 00 - Control, Source of Truth and Governance | L0.1 - Reconcile Basecamp against the repository and production, and publish the gap list | 1 |
| [10395987998](https://app.basecamp.com/3945211/buckets/49210714/todos/10395987998) | 05 - Studio, Equipment and OBS | L6.4 - Specify and source Ali's AI workstation laptop | 2 |

## D. Work still outstanding

65 todos are open. But the more useful question is not how many tickets are open — it is whether the board and the plan are describing the same system. They are not.

- Of the 56 parent tasks in the seven-phase plan, **21 are covered** by board tickets, **17 are partially covered**, and **18 have no ticket at all**.
- Of the 87 todos on the board, **38 correspond to a planned task** and **49 have no place in the plan**.

That second number is not a criticism of the board. It is where the physical studio, the avatar and voice work, the project documents and the entire 26-ticket first-class ladder live — real work the seven-phase plan never contemplated. It is recorded because a reconciliation that could only find gaps in one direction would have missed DOC 10 itself.

### The 56-task reconciliation

This is the judged part of the report. `NONE` means no ticket on the board covers the task; anything short of `COVERED` has to name what is missing.

| Task | Work | Coverage | Tickets | Gap |
|---|---|---|---|---|
| `P1-01` | Session id, safe branch/worktree, git status, main SHA, governance read | COVERED | [10393697543](https://app.basecamp.com/3945211/buckets/49210714/todos/10393697543) |  |
| `P1-02` | Map event sources, rooms, sessions, membership, playback, timeline consumers | PARTIAL | [10393697543](https://app.basecamp.com/3945211/buckets/49210714/todos/10393697543) [10392808393](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808393) | The contract map exists as code and schema but was never published as the file/line artifact the task asks for |
| `P1-03` | Inventory provider account capabilities, tokens, recording, captions, stage | COVERED | [10392808352](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808352) [10392808360](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808360) [10392808269](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808269) |  |
| `P1-04` | Bounded sandbox spike: player, mobile, cutoff, reconnect, recording, stage invite | PARTIAL | [10392808207](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808207) | The private airing covered ingest and playback; access cutoff, reconnect and stage invitation were never spiked |
| `P1-05` | Provider decision with capacity, latency, cost per event and failure recovery | **NONE** | — | No ticket writes the decision packet. Cost per event and per month are undocumented anywhere in the repository |
| `P1-06` | Source mapping, transitions, authorization matrix, metrics dictionary, backfill dry run | COVERED | [10392808414](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808414) [10392808421](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808421) [10392808429](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808429) [10392808433](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808433) |  |
| `P1-07` | UI route/component map and light/dark responsive prototypes in existing tokens | **NONE** | — | No ticket covers the route map or the prototypes. Every viewer surface was built without one |
| `P1-08` | Execution contract, dependency graph, risk register, rollout/rollback, plan audit >=18/20 | PARTIAL | [10393697560](https://app.basecamp.com/3945211/buckets/49210714/todos/10393697560) | The traceability matrix shipped; there is no recorded independent plan audit score, so the Phase 1 exit criterion was never met |
| `P2-01` | Minimal models, fields and indexes for occurrences, source refs, series, binding | COVERED | [10392808393](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808393) |  |
| `P2-02` | Canonical event/room lookup and read projections across every source | COVERED | [10392808393](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808393) [10392808433](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808433) |  |
| `P2-03` | Producer commands and provider health transitions with concurrency control | COVERED | [10392808414](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808414) [10424494579](https://app.basecamp.com/3945211/buckets/49210714/todos/10424494579) [10423504463](https://app.basecamp.com/3945211/buckets/49210714/todos/10423504463) |  |
| `P2-04` | Entitlement decision service for all four access modes against real grants | COVERED | [10392808421](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808421) [10425333905](https://app.basecamp.com/3945211/buckets/49210714/todos/10425333905) |  |
| `P2-05` | Preview deadline on server time, tested at 899/900/901 seconds | PARTIAL | [10392808421](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808421) | The clock is implemented and unit-tested; L10.7 records that entitlement has never once been exercised against a real viewer |
| `P2-06` | Validated APIs, signed webhook verification, RBAC, audit logs, rate limits | COVERED | [10392808429](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808429) |  |
| `P2-07` | Approved-event linkage and backfill, dry run then controlled batches | COVERED | [10392808433](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808433) |  |
| `P2-08` | Independent phase integration check plus traceability and rollback evidence | PARTIAL | [10393697560](https://app.basecamp.com/3945211/buckets/49210714/todos/10393697560) | Traceability is maintained; no independent phase integration check was run or recorded |
| `P3-01` | Production playback adapter with real authorized media and bounded reconnect | COVERED | [10392808371](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808371) [10392808167](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808167) |  |
| `P3-02` | Persistent mini-player in the shared shell, media surviving navigation | COVERED | [10392808436](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808436) |  |
| `P3-03` | Theater, fullscreen, mobile, captions, keyboard, screen reader, reduced motion | COVERED | [10392808439](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808439) |  |
| `P3-04` | Live badge, Today feature, room indicator, Watch action, community placement | PARTIAL | [10392808451](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808451) [10392808466](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808466) [10392808299](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808299) | Community and Events placements are deferred by an explicit decision on L4.8, so the task cannot pass as specified |
| `P3-05` | Launch animation and opt-in sound, once per occurrence, with denial fallback | COVERED | [10392808459](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808459) |  |
| `P3-06` | App and playback heartbeats, server aggregation, device dedup, staff exclusion | COVERED | [10392808230](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808230) [10423504316](https://app.basecamp.com/3945211/buckets/49210714/todos/10423504316) |  |
| `P3-07` | Explicit tune-in versus auto-exposure, preview/paid splits, freshness labels | PARTIAL | [10392808230](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808230) | The unavailable-never-zero read exists; the tune-in versus exposure split and the paid split are not implemented |
| `P3-08` | Independent viewer journey check with real desktop and mobile screenshots | **NONE** | — | No ticket covers it, and with the release switch unset there is no environment in which to take the screenshots |
| `P4-01` | Studio setup: link room, source, host, series, audience, access, title, artwork | **NONE** | — | No ticket and no screen. Access mode is settable only at creation, so a mistake is permanent |
| `P4-02` | Backstage readiness, preview/program split, live clock, rundown, go live, end | COVERED | [10392808262](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808262) [10423504463](https://app.basecamp.com/3945211/buckets/49210714/todos/10423504463) |  |
| `P4-03` | Event-scoped room chat, structured Q&A, voting, answered and deferred status | **NONE** | — | No ticket and no code. Live participation is the headline of the product and none of it exists |
| `P4-04` | Polls, pinned resources and rate-limited reactions with server-side tallies | **NONE** | — | No ticket and no code |
| `P4-05` | Moderated stage request, approval, acceptance and removal | **NONE** | — | No ticket and no code; a repository-wide search for stage-request identifiers returns nothing |
| `P4-06` | Producer metrics, errors, stream health, recording and notification in one Studio | PARTIAL | [10424494579](https://app.basecamp.com/3945211/buckets/49210714/todos/10424494579) | Stream health exists; there is no single Studio surface, and notification state has nothing to report |
| `P4-07` | Reconnect, offline and end UX plus producer recovery controls | PARTIAL | [10423504463](https://app.basecamp.com/3945211/buckets/49210714/todos/10423504463) | The auto-end safety net exists; producer-side recovery from a prolonged outage is undefined |
| `P4-08` | Independent two-role rehearsal, keyboard and mobile review, screenshots | COVERED | [10392808279](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808279) [10392808316](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808316) |  |
| `P5-01` | Series and follow preferences, upcoming lineup, real occurrence scheduling | **NONE** | — | No ticket, no code |
| `P5-02` | Notification outbox with T-10, actual-live and replay-ready triggers | **NONE** | — | No ticket, no code |
| `P5-03` | Producer campaign preview and approval with exact event deep links | **NONE** | — | No ticket, no code |
| `P5-04` | Preview clock, warning, end screen and verified checkout return | PARTIAL | [10425333905](https://app.basecamp.com/3945211/buckets/49210714/todos/10425333905) | The preview clock exists in the entitlement service; the end screen and the checkout return path for a broadcast do not |
| `P5-05` | Suppress-if-watching and frequency limits across overlapping events | **NONE** | — | No ticket, no code |
| `P5-06` | Funnel and return-attendance reporting with explicit denominators | **NONE** | — | No ticket, no code |
| `P5-07` | Wire existing marketing agents for recommendations and question grouping | **NONE** | — | No ticket, no code |
| `P5-08` | Independent free to preview to checkout to view journey on sandbox billing | PARTIAL | [10425333905](https://app.basecamp.com/3945211/buckets/49210714/todos/10425333905) | L10.7 covers proving the paywall, which is one leg of this journey; the notification and checkout-return legs have no ticket |
| `P6-01` | Bind completed recordings to the right occurrence, including split recordings | COVERED | [10416533879](https://app.basecamp.com/3945211/buckets/49210714/todos/10416533879) |  |
| `P6-02` | Processing, review, publish and unpublish states; protected playback and download | PARTIAL | [10392808287](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808287) [10496738880](https://app.basecamp.com/3945211/buckets/49210714/todos/10496738880) | Replay listing exists; the signed media route for a stored copy has no registered resolver in production, which FC6.3 now covers |
| `P6-03` | Live hub shelves and room/event replay projection with filters and empty states | COVERED | [10392808287](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808287) |  |
| `P6-04` | Resume watching, progress synced across devices, chapter navigation | **NONE** | — | No ticket, no code |
| `P6-05` | Source-grounded summaries, chapters, lesson links and approved teaser clips | PARTIAL | [10392808294](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808294) | L8.2 covers the human edit path; the transcript, chapters and AI summary steps it depends on are unbuilt |
| `P6-06` | Publish approved replay cards to timeline, community and classroom surfaces | PARTIAL | [10392808287](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808287) | Replay discovery is in the portal only; no canonical card is published to the other three surfaces |
| `P6-07` | Link unanswered questions to continuing discussion and follow-up resources | **NONE** | — | No ticket, no code. It also depends on a Q&A system that does not exist (P4-03) |
| `P6-08` | Independent end-to-replay rehearsal including delay and a two-part episode | COVERED | [10392808316](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808316) [10392808348](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808348) |  |
| `P7-01` | Full repository quality gates, reconciled session logs and scope diff | **NONE** | — | The gates exist and run in CI, but no ticket owns running them as a release step or reconciling the scope diff |
| `P7-02` | Security, accessibility, browser and failure matrix plus a load test to p95 targets | PARTIAL | [10392808332](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808332) | L10.4 covers the failure drills. There is no load test, no p95 measurement, and no browser or accessibility matrix |
| `P7-03` | Release candidate, PRs, migration order, rollback, flags, private rehearsal event | PARTIAL | [10392808339](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808339) | Go/no-go is ticketed; the migration order and the compatible rollback plan are not written down |
| `P7-04` | Merge and deploy with the current deploy script under an exclusive lock | **NONE** | — | No ticket. The deploy path exists and is used, but nothing records the release SHA and image evidence for this feature |
| `P7-05` | Independently verify production with a private test broadcast end to end | COVERED | [10392808339](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808339) [10416291196](https://app.basecamp.com/3945211/buckets/49210714/todos/10416291196) |  |
| `P7-06` | Gated activation using existing flags, internal verified audience first | **NONE** | — | No ticket, and nothing in the repository sets the release switch. This is the single step between a deployed codebase and a working feature |
| `P7-07` | Fresh production verification on deployed behavior, plus the telemetry manifest | PARTIAL | [10392808348](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808348) | Post-launch verification is ticketed; it depends on P7-06, which has no ticket |
| `P7-08` | Handoff, producer SOP, operator troubleshooting, one-command validation, dashboard | COVERED | [10392808319](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808319) [10392808324](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808324) [10392808335](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808335) |  |

### Open todos

| Todo | Group | Title | Due | Owner |
|---|---|---|---|---|
| [10392808207](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808207) | 02 - Live Provider Spine | L5.3 - First private technical airing: Zoom to Cloudflare to the Colaberry player | 2026-10-17 | Ali Muwwakkil |
| [10392808223](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808223) | 05 - Studio, Equipment and OBS | L6.2 - Install and validate camera, microphone, light and wired network | 2026-10-18 | Piyush Prajapati |
| [10392808230](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808230) | 04 - Viewer, Companion and Discovery | L4.6 - Measurement: heartbeat ingestion route and the unavailable-never-zero read | 2026-10-19 | Ali Muwwakkil |
| [10392808237](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808237) | 06 - AI Avatar and Voice | L9.1 - Verify the CURRENT official HeyGen workflow on the execution date | 2026-10-19 | Piyush Prajapati |
| [10392808241](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808241) | 01 - External Prerequisites and Accounts | L1.4 - YouTube: verify channel ownership, live eligibility and stream destination | 2026-10-20 | Sohail Syed |
| [10392808253](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808253) | 05 - Studio, Equipment and OBS | L6.3 - OBS scene package and Zoom audio routing with no duplicate audio | 2026-10-21 | Piyush Prajapati |
| [10392808258](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808258) | 06 - AI Avatar and Voice | L9.2 - Record approved avatar training footage, with consent captured exactly as required | 2026-10-22 | Ali Muwwakkil |
| [10392808262](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808262) | 03 - Session, Occurrence and Timeline | L7.3 - Timeline drives presenter moments, Prompt Drops, polls, QR state and clip markers | 2026-10-23 | Ali Muwwakkil |
| [10392808269](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808269) | 01 - External Prerequisites and Accounts | L1.5 - Consolidate the three Cloudflare accounts, or document why they stay split | 2026-10-24 | Ali Muwwakkil |
| [10392808272](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808272) | 04 - Viewer, Companion and Discovery | L4.7 - Phone companion: sticky player, one-thumb interaction, Following/Building/Stuck/Finished | 2026-10-24 | Aleem |
| [10392808276](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808276) | 06 - AI Avatar and Voice | L9.3 - Voice clone: select provider, verify current requirements, record, QA | 2026-10-24 | Piyush Prajapati |
| [10392808279](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808279) | 09 - Rehearsal, Launch and Evidence | L10.2 - Test 3: internal staff pilot with Piyush, Sohail and Aleem | 2026-10-24 | Ali Muwwakkil |
| [10392808282](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808282) | 07 - YouTube and Post Production | L8.1 - Simulcast to YouTube and define the raw-replay retention policy | 2026-10-25 | Sohail Syed |
| [10392808285](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808285) | 06 - AI Avatar and Voice | L9.4 - Avatar QA and the Real Ali versus AI Ali usage policy | 2026-10-26 | Ali Muwwakkil |
| [10392808287](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808287) | 07 - YouTube and Post Production | L8.3 - Replay discovery and listing in the portal | 2026-10-26 | Ali Muwwakkil |
| [10392808289](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808289) | 08 - Documentation and Enablement | L11.8 - Remaining project documents: Requirements, Orchestration, Viewer Experience, Studio, Avat... | 2026-10-26 | Ali Muwwakkil |
| [10392808294](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808294) | 07 - YouTube and Post Production | L8.2 - One live session to one long-form edit plus 5-7 Shorts | 2026-10-27 | Piyush Prajapati |
| [10392808299](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808299) | 04 - Viewer, Companion and Discovery | L4.8 - Events and Community discovery placements (deferred by decision) | 2026-10-28 | Ali Muwwakkil |
| [10392808302](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808302) | 08 - Documentation and Enablement | L11.1 - System Architecture Handbook | 2026-10-28 | Ali Muwwakkil |
| [10392808309](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808309) | 08 - Documentation and Enablement | L11.2 - Architecture diagrams, ten of them, Mermaid source plus rendered artifacts | 2026-10-28 | Ali Muwwakkil |
| [10392808316](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808316) | 09 - Rehearsal, Launch and Evidence | L10.3 - Test 4: full dress rehearsal in the real studio | 2026-10-28 | Piyush Prajapati |
| [10392808319](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808319) | 08 - Documentation and Enablement | L11.3 - Ali and Piyush Studio Operator Manual | 2026-10-29 | Piyush Prajapati |
| [10392808324](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808324) | 08 - Documentation and Enablement | L11.4 - Developer and AI Maintenance Runbook | 2026-10-29 | Ali Muwwakkil |
| [10392808328](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808328) | 08 - Documentation and Enablement | L11.5 - Testing Strategy and Evidence Matrix | 2026-10-29 | Ali Muwwakkil |
| [10392808332](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808332) | 09 - Rehearsal, Launch and Evidence | L10.4 - Test 5: failure drills | 2026-10-29 | Ali Muwwakkil |
| [10392808335](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808335) | 08 - Documentation and Enablement | L11.6 - Ram Executive Brief and briefing session | 2026-10-30 | Ali Muwwakkil |
| [10392808339](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808339) | 09 - Rehearsal, Launch and Evidence | L10.5 - Test 6: go/no-go and the first public production airing | 2026-10-30 | Ali Muwwakkil |
| [10392808341](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808341) | 08 - Documentation and Enablement | L11.7 - Case Study Source Pack, maintained during the build | 2026-10-31 | Ali Muwwakkil |
| [10392808348](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808348) | 09 - Rehearsal, Launch and Evidence | L10.6 - Post-launch verification, metrics and retrospective | 2026-10-31 | Ali Muwwakkil |
| [10393697546](https://app.basecamp.com/3945211/buckets/49210714/todos/10393697546) | 00 - Control, Source of Truth and Governance | L0.2 - Documentation-as-code upkeep: keep the documents and diagrams true as the system changes | 2026-10-24 | Ali Muwwakkil |
| [10393697558](https://app.basecamp.com/3945211/buckets/49210714/todos/10393697558) | 00 - Control, Source of Truth and Governance | L0.3 - Weekly launch-risk review: what is late, what is at risk, what would we drop | 2026-10-18 | Ali Muwwakkil |
| [10393697560](https://app.basecamp.com/3945211/buckets/49210714/todos/10393697560) | 00 - Control, Source of Truth and Governance | L0.4 - Traceability matrix: every requirement maps to a ticket and to evidence | 2026-10-30 | Ali Muwwakkil |
| [10416291196](https://app.basecamp.com/3945211/buckets/49210714/todos/10416291196) | 09 - Rehearsal, Launch and Evidence | L10.1 - Test 2: second private airing on the fixed build, three viewers, real bitrate | 2026-10-20 | Ali Muwwakkil |
| [10416533879](https://app.basecamp.com/3945211/buckets/49210714/todos/10416533879) | 07 - YouTube and Post Production | L8.4 - Bind recordings to occurrences so the replay transport can resolve anything | 2026-10-24 | Ali Muwwakkil |
| [10423504316](https://app.basecamp.com/3945211/buckets/49210714/todos/10423504316) | 04 - Viewer, Companion and Discovery | L4.9 - Wire the player to the heartbeat endpoint: measurement currently records nothing | 2026-10-22 | Ali Muwwakkil |
| [10423504372](https://app.basecamp.com/3945211/buckets/49210714/todos/10423504372) | 02 - Live Provider Spine | L5.4 - Bind a new occurrence to a live input: L7.1 creates occurrences that cannot resolve playback | 2026-10-22 | Ali Muwwakkil |
| [10423504463](https://app.basecamp.com/3945211/buckets/49210714/todos/10423504463) | 03 - Session, Occurrence and Timeline | L7.4 - End a broadcast without an engineer: producer control plus an auto-end safety net | 2026-10-23 | Ali Muwwakkil |
| [10424494579](https://app.basecamp.com/3945211/buckets/49210714/todos/10424494579) | 02 - Live Provider Spine | L5.5 - The provider health loop: nothing ever tells an occurrence the stream is alive | 2026-10-23 | Ali Muwwakkil |
| [10425333905](https://app.basecamp.com/3945211/buckets/49210714/todos/10425333905) | 09 - Rehearsal, Launch and Evidence | L10.7 - Prove the paywall: entitlement has never once been exercised | 2026-10-23 | Ali Muwwakkil |
| [10496600205](https://app.basecamp.com/3945211/buckets/49210714/todos/10496600205) | FC0 - Decide (nothing else can start until these are answered) | FC0.1 - Pick the topic and the day kind for class 1 | 2026-11-12 | Ali Muwwakkil |
| [10496600232](https://app.basecamp.com/3945211/buckets/49210714/todos/10496600232) | FC0 - Decide (nothing else can start until these are answered) | FC0.2 - Decide the audience: enrolled cohort only, or guests too | 2026-11-12 | Ali Muwwakkil |
| [10496600258](https://app.basecamp.com/3945211/buckets/49210714/todos/10496600258) | FC0 - Decide (nothing else can start until these are answered) | FC0.3 - Decide whether class 1 streams on Colaberry Live, or is recorded only | 2026-11-12 | Ali Muwwakkil |
| [10496600351](https://app.basecamp.com/3945211/buckets/49210714/todos/10496600351) | FC1 - Build the class | FC1.1 - Create the session row and confirm Present renders | 2026-11-13 | Ali Muwwakkil |
| [10496600396](https://app.basecamp.com/3945211/buckets/49210714/todos/10496600396) | FC1 - Build the class | FC1.2 - Author the deck content for the chosen topic | 2026-11-14 | Ali Muwwakkil |
| [10496600442](https://app.basecamp.com/3945211/buckets/49210714/todos/10496600442) | FC1 - Build the class | FC1.3 - Build, attach and verify the deck | 2026-11-17 | Ali Muwwakkil |
| [10496600466](https://app.basecamp.com/3945211/buckets/49210714/todos/10496600466) | FC1 - Build the class | FC1.4 - Rehearse the full run of show, and download the teaching guide | 2026-11-18 | Ali Muwwakkil |
| [10496600559](https://app.basecamp.com/3945211/buckets/49210714/todos/10496600559) | FC2 - The follow-along screen the room scans | FC2.1 - Decide and test which QR the room actually scans | 2026-11-13 | Ali Muwwakkil |
| [10496600593](https://app.basecamp.com/3945211/buckets/49210714/todos/10496600593) | FC2 - The follow-along screen the room scans | FC2.2 - Make guest join work without mis-titling the class "Open House" | 2026-11-17 | Ali Muwwakkil |
| [10496600623](https://app.basecamp.com/3945211/buckets/49210714/todos/10496600623) | FC2 - The follow-along screen the room scans | FC2.3 - Test the QR from a phone on the room network, on a non-staff account | 2026-11-19 | Ali Muwwakkil |
| [10496600701](https://app.basecamp.com/3945211/buckets/49210714/todos/10496600701) | FC3 - Room, capture and audio | FC3.1 - Install and validate camera, microphone, light and wired network | 2026-11-14 | Piyush Prajapati |
| [10496600746](https://app.basecamp.com/3945211/buckets/49210714/todos/10496600746) | FC3 - Room, capture and audio | FC3.2 - OBS scene package and Zoom audio routing with no duplicate audio | 2026-11-17 | Piyush Prajapati |
| [10496600768](https://app.basecamp.com/3945211/buckets/49210714/todos/10496600768) | FC3 - Room, capture and audio | FC3.3 - Zoom desktop client custom RTMP dry run, on the machine you will teach from | 2026-11-13 | Ali Muwwakkil |
| [10496600795](https://app.basecamp.com/3945211/buckets/49210714/todos/10496600795) | FC3 - Room, capture and audio | FC3.4 - Set the local recording baseline that produces the editor master | 2026-11-18 | Piyush Prajapati |
| [10496600866](https://app.basecamp.com/3945211/buckets/49210714/todos/10496600866) | FC4 - Air it | FC4.1 - Pre-flight, the morning of | 2026-11-20 | Ali Muwwakkil |
| [10496600894](https://app.basecamp.com/3945211/buckets/49210714/todos/10496600894) | FC4 - Air it | FC4.2 - Name a producer who is not the presenter | 2026-11-19 | Ali Muwwakkil |
| [10496600923](https://app.basecamp.com/3945211/buckets/49210714/todos/10496600923) | FC4 - Air it | FC4.3 - Run the show | 2026-11-20 | Ali Muwwakkil |
| [10496600948](https://app.basecamp.com/3945211/buckets/49210714/todos/10496600948) | FC4 - Air it | FC4.4 - Post-show state check, before anyone goes home | 2026-11-20 | Ali Muwwakkil |
| [10496601018](https://app.basecamp.com/3945211/buckets/49210714/todos/10496601018) | FC5 - Hand it to the videographer | FC5.1 - Capture and verify the editor master | 2026-11-21 | Piyush Prajapati |
| [10496601045](https://app.basecamp.com/3945211/buckets/49210714/todos/10496601045) | FC5 - Hand it to the videographer | FC5.2 - Pull the transcript | 2026-11-21 | Ali Muwwakkil |
| [10496601079](https://app.basecamp.com/3945211/buckets/49210714/todos/10496601079) | FC5 - Hand it to the videographer | FC5.3 - Export the clip list and cut it down to candidates | 2026-11-21 | Ali Muwwakkil |
| [10496601106](https://app.basecamp.com/3945211/buckets/49210714/todos/10496601106) | FC5 - Hand it to the videographer | FC5.4 - Write the videographer brief | 2026-11-24 | Ali Muwwakkil |
| [10496738838](https://app.basecamp.com/3945211/buckets/49210714/todos/10496738838) | FC6 - Make any event live, linked and recorded | FC6.1 - Let any event become a live event, not just an Accelerator class | 2026-11-24 | Ali Muwwakkil |
| [10496738853](https://app.basecamp.com/3945211/buckets/49210714/todos/10496738853) | FC6 - Make any event live, linked and recorded | FC6.2 - Give every event a meeting link so it is roomed and recorded automatically | 2026-11-25 | Ali Muwwakkil |
| [10496738880](https://app.basecamp.com/3945211/buckets/49210714/todos/10496738880) | FC6 - Make any event live, linked and recorded | FC6.3 - A download route for the streamed copy | 2026-11-21 | Ali Muwwakkil |
| [10496738942](https://app.basecamp.com/3945211/buckets/49210714/todos/10496738942) | FC7 - Content Picker | FC7.1 - Content Picker: blueprints x current events x quotes | 2026-11-26 | Ali Muwwakkil |

## E. External blockers

### Cloudflare Stream — WORKING

Stream enabled, a scoped token minted, and the credentials installed in the production environment. The provider adapter is live and fail-closed without them.

**Blocker.** Three separate Cloudflare accounts have still not been consolidated or a reason documented for keeping them split. An operator does not currently know which account a given live input belongs to. ([10392808269](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808269))

### Zoom — WORKING

Live Streaming to a Custom Service is verified on the account, and custom RTMP has reached a Cloudflare live input in a real airing.

**Blocker.** The only transcript route in the repository requires a Zoom CLOUD recording. A local-only recording produces no transcript, so the videographer handoff depends on a Zoom setting rather than on anything this codebase controls. ([10496601045](https://app.basecamp.com/3945211/buckets/49210714/todos/10496601045))

### YouTube — UNVERIFIED

Nothing has been confirmed. Channel ownership, live eligibility and the stream destination are all still unchecked.

**Blocker.** Simulcast and the raw-replay retention policy both sit behind this, and the verification ticket has no comments and is past due. ([10392808241](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808241))

### Purchase - studio equipment — APPROVED, NOT INSTALLED

The equipment list was researched and approved with live pricing, and the workstation laptop was specified and sourced.

**Blocker.** Nothing is installed. Camera, microphone, light and wired network, and the OBS and Zoom audio routing, are both still open and both owned by Piyush. DOC 13, the studio operator manual, is blocked on them rather than unwritten - a manual for equipment nobody has is untested prose. ([10392808223](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808223))

### Voice and avatar — NOT STARTED ON THE BOARD

All four tickets are open with no comments: verify the current official avatar workflow, record approved training footage with consent captured, choose and QA a voice clone, and write the real-versus-AI usage policy.

**Blocker.** The usage policy is the one that matters beyond the build. Until it exists there is no written rule about when an audience is watching a synthesized presenter, and that is a disclosure question rather than an engineering one. ([10392808285](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808285))

## F. Next task

**The rule.** The earliest due date among the open todos, ties broken by creation order. Stated as a rule so the answer is reproducible rather than a preference.

**The answer it returns.** [10392808207](https://app.basecamp.com/3945211/buckets/49210714/todos/10392808207) — L5.3 - First private technical airing: Zoom to Cloudflare to the Colaberry player, due 2026-10-17.

**Why that answer is a finding rather than an instruction.** Applying that rule returns the most overdue ticket, and the answer is instructive rather than actionable: L5.3 asks for a first private technical airing from Zoom through Cloudflare to the Colaberry player, and production holds broadcast occurrences for 15 and 20 October plus a recording from 13 October. The work happened; the ticket was never closed. So the honest output of section F is two things, not one. The next BOARD action is to close or re-scope the overdue tickets whose work is already done, because a board this stale cannot be used to choose anything. The next BUILD action is the finding below.

**The next build action.** P7-06, gated activation. The release switch BROADCAST_ENABLED is declared in backend/.env.example and nowhere else: not in any compose file, not in the deploy script, not in CI. Every broadcast route therefore answers 404 in production. It has no board ticket. It is one line of configuration standing between a deployed codebase and a feature that exists for a viewer, and it is the cheapest high-value item in this report.

---

*Generated from `scripts/artifacts/tickets/l05Data.js` and `l05Phases.js`. Do not edit this file by hand — the build refuses if it differs from what the data renders.*
