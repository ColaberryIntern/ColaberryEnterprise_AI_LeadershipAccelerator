/**
 * l114Sections — the nineteen sections bootstrap §3.1 requires of DOC 14, with their prose.
 *
 * Split from l114Data.js so the facts that get CHECKED (paths, flags, env vars, procedure steps)
 * live apart from the narrative that does not, and so neither file approaches the size ceiling.
 *
 * `heading` is transcribed from the bootstrap's own bullet list — the document that DEFINES the
 * deliverable — so the self-check runs requirement -> artifact. `table` names the generated block
 * that renders under the prose, or null where the section is narrative only.
 */

const SECTIONS = [
  {
    heading: 'Key code paths',
    table: 'PATHS',
    body: 'Read `broadcastStateMachine.ts` first. Its transition table encodes four rules that '
      + 'explain most of the rest of the system, and three of them are stated in its own header '
      + 'comment. After that, read entitlement, then the playback grant, then the provider '
      + 'adapter — in that order, because each takes the previous one\'s output as an input.',
  },
  {
    heading: 'Models',
    table: 'MODELS',
    body: 'Two tiers, and the split is the thing to understand. The **broadcast** tier is keyed '
      + 'on the airing; the **session** tier is keyed on the session. Eight session-tier tables '
      + 'carry participation and none of them key on the airing, which is safe today only '
      + 'because `uq_broadcast_source_ref` forbids a second occurrence. Relax that index and '
      + 'participation merges across airings silently.',
  },
  {
    heading: 'Services',
    table: 'PATHS',
    body: 'Thirty-four modules under `backend/src/services/broadcast/`. Every one takes an '
      + 'injected dependency bundle (`broadcastAccessDeps.ts`), which is why 1,200 unit tests '
      + 'run without a database and fast enough to use on every change. Keep that property: a '
      + 'service that reaches for a live connection makes its own tests slow and everyone '
      + 'else\'s flaky.',
  },
  {
    heading: 'Routes',
    table: 'ROUTES',
    body: 'Two route files. Note that the audience read shares the **command** rate limiter at '
      + '30/min, which was correct when it had no caller and is now a constraint: a naive 5s '
      + 'poll would put a viewer counter in competition with Go Live for the same budget. The '
      + 'client polls at 15s and only while on air; the route\'s own limiter is still the real '
      + 'fix. The route also answers 503 with no count when collection fails, by design, so it '
      + 'must stay a separate request from the lifecycle control.',
  },
  {
    heading: 'Flags',
    table: 'FLAGS',
    body: 'One of these two has cost an airing. Read its note before any rollout.',
  },
  {
    heading: 'Environment variables',
    table: 'ENVS',
    body: 'All of these live in the production environment only. **No secrets in source, in '
      + 'logs, in error messages or in commit history** — and any script that reads one redacts '
      + 'it in every log line that mentions it. If one is ever committed, treat it as '
      + 'compromised: rotate first, then clean history.',
  },
  {
    heading: 'Cloudflare adapter',
    table: null,
    body: 'The adapter\'s job is narrow on purpose: take the expiry instant the backend has '
      + 'already decided, and mint a provider token whose `exp` is that same instant. It decides '
      + 'no policy.\n\nFour decisions in it are worth knowing before you change anything. '
      + '**Signing is local, offline and synchronous** — the provider\'s own token endpoint is '
      + 'documented for testing or under 1,000 tokens/day and is rate-limited, while a '
      + '120-second TTL needs ~30 tokens per viewer per hour, so it is the wrong order of '
      + 'magnitude; a network round trip inside the grant path would also put a provider outage '
      + 'between a viewer and a video they have paid for. **The token is a path segment**, not a '
      + 'query parameter, which is why anything interpolated into the URL is validated. **Every '
      + 'failure throws** — there is no branch that returns a playable URL when something is '
      + 'missing. **And the ceiling is enforced**: an expiry beyond the provider\'s own maximum '
      + 'throws rather than being quietly clamped.',
  },
  {
    heading: 'Zoom integration',
    table: null,
    body: 'Zoom is the interactive production source and its custom RTMP output is the handoff '
      + 'into delivery. There is no Zoom code in this subsystem to maintain — the integration is '
      + 'a **configuration** that lives in the Zoom account and on the presenter\'s machine.\n\n'
      + 'That is exactly why it has been the program\'s most expensive open item. The account '
      + 'setting is enabled; the operator half — which client, signed in as whom, on what '
      + 'license — is not confirmed. On 2026-10-29 the host was signed in from something other '
      + 'than the Zoom **desktop client** and had no way to start the stream, so the intended '
      + 'first public airing did not stream at all. **No repository change can fix this and no '
      + 'ticket may claim it was verified from code.**\n\nOne operator fact that belongs wherever '
      + 'Zoom is discussed: **Zoom mute does not mute OBS.** A presenter who mutes to cough is '
      + 'still on the local recording master, and that master is what goes to the editor.',
  },
  {
    heading: 'Tests',
    table: 'TESTS',
    body: '1,208 tests across 73 suites, **99.6% of them unit tests**. One file is integration '
      + 'and no end-to-end test touches a broadcast.\n\n**Write the wiring test as well as the '
      + 'unit tests.** It reads the source and asserts the caller exists, and it is the only '
      + 'layer at which "nothing calls this" is visible at all. Four complete, well-tested '
      + 'features have shipped here with no caller, because a unit test mocks its caller. See '
      + 'DOC 11\'s proof register for which capabilities are actually proven, and by what.',
  },
  {
    heading: 'Mocks and fixtures',
    table: null,
    body: 'Dependencies are injected, so mocks are plain objects passed to a service rather than '
      + 'module-level patches — which is what keeps the suite fast and keeps a test from '
      + 'depending on import order.\n\nTwo fixture rules this subsystem learned the hard way. '
      + '**A fixture built by the code under test matches by construction** — if the fixture and '
      + 'the assertion come from the same function, the test passes whatever that function does, '
      + 'so use exported production rows for anything shaped like a projection. And **assert the '
      + 'SQL as text when behavior cannot see the difference**: `COUNT(DISTINCT enrollment_id)` '
      + 'and `COUNT(*)` agree on every fixture with one viewer per person and differ only when '
      + 'somebody opens a second tab, which is the case the design exists to get right.',
  },
  {
    heading: 'Deployment flow',
    table: null,
    body: '**Deploy only through `scripts/deploy-prod.sh`.** On the host, invoke it as '
      + '`bash scripts/deploy-prod.sh`. `DRY_RUN=1` is **not** honored, so there is no safe '
      + 'rehearsal mode — read the script before running it.\n\nFour things that have each gone '
      + 'wrong:\n\n- **Verify `HEAD` on the box equals `origin/main` first.** A dirty production '
      + 'tree rebuilds stale code and reports success.\n- **Never run two deploys '
      + 'concurrently.** Two `compose up` invocations race, and have produced Cloudflare 521s '
      + 'and a shared-Postgres OOM cascade.\n- **A 502 in the 60–90 seconds after a backend '
      + 'deploy is timing, not failure.** Wait before diagnosing.\n- **Production runs in '
      + 'registry mode**, so a deploy with no published image for `main`\'s tip silently '
      + 'no-ops — see *Safe rollback*.\n\nMerging is a human\'s click. Claude Code does not '
      + 'merge its own pull requests and does not close Basecamp tickets.',
  },
  {
    heading: 'Production verification',
    table: null,
    body: 'A deploy command\'s exit code is not verification. Check the live release.\n\n'
      + '**Validate controls both ways before believing a negative.** An unauthenticated probe '
      + 'of a new route returning 401 proves nothing on its own if `/api/health` and a '
      + 'deliberately bogus path also return 401 — then the probe discriminated nothing. A '
      + 'negative with no validated positive control is not evidence.\n\n**And probe from inside '
      + 'the container** for anything flag-gated: a dark flag answers 404 and an enabled one '
      + 'answers 401, while an unknown route also answers 401, so the three are only '
      + 'distinguishable from where the flag is actually read.',
  },
  {
    heading: 'Metrics and logs',
    table: null,
    body: 'Logs are JSON to stdout, captured by the container runtime, carrying a correlation id '
      + 'generated at the entry point and propagated through every downstream call and write. If '
      + 'a failure cannot be traced from symptom to root cause on one correlation id, the '
      + 'observability is incomplete.\n\nTwo traps specific to this subsystem. **The backend does '
      + 'not log request paths**, so grepping its logs for a route returns nothing while the '
      + 'route is being called — `accelerator-nginx` logs every request and is the control. And '
      + '**a measured zero and an unknown must never collapse**: the metrics dictionary treats a '
      + 'fabricated zero as a defect rather than a cosmetic issue, because it reads as "nobody '
      + 'watched" when the truth is "we do not know".',
  },
  {
    heading: 'Incident diagnosis',
    table: null,
    body: 'Work symptom first, and in this order.\n\n1. **Is the flag on, and was it on before '
      + 'boot?** This is the single commonest cause of an airing failing to start.\n2. **Is it '
      + 'entitlement or infrastructure?** They present identically to a viewer and are fixed in '
      + 'completely different places. Check the access decision before anything else.\n3. **Read '
      + 'nginx, not the backend**, for whether a request arrived at all.\n4. **Separate zero from '
      + 'unknown** in any number you are shown.\n5. **Then** read the occurrence\'s editorial '
      + 'state and `provider_health`.\n\nDuring an airing, prefer the degraded path over '
      + 'debugging: the class still runs in Zoom and OBS is still recording the master, so a '
      + 'delivery failure is not a lost session.',
  },
  {
    heading: 'Common failure modes',
    table: 'FAILURES',
    body: 'Every row here has happened or is a refusal the code deliberately makes. The '
      + 'refusals are not bugs — `ProviderNotReady` and `ContentNotStarted` are the system '
      + 'protecting an airing, and `paid` not unlocking `private` is the paywall working.',
  },
  {
    heading: 'Safe rollback',
    table: null,
    body: '**Production runs in registry mode, and registry mode cannot roll back.** A deploy '
      + 'resolves a published image for the target commit; if none exists for `main`\'s tip the '
      + 'deploy silently no-ops, and rolling *back* to an older commit needs `DEPLOY_MODE=build` '
      + 'so the image is built on the host instead of fetched. **Discovering this during an '
      + 'incident is the worst possible time**, which is why it is written here rather than left '
      + 'to be re-derived.\n\nThe ordinary path: redeploy the last known-good commit SHA with the '
      + 'same documented command. If the bad commit must not remain in history, `git revert` on '
      + '`main` and deploy that — a revert is a forward deploy and needs no mode change.\n\n'
      + '**Never blind-stash on the production host.** The stash stack is shared and another '
      + 'session\'s work may be on it.',
  },
  {
    heading: 'How to add a new provider without breaking the provider-agnostic contract',
    table: 'PROC:provider',
    body: null,
  },
  {
    heading: 'How to add a new Timeline interaction',
    table: 'PROC:timeline',
    body: null,
  },
  {
    heading: 'How to add a new show or series',
    table: 'PROC:series',
    body: null,
  },
];

module.exports = { SECTIONS };
