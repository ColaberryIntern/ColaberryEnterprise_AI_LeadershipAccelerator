/**
 * l111Data — DOC 11's required sections, and the capability proof register.
 *
 * TICKET: L11.1, "System Architecture Handbook". Its acceptance criterion is that **every
 * capability claim states whether it is proven by test or in production**.
 *
 * WHY THAT CRITERION NEEDS FOUR LEVELS AND NOT TWO. DOC 15 measured 1,208 tests across 73
 * suites, 99.6% of them unit tests — and catalogs FOUR defects a green suite did not catch,
 * every one of them a complete, well-tested unit that nothing called. A unit test mocks its
 * caller, so a missing caller is invisible to it. "Proven by test" at the unit level therefore
 * does not mean the capability works, and collapsing the scale to test-or-production would file
 * those four defects under the same word as a capability that has actually run.
 *
 * So: PRODUCTION (observed in a real airing) > TEST (a unit or integration test pins it) >
 * WIRED (a wiring test proves the call is WRITTEN, never that it works) > UNPROVEN. The levels
 * are ordered, and `rank` makes the ordering data rather than a reader's inference.
 *
 * EVIDENCE IS STRUCTURED, NOT PROSE, so the self-check can be real rather than decorative:
 *
 *   - PRODUCTION needs `when` — the date of the airing that showed it. A production claim with
 *     no date is a memory, not evidence.
 *   - TEST and WIRED need `where` — the file that pins it. "Tested" with nothing to open is the
 *     claim this whole register exists to stop.
 *   - UNPROVEN needs `settledBy` and must NOT carry `where`, because naming a file next to an
 *     unproven claim is how an unproven claim gets read as a proven one.
 *
 * `settledBy` is an explicit field rather than a grep of the note for words like "never" or
 * "not run". A hand-written word list over prose passes any row that happens to use the
 * vocabulary and fails one that says the right thing in other words.
 */

const META = {
  ticket: 'L11.1',
  doc: 'DOC 11',
  title: 'Colaberry Live — System Architecture Handbook',
  owner: 'Ali Muwwakkil',
  file: 'docs/colaberry-live/DOC_11_SYSTEM_ARCHITECTURE_HANDBOOK.md',
  built: '2026-11-03',
  evidenceBase: 'docs/COLABERRY_LIVE_TESTING_STRATEGY.md (DOC 15), measured 2026-11-02 at '
    + 'origin/main 4c3d0df2: 1,208 tests, 73 suites, 99.6% unit, 1 integration file, 0 '
    + 'end-to-end tests touching a broadcast',
};

/** The proof scale. Ordered; `rank` is the ordering, so nothing infers it from position. */
const PROOFS = {
  PRODUCTION: {
    rank: 4,
    label: 'Proven in production',
    means: 'Observed working, or observed failing, in a real airing. Four claims qualify and two '
      + 'of them are failures — which is why this level is the most informative and the rarest.',
  },
  TEST: {
    rank: 3,
    label: 'Proven by test',
    means: 'A unit or integration test pins the behavior. It does NOT prove anything calls it: '
      + 'see the four defects a green suite did not catch.',
  },
  WIRED: {
    rank: 2,
    label: 'Wired only',
    means: 'A wiring test reads the source and asserts the caller exists. It proves a call is '
      + 'written, never that it works. Invented in this repo precisely because unit tests cannot '
      + 'see a missing caller.',
  },
  UNPROVEN: {
    rank: 1,
    label: 'Unproven',
    means: 'No test and no airing. Named explicitly rather than omitted, and each one says what '
      + 'would settle it.',
  },
};

/**
 * The 23 sections bootstrap §3.1 requires of DOC 11, transcribed from the document that defines
 * the deliverable rather than read back off the handbook — a contract copied from the thing it
 * checks would pass by construction.
 */
const SECTIONS = [
  'System purpose',
  'Major components',
  'Responsibility of each component',
  'Session vs Timeline vs Broadcast Occurrence',
  'Zoom responsibility',
  'Cloudflare Stream Live responsibility',
  'Colaberry backend responsibility',
  'Playback grant and security model',
  'Persistent player behavior',
  'Phone companion behavior',
  'YouTube distribution behavior',
  'Replay behavior',
  'Community and Builder Room behavior',
  'Prompt Drop, Claude and Claude Code behavior',
  'Production and studio workflow',
  'Failure and reconnect behavior',
  'Post-live media workflow',
  'Environment and configuration dependencies',
  'Key database records and relationships',
  'Main routes, services and files',
  'Operational ownership',
  'Known limitations',
  'Troubleshooting entry points',
];

/** The bootstrap also requires plain English FIRST, then technical depth. */
const PLAIN_ENGLISH_HEADING = 'The whole system in plain English';

/** Where the generated register is spliced into the hand-written handbook. */
const MARKERS = {
  begin: '<!-- BEGIN GENERATED: capability-proof-register -->',
  end: '<!-- END GENERATED: capability-proof-register -->',
};

/**
 * Every capability claim the handbook makes, with its proof level. The register rendered into
 * DOC 11 comes from this list, so the document cannot disagree with it.
 */
const CLAIMS = [
  // ── Proven in production: four, and two of them are failures ────────────────────────────────
  {
    id: 1,
    proof: 'PRODUCTION',
    claim: 'Signed playback grants are issued and renewed to real viewers',
    when: '2026-10-20',
    evidence: 'The first private airing: nginx logged 16 playback grants from two distinct '
      + 'clients, which is renewal, not a single hand-out.',
  },
  {
    id: 2,
    proof: 'PRODUCTION',
    claim: 'Discovery polling reaches real clients on the server-defined cadence',
    when: '2026-10-20',
    evidence: 'The same airing: 103 discovery polls from two distinct clients.',
  },
  {
    id: 3,
    proof: 'PRODUCTION',
    claim: 'Enabling the broadcast flag during a class leaves the health loop unscheduled, so '
      + 'go_live refuses for the whole show',
    when: '2026-10-20',
    evidence: 'The flag is read once at boot. provider_health was never written, go_live '
      + 'refused with ProviderNotReady, and the provider event had to be hand-fed.',
  },
  {
    id: 4,
    proof: 'PRODUCTION',
    claim: 'Zoom custom RTMP cannot be started from anything but the Zoom desktop client',
    when: '2026-10-29',
    evidence: 'The intended first public airing did not stream: the host was signed in from '
      + 'something other than the desktop client and had no way to start the stream.',
  },

  // ── Wired only: the call is written, nothing has run it ────────────────────────────────────
  {
    id: 5,
    proof: 'WIRED',
    claim: 'The provider health loop is started by the server at boot',
    where: 'backend/src/services/broadcast/__tests__/broadcastHealthLoop.wiring.test.ts',
    evidence: 'Asserts server.ts imports the loop, CALLS it in live code rather than in a '
      + 'comment, and guards the call in a try block. Its first version passed with the call '
      + 'commented out, which is why it tests its own comment stripper.',
  },
  {
    id: 6,
    proof: 'WIRED',
    claim: 'The player reports viewer heartbeats to the telemetry endpoint',
    where: 'frontend/src/components/portal (L4.9), backend/src/routes/broadcastRoutes.ts',
    evidence: 'L4.9 wired it. Before that the route had no caller at all and a 20-minute airing '
      + 'with two viewers recorded zero rows in both telemetry tables. No airing has exercised '
      + 'the wiring since it landed.',
  },

  // ── Proven by test ─────────────────────────────────────────────────────────────────────────
  {
    id: 7,
    proof: 'TEST',
    claim: 'The lifecycle refuses every transition outside its table',
    where: 'backend/src/services/broadcast/broadcastStateMachine.ts',
    evidence: 'A table test keyed on Record<EditorialState, …>, so a ninth state cannot be '
      + 'dropped into the wrong bucket by default.',
  },
  {
    id: 8,
    proof: 'TEST',
    claim: 'A called-off airing is terminal and names that as its own refusal reason',
    where: 'backend/src/services/broadcast/broadcastSessionOccurrence.ts, '
      + 'backend/src/services/broadcast/broadcastStateMachine.ts',
    evidence: 'Both the aired states and the called-off one used to answer already_aired — the '
      + 'single thing that is not true about a show called off before it ever aired, and a reason '
      + 'that sends whoever reads the log looking for a recording. Fixed and pinned 2026-11-01.',
  },
  {
    id: 9,
    proof: 'TEST',
    claim: 'A preview grant is bounded by the preview deadline, not by the token TTL',
    where: 'backend/src/services/broadcast/__tests__/broadcastPlaybackGrant.test.ts',
    evidence: 'expiresAt = min(now + ttl, contentStartedAt + previewSeconds), so a viewer at '
      + 'minute fourteen gets a 60-second token rather than a 120-second one, and renewal '
      + 'recomputes from the deadline instead of extending the old expiry.',
  },
  {
    id: 10,
    proof: 'TEST',
    claim: 'Every playback-grant failure path throws instead of returning a weaker URL',
    where: 'backend/src/services/broadcast/providers/cloudflareStreamProvider.ts',
    evidence: 'Each proven by reversing it: a missing credential, a bad uid, a bad subdomain, an '
      + 'expiry in the past, and an expiry beyond the provider\'s own 24-hour ceiling.',
  },
  {
    id: 11,
    proof: 'TEST',
    claim: 'Entitlement is fail-closed, and paid status never unlocks a private cohort',
    where: 'backend/src/services/broadcast/broadcastEntitlement.ts',
    evidence: 'Layers free/paid/preview/private on the single existing definition of "has paid" '
      + 'rather than restating it. Money buys the paid tier, not membership of someone '
      + 'else\'s room.',
  },
  {
    id: 12,
    proof: 'TEST',
    claim: 'A live session holds at most one broadcast occurrence',
    where: 'backend/src/db/ensureBroadcastSchema.ts (uq_broadcast_source_ref)',
    evidence: 'UNIQUE on (source_type, source_id) — idempotency is the database\'s job, not a '
      + 'convention. It is also why a session cannot be re-aired.',
  },
  {
    id: 13,
    proof: 'TEST',
    claim: 'Clip markers pair into ranges on read, and the last clip of an airing has no end',
    where: 'backend/src/services/broadcast/broadcastClipMarkerPolicy.ts, '
      + 'backend/src/services/broadcast/broadcastClipListExport.ts',
    evidence: 'Markers are in-points only. The out point is the next marker\'s in point; for the '
      + 'last it is ended_at, which is null on a real row, so it is reported unknown rather than '
      + 'measured against now — which would grow the duration on every download.',
  },
  {
    id: 14,
    proof: 'TEST',
    claim: 'The chat thread returns the newest messages and does not leak enrollment ids',
    where: 'frontend/src/components/portal (SessionChatPanel), backend session chat route tests',
    evidence: 'Both defects were invisible while nothing read the thread. limit with ORDER BY '
      + 'ASC returned the OLDEST hundred, so a class past a hundred lines would have shown a '
      + 'thread frozen on its first hour with no new message ever arriving. Fixed 2026-10-31.',
  },
  {
    id: 15,
    proof: 'TEST',
    claim: 'Both phone surfaces offer the same four pulse states',
    where: 'frontend/src/components/portal/livePulse.ts',
    evidence: 'Imported by both surfaces so they cannot drift again, plus 25 tests on '
      + 'ClassCheckinPage — the first coverage that file has ever had.',
  },
  {
    id: 16,
    proof: 'TEST',
    claim: 'Portal navigation cannot restart the video, and no watch control self-links',
    where: 'frontend/src/routes/portalRoutes.tsx, frontend/src/components/portal',
    evidence: 'The <video> is a sibling of <Outlet/> in the layout route, so it is literally the '
      + 'same DOM node across navigations. A test now fails if any anchor on the page points at '
      + 'its own route — the shipped "Watch now" button used to link to the page it was on.',
  },
  {
    id: 17,
    proof: 'TEST',
    claim: 'Viewer counts count distinct people rather than rows',
    where: 'backend/src/services/broadcast/__tests__/broadcastTelemetryQuery.test.ts',
    evidence: 'Asserts the SQL as text, because COUNT(DISTINCT enrollment_id) and COUNT(*) agree '
      + 'on any fixture with one viewer per person and differ only when somebody opens a second '
      + 'tab — the case the design exists to get right.',
  },
  {
    id: 18,
    proof: 'TEST',
    claim: 'A measured zero and an unknown never collapse into the same answer',
    where: 'backend/src/services/broadcast/broadcastProducerState.ts, '
      + 'backend/src/services/broadcast/broadcastDiscovery.ts',
    evidence: 'The metrics dictionary treats a fabricated zero as a defect rather than a '
      + 'cosmetic issue: it reads as "nobody watched" when the truth is "we do not know".',
  },
  {
    id: 19,
    proof: 'TEST',
    claim: 'Concurrent telemetry writes do not corrupt the occurrence anchor',
    where: 'backend/src/services/broadcast/__tests__/'
      + 'broadcastTelemetryAnchorRace.integration.test.ts',
    evidence: 'A real race against Postgres, and the ONLY integration test in the subsystem. '
      + 'describe.skip unless HAS_DB, so CI\'s Postgres job is the only place it runs and it is '
      + 'silently skipped on every developer machine.',
  },
  {
    id: 20,
    proof: 'TEST',
    claim: 'The player subtree has no WCAG 2 A/AA violations in either theme',
    where: 'frontend/src/components/portal/__tests__/liveMiniPlayer.axe.test.tsx',
    evidence: 'Sweeps the player subtree in light and dark. It is the only axe sweep in the '
      + 'subsystem.',
  },

  // ── Unproven: no test, no airing. Each says what would settle it, and names no file ────────
  {
    id: 21,
    proof: 'UNPROVEN',
    claim: 'Entitlement refuses a real un-entitled viewer',
    evidence: 'The paywall is unit-tested and has never refused an actual person. L10.7, open '
      + 'and P0. This is the highest-consequence unproven claim in the system.',
    settledBy: 'One paywalled airing in which a person without entitlement is refused and a '
      + 'person with it is admitted, both recorded.',
  },
  {
    id: 22,
    proof: 'UNPROVEN',
    claim: 'What a viewer sees while the show is failing',
    evidence: 'No test asserts the viewer-facing surface of any failure state. L10.4\'s failure '
      + 'drills are the plan and have not been run.',
    settledBy: 'Test 5: all thirteen failure modes exercised, one record each saying how it was '
      + 'induced. A green suite is explicitly not evidence for that stage.',
  },
  {
    id: 23,
    proof: 'UNPROVEN',
    claim: 'Reconnect recovers a live airing without restarting it',
    evidence: 'The transition is tested, but the state could not be reached in production at all '
      + 'until the health loop was wired, so nothing has recovered a real airing.',
    settledBy: 'An induced RTMP interruption during an airing, with the occurrence returning to '
      + 'live and viewers continuing without a restart.',
  },
  {
    id: 24,
    proof: 'UNPROVEN',
    claim: 'Behavior under load or real concurrency',
    evidence: 'The telemetry tables are designed to be bounded by concurrent tabs rather than by '
      + 'elapsed time, and that property has never been measured under load.',
    settledBy: 'A load exercise at the planning scenario, or an airing large enough to produce '
      + 'the contention.',
  },
  {
    id: 25,
    proof: 'UNPROVEN',
    claim: 'The path a viewer actually walks, end to end',
    evidence: 'Zero end-to-end tests touch a broadcast. Eight Playwright flows exist and none '
      + 'opens a player, joins a room, votes in a poll or watches a replay — deliberate and '
      + 'recorded (#3346), but it means no test has ever walked a viewer\'s path.',
    settledBy: 'One Playwright flow that opens a player against a seeded broadcast.',
  },
  {
    id: 26,
    proof: 'UNPROVEN',
    claim: 'Accessibility of the companion, the producer strip and the replay list',
    evidence: 'The axe sweep covers the player only.',
    settledBy: 'An axe sweep over each of the three remaining surfaces, in both themes.',
  },
  {
    id: 27,
    proof: 'UNPROVEN',
    claim: 'Replay processing failing cleanly to "aired, no replay"',
    evidence: 'The transition is in the table and tested as a transition; no real airing has '
      + 'failed processing.',
    settledBy: 'An induced replay-processing failure during Test 5, leaving the occurrence in '
      + 'ended rather than replay_ready.',
  },
  {
    id: 28,
    proof: 'UNPROVEN',
    claim: 'YouTube distribution of any kind',
    evidence: 'Nothing is built. Simulcast and the raw-replay retention policy are L8.1, open.',
    settledBy: 'L8.1: a test or unlisted live event on the channel, plus the four-way retention '
      + 'policy recorded.',
  },
];

const TOTALS = (() => {
  const by = {};
  Object.keys(PROOFS).forEach((k) => { by[k] = 0; });
  CLAIMS.forEach((cl) => { by[cl.proof] += 1; });
  return {
    claims: CLAIMS.length,
    sections: SECTIONS.length,
    by,
    // What the criterion is really asking: how much of the handbook rests on something that has
    // actually run. Wired and unproven both mean "no run", so they belong on the same side.
    neverRun: by.WIRED + by.UNPROVEN,
    unproven: by.UNPROVEN,
  };
})();

module.exports = { META, PROOFS, SECTIONS, PLAIN_ENGLISH_HEADING, MARKERS, CLAIMS, TOTALS };
