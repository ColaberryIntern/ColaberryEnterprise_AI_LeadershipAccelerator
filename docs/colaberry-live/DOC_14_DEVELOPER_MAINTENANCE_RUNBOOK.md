# DOC 14 — Colaberry Live: Developer & AI Maintenance Runbook

> Generated from `scripts/artifacts/tickets/l114Data.js` and `l114Sections.js`.
> **Do not hand-edit** — change the data and re-run
> `node scripts/artifacts/buildL114Artifacts.js`, which refuses to write if any path this
> runbook names has stopped existing.

| | |
|---|---|
| **Required by** | `docs/requirements/COLABERRY_LIVE_BASECAMP_BOOTSTRAP_v2.md` §3.1 |
| **Basecamp ticket** | L11.4 |
| **Owner** | Ali Muwwakkil |
| **Written** | 2026-11-07 |
| **Start here** | [DOC 00](DOC_00_READ_FIRST_AI_OPERATING_BRIEF.md) · the architecture is [DOC 11](DOC_11_SYSTEM_ARCHITECTURE_HANDBOOK.md) · the contract is [DOC 02](DOC_02_BROADCAST_ARCHITECTURE_AND_SECURITY_CONTRACT.md) · the diagrams are [DOC 12](DOC_12_ARCHITECTURE_DIAGRAMS.md) |

**This document is for a future Claude Code session or engineer with no chat history.** It assumes
you have read DOC 00 and nothing else.

**35 paths, 2 flags, 9 environment variables and
18 procedure-step file references are checked to exist on every build.** A
runbook that tells you to open a file that is gone teaches you to stop trusting it, which costs
more than the answer you came for.

## What is dated, and what is not

The paths, flags, variables and procedures above are checked mechanically, so they are true at
build time. **The state claims are not checkable the same way, and an airing is an event git
cannot show.** Checked 2026-11-07: nothing had touched
`backend/src/services/broadcast/` or `backend/src/services/classKit/` since 2026-11-03, and no
Colaberry Live airing is recorded in the repository. Absence of a commit is not proof an airing did
not happen — so treat state claims here as *what was checked on that date*, and re-derive from
[DOC 11](DOC_11_SYSTEM_ARCHITECTURE_HANDBOOK.md)'s proof register if it matters.

## False leads

**Read this before you start.** Each row is an hour a session with no chat history would otherwise
lose, and none of them is discoverable from the code alone.

| It looks like | You might assume | It actually is |
|---|---|---|
| frontend/src/components/portal/broadcastLaunchCue.ts | Sounds like it launches Claude or Claude Code from a prompt | The "we are live" chime and motion flourish — broadcast launch, not app launch. Synthesized with Web Audio, no asset. Nothing in the product launches a tool. |
| P3-09 / P4-02 style keys in the source | Stale internal naming somebody forgot to clean up | The 7-phase build plan's real task IDs, from docs/requirements/CLAUDE_CODE_COLABERRY_LIVE_7_PHASE_BUILD.md. A real traceability axis — do not rename them. |
| A capability that is exported, tested, and seemingly complete | Built | Possibly never called. FOUR shipped that way here. A unit test mocks its caller, so grep for a caller before believing a feature exists. DOC 11 grades all 28 claims. |
| access_mode on broadcast_occurrences and broadcast_series | The access tier the product uses | Declared and read by NOTHING. The tier is decided elsewhere. |
| A green test suite before an airing | Readiness | No end-to-end test touches a broadcast and the integration tier is one DB-gated file. The suite cannot see a missing caller. |

---

## Key code paths

Read `broadcastStateMachine.ts` first. Its transition table encodes four rules that explain most of the rest of the system, and three of them are stated in its own header comment. After that, read entitlement, then the playback grant, then the provider adapter — in that order, because each takes the previous one's output as an input.

| Path | What it owns |
|---|---|
| `backend/src/services/broadcast/` | The whole broadcast tier: 34 modules |
| `backend/src/services/broadcast/broadcastStateMachine.ts` | The transition table. READ THIS FIRST — four rules are encoded here |
| `backend/src/services/broadcast/broadcastEntitlement.ts` | The access decision, fail-closed. free / paid / preview / private |
| `backend/src/services/broadcast/broadcastPlaybackGrant.ts` | Grant expiry arithmetic — ONE place, deliberately |
| `backend/src/services/broadcast/providers/cloudflareStreamProvider.ts` | The only provider adapter. Turns an expiry instant into a signed token |
| `backend/src/services/broadcast/broadcastSessionOccurrence.ts` | Session to occurrence, and why idempotency is the database's job |
| `backend/src/services/broadcast/broadcastHealthLoop.ts` | Provider health polling. The flag-ordering trap lives here |
| `backend/src/services/broadcast/broadcastClipMarkerPolicy.ts` | The class clock and clip-label precedence |
| `backend/src/services/broadcast/broadcastDiscovery.ts` | What a given viewer is allowed to know is airing |
| `backend/src/services/broadcast/broadcastAccessDeps.ts` | The injected dependency bundle — why no unit test needs a database |
| `backend/src/services/classKit/runOfShow.ts` | The authored show as static template data |
| `backend/src/services/classKit/kitDeckScript.ts` | The presenter deck browser script, 653 lines. The instructor class clock |
| `frontend/src/components/portal/LiveMiniPlayer.tsx` | The persistent player |
| `frontend/src/components/portal/LivePromptCard.tsx` | The desktop prompt card — the only surface rendering pasteWhere/ccMode/rescue |
| `frontend/src/components/portal/CompanionDeck.tsx` | The phone companion |
| `frontend/src/components/portal/livePulse.ts` | The four pulse states, shared so the two surfaces cannot drift |
| `frontend/src/components/portal/ProducerStrip.tsx` | The producer controls |
| `frontend/src/components/portal/SessionChatPanel.tsx` | The Builder Room reader |
| `frontend/src/pages/portal/ClassCheckinPage.tsx` | THE HIGHEST-TRAFFIC LIVE SURFACE — where the room QR actually lands |
| `frontend/src/pages/portal/LiveSessionPage.tsx` | The desktop workspace |
| `frontend/src/routes/portalRoutes.tsx` | Portal routing, including the layout route |

---

## Models

Two tiers, and the split is the thing to understand. The **broadcast** tier is keyed on the airing; the **session** tier is keyed on the session. Eight session-tier tables carry participation and none of them key on the airing, which is safe today only because `uq_broadcast_source_ref` forbids a second occurrence. Relax that index and participation merges across airings silently.

| Path | What it owns |
|---|---|
| `backend/src/models/BroadcastOccurrence.ts` | One airing |
| `backend/src/models/LiveSession.ts` | The show definition, incl. kit_json |
| `backend/src/models/SessionPulse.ts` | Following / Building / Stuck / Finished |
| `backend/src/models/SessionChatMessage.ts` | The Builder Room thread |
| `backend/src/models/SessionChecklist.ts` | Per-session checklist state |
| `backend/src/models/SessionGate.ts` | Session gating |
| `backend/src/db/ensureBroadcastSchema.ts` | The 7 broadcast tables AND uq_broadcast_source_ref, the UNIQUE index that makes a session hold at most one airing |
| `backend/src/db/ensureLiveSessionSchema.ts` | The 12 session-tier tables. EIGHT of them key on the session, not the airing |

---

## Services

Thirty-four modules under `backend/src/services/broadcast/`. Every one takes an injected dependency bundle (`broadcastAccessDeps.ts`), which is why 1,200 unit tests run without a database and fast enough to use on every change. Keep that property: a service that reaches for a live connection makes its own tests slow and everyone else's flaky.

| Path | What it owns |
|---|---|
| `backend/src/services/broadcast/` | The whole broadcast tier: 34 modules |
| `backend/src/services/broadcast/broadcastStateMachine.ts` | The transition table. READ THIS FIRST — four rules are encoded here |
| `backend/src/services/broadcast/broadcastEntitlement.ts` | The access decision, fail-closed. free / paid / preview / private |
| `backend/src/services/broadcast/broadcastPlaybackGrant.ts` | Grant expiry arithmetic — ONE place, deliberately |
| `backend/src/services/broadcast/providers/cloudflareStreamProvider.ts` | The only provider adapter. Turns an expiry instant into a signed token |
| `backend/src/services/broadcast/broadcastSessionOccurrence.ts` | Session to occurrence, and why idempotency is the database's job |
| `backend/src/services/broadcast/broadcastHealthLoop.ts` | Provider health polling. The flag-ordering trap lives here |
| `backend/src/services/broadcast/broadcastClipMarkerPolicy.ts` | The class clock and clip-label precedence |
| `backend/src/services/broadcast/broadcastDiscovery.ts` | What a given viewer is allowed to know is airing |
| `backend/src/services/broadcast/broadcastAccessDeps.ts` | The injected dependency bundle — why no unit test needs a database |
| `backend/src/services/classKit/runOfShow.ts` | The authored show as static template data |
| `backend/src/services/classKit/kitDeckScript.ts` | The presenter deck browser script, 653 lines. The instructor class clock |
| `frontend/src/components/portal/LiveMiniPlayer.tsx` | The persistent player |
| `frontend/src/components/portal/LivePromptCard.tsx` | The desktop prompt card — the only surface rendering pasteWhere/ccMode/rescue |
| `frontend/src/components/portal/CompanionDeck.tsx` | The phone companion |
| `frontend/src/components/portal/livePulse.ts` | The four pulse states, shared so the two surfaces cannot drift |
| `frontend/src/components/portal/ProducerStrip.tsx` | The producer controls |
| `frontend/src/components/portal/SessionChatPanel.tsx` | The Builder Room reader |
| `frontend/src/pages/portal/ClassCheckinPage.tsx` | THE HIGHEST-TRAFFIC LIVE SURFACE — where the room QR actually lands |
| `frontend/src/pages/portal/LiveSessionPage.tsx` | The desktop workspace |
| `frontend/src/routes/portalRoutes.tsx` | Portal routing, including the layout route |

---

## Routes

Two route files. Note that the audience read shares the **command** rate limiter at 30/min, which was correct when it had no caller and is now a constraint: a naive 5s poll would put a viewer counter in competition with Go Live for the same budget. The client polls at 15s and only while on air; the route's own limiter is still the real fix. The route also answers 503 with no count when collection fails, by design, so it must stay a separate request from the lifecycle control.

| Path | What it carries |
|---|---|
| `backend/src/routes/broadcastRoutes.ts` | Producer commands, discovery, playback grants, telemetry heartbeat, audience read, clip list |
| `backend/src/routes/broadcastMediaRoutes.ts` | /bm/ — replay bytes off our own disk, range-capable |

---

## Flags

One of these two has cost an airing. Read its note before any rollout.

| Flag | Read in | What to know |
|---|---|---|
| BROADCAST_ENABLED | `backend/src/services/broadcast/broadcastHealthLoop.ts` | READ ONCE AT BOOT. Turning it on during a class means the health loop never schedules, nothing writes provider_health, and go_live refuses ProviderNotReady for the whole show. Needs a container recreate. This cost the 2026-10-20 airing. |
| BROADCAST_INPUT_STRATEGY | `backend/src/services/broadcast/broadcastInputBinding.ts` | How an occurrence is bound to a provider live input. |

---

## Environment variables

All of these live in the production environment only. **No secrets in source, in logs, in error messages or in commit history** — and any script that reads one redacts it in every log line that mentions it. If one is ever committed, treat it as compromised: rotate first, then clean history.

| Variable | Purpose |
|---|---|
| `BROADCAST_ENABLED` | Master flag. Read once at boot. |
| `BROADCAST_INPUT_STRATEGY` | Occurrence-to-input binding strategy. |
| `CLOUDFLARE_ACCOUNT_ID` | Provider account. |
| `CLOUDFLARE_STREAM_TOKEN` | Provider API credential. |
| `CLOUDFLARE_STREAM_SUBDOMAIN` | Interpolated into the playback URL as a PATH SEGMENT — validated for that reason. |
| `CLOUDFLARE_STREAM_SIGNING_KEY_ID` | Local signing key id. |
| `CLOUDFLARE_STREAM_SIGNING_KEY_PEM` | Local signing key. Never logged. |
| `CLOUDFLARE_STREAM_LIVE_INPUT_UID` | The live input. |
| `CLOUDFLARE_MAX_TOKEN_LIFETIME_MS` | Provider ceiling. An expiry beyond it throws rather than being clamped. |

---

## Cloudflare adapter

The adapter's job is narrow on purpose: take the expiry instant the backend has already decided, and mint a provider token whose `exp` is that same instant. It decides no policy.

Four decisions in it are worth knowing before you change anything. **Signing is local, offline and synchronous** — the provider's own token endpoint is documented for testing or under 1,000 tokens/day and is rate-limited, while a 120-second TTL needs ~30 tokens per viewer per hour, so it is the wrong order of magnitude; a network round trip inside the grant path would also put a provider outage between a viewer and a video they have paid for. **The token is a path segment**, not a query parameter, which is why anything interpolated into the URL is validated. **Every failure throws** — there is no branch that returns a playable URL when something is missing. **And the ceiling is enforced**: an expiry beyond the provider's own maximum throws rather than being quietly clamped.

---

## Zoom integration

Zoom is the interactive production source and its custom RTMP output is the handoff into delivery. There is no Zoom code in this subsystem to maintain — the integration is a **configuration** that lives in the Zoom account and on the presenter's machine.

That is exactly why it has been the program's most expensive open item. The account setting is enabled; the operator half — which client, signed in as whom, on what license — is not confirmed. On 2026-10-29 the host was signed in from something other than the Zoom **desktop client** and had no way to start the stream, so the intended first public airing did not stream at all. **No repository change can fix this and no ticket may claim it was verified from code.**

One operator fact that belongs wherever Zoom is discussed: **Zoom mute does not mute OBS.** A presenter who mutes to cough is still on the local recording master, and that master is what goes to the editor.

---

## Tests

1,208 tests across 73 suites, **99.6% of them unit tests**. One file is integration and no end-to-end test touches a broadcast.

**Write the wiring test as well as the unit tests.** It reads the source and asserts the caller exists, and it is the only layer at which "nothing calls this" is visible at all. Four complete, well-tested features have shipped here with no caller, because a unit test mocks its caller. See DOC 11's proof register for which capabilities are actually proven, and by what.

| Path | What it covers |
|---|---|
| `backend/src/services/broadcast/__tests__` | 640 tests, 40 suites. The service tier |
| `backend/src/services/broadcast/__tests__/broadcastHealthLoop.wiring.test.ts` | THE WIRING TEST. Reads the source and asserts server.ts actually CALLS the loop in live code. Tests its own comment stripper, because its first version passed with the call commented out |
| `backend/src/services/broadcast/__tests__/broadcastTelemetryAnchorRace.integration.test.ts` | The ONLY integration test. describe.skip unless HAS_DB, so CI's Postgres job is the only place it runs |
| `backend/src/services/broadcast/__tests__/broadcastPlaybackGrant.test.ts` | The grant expiry arithmetic, including the preview-beats-TTL rule |

---

## Mocks and fixtures

Dependencies are injected, so mocks are plain objects passed to a service rather than module-level patches — which is what keeps the suite fast and keeps a test from depending on import order.

Two fixture rules this subsystem learned the hard way. **A fixture built by the code under test matches by construction** — if the fixture and the assertion come from the same function, the test passes whatever that function does, so use exported production rows for anything shaped like a projection. And **assert the SQL as text when behavior cannot see the difference**: `COUNT(DISTINCT enrollment_id)` and `COUNT(*)` agree on every fixture with one viewer per person and differ only when somebody opens a second tab, which is the case the design exists to get right.

---

## Deployment flow

**Deploy only through `scripts/deploy-prod.sh`.** On the host, invoke it as `bash scripts/deploy-prod.sh`. `DRY_RUN=1` is **not** honored, so there is no safe rehearsal mode — read the script before running it.

Four things that have each gone wrong:

- **Verify `HEAD` on the box equals `origin/main` first.** A dirty production tree rebuilds stale code and reports success.
- **Never run two deploys concurrently.** Two `compose up` invocations race, and have produced Cloudflare 521s and a shared-Postgres OOM cascade.
- **A 502 in the 60–90 seconds after a backend deploy is timing, not failure.** Wait before diagnosing.
- **Production runs in registry mode**, so a deploy with no published image for `main`'s tip silently no-ops — see *Safe rollback*.

Merging is a human's click. Claude Code does not merge its own pull requests and does not close Basecamp tickets.

---

## Production verification

A deploy command's exit code is not verification. Check the live release.

**Validate controls both ways before believing a negative.** An unauthenticated probe of a new route returning 401 proves nothing on its own if `/api/health` and a deliberately bogus path also return 401 — then the probe discriminated nothing. A negative with no validated positive control is not evidence.

**And probe from inside the container** for anything flag-gated: a dark flag answers 404 and an enabled one answers 401, while an unknown route also answers 401, so the three are only distinguishable from where the flag is actually read.

---

## Metrics and logs

Logs are JSON to stdout, captured by the container runtime, carrying a correlation id generated at the entry point and propagated through every downstream call and write. If a failure cannot be traced from symptom to root cause on one correlation id, the observability is incomplete.

Two traps specific to this subsystem. **The backend does not log request paths**, so grepping its logs for a route returns nothing while the route is being called — `accelerator-nginx` logs every request and is the control. And **a measured zero and an unknown must never collapse**: the metrics dictionary treats a fabricated zero as a defect rather than a cosmetic issue, because it reads as "nobody watched" when the truth is "we do not know".

---

## Incident diagnosis

Work symptom first, and in this order.

1. **Is the flag on, and was it on before boot?** This is the single commonest cause of an airing failing to start.
2. **Is it entitlement or infrastructure?** They present identically to a viewer and are fixed in completely different places. Check the access decision before anything else.
3. **Read nginx, not the backend**, for whether a request arrived at all.
4. **Separate zero from unknown** in any number you are shown.
5. **Then** read the occurrence's editorial state and `provider_health`.

During an airing, prefer the degraded path over debugging: the class still runs in Zoom and OBS is still recording the master, so a delivery failure is not a lost session.

---

## Common failure modes

Every row here has happened or is a refusal the code deliberately makes. The refusals are not bugs — `ProviderNotReady` and `ContentNotStarted` are the system protecting an airing, and `paid` not unlocking `private` is the paywall working.

| Symptom | Usual cause | What to do |
|---|---|---|
| go_live refuses: ProviderNotReady | The health loop never scheduled — almost always the flag was turned on after boot | Confirm BROADCAST_ENABLED was set BEFORE the container started; recreate and retry |
| go_live refuses: ContentNotStarted | mark_content_started has not been issued | Issue it. This is correct behavior — it bounds every viewer's free preview |
| The stream never starts in Zoom | The host is not in the Zoom DESKTOP client, or not on the right account | Switch clients. This is the 2026-10-29 failure, and no repo change fixes it |
| A viewer cannot watch | Entitlement, before infrastructure. Note paid does NOT unlock private | Check the access decision first, then whether a grant was issued at all |
| Audience count reads zero | Either nobody watched or collection is broken — the system is built never to collapse those | Distinguish zero from unknown, then check the player is calling the heartbeat |
| Video restarts on navigation | Something moved the <video> out of the layout route; it is structurally impossible otherwise | Restore it as a sibling of <Outlet/>; a test fails if an anchor self-links |
| The deck pace bar disagrees with the producer clock | Two class clocks, by design today: localStorage vs content_started_at | Trust content_started_at. Anything measuring the show must use it |
| A re-scheduled class does not air | The airing was called off. That state is terminal and re-scheduling reports nothing | Create a new session. There is no recovery path |
| A new admin export 401s | A plain <a href> carries no Authorization; the admin JWT is attached by the api interceptor | Fetch through api and save client-side |
| A replay will not play | Replay bytes come from /bm/, not Cloudflare | Check the recording binding and the grant separately |

---

## Safe rollback

**Production runs in registry mode, and registry mode cannot roll back.** A deploy resolves a published image for the target commit; if none exists for `main`'s tip the deploy silently no-ops, and rolling *back* to an older commit needs `DEPLOY_MODE=build` so the image is built on the host instead of fetched. **Discovering this during an incident is the worst possible time**, which is why it is written here rather than left to be re-derived.

The ordinary path: redeploy the last known-good commit SHA with the same documented command. If the bad commit must not remain in history, `git revert` on `main` and deploy that — a revert is a forward deploy and needs no mode change.

**Never blind-stash on the production host.** The stash stack is shared and another session's work may be on it.

---

## How to add a new provider without breaking the provider-agnostic contract

**Why this contract exists.** The contract is that the backend decides WHO may watch and FOR HOW LONG, and the provider only mints a token for that instant. A second provider that decides its own expiry has broken it, even if every test passes.

1. Read the existing adapter end to end first. Its header states the four decisions (local signing, token-in-path, fail-closed, no fallback) and why each was made.
   `backend/src/services/broadcast/providers/cloudflareStreamProvider.ts`
2. Do NOT touch the expiry arithmetic. computeGrantExpiry stays the single place a deadline is decided; your adapter takes that instant as an INPUT.
   `backend/src/services/broadcast/broadcastPlaybackGrant.ts`
3. Validate every value you interpolate into a playback URL. In Cloudflare's scheme the token is a PATH SEGMENT, so an unvalidated uid or subdomain is a URL-shaped injection, not a cosmetic bug.
   `backend/src/services/broadcast/providers/cloudflareStreamProvider.ts`
4. Make every failure path THROW. No degraded URL, no unsigned URL, no longer-lived token. Prove each by reversing it in a test.
   `backend/src/services/broadcast/providers/__tests__`
5. Add the health path, and add a WIRING test that asserts something actually calls it. Four features here shipped complete and uncalled; a unit test cannot see that.
   `backend/src/services/broadcast/broadcastHealthLoop.ts` · `backend/src/services/broadcast/__tests__/broadcastHealthLoop.wiring.test.ts`
6. Add the credentials as env vars only, document them in DOC 14's env table, and redact them in any log line that mentions them.
   `backend/.env.example`

---

## How to add a new Timeline interaction

**Why this contract exists.** THERE IS NO TIMELINE RUNTIME. Nothing advances on a clock and no producer command touches content, so "the timeline drives X" means "the presenter's keypress drives X when they reach the slide X was authored onto." Build accordingly, or build the runtime first — which is a governance-sized decision, not a feature.

1. Author the new field on the run of show. It is static template data, persisted into live_sessions.kit_json.
   `backend/src/services/classKit/runOfShow.ts`
2. Decide what the single current-view row must carry. session_broadcast is (session_id PK, state JSONB) and LAST WRITE WINS — there is no history and no per-viewer state.
   `backend/src/db/ensureLiveSessionSchema.ts`
3. Render it on BOTH phone surfaces or neither. The companion and the check-in page have drifted before; the pulse states now live in one shared module for that reason.
   `frontend/src/components/portal/CompanionDeck.tsx` · `frontend/src/pages/portal/ClassCheckinPage.tsx` · `frontend/src/components/portal/livePulse.ts`
4. Give it a READER before calling it done, and check the desktop card too — it currently renders three authored fields the phone does not.
   `frontend/src/components/portal/LivePromptCard.tsx`
5. If it must be measurable, key it on the AIRING, not the session. Eight tables key on session_id today and will merge across airings the day a session can hold two.
   `backend/src/db/ensureBroadcastSchema.ts`

---

## How to add a new show or series

**Why this contract exists.** A series is the show identity; an occurrence is one airing of one session. The constraint that matters is that a session holds AT MOST ONE occurrence, so "run it again" is a new session today, not a second airing.

1. Add the series row. Note default_access_mode exists and NOTHING READS IT, so setting it changes no behavior today.
   `backend/src/db/ensureBroadcastSchema.ts`
2. Create the session, then enable live for it. Occurrence creation is idempotent by UNIQUE index rather than by convention.
   `backend/src/services/broadcast/broadcastSessionOccurrence.ts`
3. Check what discovery will show. A private occurrence must be OMITTED from ineligible discovery rather than shown-and-refused, which would leak its existence.
   `backend/src/services/broadcast/broadcastDiscovery.ts`
4. Do not rely on calling a class off and re-scheduling to fix a mistake. cancel is terminal, the session cannot be given another occurrence, and re-scheduling writes nothing and reports nothing to whoever did it.
   `backend/src/services/broadcast/broadcastStateMachine.ts`
