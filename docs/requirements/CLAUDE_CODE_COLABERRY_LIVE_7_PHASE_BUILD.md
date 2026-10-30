# Colaberry Live: Seven-Phase Enterprise Build

Prepared for Ali Muwwakkil | October 1, 2026, Central time
Repository: https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator
Execution environment: the existing enterprise repository in VS Code with Claude Code.

## Paste this instruction into the enterprise Claude Code session

Read this entire file, the repository's current root and applicable nested CLAUDE.md files, and `.claude/skills/loop-architect/SKILL.md` with its referenced execution contract, audit, verification, state, milestone, and worked-example documents. Invoke `/loop-architect` to deliver the Colaberry Live scope below through all seven delivery phases, production deployment, independent live verification, and a plain-English handoff. This file is the implementation request, not permission to merely generate another plan.

Use the existing project and services. Discover current implementations before editing. Build the task plan, have it independently audited, then execute and verify one task at a time. Continue automatically between successful phases. Update me only at phase boundaries and after production verification, except for genuine hard-stop blockers. Do not ask me to approve routine implementation choices, individual tasks, tests, or each phase. Preserve state so a new session can resume without repeating verified work. Do not claim completion until the production journey works.

The authorized destination is the existing enterprise application's production environment, using its existing approved deployment process. Respect protected-branch review and security controls. If a required external purchase, credential, infrastructure decision, destructive action, or mandatory human PR approval is missing, finish all independently safe authorized work and present one concrete, consolidated blocker request with the exact resume action. Never fabricate approvals or use my identity to approve your own PR.

## 1. Outcome and scope

Build Colaberry Live, an integrated broadcast experience supporting self-paced learning with live classes, open houses, office hours, demonstrations, and community participation. Promise: "Learn at your pace. Build with us live."

Required outcomes:

1. An authorized producer can attach a broadcast to an existing event and room, prepare backstage, and deliberately mark it live when a usable feed exists.
2. Eligible app users receive a prominent live announcement and a bottom-right player that expands to theater and fullscreen modes while retaining continuity across navigation.
3. Live events support fully free, paid, 15-minute opening preview, and private access. Open Houses default to fully free.
4. Pre-live and live-now campaigns bring people back to the exact event after authentication. Delivery follows existing preferences, suppression, permissions, and approval processes.
5. Viewers participate through event-scoped room chat, structured Q&A, question voting, polls, reactions, and pinned resources. A moderated stage-request workflow supports approved speakers through the selected provider's actual capabilities.
6. Producers see active app users, actual viewers, preview viewers, paid viewers, engagement, peak audience, and conversion measures with honest definitions.
7. Existing automatic recordings become reviewed, playable episodes with replay shelves, progress, chapters, resources, and distribution into the existing timeline.
8. Existing AI employees assist with relevant recommendations, question grouping, learning links, recaps, and production tasks within their current permission model. Deterministic services enforce access and execute approved actions.
9. Recurring shows and follows encourage repeat attendance. The studio presents one coherent operating surface.
10. Ship and independently verify the actual production experience with rollback, operational documentation, and evidence.

This is seven delivery phases, not seven new disconnected modules. Loop Architect's internal A-J orchestration stages still govern the run. Do not confuse its internal stages with the seven product delivery phases in this document.

## 2. Run contract, autonomy, and communication

### Required skill workflow

- Read the installed skill and referenced grader definitions; do not substitute a homegrown loop.
- Use `loop-plan-auditor` for the grounded plan: PASS >=18/20 with no zero; maximum three audit cycles.
- Use `loop-task-verifier` after each task: PASS >=11/12 with no zero; maximum three attempts per task. Verifier receives task criteria and scoped diff, reruns evidence, and does not edit the implementation.
- Use `loop-production-verifier` against the deployed application: all applicable critical checks must pass; maximum two production fix/deploy/verify cycles.
- Producer does not grade its own plan, tasks, or production release. Read-only exploration may run in parallel when the installed skill or CLAUDE.md calls for it; serialize dependent edits and deployments.
- Preserve the skill's full quality gate, session-log hard gate, screenshot-review, telemetry-emission, and final report requirements.
- Read current rules rather than assuming the historical required-check count or review count remains unchanged.

### Important source conflict already identified

The reviewed Loop Architect deployment examples use direct Docker Compose commands. The newer root CLAUDE.md requires `scripts/deploy-prod.sh`, with exclusive locking, clean-tree checks, release checks, and running-container verification. The current root deployment rules win. Revalidate this during discovery. Do not copy a stale raw Compose command from the skill. Obtain private production connection details from authorized ops configuration; do not place them in tracked documentation.

### Notification cadence for this run

Ali explicitly requested phase-boundary updates rather than task narration. Apply this as a run-specific reporting preference; do not rewrite repository governance files or hooks to implement it.

- One kickoff summary after discovery/plan audit, combined with Phase 1 completion where possible.
- One concise update at each subsequent completed delivery phase. State evidence, next phase, and whether anything is needed. Continue without waiting when nothing is needed.
- One final production-verified report, combined with Phase 7 completion.
- A genuine blocker may interrupt this cadence. Explain the exact rule or unavailable capability requiring the stop.
- No per-task browser openings or chat narration. Maintain logs per task. Use the changelog generator's existing `--no-open` option for routine regeneration and expose reports at phase boundaries.
- Keep the skill's fixed milestone dashboard set and deduplication. Fold their user-visible presentation into the nearest phase boundary. For this run, defer the halfway auto-open until the Phase 4 boundary rather than interrupting a task. Do not disable or edit global hooks. Keep detailed intermediate evidence in Markdown/JSON until a boundary.
- In each permitted update, use the root CLAUDE.md short brief format. Time shown to people uses America/Chicago with CST/CDT. Machine timestamps retain their contract format.
- Report built, verified, merged, deployed, and production-verified as distinct states. No invented percent, test result, ETA, viewer count, or production status.

### Persistent execution state

Reuse a matching incomplete run under `.loop-architect/runs/<run-id>/`. Maintain the installed skill's files and schema, extended compatibly with delivery phase, task dependency IDs, release SHA, flag state, capability decisions, unresolved blockers, and phase-notification markers.

Required artifacts: request.md, execution-contract.md, plan.md, state-ledger.json, verification-log.md, deployment-log.md, handoff.md, requirements-traceability.md, architecture-decisions.md, access-matrix.md, metrics-dictionary.md, test-matrix.md, rollout-runbook.md, and screenshots/.

Update the ledger atomically after each transition. Record exact evidence paths and source revision. On resume, revalidate repository drift and reverify affected evidence only; do not rerun valid completed tasks or reissue notifications. Every implementation commit includes this session's own `docs/sessions/CC-<id>.md` entries. Never modify another session's log, stash shared work, or stage unrelated files.

## 3. Grounding from the reviewed repository

These observations are discovery leads, not a claim about current deployment. Re-read current source and inspect tests and call sites.

| Area | Starting points | Observed implication |
|---|---|---|
| Scheduled room lifecycle | backend/src/models/RoomBooking.ts | Existing states include scheduled, lobby_open, live, cooldown, completed; booking carries audience, recording, reminder, timeline, and session references. |
| Community calendar | backend/src/services/communityCalendarService.ts | Aggregates LiveSession, OpenHouseEvent, CommunityEvent; filters upcoming events. Do not rely on an upcoming-only result to discover already-live sessions. |
| Portal events | frontend/src/pages/portal/events/EventsPage.tsx | Uses public-events feed backed by CCPP/Eventbrite with registration metadata; differs from the community calendar. |
| Room UI | frontend/src/pages/portal/rooms/RoomPane.tsx | Chat, questions, resources, recordings and presence exist; video join opens a separate URL. |
| Meeting providers | backend/src/services/communityRooms/meetingProvider.ts | Zoom is default; adapters currently report supportsEmbedded=false. This is current adapter behavior, not proof that the external provider cannot embed. |
| Recording ingestion | backend/src/services/sessionRecordingService.ts | Supports session, booking and persistent-room recording ingestion, multi-part Zoom recordings, recording-instance deduplication, and recording-attached event. |
| Room events | backend/src/services/communityRooms/roomOutboxHandlers.ts | Went-live and recording-attached cases are observational in the reviewed handler. Find other handlers before claiming no distribution exists anywhere. |
| Reminders | backend/src/services/communityRooms/roomReminderService.ts | Existing 24h/1h outbox reminders; reviewed handler posts room notices. Discover existing email platform before adding delivery. |
| Entitlements | backend/src/services/communityRooms/roomEntitlementService.ts | Server-side room/cohort/membership privacy exists; paid broadcast access must be a separate, compatible entitlement decision. |
| Presence | backend/src/services/cohortPresenceService.ts | Recent-activity cohort signal exists; it is not platform-wide viewing telemetry. |
| Other integration points | CommunityPage.tsx, TodayShell.tsx, PortalShell, classroom rails, publicEventsService, current billing/marketing/agent services | Trace actual contracts and route names; reuse existing authorities. |

Do not replace all event systems or merge their tables. Introduce the smallest additive canonical broadcast occurrence and source mappings needed to reconcile them. Keep authoritative event ownership where it is today.

## 4. Product decisions that are fixed for this build

### 4.1 Identity and event lifecycle

One broadcast occurrence links an authoritative source event, its room, provider session/instance, access policy, notifications, viewer sessions, and replay assets. Use stable source type + source ID + occurrence identity with uniqueness constraints. A recurring series has distinct occurrences; one persistent meeting ID cannot identify every episode.

Model editorial intent and provider health separately. Suggested public states: scheduled, backstage, live, reconnecting, ended, processing, replay_ready, cancelled. Map these to existing booking states without introducing conflicting authorities. A producer's Go Live command and verified provider readiness are both needed. A scheduled start time or arbitrary webhook must not publish backstage content. Keep a distinct `content_started_at` for previews; waiting-room countdowns do not consume preview time.

State transitions are authenticated, authorized, auditable, idempotent, and concurrency-safe. Reject stale updates, duplicate events, and out-of-order transitions. Reconnect preserves occurrence identity, preview deadline, and send deduplication.

### 4.2 Access and preview

- Fully free: entire event for a signed-in free or paid account. Event marketing metadata may be public when allowed. Open Houses default here.
- Paid: full access only through existing qualifying subscription/program entitlement. Discover which actual products qualify; do not equate any paid invoice with permission.
- Live preview: free accounts see the opening 900 seconds from `content_started_at`. Joining at minute ten gives five minutes; joining after minute fifteen shows preview-ended. Countdown, tab changes, refresh, another device, or reconnect do not reset it.
- Private: room/cohort/invitation rules still apply. Paid status never unlocks another private cohort.
- Explicit existing scholarship, staff, or sponsored entitlements count as configured; do not gate solely on cash payment.
- Preview room access exposes only an approved event discussion slice, not historical paid chat or files.
- Persist a policy snapshot/version for reproducible decisions. Log later edits; re-evaluate access on policy changes without silently widening visibility.
- Enforce live media, manifests, segments, provider join credentials, recordings, byte-range requests, captions/transcripts, chapters, resource downloads, and cache access as applicable. A hidden button is not enforcement.
- Prefer short-lived scoped playback authorization whose expiry is bounded by the preview deadline. Define buffer/segment cutoff tolerance and prove the viewer cannot continue obtaining paid content after expiry. Do not expose public source URLs for protected media.
- Upgrade uses existing checkout and verified server-side billing state. Returning from checkout alone is not proof of payment. Retain the event destination and resume at live edge after entitlement is confirmed. Handle webhook delay, duplicates, cancellation, and failed payment clearly.
- Replay defaults to the same paid/private restrictions. A free preview replay must be a separately authorized opening clip or restricted playback window, never an unrestricted full recording download.

### 4.3 Viewing and discovery

One persistent player at the appropriate shared app shell. Mini-player -> theater -> fullscreen preserves the media session and room context. One audio source only. Provide mute/unmute, captions, expand, minimize, close, and clear retry states. A room switch cannot leak the previous room's chat or media. Account logout or entitlement loss tears down access.

Muted launch is best-effort; provide a play fallback when autoplay is denied. Never auto-enable microphone/camera. Original short Colaberry sound cue is opt-in and user-gesture compatible. Do not copy ESPN branding or audio. Respect reduced motion, keyboard controls, focus management, screen-reader status announcements, mobile safe areas, and existing light/dark tokens. Avoid overlap with Reese, help chat, and bottom navigation.

Prioritize live events by eligibility and explicit follows, then editorial featured priority. Surface alternatives in a live selector. Never create several autoplaying players. Announcement deduplication is per occurrence and user/session policy; dismissal persists appropriately and does not repeat on every route change. Keep a quiet Live badge available.

Four coherent surfaces: (1) global live controls/player, (2) existing event/room theater, (3) Live hub with schedule and replay shelves, (4) one producer Studio with contextual tabs. Do not create separate logins or a new page for each function. Extend existing event management where possible.

### 4.4 Communications

Build real integrations with existing email, preferences, marketing, and notification systems. Configure day-before reminders for followers/registrants, T-10-minute reminders, actual-live notification, and replay-ready notification. Use existing 24h/1h behavior where compatible and eliminate duplicates rather than running two reminder systems.

Marketing copy, audience configuration and broad sends remain under existing human approval rules. Building and deploying this feature does not authorize sending mass test emails or launching a public broadcast. Test delivery only with an explicitly configured approved test audience. Keep broad outbound campaigns disabled until a producer deliberately enables the event's approved campaign.

Use event + occurrence + recipient + channel + notification kind + campaign version deduplication. Persist delivery attempts and provider IDs; handle ambiguous provider responses without blind resend. Re-check eligibility, suppression, consent and event status at send time. Cancellation/reschedule invalidates old jobs. Reconnect never sends another launch campaign. Suppress live-now email for viewers already watching where current telemetry permits. Use safe login return URLs, validated against open redirects. User-level notification preference and frequency limits are enforced, not merely displayed.

### 4.5 Participation and production

Event-scoped room conversation, Q&A status, votes, polls, pinned links/files, modest rate-limited reactions, and moderation. Hosts/producers/moderators/viewers have distinct server-side permissions, inherited from existing identity where suitable. Questions can be queued, featured, answered, or deferred. Bind an answered question to the replay chapter when available.

Studio controls preparation, access, campaign settings, backstage, preview/program monitor, schedule, agenda segments, Go Live/End, audience metrics, moderation, recording and distribution status. Camera/screen/audio readiness is visible. Separate private backstage monitor from audience program. Handle screen-share removal without unintentionally revealing a private desktop/camera source.

Stage requests require moderator approval and explicit viewer acceptance. Approved participant credentials are short lived. Revoke on removal/end. Prevent echo by managing audience playback when on stage. Implement through real provider capability, not a pretend button; if the chosen provider cannot satisfy it, surface that fact in Phase 1 before architecture is locked.

### 4.6 Replays and AI assistance

Recording attached is an ingestion signal, not automatic public publication. Reconcile recording instance to the correct occurrence; include all valid parts, exclude unrelated tests/backstage where possible, and flag uncertain matches for review. Verify media availability/composition, access, processing and captions status before publishing. Preserve existing ingestion deduplication and avoid duplicate file downloads.

Create shelves Recently Live, Continue Watching, Followed Shows, Relevant to Your Learning, and Free/Open Houses. Shelves are projections of canonical episodes; do not copy videos per surface. Timeline cards share an idempotent source reference. One published replay may appear in room, event, classroom and timeline without becoming multiple episodes.

Chapters, summary, clips, resource lists and learning links can be drafted by existing approved AI services with source timestamps and provenance. Host/editor can correct them. Public/promotional clips require publication approval and cannot include paid/private material without an explicit policy grant. Deterministic access and delivery never depend on LLM judgment. If generation fails, manual publishing remains usable and failure is visible.

Use existing agent framework: Reese for relevant learner recommendations; Dara for learning alignment and unanswered learning questions; existing marketing responsibility for approved distribution. Verify their actual tool permissions and manager identities. Do not create redundant autonomous agents or enable unsupervised new outreach. Requested actions, approval, execution, evidence, retries, and human owner remain visible.

### 4.7 Metrics

Define metrics before implementing the dashboard. Proposed freshness defaults for local implementation: app heartbeat every 30 seconds, active window 90 seconds; playback heartbeat every 15 seconds, viewer expiry 45 seconds. Log and test chosen values; re-evaluate load before changing them. These are measurement defaults, not claims about existing behavior.

- Active in app: distinct authenticated person with a fresh app heartbeat, not every unexpired login.
- Watching now: distinct person with fresh valid playing telemetry. Paused/error/ended sessions do not count; buffering uses the documented grace rule.
- Deliberately tuned in: viewer explicitly initiated/expanded/unmuted or selected Watch; distinguish automatic muted exposure.
- Engaged: separately defined visible playback and/or meaningful participation; never claim attention can be known perfectly.
- Preview/paid/private entitlement counts: based on server decision at measurement time.
- Unique attendees, peak concurrency, watch time: deduplicated across tabs/devices and bounded against overlapping sessions.
- Participation: distinct participating viewers divided by distinct eligible viewers for the stated event/window.
- Tune-in: deliberate viewers among eligible active app users at the same measurement window. Do not mix denominators from different populations.
- Conversions: unique preview viewers with confirmed qualifying purchase within a clearly labeled attribution window; distinguish association from causal lift. Reuse existing attribution rules where present.
- Return attendance: viewers attending a later occurrence; separate live from replay.

Staff/test accounts excluded from business reporting by default but visible in diagnostic mode. Aggregate counts visible to hosts; viewer-level details limited to existing authorized roles. Data retention follows existing policy. Reject spoofed broadcast IDs and unauthorized telemetry; throttle heartbeats. Display freshness and unavailable states instead of zeros when collection is down.

## 5. Seven phases and task plan

The 56 parent tasks below are the required starting plan. The executor may split large tasks into smaller verifiable children without dropping acceptance criteria or changing the seven phases. Record exact affected files, dependencies, executable checks, rollback notes, and owner/verifier for each task during Phase 1. Parent tasks pass only after all children pass. Task counts displayed in dashboards must use the actual audited plan.

### Phase 1: Discover, prove feasibility, and lock the plan (P1-01 through P1-08)

Dependencies: none. Exit: independently audited plan plus a real provider feasibility result.

| ID | Work and required evidence |
|---|---|
| P1-01 | Establish session ID, safe branch/worktree, git status, current main SHA and matching run. Read governance, applicable skills, recent relevant session logs and current deploy script. Evidence: repository facts and isolation record; no overwritten concurrent work. |
| P1-02 | Map event sources, source IDs, rooms, session instances, membership, playback, ingestion, timeline and classroom consumers. Evidence: actual file/line contract map and representative read-only data shapes with PII removed. |
| P1-03 | Inventory provider account capabilities, embedding/live output, token control, recording, captions, stage permissions and existing billing/email/agent services. Check current official provider documentation. Record verified/unknown states without exposing credentials. |
| P1-04 | Run a bounded sandbox/private spike using existing approved capability: feed into embedded player, mobile play, access cutoff, reconnect, recording linkage, stage invitation. Evidence: actual runs and gaps; an iframe displaying a meeting is insufficient proof. |
| P1-05 | Write provider decision with expected audience scenarios (100/500/1,000 are planning scenarios, not measured traffic), latency, capacity, cost per event/month, protection, failure recovery and alternatives. Prefer current approved services. If a new purchase or infrastructure change is required, prepare one decision packet before dependent work; never claim free usage without verification. |
| P1-06 | Define source mapping, state transitions, authorization matrix, metrics dictionary and compatible data changes. Dry-run proposed backfill against sanitized representative inputs; quarantine ambiguous links instead of guessing by title. |
| P1-07 | Produce coherent UI route/component map and light/dark responsive prototypes within existing design tokens. Map every user/producer action and empty/error/locked/reconnecting state to backend behavior. No disconnected feature screens. |
| P1-08 | Materialize execution contract, all task checks, dependency graph, risk register, rollout/rollback and traceability. Independent plan audit >=18/20, no zero. Publish Phase 1/kickoff update and proceed on PASS. |

### Phase 2: Broadcast identity, lifecycle, and protected access (P2-01 through P2-08)

Dependencies: Phase 1 architecture and provider feasibility passed.

| ID | Work and required evidence |
|---|---|
| P2-01 | Add minimal models/fields/indexes for occurrences, source references, series and provider binding using current migration conventions. Prove old code compatibility, repeat safety and rollback strategy; no wholesale event-table migration. |
| P2-02 | Implement canonical event/room lookup and read projections across community, Events, Today and classroom sources. Tests: duplicate source references, recurring occurrences, unknown source, cross-cohort visibility, live event after scheduled time. |
| P2-03 | Implement producer commands and provider health state transitions with concurrency/version controls. Tests: unauthorized transition, repeated Go Live/End, out-of-order webhook, host late, cancelled event, reconnect. |
| P2-04 | Implement entitlement decision service for all four access modes and real qualifying products/grants. Tests cover guest, free, paid, scholarship, wrong cohort, revoked member, moderator and admin. |
| P2-05 | Enforce preview deadline using server time and provider/media authorization. Tests at 899/900/901 seconds, late arrival, refresh, multi-device, cached segment, direct URL and token expiry. Prove no unrestricted fallback link. |
| P2-06 | Add validated APIs, signed webhook verification/replay defense, RBAC, safe audit logs, rate limits and idempotent event delivery. Negative integration tests must hit real backend authorization paths. |
| P2-07 | Implement approved-event linkage/backfill in dry-run then controlled batches. Tests: repeated run, partial failure/resume, stable mapping and unchanged existing room membership/resources. No broad automatic publication of old private recordings. |
| P2-08 | Independent phase integration check of schema, state, access and regression suite; update traceability, migration and rollback evidence. Phase update only after evidence passes. |

### Phase 3: In-app player, live discovery, and audience measurement (P3-01 through P3-08)

Dependencies: Phase 2 canonical identity and access contracts.

| ID | Work and required evidence |
|---|---|
| P3-01 | Implement production provider playback adapter with real authorized media, loading/error/end states and bounded reconnect. Test credential expiration and upstream outage without leaking URLs. |
| P3-02 | Mount persistent mini-player in shared shell; preserve session across routes and resolve existing overlay collisions. Browser proof of navigation with uninterrupted media, single audio and logout cleanup. |
| P3-03 | Add theater/fullscreen, mobile layout, captions, keyboard/focus behavior, screen-reader status, reduced motion and light/dark compatibility. Test unsupported fullscreen/autoplay fallback. |
| P3-04 | Add Live badge, Today feature, room indicator, event Watch action, community placement, multiple-live selector and dismissal persistence. Tests ensure private titles/content never appear to wrong audiences. |
| P3-05 | Add original launch animation and opt-in sound using permitted assets or deterministic audio. Verify once-per-occurrence behavior, no repeated interruption on route changes, and browser sound denial fallback. |
| P3-06 | Implement app/playback heartbeats and server aggregation with authenticated identity, expiration, device/tab deduplication and staff/test exclusion. Fake-clock integration tests for stale/paused/ended viewers. |
| P3-07 | Add explicit-tune-in versus auto-exposure measurement and preview/paid splits; integrate metric cards with freshness/unavailable labels. Verify known fixture counts and no double counting across two devices. |
| P3-08 | Independent viewer journey and existing portal regression check; real screenshots on desktop/mobile and evidence of protected playback. Record issues fixed, update phase dashboard, proceed. |

### Phase 4: Broadcast Studio and live participation (P4-01 through P4-08)

Dependencies: Phases 2-3; reuse room services and existing staff permissions.

| ID | Work and required evidence |
|---|---|
| P4-01 | Extend existing event admin into Studio setup: link room/source, host, series, audience/access, preview, title/artwork and approved campaign settings. Validate permissions and conflicting schedule/provider capacity. |
| P4-02 | Build backstage readiness, preview/program distinction, live clock, segment rundown, explicit content-start, Go Live and End. Browser proof that backstage never goes public and program status matches backend state. |
| P4-03 | Integrate event-scoped room chat, structured Q&A, voting and answered/deferred status. Test unauthorized writes, duplicate votes, moderated content and cross-event history boundaries. |
| P4-04 | Add polls, pinned resources and rate-limited reactions. Server controls opening/closing and tally. Tests enforce one configured vote per person and private resource policy. |
| P4-05 | Implement moderated stage request/approval/acceptance/removal using verified provider capability. Test rejected, expired, cancelled and revoked invitations; no auto-enabled camera/mic; prevent playback echo. |
| P4-06 | Add producer metrics, errors, stream health, recording state and notification state in one Studio. Counts reconcile to metrics service; action failures are visible and retryable without duplicate broadcast. |
| P4-07 | Add reconnect/offline/end UX and producer recovery controls. Exercise feed loss, browser reconnect, producer disconnect and accidental repeated commands. Define and test when a prolonged outage stops playback and asks producer action. |
| P4-08 | Independent two-role rehearsal (producer/moderator and viewers), keyboard/mobile review and screenshots. Present Phase 4 update with deferred Halfway dashboard if eligible. |

### Phase 5: Invitations, subscriptions, recurring shows, and AI support (P5-01 through P5-08)

Dependencies: identity, player, participation and metric contracts stable.

| ID | Work and required evidence |
|---|---|
| P5-01 | Implement series/follow preferences, upcoming lineup, relevant audience selection and real event occurrence scheduling. Tests cover DST, cancellation/reschedule, duplicate follows and unsubscribes. Suggested show names are editable examples, not live seeded broadcasts. |
| P5-02 | Extend existing notification/outbox system with T-10, actual-live and replay-ready triggers, safe retries, send-time authorization, preference/suppression checks and durable deduplication. Simulate crash between provider response and acknowledgment. |
| P5-03 | Add producer campaign preview/approval controls and branded templates with exact event deep links. Verify sign-in/sign-up returns to event; reject external return URLs. Test only configured approved recipients; no broad sends. |
| P5-04 | Add preview clock/warning/end screen and verified existing checkout return/resumption. Test successful entitlement update, slow webhook, failed/cancelled payment, duplicate billing event and wrong-product purchase. |
| P5-05 | Implement suppress-if-watching and frequency limits across overlapping events; expose queued/sent/suppressed/failed states and manual safe retry. No launch resend on reconnect. |
| P5-06 | Add funnel/return-attendance reporting using actual delivery, watch and billing records with explicit denominators/windows. Distinguish observed attribution from causal claims and delayed data. |
| P5-07 | Wire existing Reese/Dara/marketing tools for recommendations, learning alignment and question grouping with named human owners, approval states and evidence. Test authorization denial and LLM outage; manual production must remain functional. |
| P5-08 | Independent free-to-preview-to-checkout-to-view journey using sandbox billing, notification sink and realistic user roles. Confirm production campaigns remain producer-controlled. Phase update and proceed. |

### Phase 6: Replays, learning continuity, and distribution (P6-01 through P6-08)

Dependencies: broadcast occurrence, recording provider, access and campaign contracts.

| ID | Work and required evidence |
|---|---|
| P6-01 | Bind completed provider recordings to correct occurrence/room/session, including split recordings and reused meeting IDs. Test delayed/duplicate callbacks, missing screen share, unrelated preshow clips and ambiguous matches. |
| P6-02 | Implement processing, review, publish/unpublish and failed states, media readiness checks and replay authorization. Prove protected playback/download/captions and cache paths remain restricted. |
| P6-03 | Build Live hub horizontal shelves and room/event replay projection with posters, duration, series, topic/level, access, filters and empty states. Confirm one episode across multiple surfaces. |
| P6-04 | Add resume watching and progress synced across devices, chapter navigation and resource links. Validate bounds and accessible controls; distinguish replay progress from live attendance. |
| P6-05 | Generate/edit source-grounded summaries, chapters, lesson links and approved teaser clips through existing media/AI tools. Tests cover failure, uncertain timestamps, private content and manual correction/publishing. No invented transcript or rendered clip. |
| P6-06 | Publish approved replay/timeline/community/classroom cards via canonical references; dedupe retries and propagate unpublish/access changes. Replay-ready notification triggers only when playable and approved. |
| P6-07 | Link unanswered questions to continuing discussion, follow-up resources and relevant learning tasks without altering core curriculum automatically. Verify room privacy and user-controlled recommendations. |
| P6-08 | Independent end-to-replay rehearsal including recording delay/failure and two-part episode. Confirm replay shelves and distribution really work. Capture evidence and phase update. |

### Phase 7: Harden, release, verify production, and hand off (P7-01 through P7-08)

Dependencies: all prior required tasks passed. Release tasks execute in order; do not require deployment tasks themselves to pass before deployment begins. All pre-deploy implementation and readiness tasks must pass before P7-04.

| ID | Work and required evidence |
|---|---|
| P7-01 | Run full current repository quality gates: both TypeScript stacks, relevant/full mandated Jest, lint, frontend/browser and critical integration checks. Reconcile session logs and scope diff. Never disable checks or count skipped tests as passed. |
| P7-02 | Run critical security, accessibility, browser and failure matrix; load-test approved nonproduction environment against Phase 1 targets. Measure p95 startup, reconnect, heartbeat load and watch authorization. Document exact supported browsers/capacity/cost; no synthetic results presented as production. |
| P7-03 | Prepare release candidate, PR(s), migration order, compatible rollback, existing feature flags, approved test identities, private rehearsal event and exact deployment/verification commands. Rebase/merge safely as current governance requires; revalidate changed evidence. Obtain required real review/checks, never bypass branch protection. |
| P7-04 | Merge approved candidate and deploy with current `scripts/deploy-prod.sh` workflow and exclusive lock. Record prior/release SHA, image/container evidence, migration result and hostname. Confirm frontend and backend serve the intended release; static HTTP 200 alone is inadequate. |
| P7-05 | Independently verify production with private test broadcast: Go Live, announcement, mini/theater/fullscreen, route persistence, two-role participation, real playback authorization, preview boundary, accurate count, end, actual recording and replay. Use approved test recipients and no real paid transaction without explicit authorization. |
| P7-06 | Complete gated activation using existing flags: internal verified audience first, then intended access modes after successful checks. Ensure campaigns remain event-controlled. Monitor through one full broadcast-to-recording-to-replay cycle and a documented error window; bounded waits with durable resume if provider processing is delayed. |
| P7-07 | Run `loop-production-verifier` fresh on deployed behavior and real screenshots, logs, RBAC, rollback readiness and release marker. Address failures within two cycles, disable affected feature or restore known-good behavior when necessary. Emit required telemetry manifest through existing contract. |
| P7-08 | Write handoff, producer SOP, operator troubleshooting, one-command validation entry point, test guide and final Live dashboard. Final report includes audit scores, task outcomes/retries, actual production links/SHA, screenshots, known limitations, rollback and session progress audit. Mark complete only if required production evidence passed. |

## 6. Verification matrix that cannot be omitted

Bind each scenario to exact test paths/commands in the audited plan; this list is acceptance behavior, not a claim that tests already exist.

| Scenario | Required result |
|---|---|
| Free account watches free Open House | Full event and eligible resources; no forced paywall. |
| Free account watches paid preview | Opening window only; server/media denial after cutoff. |
| Preview viewer refreshes, opens new tab/device, or changes client clock | Same server deadline; counts remain deduplicated. |
| Free account directly requests full replay, segment, caption or download | Denied where protected; public metadata remains safe. |
| Paid member of another private cohort | Cannot watch or read that private event. |
| Valid scholarship/sponsored grant | Qualifying access works without requiring a cash purchase. |
| Producer backstage, scheduled time passes | No broadcast announcement or backstage exposure. |
| Duplicate Go Live/webhook/job delivery | One transition and one eligible campaign send per recipient/kind. |
| Concurrent producer commands | Version conflict handled; no impossible state. |
| Event rescheduled/cancelled | Old jobs do not send; user sees corrected status. |
| Provider connection drops and reconnects | Honest reconnect status; no preview reset or new launch campaign. |
| User navigates app, expands, minimizes, logs out | Continuity while authorized; access stops on logout. |
| Browser blocks sound/autoplay or fullscreen | Accessible play/expand fallback; no broken app. |
| Two broadcasts live | One audio source, eligible selector, correct room context. |
| Moderator stage invitation revoked | Provider access revoked and media cleaned up. |
| Playback paused/stale/two devices | Count expires or deduplicates as dictionary specifies. |
| Telemetry outage | Unavailable/stale label; never fake zero or fabricate audience. |
| Billing return before confirmed entitlement | Pending state, then automatic verified resumption; no client-only unlock. |
| Room/user loses access mid-event | Playback renewal, chat and resources all enforce revocation. |
| Duplicate/delayed or multipart recording | Correct single episode with ordered parts, no premature replay notification. |
| Timeline retry or replay unpublish | No duplicate card; access/unpublish propagates everywhere. |
| AI/provider/email service unavailable | Bounded retry, actionable status, manual path, no silent success. |
| New build rolled back | Existing classes, rooms and recordings still function with additive schema. |

Test time-dependent logic using injected/fake clocks locally, but include an actual protected production preview cutoff check with approved test accounts. Do not change global clocks or public event timing to accelerate it. A separate short-duration private diagnostic can supplement, not replace, verification of the configured 900-second rule.

## 7. Release safety and operational completeness

- Prefer additive backward-compatible migrations; use expand/contract if required. Take the established backup/snapshot and verify the restore procedure before shared-state migration. Application rollback must not require deleting live broadcast/attendance/payment data.
- Rehearse migrations in a representative environment. Include indexes and query plans for active broadcast selection, heartbeats, source mapping and episode shelves. Do not put high-volume heartbeat writes into an unbounded hot table.
- Use existing authenticated realtime infrastructure where available. If polling is the compatible choice, bound intervals, payloads and load. A new infrastructure service needs a concrete reviewed decision.
- Never let a client supply its own identity, role, paid status, source URL, campaign recipient list or authoritative viewer count.
- Recording fetch/transcode paths validate approved providers/URLs and prevent arbitrary URL fetches. Secrets, signed URLs, private room details and payment payloads are redacted in logs.
- Declare recording/processing retention and cleanup using existing policies; do not invent a new retention promise. Preserve audit and media references through retry and rollback.
- Track operational success/failure/retries/latency/volume for provider, playback authorization, notifications, recording, AI and publishing jobs. Correlation IDs connect event -> broadcast -> provider instance -> job -> delivery -> replay. Visible errors have stable error classes.
- Feature flags use the existing settings system and default to an internal/disabled audience until verified. Keep player, campaigns, preview access and replay distribution separable where operationally useful.
- A provider/permission gap must not be concealed behind fixtures, a public unlisted URL, a disabled test, an external-meeting fallback presented as embedded playback, or a "coming soon" control.
- No new paid contracts, large infrastructure change, unrelated agent refactor, mass public campaign, or destructive data replacement is authorized by this build prompt. Existing production deployment is the target; existing review and approval controls remain intact.

## 8. Blocker handling without burdening Ali

Discovery should identify external gates early. Prepare one packet with: exact missing capability; observed evidence; required task IDs; recommended concrete solution; alternatives and trade-offs; verified cost when known; exact permission/purchase/action needed; completed safe work; exact resume command. Do not ask generic questions such as which framework to use or whether to continue to the next phase.

If required review is outstanding, show the full PR URL and reviewed head SHA. Do not repeatedly push optional edits that invalidate approvals. If mandatory checks fail, investigate and fix within the permitted scope and retry caps; do not waive them because failures are old.

If production verification cannot run because credentials, media access, browser tooling, provider processing or approval is unavailable, state "deployed, production verification blocked" or the precise earlier stage. Do not say "live and complete." Maintain the durable cursor and resume instruction. Use a bounded polling/checkpoint procedure for delayed recording readiness; never an endless sleep loop.

## 9. Final handoff Ali should receive

Give the actual production URLs for Live hub, Studio and one approved example event/replay. Include numbered, nontechnical testing steps:

1. Open Studio and select/create an event tied to a room.
2. Choose Free, Paid, Live Preview or Private; confirm who can watch.
3. Review event campaign and reminder audience without accidentally sending a test to everyone.
4. Enter backstage, check audio/video/screen/recording, and Go Live.
5. Open the app as a permitted viewer; find the live indicator and mini-player.
6. Expand, navigate, minimize, and participate in a question/poll.
7. Observe Studio app-active/viewer numbers and their definitions.
8. Verify a free preview ends after the opening 15 minutes while a qualifying member continues.
9. End broadcast, observe recording processing, review/publish the replay.
10. Find the same episode in the room, Live shelf and timeline; verify locked/full access.
11. Locate errors, retries, audit history and emergency stop/feature rollback controls.

Report phase completion, actual parent/child task totals, audit cycles/scores, retries, tested browsers, measured limits, release SHA and production verification evidence. Separate any authorized deferred optional enhancements from required scope; required missing functionality blocks completion. Include screenshots from actual production, not concept art.

## 10. Start now

Read governance and the installed skill, reconcile current repository state, locate or initialize the durable run, and execute Phase 1. Make the requested run-specific reporting cadence explicit in the execution contract. Complete all seven phases through verified production using Loop Architect, with independent graders and no routine permission pauses.
