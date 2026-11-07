/**
 * l114Data — the checked facts behind DOC 14, the Developer & AI Maintenance Runbook.
 *
 * TICKET: L11.4. Its acceptance criterion is that the runbook be "readable by a future session
 * with no chat history".
 *
 * WHY EVERY PATH IN HERE IS ASSERTED TO EXIST. A runbook's failure mode is not being wrong about
 * an opinion, it is telling a future session to open a file that is not there. That session has
 * no chat history by definition — it cannot tell a renamed module from its own mistake, and the
 * cheapest outcome is that it stops trusting the document. So the self-check stats every path in
 * PATHS and in every procedure step, and every environment variable has to be referenced
 * somewhere in the backend source.
 *
 * The prose lives in l114Sections.js. This file holds only what can be checked.
 */

const META = {
  ticket: 'L11.4',
  doc: 'DOC 14',
  title: 'Colaberry Live — Developer & AI Maintenance Runbook',
  owner: 'Ali Muwwakkil',
  file: 'docs/colaberry-live/DOC_14_DEVELOPER_MAINTENANCE_RUNBOOK.md',
  built: '2026-11-07',
  /**
   * State claims in this document are dated, because an AIRING is an event git cannot show.
   * Checked 2026-11-07: no commit has touched backend/src/services/broadcast/ or
   * backend/src/services/classKit/ since 2026-11-03, and no Colaberry Live airing is recorded in
   * the repository. Absence of a commit is not proof an airing did not happen, so this is stated
   * as what was checked rather than as what is true.
   */
  stateCheckedOn: '2026-11-07',
};

/** Key code paths. Every one is stat'ed by the self-check. */
const PATHS = [
  { path: 'backend/src/services/broadcast/', owns: 'The whole broadcast tier: 34 modules' },
  { path: 'backend/src/services/broadcast/broadcastStateMachine.ts',
    owns: 'The transition table. READ THIS FIRST — four rules are encoded here' },
  { path: 'backend/src/services/broadcast/broadcastEntitlement.ts',
    owns: 'The access decision, fail-closed. free / paid / preview / private' },
  { path: 'backend/src/services/broadcast/broadcastPlaybackGrant.ts',
    owns: 'Grant expiry arithmetic — ONE place, deliberately' },
  { path: 'backend/src/services/broadcast/providers/cloudflareStreamProvider.ts',
    owns: 'The only provider adapter. Turns an expiry instant into a signed token' },
  { path: 'backend/src/services/broadcast/broadcastSessionOccurrence.ts',
    owns: 'Session to occurrence, and why idempotency is the database\'s job' },
  { path: 'backend/src/services/broadcast/broadcastHealthLoop.ts',
    owns: 'Provider health polling. The flag-ordering trap lives here' },
  { path: 'backend/src/services/broadcast/broadcastClipMarkerPolicy.ts',
    owns: 'The class clock and clip-label precedence' },
  { path: 'backend/src/services/broadcast/broadcastDiscovery.ts',
    owns: 'What a given viewer is allowed to know is airing' },
  { path: 'backend/src/services/broadcast/broadcastAccessDeps.ts',
    owns: 'The injected dependency bundle — why no unit test needs a database' },
  { path: 'backend/src/services/classKit/runOfShow.ts',
    owns: 'The authored show as static template data' },
  { path: 'backend/src/services/classKit/kitDeckScript.ts',
    owns: 'The presenter deck browser script, 653 lines. The instructor class clock' },
  { path: 'frontend/src/components/portal/LiveMiniPlayer.tsx',
    owns: 'The persistent player' },
  { path: 'frontend/src/components/portal/LivePromptCard.tsx',
    owns: 'The desktop prompt card — the only surface rendering pasteWhere/ccMode/rescue' },
  { path: 'frontend/src/components/portal/CompanionDeck.tsx', owns: 'The phone companion' },
  { path: 'frontend/src/components/portal/livePulse.ts',
    owns: 'The four pulse states, shared so the two surfaces cannot drift' },
  { path: 'frontend/src/components/portal/ProducerStrip.tsx', owns: 'The producer controls' },
  { path: 'frontend/src/components/portal/SessionChatPanel.tsx',
    owns: 'The Builder Room reader' },
  { path: 'frontend/src/pages/portal/ClassCheckinPage.tsx',
    owns: 'THE HIGHEST-TRAFFIC LIVE SURFACE — where the room QR actually lands' },
  { path: 'frontend/src/pages/portal/LiveSessionPage.tsx', owns: 'The desktop workspace' },
  { path: 'frontend/src/routes/portalRoutes.tsx', owns: 'Portal routing, including the layout route' },
];

const MODELS = [
  { path: 'backend/src/models/BroadcastOccurrence.ts', owns: 'One airing' },
  { path: 'backend/src/models/LiveSession.ts', owns: 'The show definition, incl. kit_json' },
  { path: 'backend/src/models/SessionPulse.ts', owns: 'Following / Building / Stuck / Finished' },
  { path: 'backend/src/models/SessionChatMessage.ts', owns: 'The Builder Room thread' },
  { path: 'backend/src/models/SessionChecklist.ts', owns: 'Per-session checklist state' },
  { path: 'backend/src/models/SessionGate.ts', owns: 'Session gating' },
  { path: 'backend/src/db/ensureBroadcastSchema.ts',
    owns: 'The 7 broadcast tables AND uq_broadcast_source_ref, the UNIQUE index that makes a '
      + 'session hold at most one airing' },
  { path: 'backend/src/db/ensureLiveSessionSchema.ts',
    owns: 'The 12 session-tier tables. EIGHT of them key on the session, not the airing' },
];

const ROUTES = [
  { path: 'backend/src/routes/broadcastRoutes.ts',
    owns: 'Producer commands, discovery, playback grants, telemetry heartbeat, audience read, '
      + 'clip list' },
  { path: 'backend/src/routes/broadcastMediaRoutes.ts',
    owns: '/bm/ — replay bytes off our own disk, range-capable' },
];

const TESTS = [
  { path: 'backend/src/services/broadcast/__tests__',
    owns: '640 tests, 40 suites. The service tier' },
  { path: 'backend/src/services/broadcast/__tests__/broadcastHealthLoop.wiring.test.ts',
    owns: 'THE WIRING TEST. Reads the source and asserts server.ts actually CALLS the loop in '
      + 'live code. Tests its own comment stripper, because its first version passed with the '
      + 'call commented out' },
  { path: 'backend/src/services/broadcast/__tests__/broadcastTelemetryAnchorRace.integration.test.ts',
    owns: 'The ONLY integration test. describe.skip unless HAS_DB, so CI\'s Postgres job is the '
      + 'only place it runs' },
  { path: 'backend/src/services/broadcast/__tests__/broadcastPlaybackGrant.test.ts',
    owns: 'The grant expiry arithmetic, including the preview-beats-TTL rule' },
];

/** Feature flags. `where` is stat'ed; the note is what a future session needs to know. */
const FLAGS = [
  {
    name: 'BROADCAST_ENABLED',
    where: 'backend/src/services/broadcast/broadcastHealthLoop.ts',
    note: 'READ ONCE AT BOOT. Turning it on during a class means the health loop never '
      + 'schedules, nothing writes provider_health, and go_live refuses ProviderNotReady for the '
      + 'whole show. Needs a container recreate. This cost the 2026-10-20 airing.',
  },
  {
    name: 'BROADCAST_INPUT_STRATEGY',
    where: 'backend/src/services/broadcast/broadcastInputBinding.ts',
    note: 'How an occurrence is bound to a provider live input.',
  },
];

/** Every name here must appear in backend/src somewhere, or the runbook is lying. */
const ENVS = [
  { name: 'BROADCAST_ENABLED', purpose: 'Master flag. Read once at boot.' },
  { name: 'BROADCAST_INPUT_STRATEGY', purpose: 'Occurrence-to-input binding strategy.' },
  { name: 'CLOUDFLARE_ACCOUNT_ID', purpose: 'Provider account.' },
  { name: 'CLOUDFLARE_STREAM_TOKEN', purpose: 'Provider API credential.' },
  { name: 'CLOUDFLARE_STREAM_SUBDOMAIN',
    purpose: 'Interpolated into the playback URL as a PATH SEGMENT — validated for that reason.' },
  { name: 'CLOUDFLARE_STREAM_SIGNING_KEY_ID', purpose: 'Local signing key id.' },
  { name: 'CLOUDFLARE_STREAM_SIGNING_KEY_PEM', purpose: 'Local signing key. Never logged.' },
  { name: 'CLOUDFLARE_STREAM_LIVE_INPUT_UID', purpose: 'The live input.' },
  { name: 'CLOUDFLARE_MAX_TOKEN_LIFETIME_MS',
    purpose: 'Provider ceiling. An expiry beyond it throws rather than being clamped.' },
];

/** Symptom-first, because that is the order an incident arrives in. */
const FAILURES = [
  { symptom: 'go_live refuses: ProviderNotReady',
    cause: 'The health loop never scheduled — almost always the flag was turned on after boot',
    fix: 'Confirm BROADCAST_ENABLED was set BEFORE the container started; recreate and retry' },
  { symptom: 'go_live refuses: ContentNotStarted',
    cause: 'mark_content_started has not been issued',
    fix: 'Issue it. This is correct behavior — it bounds every viewer\'s free preview' },
  { symptom: 'The stream never starts in Zoom',
    cause: 'The host is not in the Zoom DESKTOP client, or not on the right account',
    fix: 'Switch clients. This is the 2026-10-29 failure, and no repo change fixes it' },
  { symptom: 'A viewer cannot watch',
    cause: 'Entitlement, before infrastructure. Note paid does NOT unlock private',
    fix: 'Check the access decision first, then whether a grant was issued at all' },
  { symptom: 'Audience count reads zero',
    cause: 'Either nobody watched or collection is broken — the system is built never to '
      + 'collapse those',
    fix: 'Distinguish zero from unknown, then check the player is calling the heartbeat' },
  { symptom: 'Video restarts on navigation',
    cause: 'Something moved the <video> out of the layout route; it is structurally impossible '
      + 'otherwise',
    fix: 'Restore it as a sibling of <Outlet/>; a test fails if an anchor self-links' },
  { symptom: 'The deck pace bar disagrees with the producer clock',
    cause: 'Two class clocks, by design today: localStorage vs content_started_at',
    fix: 'Trust content_started_at. Anything measuring the show must use it' },
  { symptom: 'A re-scheduled class does not air',
    cause: 'The airing was called off. That state is terminal and re-scheduling reports nothing',
    fix: 'Create a new session. There is no recovery path' },
  { symptom: 'A new admin export 401s',
    cause: 'A plain <a href> carries no Authorization; the admin JWT is attached by the api '
      + 'interceptor',
    fix: 'Fetch through api and save client-side' },
  { symptom: 'A replay will not play',
    cause: 'Replay bytes come from /bm/, not Cloudflare',
    fix: 'Check the recording binding and the grant separately' },
];

/**
 * FALSE LEADS. Not required by the bootstrap, and the highest-value part of this document for
 * L11.4's actual criterion: a session with no chat history will waste an hour on each of these.
 */
const TRAPS = [
  { thing: 'frontend/src/components/portal/broadcastLaunchCue.ts',
    looks: 'Sounds like it launches Claude or Claude Code from a prompt',
    is: 'The "we are live" chime and motion flourish — broadcast launch, not app launch. '
      + 'Synthesized with Web Audio, no asset. Nothing in the product launches a tool.' },
  { thing: 'P3-09 / P4-02 style keys in the source',
    looks: 'Stale internal naming somebody forgot to clean up',
    is: 'The 7-phase build plan\'s real task IDs, from '
      + 'docs/requirements/CLAUDE_CODE_COLABERRY_LIVE_7_PHASE_BUILD.md. A real traceability '
      + 'axis — do not rename them.' },
  { thing: 'A capability that is exported, tested, and seemingly complete',
    looks: 'Built',
    is: 'Possibly never called. FOUR shipped that way here. A unit test mocks its caller, so '
      + 'grep for a caller before believing a feature exists. DOC 11 grades all 28 claims.' },
  { thing: 'access_mode on broadcast_occurrences and broadcast_series',
    looks: 'The access tier the product uses',
    is: 'Declared and read by NOTHING. The tier is decided elsewhere.' },
  { thing: 'A green test suite before an airing',
    looks: 'Readiness',
    is: 'No end-to-end test touches a broadcast and the integration tier is one DB-gated file. '
      + 'The suite cannot see a missing caller.' },
];

/** The three recipes the bootstrap names. Every file in every step is stat'ed. */
const PROCEDURES = [
  {
    key: 'provider',
    title: 'How to add a new provider without breaking the provider-agnostic contract',
    why: 'The contract is that the backend decides WHO may watch and FOR HOW LONG, and the '
      + 'provider only mints a token for that instant. A second provider that decides its own '
      + 'expiry has broken it, even if every test passes.',
    steps: [
      { do: 'Read the existing adapter end to end first. Its header states the four decisions '
          + '(local signing, token-in-path, fail-closed, no fallback) and why each was made.',
        files: ['backend/src/services/broadcast/providers/cloudflareStreamProvider.ts'] },
      { do: 'Do NOT touch the expiry arithmetic. computeGrantExpiry stays the single place a '
          + 'deadline is decided; your adapter takes that instant as an INPUT.',
        files: ['backend/src/services/broadcast/broadcastPlaybackGrant.ts'] },
      { do: 'Validate every value you interpolate into a playback URL. In Cloudflare\'s scheme '
          + 'the token is a PATH SEGMENT, so an unvalidated uid or subdomain is a URL-shaped '
          + 'injection, not a cosmetic bug.',
        files: ['backend/src/services/broadcast/providers/cloudflareStreamProvider.ts'] },
      { do: 'Make every failure path THROW. No degraded URL, no unsigned URL, no longer-lived '
          + 'token. Prove each by reversing it in a test.',
        files: ['backend/src/services/broadcast/providers/__tests__'] },
      { do: 'Add the health path, and add a WIRING test that asserts something actually calls '
          + 'it. Four features here shipped complete and uncalled; a unit test cannot see that.',
        files: ['backend/src/services/broadcast/broadcastHealthLoop.ts',
          'backend/src/services/broadcast/__tests__/broadcastHealthLoop.wiring.test.ts'] },
      { do: 'Add the credentials as env vars only, document them in DOC 14\'s env table, and '
          + 'redact them in any log line that mentions them.',
        files: ['backend/.env.example'] },
    ],
  },
  {
    key: 'timeline',
    title: 'How to add a new Timeline interaction',
    why: 'THERE IS NO TIMELINE RUNTIME. Nothing advances on a clock and no producer command '
      + 'touches content, so "the timeline drives X" means "the presenter\'s keypress drives X '
      + 'when they reach the slide X was authored onto." Build accordingly, or build the runtime '
      + 'first — which is a governance-sized decision, not a feature.',
    steps: [
      { do: 'Author the new field on the run of show. It is static template data, persisted into '
          + 'live_sessions.kit_json.',
        files: ['backend/src/services/classKit/runOfShow.ts'] },
      { do: 'Decide what the single current-view row must carry. session_broadcast is '
          + '(session_id PK, state JSONB) and LAST WRITE WINS — there is no history and no '
          + 'per-viewer state.',
        files: ['backend/src/db/ensureLiveSessionSchema.ts'] },
      { do: 'Render it on BOTH phone surfaces or neither. The companion and the check-in page '
          + 'have drifted before; the pulse states now live in one shared module for that reason.',
        files: ['frontend/src/components/portal/CompanionDeck.tsx',
          'frontend/src/pages/portal/ClassCheckinPage.tsx',
          'frontend/src/components/portal/livePulse.ts'] },
      { do: 'Give it a READER before calling it done, and check the desktop card too — it '
          + 'currently renders three authored fields the phone does not.',
        files: ['frontend/src/components/portal/LivePromptCard.tsx'] },
      { do: 'If it must be measurable, key it on the AIRING, not the session. Eight tables key '
          + 'on session_id today and will merge across airings the day a session can hold two.',
        files: ['backend/src/db/ensureBroadcastSchema.ts'] },
    ],
  },
  {
    key: 'series',
    title: 'How to add a new show or series',
    why: 'A series is the show identity; an occurrence is one airing of one session. The '
      + 'constraint that matters is that a session holds AT MOST ONE occurrence, so "run it '
      + 'again" is a new session today, not a second airing.',
    steps: [
      { do: 'Add the series row. Note default_access_mode exists and NOTHING READS IT, so '
          + 'setting it changes no behavior today.',
        files: ['backend/src/db/ensureBroadcastSchema.ts'] },
      { do: 'Create the session, then enable live for it. Occurrence creation is idempotent by '
          + 'UNIQUE index rather than by convention.',
        files: ['backend/src/services/broadcast/broadcastSessionOccurrence.ts'] },
      { do: 'Check what discovery will show. A private occurrence must be OMITTED from '
          + 'ineligible discovery rather than shown-and-refused, which would leak its existence.',
        files: ['backend/src/services/broadcast/broadcastDiscovery.ts'] },
      { do: 'Do not rely on calling a class off and re-scheduling to fix a mistake. cancel is '
        + 'terminal, '
          + 'the session cannot be given another occurrence, and re-scheduling writes nothing '
          + 'and reports nothing to whoever did it.',
        files: ['backend/src/services/broadcast/broadcastStateMachine.ts'] },
    ],
  },
];

const TOTALS = (() => {
  const procFiles = PROCEDURES.reduce(
    (n, p) => n + p.steps.reduce((m, s) => m + s.files.length, 0), 0,
  );
  return {
    paths: PATHS.length + MODELS.length + ROUTES.length + TESTS.length,
    flags: FLAGS.length,
    envs: ENVS.length,
    failures: FAILURES.length,
    traps: TRAPS.length,
    procedures: PROCEDURES.length,
    procedureSteps: PROCEDURES.reduce((n, p) => n + p.steps.length, 0),
    procedureFiles: procFiles,
  };
})();

module.exports = {
  META, PATHS, MODELS, ROUTES, TESTS, FLAGS, ENVS, FAILURES, TRAPS, PROCEDURES, TOTALS,
};
