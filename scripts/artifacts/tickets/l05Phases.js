/**
 * l05Phases — section B of DOC 10, and the 56-task reconciliation behind sections C and D.
 *
 * THE PHASE DEFINITION IS NOT IN THE BOOTSTRAP. Bootstrap §17 asks section B to cover "every
 * known Phase 1-7 area" without ever defining the phases; it only references them in passing at
 * §1172-1174. The authoritative table is its sibling document,
 * docs/requirements/CLAUDE_CODE_COLABERRY_LIVE_7_PHASE_BUILD.md §5, "Seven phases and task plan",
 * which names 56 parent tasks P1-01 through P7-08. Titles and task clauses below are transcribed
 * from there. A reader who assumes the bootstrap defines them will look in the wrong file, so the
 * provenance is recorded rather than implied.
 *
 * WHY THE MAPPING IS DATA AND NOT PROSE. §17 names this artifact the "current tab -> Basecamp"
 * migration report. Its job is to reconcile a plan that lived in a Claude Code tab against the
 * board that is supposed to carry it. That reconciliation is a judgment, made once, recorded here,
 * and then constrained from both directions by the self-check:
 *
 *   - every one of the 56 tasks appears exactly once, and declares coverage;
 *   - every Basecamp id cited exists in the measured census, so a typo is a build failure
 *     rather than a dead link in a governance document;
 *   - board todos cited by NO task are computed, not listed, so work that exists only on the
 *     board surfaces by subtraction instead of by someone remembering to write it down.
 *
 * That last direction is the one that matters. DOC 10 itself was found by counting a requirement
 * list against a board, and a reconciliation that can only find gaps in one direction would have
 * missed it.
 *
 * COVERAGE VALUES. 'COVERED' means board tickets account for the task. 'PARTIAL' means a ticket
 * covers some of it and the rest is named in `gap`. 'NONE' means no ticket on the board covers it
 * at all. PARTIAL and NONE both require a `gap`, asserted, because "partial" without saying what
 * is missing is the same as saying nothing.
 */

/** Phase 1-7, transcribed from CLAUDE_CODE_COLABERRY_LIVE_7_PHASE_BUILD.md §5. */
const PHASES = [
  {
    id: 1,
    title: 'Discover, prove feasibility, and lock the plan',
    deps: 'none',
    exit: 'independently audited plan plus a real provider feasibility result',
    exists: 'Provider feasibility is resolved: Cloudflare Stream Live was chosen and is '
      + 'implemented behind an adapter, so the decision is embodied in code rather than only '
      + 'written down. A metrics dictionary and the state contracts exist.',
    files: [
      'backend/src/services/broadcast/providers/cloudflareStreamProvider.ts',
      'backend/src/services/broadcast/broadcastMetrics.ts',
      'backend/src/services/broadcast/broadcastStateMachine.ts',
    ],
    tests: [
      'backend/src/services/broadcast/providers/__tests__/cloudflareStreamProvider.test.ts',
      'backend/src/services/broadcast/__tests__/broadcastMetrics.test.ts',
      'backend/src/services/broadcast/__tests__/broadcastStateMachine.test.ts',
    ],
    // Names only. A flag's VALUE in production is not a thing this document is allowed to carry.
    flags: ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_STREAM_SUBDOMAIN', 'CLOUDFLARE_STREAM_TOKEN',
      'CLOUDFLARE_STREAM_SIGNING_KEY_ID', 'CLOUDFLARE_STREAM_SIGNING_KEY_PEM'],
    flagNote: 'Read together by readCloudflareStreamConfig, which returns null when any is unset. '
      + 'Fail-closed: absent configuration disables the provider rather than degrading it.',
    deployed: 'Code deployed. Provider configuration present in the production environment '
      + '(L1.3 completed).',
    blockers: 'No load test and no measured p95 against the planning scenarios, so the capacity '
      + 'half of the feasibility result does not exist. The studio hardware spike was never run.',
  },
  {
    id: 2,
    title: 'Broadcast identity, lifecycle, and protected access',
    deps: 'Phase 1 architecture and provider feasibility passed',
    exit: 'independent integration check of schema, state, access and the regression suite',
    exists: 'The most complete area. Canonical broadcast_series, broadcast_occurrences and '
      + 'broadcast_source_refs tables created additively; a versioned state machine with '
      + 'concurrency control; producer commands; fail-closed entitlement across free, paid, '
      + 'preview and private; a 900-second preview clock; signed short-lived playback grants '
      + 'with rate limits; and a dry-run-first backfill.',
    files: [
      'backend/src/db/ensureBroadcastSchema.ts',
      'backend/src/models/BroadcastOccurrence.ts',
      'backend/src/services/broadcast/broadcastIdentity.ts',
      'backend/src/services/broadcast/broadcastEntitlement.ts',
      'backend/src/services/broadcast/broadcastPlaybackGrant.ts',
      'backend/src/services/broadcast/broadcastCommandService.ts',
      'backend/src/routes/broadcastRoutes.ts',
    ],
    tests: [
      'backend/src/routes/__tests__/broadcastRoutes.test.ts',
      'backend/src/db/__tests__/ensureBroadcastSchema.test.ts',
      'backend/src/controllers/__tests__/broadcastController.test.ts',
    ],
    flags: ['BROADCAST_ENABLED', 'COMMUNITY_ROOMS_ENABLED'],
    flagNote: 'Both are read in backend/src/config/env.ts and both default to false in code, so '
      + 'the routes answer 404 until they are set. They are separate switches, but '
      + 'broadcast_occurrences.room_id points at a community room, so room-scoped access needs '
      + 'both on.',
    deployed: 'Code deployed. Schema bootstrapped at server start.',
    // The state is spelled `cancelled` in the shipped state machine, so naming it any other way // spelling-exempt: naming the shipped state
    // would send a reader grepping for a literal that is not there. Backticked so it reads as
    // code rather than as British prose, and exempted with a reason — the same treatment the
    // shipped state names already get in l112Data.
    blockers: 'Only two creation paths exist: historical backfill, and ensureOccurrenceForSession '
      + 'called from the Accelerator session flow. The `cancelled` state is a one-way door ' // spelling-exempt: shipped state name
      + 'with no outbound transition, so a `cancelled` class can never air again.', // spelling-exempt: shipped state name
  },
  {
    id: 3,
    title: 'In-app player, live discovery, and audience measurement',
    deps: 'Phase 2 canonical identity and access contracts',
    exit: 'independent viewer-journey check with real screenshots on desktop and mobile',
    exists: 'A Cloudflare playback adapter; a persistent mini-player mounted beside the router '
      + 'outlet so media survives navigation; a shared discovery poller on a server-defined '
      + 'cadence; the live badge and Watch action; heartbeats with server-side aggregation.',
    files: [
      'frontend/src/services/broadcastPlaybackAdapter.ts',
      'frontend/src/services/broadcastHeartbeat.ts',
      'frontend/src/components/portal/LiveMiniPlayer.tsx',
      'frontend/src/contexts/BroadcastPlayerContext.tsx',
      'backend/src/services/broadcast/broadcastTelemetryService.ts',
    ],
    tests: [
      'frontend/src/routes/__tests__/portalRoutesPlayerMount.test.tsx',
      'frontend/src/services/__tests__/broadcastPlaybackAdapter.security.test.ts',
    ],
    flags: ['BROADCAST_ENABLED', 'BROADCAST_DISCOVERY_POLL_MS'],
    flagNote: 'Clients learn the feature is off by receiving a 404 from discovery, which is why '
      + 'a dark deployment looks identical to a broken one from the browser.',
    deployed: 'Code deployed. Never exercised with the flag on in production.',
    blockers: 'Community placement is deferred by decision (L4.8). No test asserts what a viewer '
      + 'actually sees end to end, which is recorded in the DOC 12 diagram data as an unbuilt '
      + 'node. With no flag-on environment there are no screenshots and no contrast evidence.',
  },
  {
    id: 4,
    title: 'Broadcast Studio and live participation',
    deps: 'Phases 2-3; reuse room services and existing staff permissions',
    exit: 'independent two-role rehearsal with a producer, a moderator and viewers',
    exists: 'Half of it. The producer control strip exists - backstage, content-started, go live, '
      + 'end with confirmation and a version check - plus a segment rundown, producer state and '
      + 'live-audience reads, and a stream health loop with an auto-end safety net.',
    files: [
      'frontend/src/components/portal/ProducerStrip.tsx',
      'frontend/src/components/portal/ProducerRundown.tsx',
      'frontend/src/components/portal/LiveWorkspace.tsx',
      'backend/src/services/broadcast/broadcastHealthLoop.ts',
      'backend/src/services/broadcast/broadcastAutoEndPolicy.ts',
    ],
    tests: [
      'frontend/src/components/portal/__tests__/ProducerRundown.test.tsx',
      'backend/src/services/broadcast/__tests__/broadcastAutoEndPolicy.test.ts',
    ],
    flags: ['BROADCAST_ENABLED', 'BROADCAST_INPUT_STRATEGY',
      'CLOUDFLARE_STREAM_LIVE_INPUT_UID', 'BROADCAST_AUTO_END_WINDOW_SECONDS'],
    flagNote: 'BROADCAST_INPUT_STRATEGY selects shared-default, per-occurrence or per-series '
      + 'input binding.',
    deployed: 'The producer half is deployed. The participation half does not exist to deploy.',
    blockers: 'There is no Studio setup screen at all: room, host, series, audience, access and '
      + 'artwork cannot be set after creation. Structured Q&A, polls, reactions, pinned resources '
      + 'and the moderated stage request flow are entirely absent - a repository-wide search for '
      + 'stage-request identifiers returns nothing. This is the largest unbuilt surface that the '
      + 'plan treats as required.',
  },
  {
    id: 5,
    title: 'Invitations, subscriptions, recurring shows, and AI support',
    deps: 'identity, player, participation and metric contracts stable',
    exit: 'independent free-to-preview-to-checkout-to-view journey on sandbox billing',
    exists: 'Nothing beyond the broadcast_series table and a series_id foreign key. The phase is '
      + 'unbuilt, not partially built.',
    files: ['backend/src/db/ensureBroadcastSchema.ts'],
    tests: [],
    flags: [],
    flagNote: 'No flag exists for this area, because there is nothing to gate.',
    deployed: 'Not built.',
    blockers: 'No follow or subscription model, no series lineup, no T-10 / actual-live / '
      + 'replay-ready notification triggers, no campaign preview or approval, no '
      + 'suppress-if-watching, no funnel reporting, and no wiring to the existing marketing '
      + 'agents. All eight tasks are outstanding and, as section D records, the board has no '
      + 'ticket for any of them.',
  },
  {
    id: 6,
    title: 'Replays, learning continuity, and distribution',
    deps: 'broadcast occurrence, recording provider, access and campaign contracts',
    exit: 'independent end-to-replay rehearsal including a recording delay and a two-part episode',
    exists: 'Recordings are bound to occurrences by observed provider video id; a replay '
      + 'promotion loop and readiness policy exist; a replay list route and a Replays page with '
      + 'nav gating; clip markers and a CSV clip-list export.',
    files: [
      'backend/src/services/broadcast/broadcastRecordingBinding.ts',
      'backend/src/services/broadcast/broadcastReplayPolicy.ts',
      'backend/src/services/broadcast/broadcastClipListExport.ts',
      'frontend/src/pages/portal/replays/ReplaysPage.tsx',
      'frontend/src/components/portal/replaysNavGate.ts',
    ],
    tests: [
      'backend/src/services/broadcast/__tests__/broadcastRecordingBinding.test.ts',
      'backend/src/services/broadcast/__tests__/broadcastReplayPolicy.test.ts',
    ],
    flags: ['BROADCAST_ENABLED'],
    flagNote: 'Same switch as the rest of the broadcast surface.',
    deployed: 'Code deployed.',
    blockers: 'The whole media-production chain downstream of the recording is unbuilt: '
      + 'transcript, chapters and description, the long-form edit, the short clips, and any '
      + 'publish to YouTube or social. There is no resume-watching or cross-device progress, no '
      + 'chapter navigation, no AI summaries, and no unanswered-question continuity. The signed '
      + 'media route for a stored copy exists but its recording resolver is never registered '
      + 'outside its own test, so the route has no source in production.',
  },
  {
    id: 7,
    title: 'Harden, release, verify production, and hand off',
    deps: 'all prior required tasks passed',
    exit: 'production evidence passed, with a handoff and a final dashboard',
    exists: 'Repository-wide quality gates exist and run in CI across both TypeScript stacks, '
      + 'Jest, lint and an integration tier. A broadcast test-evidence script exists.',
    files: ['backend/src/scripts/broadcastTestEvidence.js', 'scripts/deploy-prod.sh'],
    tests: [],
    flags: ['BROADCAST_ENABLED'],
    // The finding this phase exists to surface. Deployed and enabled are different states.
    flagNote: 'This is the release switch, and it is declared in exactly one place outside of '
      + 'tests: backend/.env.example. It appears in no docker-compose file, no deploy script and '
      + 'no CI workflow. Nothing in the repository turns it on.',
    deployed: 'The CODE is deployed. The FEATURE is dark: the release switch is not set anywhere '
      + 'in the deployment path, so every broadcast route answers 404 in production. Deployed and '
      + 'enabled are two different states and this report refuses to collapse them.',
    blockers: 'No security, accessibility, browser or failure matrix has been run. No load test. '
      + 'No production verification of a broadcast, and therefore no handoff.',
  },
];

/**
 * The 56 parent tasks and what carries them on the board.
 *
 * `work` is a compressed clause from the §5 table, enough to recognize the task without
 * reproducing the whole specification - the document links to the source for that. `todos` are
 * Basecamp ids, checked against the census. `gap` is required whenever coverage is not COVERED.
 */
const T = (id, work, coverage, todos, gap) => ({ id, work, coverage, todos: todos || [], gap });

const TASKS = [
  // Phase 1
  T('P1-01', 'Session id, safe branch/worktree, git status, main SHA, governance read', 'COVERED', [10393697543]),
  T('P1-02', 'Map event sources, rooms, sessions, membership, playback, timeline consumers', 'PARTIAL', [10393697543, 10392808393],
    'The contract map exists as code and schema but was never published as the file/line artifact the task asks for'),
  T('P1-03', 'Inventory provider account capabilities, tokens, recording, captions, stage', 'COVERED', [10392808352, 10392808360, 10392808269]),
  T('P1-04', 'Bounded sandbox spike: player, mobile, cutoff, reconnect, recording, stage invite', 'PARTIAL', [10392808207],
    'The private airing covered ingest and playback; access cutoff, reconnect and stage invitation were never spiked'),
  T('P1-05', 'Provider decision with capacity, latency, cost per event and failure recovery', 'NONE', [],
    'No ticket writes the decision packet. Cost per event and per month are undocumented anywhere in the repository'),
  T('P1-06', 'Source mapping, transitions, authorization matrix, metrics dictionary, backfill dry run', 'COVERED', [10392808414, 10392808421, 10392808429, 10392808433]),
  T('P1-07', 'UI route/component map and light/dark responsive prototypes in existing tokens', 'NONE', [],
    'No ticket covers the route map or the prototypes. Every viewer surface was built without one'),
  T('P1-08', 'Execution contract, dependency graph, risk register, rollout/rollback, plan audit >=18/20', 'PARTIAL', [10393697560],
    'The traceability matrix shipped; there is no recorded independent plan audit score, so the Phase 1 exit criterion was never met'),

  // Phase 2
  T('P2-01', 'Minimal models, fields and indexes for occurrences, source refs, series, binding', 'COVERED', [10392808393]),
  T('P2-02', 'Canonical event/room lookup and read projections across every source', 'COVERED', [10392808393, 10392808433]),
  T('P2-03', 'Producer commands and provider health transitions with concurrency control', 'COVERED', [10392808414, 10424494579, 10423504463]),
  T('P2-04', 'Entitlement decision service for all four access modes against real grants', 'COVERED', [10392808421, 10425333905]),
  T('P2-05', 'Preview deadline on server time, tested at 899/900/901 seconds', 'PARTIAL', [10392808421],
    'The clock is implemented and unit-tested; L10.7 records that entitlement has never once been exercised against a real viewer'),
  T('P2-06', 'Validated APIs, signed webhook verification, RBAC, audit logs, rate limits', 'COVERED', [10392808429]),
  T('P2-07', 'Approved-event linkage and backfill, dry run then controlled batches', 'COVERED', [10392808433]),
  T('P2-08', 'Independent phase integration check plus traceability and rollback evidence', 'PARTIAL', [10393697560],
    'Traceability is maintained; no independent phase integration check was run or recorded'),

  // Phase 3
  T('P3-01', 'Production playback adapter with real authorized media and bounded reconnect', 'COVERED', [10392808371, 10392808167]),
  T('P3-02', 'Persistent mini-player in the shared shell, media surviving navigation', 'COVERED', [10392808436]),
  T('P3-03', 'Theater, fullscreen, mobile, captions, keyboard, screen reader, reduced motion', 'COVERED', [10392808439]),
  T('P3-04', 'Live badge, Today feature, room indicator, Watch action, community placement', 'PARTIAL', [10392808451, 10392808466, 10392808299],
    'Community and Events placements are deferred by an explicit decision on L4.8, so the task cannot pass as specified'),
  T('P3-05', 'Launch animation and opt-in sound, once per occurrence, with denial fallback', 'COVERED', [10392808459]),
  T('P3-06', 'App and playback heartbeats, server aggregation, device dedup, staff exclusion', 'COVERED', [10392808230, 10423504316]),
  T('P3-07', 'Explicit tune-in versus auto-exposure, preview/paid splits, freshness labels', 'PARTIAL', [10392808230],
    'The unavailable-never-zero read exists; the tune-in versus exposure split and the paid split are not implemented'),
  T('P3-08', 'Independent viewer journey check with real desktop and mobile screenshots', 'NONE', [],
    'No ticket covers it, and with the release switch unset there is no environment in which to take the screenshots'),

  // Phase 4
  T('P4-01', 'Studio setup: link room, source, host, series, audience, access, title, artwork', 'NONE', [],
    'No ticket and no screen. Access mode is settable only at creation, so a mistake is permanent'),
  T('P4-02', 'Backstage readiness, preview/program split, live clock, rundown, go live, end', 'COVERED', [10392808262, 10423504463]),
  T('P4-03', 'Event-scoped room chat, structured Q&A, voting, answered and deferred status', 'NONE', [],
    'No ticket and no code. Live participation is the headline of the product and none of it exists'),
  T('P4-04', 'Polls, pinned resources and rate-limited reactions with server-side tallies', 'NONE', [],
    'No ticket and no code'),
  T('P4-05', 'Moderated stage request, approval, acceptance and removal', 'NONE', [],
    'No ticket and no code; a repository-wide search for stage-request identifiers returns nothing'),
  T('P4-06', 'Producer metrics, errors, stream health, recording and notification in one Studio', 'PARTIAL', [10424494579],
    'Stream health exists; there is no single Studio surface, and notification state has nothing to report'),
  T('P4-07', 'Reconnect, offline and end UX plus producer recovery controls', 'PARTIAL', [10423504463],
    'The auto-end safety net exists; producer-side recovery from a prolonged outage is undefined'),
  T('P4-08', 'Independent two-role rehearsal, keyboard and mobile review, screenshots', 'COVERED', [10392808279, 10392808316]),

  // Phase 5
  T('P5-01', 'Series and follow preferences, upcoming lineup, real occurrence scheduling', 'NONE', [], 'No ticket, no code'),
  T('P5-02', 'Notification outbox with T-10, actual-live and replay-ready triggers', 'NONE', [], 'No ticket, no code'),
  T('P5-03', 'Producer campaign preview and approval with exact event deep links', 'NONE', [], 'No ticket, no code'),
  T('P5-04', 'Preview clock, warning, end screen and verified checkout return', 'PARTIAL', [10425333905],
    'The preview clock exists in the entitlement service; the end screen and the checkout return path for a broadcast do not'),
  T('P5-05', 'Suppress-if-watching and frequency limits across overlapping events', 'NONE', [], 'No ticket, no code'),
  T('P5-06', 'Funnel and return-attendance reporting with explicit denominators', 'NONE', [], 'No ticket, no code'),
  T('P5-07', 'Wire existing marketing agents for recommendations and question grouping', 'NONE', [], 'No ticket, no code'),
  T('P5-08', 'Independent free to preview to checkout to view journey on sandbox billing', 'PARTIAL', [10425333905],
    'L10.7 covers proving the paywall, which is one leg of this journey; the notification and checkout-return legs have no ticket'),

  // Phase 6
  T('P6-01', 'Bind completed recordings to the right occurrence, including split recordings', 'COVERED', [10416533879]),
  T('P6-02', 'Processing, review, publish and unpublish states; protected playback and download', 'PARTIAL', [10392808287, 10496738880],
    'Replay listing exists; the signed media route for a stored copy has no registered resolver in production, which FC6.3 now covers'),
  T('P6-03', 'Live hub shelves and room/event replay projection with filters and empty states', 'COVERED', [10392808287]),
  T('P6-04', 'Resume watching, progress synced across devices, chapter navigation', 'NONE', [], 'No ticket, no code'),
  T('P6-05', 'Source-grounded summaries, chapters, lesson links and approved teaser clips', 'PARTIAL', [10392808294],
    'L8.2 covers the human edit path; the transcript, chapters and AI summary steps it depends on are unbuilt'),
  T('P6-06', 'Publish approved replay cards to timeline, community and classroom surfaces', 'PARTIAL', [10392808287],
    'Replay discovery is in the portal only; no canonical card is published to the other three surfaces'),
  T('P6-07', 'Link unanswered questions to continuing discussion and follow-up resources', 'NONE', [],
    'No ticket, no code. It also depends on a Q&A system that does not exist (P4-03)'),
  T('P6-08', 'Independent end-to-replay rehearsal including delay and a two-part episode', 'COVERED', [10392808316, 10392808348]),

  // Phase 7
  T('P7-01', 'Full repository quality gates, reconciled session logs and scope diff', 'NONE', [],
    'The gates exist and run in CI, but no ticket owns running them as a release step or reconciling the scope diff'),
  T('P7-02', 'Security, accessibility, browser and failure matrix plus a load test to p95 targets', 'PARTIAL', [10392808332],
    'L10.4 covers the failure drills. There is no load test, no p95 measurement, and no browser or accessibility matrix'),
  T('P7-03', 'Release candidate, PRs, migration order, rollback, flags, private rehearsal event', 'PARTIAL', [10392808339],
    'Go/no-go is ticketed; the migration order and the compatible rollback plan are not written down'),
  T('P7-04', 'Merge and deploy with the current deploy script under an exclusive lock', 'NONE', [],
    'No ticket. The deploy path exists and is used, but nothing records the release SHA and image evidence for this feature'),
  T('P7-05', 'Independently verify production with a private test broadcast end to end', 'COVERED', [10392808339, 10416291196]),
  T('P7-06', 'Gated activation using existing flags, internal verified audience first', 'NONE', [],
    'No ticket, and nothing in the repository sets the release switch. This is the single step between a deployed codebase and a working feature'),
  T('P7-07', 'Fresh production verification on deployed behavior, plus the telemetry manifest', 'PARTIAL', [10392808348],
    'Post-launch verification is ticketed; it depends on P7-06, which has no ticket'),
  T('P7-08', 'Handoff, producer SOP, operator troubleshooting, one-command validation, dashboard', 'COVERED', [10392808319, 10392808324, 10392808335]),
];

module.exports = { PHASES, TASKS };
