# DOC 11 — Colaberry Live: System Architecture Handbook

| | |
|---|---|
| **Required by** | `docs/requirements/COLABERRY_LIVE_BASECAMP_BOOTSTRAP_v2.md` §3.1 |
| **Basecamp ticket** | L11.1 |
| **Owner** | Ali Muwwakkil |
| **Written** | 2026-11-03, against the code at `origin/main` |
| **Audience** | **Ali and Piyush first**, then any developer or Claude Code session |
| **Start here** | DOC 00 · the contract is DOC 02 · the diagrams are DOC 12 (L11.2, not yet written) |

**This is the primary technical explanation of Colaberry Live.** It explains the whole system in
plain English first, then at technical depth, and it must be maintained as the architecture
changes.

---

## How to read this document

Every capability claim in this handbook carries a **proof level**, because L11.1's acceptance
criterion is that each one states whether it is proven by test or in production. The complete
register is below, and it is generated from a data module so that it cannot quietly disagree with
the prose.

**The reason the scale has four levels rather than two is measured, not stylistic.** DOC 15 counts
**1,208 tests across 73 suites, 99.6% of them unit tests** — and catalogues **four defects a green
suite did not catch**, every one a complete, well-tested unit that *nothing called*:

| Defect | What a green suite missed |
|---|---|
| **L4.6** | The heartbeat route shipped with no caller. A real 20-minute airing with two viewers recorded **zero** rows — not a low number, zero — while nginx logged 16 playback grants and 103 discovery polls from two distinct clients. Live and broken for five days. |
| **L7.1** | Occurrence creation shipped with no provider binding. The occurrence was real, correctly private, correctly roomed, correctly timed — and unplayable. |
| **L5.5** | `runProviderEvent` was exported, tested, and called by nothing. `provider_health` stayed permanently "unknown", so `go_live` always refused. |
| **L4.9** | The player never called the heartbeat endpoint. Every audience number for the first public airing would have been a confident zero — the precise failure L4.6 was built to prevent, shipped with that failure live. |

**A unit test mocks its caller, so a missing caller is invisible to it.** That is why "proven by
test" is a weaker statement than it sounds here, and why this handbook distinguishes it from
"wired" and from "proven in production".

---

## The whole system in plain English

Ali teaches a live class from a studio. He runs the class in **Zoom**, the way he always has —
that is where students speak and where he shares his screen. What is new is that Zoom's picture is
also pushed out to **Cloudflare**, which is a video delivery service, and Cloudflare serves it to
students **inside the Colaberry app** rather than in a Zoom window.

Why go to that trouble? Because once the video is inside Colaberry, everything else in Colaberry
can happen around it. A student watching on a laptop keeps the video playing while they click to
another page. A student can scan a QR code and use their phone as a second screen — tapping
"Building" or "Stuck", voting in a poll, copying the prompt Ali just dropped into Claude. None of
that is possible in a Zoom window.

**Three things are easy to confuse, and most confusion about this system comes from mixing them
up:**

- **The Session** is *what the show is* — the title, the time, who may watch, what gets built.
- **The Timeline** is *how the show runs* — the ordered list of segments, slides, prompts and
  polls.
- **The Broadcast Occurrence** is *this particular airing of it* — the thing that goes live,
  reconnects if the network drops, ends, and becomes a replay.

**The part that keeps the paywall honest** is worth understanding even if nothing else here is.
Colaberry never gives a student a video link that keeps working. It gives them a **120-second
pass**, signed by the server, and the player quietly asks for a new one before the old expires. If
a student is not entitled to watch, no pass is issued and there is nothing to share. A student on
a free preview gets a pass that expires when their preview window does, not when the 120 seconds
run out — so the preview cannot be extended by refreshing.

**What is honest to say about the current state:** the class runs, the video reaches real viewers,
and one private airing has happened. The deadline of October 31 passed without a public airing.
The biggest structural gap is that **nothing drives the show automatically** — the Timeline is
authored data, and the class advances when Ali presses a key. And **the paywall has never once
refused an actual person**, which is the single most consequential untested thing in the system.

---

## Capability proof register

<!-- BEGIN GENERATED: capability-proof-register -->

> Generated from `scripts/artifacts/tickets/l111Data.js`. **Do not hand-edit this section** —
> change the data module and re-run `node scripts/artifacts/buildL111Artifacts.js`. The build
> refuses if the table below and the data module disagree.

L11.1's acceptance criterion is that **every capability claim states whether it is proven by test
or in production.** Two levels are not enough to say that honestly here, and the reason is
measured: DOC 15 counts **1,208 tests across 73 suites, 99.6% of them unit tests**, and catalogs
**four defects a green suite did not catch** — every one a complete, well-tested unit that nothing
called. A unit test mocks its caller, so a missing caller is invisible to it.

| Level | Claims | What it means |
|---|---|---|
| **Proven in production** | 4 | Observed working, or observed failing, in a real airing. Four claims qualify and two of them are failures — which is why this level is the most informative and the rarest. |
| **Proven by test** | 14 | A unit or integration test pins the behavior. It does NOT prove anything calls it: see the four defects a green suite did not catch. |
| **Wired only** | 2 | A wiring test reads the source and asserts the caller exists. It proves a call is written, never that it works. Invented in this repo precisely because unit tests cannot see a missing caller. |
| **Unproven** | 8 | No test and no airing. Named explicitly rather than omitted, and each one says what would settle it. |

**4 of 28 claims have actually run in a real airing.
10 have never run at all** — 2 wired but unexercised, and
8 with no test and no airing.

| # | Capability claim | Proof | Anchor | Evidence |
|---|---|---|---|---|
| 1 | Signed playback grants are issued and renewed to real viewers | **Proven in production** | Airing of 2026-10-20 | The first private airing: nginx logged 16 playback grants from two distinct clients, which is renewal, not a single hand-out. |
| 2 | Discovery polling reaches real clients on the server-defined cadence | **Proven in production** | Airing of 2026-10-20 | The same airing: 103 discovery polls from two distinct clients. |
| 3 | Enabling the broadcast flag during a class leaves the health loop unscheduled, so go_live refuses for the whole show | **Proven in production** | Airing of 2026-10-20 | The flag is read once at boot. provider_health was never written, go_live refused with ProviderNotReady, and the provider event had to be hand-fed. |
| 4 | Zoom custom RTMP cannot be started from anything but the Zoom desktop client | **Proven in production** | Airing of 2026-10-29 | The intended first public airing did not stream: the host was signed in from something other than the desktop client and had no way to start the stream. |
| 7 | The lifecycle refuses every transition outside its table | **Proven by test** | `backend/src/services/broadcast/broadcastStateMachine.ts` | A table test keyed on Record<EditorialState, …>, so a ninth state cannot be dropped into the wrong bucket by default. |
| 8 | A called-off airing is terminal and names that as its own refusal reason | **Proven by test** | `backend/src/services/broadcast/broadcastSessionOccurrence.ts, backend/src/services/broadcast/broadcastStateMachine.ts` | Both the aired states and the called-off one used to answer already_aired — the single thing that is not true about a show called off before it ever aired, and a reason that sends whoever reads the log looking for a recording. Fixed and pinned 2026-11-01. |
| 9 | A preview grant is bounded by the preview deadline, not by the token TTL | **Proven by test** | `backend/src/services/broadcast/__tests__/broadcastPlaybackGrant.test.ts` | expiresAt = min(now + ttl, contentStartedAt + previewSeconds), so a viewer at minute fourteen gets a 60-second token rather than a 120-second one, and renewal recomputes from the deadline instead of extending the old expiry. |
| 10 | Every playback-grant failure path throws instead of returning a weaker URL | **Proven by test** | `backend/src/services/broadcast/providers/cloudflareStreamProvider.ts` | Each proven by reversing it: a missing credential, a bad uid, a bad subdomain, an expiry in the past, and an expiry beyond the provider's own 24-hour ceiling. |
| 11 | Entitlement is fail-closed, and paid status never unlocks a private cohort | **Proven by test** | `backend/src/services/broadcast/broadcastEntitlement.ts` | Layers free/paid/preview/private on the single existing definition of "has paid" rather than restating it. Money buys the paid tier, not membership of someone else's room. |
| 12 | A live session holds at most one broadcast occurrence | **Proven by test** | `backend/src/db/ensureBroadcastSchema.ts (uq_broadcast_source_ref)` | UNIQUE on (source_type, source_id) — idempotency is the database's job, not a convention. It is also why a session cannot be re-aired. |
| 13 | Clip markers pair into ranges on read, and the last clip of an airing has no end | **Proven by test** | `backend/src/services/broadcast/broadcastClipMarkerPolicy.ts, backend/src/services/broadcast/broadcastClipListExport.ts` | Markers are in-points only. The out point is the next marker's in point; for the last it is ended_at, which is null on a real row, so it is reported unknown rather than measured against now — which would grow the duration on every download. |
| 14 | The chat thread returns the newest messages and does not leak enrollment ids | **Proven by test** | `frontend/src/components/portal (SessionChatPanel), backend session chat route tests` | Both defects were invisible while nothing read the thread. limit with ORDER BY ASC returned the OLDEST hundred, so a class past a hundred lines would have shown a thread frozen on its first hour with no new message ever arriving. Fixed 2026-10-31. |
| 15 | Both phone surfaces offer the same four pulse states | **Proven by test** | `frontend/src/components/portal/livePulse.ts` | Imported by both surfaces so they cannot drift again, plus 25 tests on ClassCheckinPage — the first coverage that file has ever had. |
| 16 | Portal navigation cannot restart the video, and no watch control self-links | **Proven by test** | `frontend/src/routes/portalRoutes.tsx, frontend/src/components/portal` | The <video> is a sibling of <Outlet/> in the layout route, so it is literally the same DOM node across navigations. A test now fails if any anchor on the page points at its own route — the shipped "Watch now" button used to link to the page it was on. |
| 17 | Viewer counts count distinct people rather than rows | **Proven by test** | `backend/src/services/broadcast/__tests__/broadcastTelemetryQuery.test.ts` | Asserts the SQL as text, because COUNT(DISTINCT enrollment_id) and COUNT(*) agree on any fixture with one viewer per person and differ only when somebody opens a second tab — the case the design exists to get right. |
| 18 | A measured zero and an unknown never collapse into the same answer | **Proven by test** | `backend/src/services/broadcast/broadcastProducerState.ts, backend/src/services/broadcast/broadcastDiscovery.ts` | The metrics dictionary treats a fabricated zero as a defect rather than a cosmetic issue: it reads as "nobody watched" when the truth is "we do not know". |
| 19 | Concurrent telemetry writes do not corrupt the occurrence anchor | **Proven by test** | `backend/src/services/broadcast/__tests__/broadcastTelemetryAnchorRace.integration.test.ts` | A real race against Postgres, and the ONLY integration test in the subsystem. describe.skip unless HAS_DB, so CI's Postgres job is the only place it runs and it is silently skipped on every developer machine. |
| 20 | The player subtree has no WCAG 2 A/AA violations in either theme | **Proven by test** | `frontend/src/components/portal/__tests__/liveMiniPlayer.axe.test.tsx` | Sweeps the player subtree in light and dark. It is the only axe sweep in the subsystem. |
| 5 | The provider health loop is started by the server at boot | **Wired only** | `backend/src/services/broadcast/__tests__/broadcastHealthLoop.wiring.test.ts` | Asserts server.ts imports the loop, CALLS it in live code rather than in a comment, and guards the call in a try block. Its first version passed with the call commented out, which is why it tests its own comment stripper. |
| 6 | The player reports viewer heartbeats to the telemetry endpoint | **Wired only** | `frontend/src/components/portal (L4.9), backend/src/routes/broadcastRoutes.ts` | L4.9 wired it. Before that the route had no caller at all and a 20-minute airing with two viewers recorded zero rows in both telemetry tables. No airing has exercised the wiring since it landed. |
| 21 | Entitlement refuses a real un-entitled viewer | **Unproven** | — nothing to open — | The paywall is unit-tested and has never refused an actual person. L10.7, open and P0. This is the highest-consequence unproven claim in the system. **Settled by:** One paywalled airing in which a person without entitlement is refused and a person with it is admitted, both recorded. |
| 22 | What a viewer sees while the show is failing | **Unproven** | — nothing to open — | No test asserts the viewer-facing surface of any failure state. L10.4's failure drills are the plan and have not been run. **Settled by:** Test 5: all thirteen failure modes exercised, one record each saying how it was induced. A green suite is explicitly not evidence for that stage. |
| 23 | Reconnect recovers a live airing without restarting it | **Unproven** | — nothing to open — | The transition is tested, but the state could not be reached in production at all until the health loop was wired, so nothing has recovered a real airing. **Settled by:** An induced RTMP interruption during an airing, with the occurrence returning to live and viewers continuing without a restart. |
| 24 | Behavior under load or real concurrency | **Unproven** | — nothing to open — | The telemetry tables are designed to be bounded by concurrent tabs rather than by elapsed time, and that property has never been measured under load. **Settled by:** A load exercise at the planning scenario, or an airing large enough to produce the contention. |
| 25 | The path a viewer actually walks, end to end | **Unproven** | — nothing to open — | Zero end-to-end tests touch a broadcast. Eight Playwright flows exist and none opens a player, joins a room, votes in a poll or watches a replay — deliberate and recorded (#3346), but it means no test has ever walked a viewer's path. **Settled by:** One Playwright flow that opens a player against a seeded broadcast. |
| 26 | Accessibility of the companion, the producer strip and the replay list | **Unproven** | — nothing to open — | The axe sweep covers the player only. **Settled by:** An axe sweep over each of the three remaining surfaces, in both themes. |
| 27 | Replay processing failing cleanly to "aired, no replay" | **Unproven** | — nothing to open — | The transition is in the table and tested as a transition; no real airing has failed processing. **Settled by:** An induced replay-processing failure during Test 5, leaving the occurrence in ended rather than replay_ready. |
| 28 | YouTube distribution of any kind | **Unproven** | — nothing to open — | Nothing is built. Simulcast and the raw-replay retention policy are L8.1, open. **Settled by:** L8.1: a test or unlisted live event on the channel, plus the four-way retention policy recorded. |

<!-- END GENERATED: capability-proof-register -->

---

## System purpose

Colaberry Live exists to turn a live class into a **participation and conversion surface** rather
than a broadcast. The measure of success is the funnel, not the audience:

```
Watch → Participate → Prompt → Build → Save → $0 Colaberry Account → Community
      → Completed Artifact → Architect Progress
```

The requirements are explicit that success is **not** YouTube subscribers. An *Activated Architect*
has an account, at least one tracked build, and at least one submitted artifact. Full vision and
state in DOC 01.

---

## Major components

| Component | Where |
|---|---|
| **Zoom** | External. The interactive production source. |
| **OBS** | On Ali's workstation. Scene composition and the local recording master. |
| **Cloudflare Stream Live** | External. Ingests RTMP, packages HLS, serves it from its edge. |
| **Provider adapter** | `backend/src/services/broadcast/providers/cloudflareStreamProvider.ts` |
| **Broadcast services** | `backend/src/services/broadcast/` — 34 modules: state machine, entitlement, playback grants, discovery, health, telemetry, clip markers, replay, rundown |
| **Class Kit / run of show** | `backend/src/services/classKit/` — the authored show, plus the presenter deck |
| **Broadcast routes** | `backend/src/routes/broadcastRoutes.ts` (control, discovery, telemetry), `broadcastMediaRoutes.ts` (`/bm/` replay bytes) |
| **Portal player and surfaces** | `frontend/src/components/portal/` — persistent player, prompt card, poll, chat panel, pulse grid, producer strip |
| **Postgres** | Occurrences, participation, telemetry, clip markers |

---

## Responsibility of each component

The division that matters: **Zoom owns the room, Cloudflare owns the bytes, Colaberry owns the
decision about who may see them.**

| Component | Owns | Explicitly does not own |
|---|---|---|
| Zoom | The interactive room: student audio, screen share, Ali's camera feed into the stream | Access control, the audience record, the replay |
| OBS | Scene composition, the local MKV master for editing | Delivery of any kind |
| Cloudflare | RTMP ingest, HLS packaging, edge delivery, VOD recording | Who may fetch it — it enforces a token the backend mints |
| Provider adapter | Translating the backend's expiry decision into a provider token | Deciding the expiry |
| Broadcast services | Lifecycle, entitlement, grant expiry, discovery, health, telemetry | Rendering anything |
| Portal surfaces | Rendering, polling, viewer interaction | Any access decision |
| Postgres | The record of what aired and who participated | — |

---

## Session vs Timeline vs Broadcast Occurrence

| Concept | Meaning | Storage |
|---|---|---|
| **Accelerator Session** | The show definition | `live_sessions` |
| **Session Timeline** | The show rundown | `backend/src/services/classKit/runOfShow.ts`, persisted in `live_sessions.kit_json` |
| **Broadcast Occurrence** | One airing | `broadcast_occurrences` |

**A session holds at most one occurrence, by database constraint** — `uq_broadcast_source_ref`,
UNIQUE on `(source_type, source_id)`. The requirements say a session *can* have more than one; the
schema says it cannot. **That divergence is the most consequential requirement-versus-code gap in
the program**, and closing it requires re-keying eight participation tables from the session to the
airing *first*. Full treatment in DOC 03.

**There is no timeline runtime.** The only cursor in the system is `slide_index` in a
last-write-wins row `session_broadcast (session_id PK, state JSONB)`. Nothing advances it on a
clock — `broadcastStateMachine.ts:12` states the rule outright, *"NO transition here is driven by
the clock. Time cannot publish anything."* — and no producer command touches content. **The show
moves when the presenter presses a key.**

---

## Zoom responsibility

Zoom is the **interactive production source**. Students speak there, Ali shares there, and Zoom's
custom RTMP output is the handoff into the delivery path.

**Zoom's custom RTMP is the program's cheapest open blocker.** The account setting is enabled
(L1.1). The operator half — which client, signed in as whom, on what license — has never been
confirmed by the host seeing the menu item. On 2026-10-29 the host was signed in from something
other than the Zoom desktop client and **had no way to start the stream**, so the intended first
public airing did not stream. Ten minutes of Ali's time; no repository work substitutes.

One operator warning that belongs wherever Zoom is discussed: **Zoom mute does not mute OBS.** A
presenter who mutes himself to cough is still being recorded into the local master.

---

## Cloudflare Stream Live responsibility

Cloudflare ingests the RTMP, packages HLS, and serves it from its own edge. **The bytes never
touch the Colaberry server for a live stream**, which is the fact that shapes the whole security
model: the only thing Colaberry controls is *who may fetch it and for how long*.

Two provider-side decisions worth knowing before touching the adapter:

- **Signing is local, offline and synchronous.** Cloudflare's `POST /stream/{uid}/token` endpoint
  is documented for testing or under 1,000 tokens/day and is rate-limited. At a 120-second TTL one
  viewer needs ~30 tokens an hour and the 1,000-viewer scenario needs ~30,000 — the endpoint is
  the wrong order of magnitude, and a round trip inside the grant path would put a Cloudflare
  outage between a viewer and a video they have paid for.
- **The token is a path segment, not a query parameter** —
  `https://customer-<code>.cloudflarestream.com/<JWT>/manifest/video.m3u8`. This is why
  `assertSafeUid` and `assertSafeSubdomain` exist: anything interpolated into that URL is a path
  segment, so an unvalidated env var or uid is a URL-shaped injection rather than a cosmetic bug.

---

## Colaberry backend responsibility

The backend owns every decision and none of the bytes (for live). Specifically:

- **The lifecycle** — which transitions are legal, and refusing the rest.
- **Entitlement** — fail-closed, layered on the single existing definition of "has paid".
- **Grant expiry** — one piece of arithmetic, `min(now + ttl, contentStartedAt + previewSeconds)`,
  which decides the instant access ends for live *and* replay, so a deadline cannot drift between
  two code paths.
- **Discovery** — what a given viewer is allowed to know is airing. A private occurrence is
  *omitted*, not shown-and-refused, because shown-and-refused leaks its existence.
- **Provider health** — `go_live` is refused unless the provider is ready.
- **Telemetry** — the audience record, counted in distinct people rather than rows.
- **Replay** — bytes served from our own disk through `/bm/`, with range support.

---

## Playback grant and security model

| Rule | Detail |
|---|---|
| **No durable client media URL** | There is no unsigned URL, no "public unlisted" fallback, no degraded path. Every failure throws. |
| **120-second signed grant** | `GRANT_TTL_MS = 120_000`. Deliberately not `mediaStore`'s 15 minutes, which is sized for a different threat. |
| **HMAC-SHA256** | Over `key\|expiresAt`, digested `base64url`, mirroring `mediaStore.ts:199-224`. |
| **Renewal recomputes** | A renewal recalculates the deadline rather than extending the old expiry. |
| **The preview deadline beats the TTL** | A viewer at minute fourteen of a fifteen-minute preview gets a 60-second token, not a 120-second one. |
| **Access modes** | `free`, `paid`, `preview`, `private`. `preview` is a time-boxed grant, not a lesser kind of full. |
| **Paid never unlocks private** | Money buys the paid tier, not membership of someone else's room. |
| **`previewSecondsRemaining` is `null`, not `0`, before the clock starts** | Zero means the window closed; null means it has not opened. A client that conflates them shows the wrong thing to someone who arrived early. |

**The highest-consequence thing in this section is unproven.** Entitlement has never refused an
actual person (claim 21, L10.7, P0). Everything above is unit-tested and has never met a real
un-entitled viewer.

---

## Persistent player behavior

The `<video>` element is a **sibling of `<Outlet/>` in the layout route**, so it is literally the
same DOM node across portal navigations. Navigation cannot restart it — this is structural, not a
reconnection trick.

Discovery is **polling, on a server-defined cadence**, through one shared tab-level poller. Polling
rather than `EventSource` because portal auth is a Bearer JWT and `EventSource` cannot attach the
required header in the current design. That is a constraint, not a preference.

A fixed defect worth remembering: the laptop **"Watch now"** button used to link to the page it was
on. The page no longer reads `watch_url` at all; the watch control is `BroadcastWatchButton`, which
opens the in-app player and renders nothing when there is nothing to offer. A test now fails if any
anchor on the page points back at its own route.

---

## Phone companion behavior

The phone is a **second screen**, not a smaller first screen. Sticky video, every control at least
56px, and an optimistic pulse so a tap registers before the round trip. The four pulse states —
**Following / Building / Stuck / Finished** — now live in one module, `livePulse.ts`, imported by
both phone surfaces so they cannot drift again.

**Two things about the phone that are easy to get wrong:**

- **The room QR does not land on the companion deck.** `sessionPersistentUrl` resolves to
  `/portal/class-checkin/<sessionId>`, which polls companion state and renders polls and prompts
  itself. `/portal/live/<sessionId>/companion` is reached only by typing or linking it directly.
- **The desktop prompt card is *fuller* than the phone's.** Desktop is the only surface anywhere
  that renders `pasteWhere`, `ccMode` and `rescue`; the companion renders none of the three.

Phone chat, phone build, "Open in Claude" and "Save Claude Code version for later" are not built.
Full matrix in DOC 04.

---

## YouTube distribution behavior

**Nothing is built.** YouTube is reach and distribution; Colaberry stays authoritative for session,
access, participation, build progress, community, replay metadata and conversion. Simulcast hangs
off the same Zoom RTMP production source, so a YouTube outage must degrade reach without degrading
the class.

The raw-live retention policy is four dispositions, and the judgment is a human's: **strong** keep
public, **acceptable** evaluate after the edited version publishes, **poor technical quality**
unlisted, **sensitive or failed** private. Do not automatically delete every raw live and do not
automatically keep every raw live public. L8.1, open. Detail in DOC 07.

---

## Replay behavior

An airing ends, processes, and becomes a replay. `ended → processing → replay_ready` is the happy
path; **`processing → ended` is a legitimate transition meaning "aired, no replay"**, and it must
not be dressed up as `replay_ready`.

Replay differs from live in one important way: **replay bytes come off our own disk** through
`/bm/` (`broadcastMediaRoutes`), with range support so the player can seek. The same grant
arithmetic governs it, so the preview rule is enforced identically on both.

Recordings bind to occurrences (`broadcastRecordingBinding.ts`, `broadcast_source_refs` UNIQUE —
L8.4). **Replay metadata is lifecycle-only**: no chapters, no description, and nothing joins the
clip markers to the replay. Discovery and listing is L8.3, open.

---

## Community and Builder Room behavior

`SessionChatPanel` landed 2026-10-31 and is the **first reader the chat thread has ever had**.
Students had been writing into it for months and no student had ever read it.

Giving it a reader immediately exposed two defects that could not have been observed while nothing
read it: the response handed every classmate the author's `enrollment_id`, and `limit` with
`ORDER BY ASC` returned the **oldest** hundred messages, so a class past a hundred lines would have
shown a thread frozen on its first hour with no new message arriving. Both fixed and pinned.

**Still open: nothing reads `access_mode`.** Both `broadcast_occurrences.access_mode` and
`broadcast_series.default_access_mode` are declared and unreachable, which is why "Builder Room at
the agreed access tier" is unmet — and it has no ticket.

---

## Prompt Drop, Claude and Claude Code behavior

A prompt is authored onto a slide with `pasteWhere`, `ccMode`, `rescue`, `expectedResult` and
`stopCondition`. When the presenter reaches that slide, the prompt pushes to the companion state
that the phone polls every 2.5 seconds.

**Two gaps, and the second is the largest coverage hole in the program:**

- **A prompt fires on slide arrival and there is no control to drop one ad hoc** — the commonest
  live need.
- **Nothing launches anything.** The desktop card tells the viewer which tool and which mode, but
  `pasteWhere` and `ccMode` are free text authored per week ("Claude Code", "Plan Mode"), and
  guessing a destination from prose sends somebody to a chat window for a terminal exercise. **A
  real launch control needs the session builder to declare a tool mode**, which requirements §9
  asks for and the builder does not expose.

**Definition-of-done items 17 and 18 — the Claude pathway and the Claude Code desktop pathway —
have no Basecamp ticket at all.**

---

## Production and studio workflow

Ali teaches from a studio: Logitech MX Brio at eye level, FIFINE K688 on a BM88 boom 4–6 inches off
axis, an Elgato Key Light 30–45° to one side, and **wired** Cat6. OBS composes a teaching scene
from the display capture of the teaching monitor plus the camera, routes the K688 as audio input
and Zoom as application audio, and **disables global desktop audio and mic/aux to avoid duplicate
capture**. Records 1920×1080/30, hardware H.264, **MKV primary** to a local SSD, remuxed to MP4 for
sharing — MKV because it survives a crash mid-recording where MP4 does not.

**None of it is installed.** L6.2 (install and validate) and L6.3 (OBS scenes and Zoom audio
routing) are open and Piyush's, and together they are **the longest dependency chain on the
board** — they block Test 4, the operator manual (DOC 13) and five launch tickets. Full requirement
in DOC 05.

---

## Failure and reconnect behavior

| Failure | Behavior |
|---|---|
| **RTMP drops mid-class** | `live → reconnecting → live` preserves occurrence identity. **Reconnect is not a restart.** The auto-end window has hysteresis so a brief drop does not end the show. |
| **Replay processing fails** | `processing → ended` — "aired, no replay". The local OBS master is the recovery path for the edit. |
| **Provider not ready** | `go_live` refuses with `ProviderNotReady`. Correct, and the commonest cause is the flag-ordering trap below. |
| **Content not started** | `go_live` refuses with `ContentNotStarted`, because going live without the anchor would leave every viewer's preview window unbounded. |
| **Cloudflare unavailable** | **No fallback that serves media.** Do not improvise an unsigned or public-unlisted URL — that is how a paywall is given away permanently. Fail closed, tell the room, continue in Zoom. |
| **Audience collection fails** | The audience route answers **503 with no count, by design**. It is a separate request from the lifecycle control precisely so the control survives it. |
| **Cancel pressed by mistake** | **No recovery.** `cancelled` is terminal, the session cannot be given a second occurrence, and re-scheduling writes nothing and reports nothing. Create a new session. |

> **The flag-ordering trap.** `broadcastHealthLoop` reads `BROADCAST_ENABLED` **once at boot** and
> schedules nothing when it is off. Turning it on during a class means the health loop never runs,
> nothing writes `provider_health`, and `go_live` refuses for the whole show. **That is what
> happened on 2026-10-20.** Enable the flag and restart *before* an airing, never during one.

**What is unproven here matters as much as what is built:** no test asserts what a viewer *sees*
during any failure (claim 22), and nothing has recovered a real airing from `reconnecting`
(claim 23).

---

## Post-live media workflow

One airing is supposed to become fifteen outputs. **Two of the fifteen exist.**

The one real brick is clip markers, which got their reader on 2026-11-01 — `SessionClipList` on
the Class Kit plus a CSV export. Four things it taught, all of which are planning input rather
than closed history:

- **A marker is a start point and an editor needs a range.** The out point is the next marker's in
  point; for the last marker it is `ended_at`, which is null on a real row, so the last clip
  legitimately has no end and is reported unknown rather than measured against `now`.
- **Every slide advance writes a marker, so most rows are not clip candidates.** A 38-minute class
  produces dozens and a handful are worth cutting. Handing an editor forty undifferentiated rows
  leaves him scrubbing the video — the precise cost the feature exists to remove.
- **A plain `<a href>` export would 401.** The admin JWT lives in `localStorage` and is attached by
  the `api` interceptor, so an anchor straight to the CSV route carries no `Authorization`.
- **The deck's own `M` key writes to an in-memory array lost on tab close**, so the markers an
  instructor *deliberately* sets are the ones most likely to be lost.

**The first real decision in R7** is whether the write path learns to distinguish an authored moment
from an ordinary advance, or the handoff carries a ranked shortlist. Not made yet. Full requirement
in DOC 07.

---

## Environment and configuration dependencies

| Variable | Purpose |
|---|---|
| `BROADCAST_ENABLED` | Master flag. **Read once at boot** — see the flag-ordering trap. |
| `BROADCAST_INPUT_STRATEGY` | How an occurrence is bound to a provider input |
| `CLOUDFLARE_ACCOUNT_ID` | Provider account |
| `CLOUDFLARE_STREAM_TOKEN` | Provider API credential |
| `CLOUDFLARE_STREAM_SUBDOMAIN` | Interpolated into the playback URL — validated, because it is a path segment |
| `CLOUDFLARE_STREAM_SIGNING_KEY_ID` | Local signing key id |
| `CLOUDFLARE_STREAM_SIGNING_KEY_PEM` | Local signing key |
| `CLOUDFLARE_STREAM_LIVE_INPUT_UID` | The live input |
| `CLOUDFLARE_MAX_TOKEN_LIFETIME_MS` | Provider ceiling; an expiry beyond it throws |
| `DATABASE_URL` | Postgres |

**No secrets in source, in logs, in error messages or in commit history.** Cloudflare and Zoom
credentials live in the production environment only. Every script that reads a secret redacts it in
any log line that references it.

---

## Key database records and relationships

**Broadcast tier** (`ensureBroadcastSchema.ts`):

| Table | Holds |
|---|---|
| `broadcast_series` | The show identity; `default_access_mode` — **declared and unread** |
| `broadcast_occurrences` | One airing: editorial state, `content_started_at`, `ended_at`, `access_mode` — **also unread** |
| `broadcast_source_refs` | `(source_type, source_id)` **UNIQUE** → the occurrence. This is why a session holds at most one airing. |
| `broadcast_clip_markers` | One in-point per slide advance, occurrence-keyed |
| `broadcast_viewer_sessions` | Telemetry: one row per viewing session |
| `broadcast_viewer_people` | Telemetry: distinct people, which is why counts are people rather than tabs |
| `broadcast_occurrence_metrics` | Rolled-up per-airing metrics |

**Session tier** (`ensureLiveSessionSchema.ts`) — `live_sessions` plus `attendance_records`,
`session_chat_messages`, `session_checklists`, `session_pulse`, `session_broadcast`,
`session_poll_responses`, `session_guests`, `session_guest_poll_responses`,
`session_raffle_winners`, `session_presence_events`, `session_gates`.

> **The keying mismatch, stated once and clearly.** Clip markers are **occurrence**-keyed.
> Participation is **session**-keyed — eight of those tables. Today they are 1:1 because the UNIQUE
> index forbids a second occurrence. **The day that constraint is relaxed, participation merges
> across both airings silently.** Occurrence-keying participation is therefore work that lands
> *before* re-airing is supported, not after.

---

## Main routes, services and files

**Routes**

| Route file | Carries |
|---|---|
| `backend/src/routes/broadcastRoutes.ts` | Producer commands, discovery, playback grants, telemetry heartbeat, audience read, clip list |
| `backend/src/routes/broadcastMediaRoutes.ts` | `/bm/` — replay bytes, range-capable |

**The services most worth reading first**, in the order a newcomer should read them:

| File | Why first |
|---|---|
| `broadcastStateMachine.ts` | The transition table and the four rules it encodes. Start here. |
| `broadcastEntitlement.ts` | The access decision, fail-closed |
| `broadcastPlaybackGrant.ts` | The expiry arithmetic — one place, deliberately |
| `providers/cloudflareStreamProvider.ts` | How the expiry becomes a provider token |
| `broadcastSessionOccurrence.ts` | Session → occurrence, and why idempotency is the database's job |
| `broadcastHealthLoop.ts` | The flag-ordering trap lives here |
| `broadcastClipMarkerPolicy.ts` | The class clock, and label precedence |
| `broadcastDiscovery.ts` | What a viewer may know is airing |

**Frontend**: `frontend/src/components/portal/` (persistent player, `LivePromptCard`,
`SessionChatPanel`, `PulseGrid`, `livePulse.ts`, producer strip, `CompanionDeck`),
`frontend/src/routes/portalRoutes.tsx`, `ClassCheckinPage.tsx` (the highest-traffic live surface).

**Show authoring**: `backend/src/services/classKit/runOfShow.ts`, `classKit/kitDeckScript.ts`.

---

## Operational ownership

| Area | Owner |
|---|---|
| Product decisions, final approval, technical ownership, deploys | **Ali Muwwakkil** |
| Studio, OBS, camera/audio/lighting, avatar and voice, recording quality, the operator manual | **Piyush Prajapati** |
| YouTube, distribution, campaigns, audience growth | **Sohail Syed** |
| Creative, UI/UX, broadcast graphics, visual review | **Mohammed Abdul Aleem** |
| Lifecycle, entitlement, grants, telemetry, documentation | Claude Code sessions, under DOC 00's rules |

**Claude Code does not close Basecamp tickets and does not merge its own pull requests.** Work a
ticket to a review state, post the evidence, and stop.

---

## Known limitations

Named explicitly rather than omitted, because a handbook that only describes the design is
unusable for planning.

| Limitation | Consequence |
|---|---|
| **No timeline runtime** | Thirteen DOC 03 requirements degrade to "the presenter pressed a key". One missing piece of infrastructure, not four UI gaps. |
| **A session cannot be re-aired** | No second cohort, no second chance after a cancellation. Needs eight tables re-keyed first. |
| **Cancel is a one-way door** | One confirmed click permanently retires a class; re-scheduling is accepted, writes nothing, and reports nothing. |
| **Nothing reads `access_mode`** | Builder Room access tier unmet; the field is declared and unreachable. |
| **No build-progress model** | Breaks the middle of the conversion funnel; two DOC 04 rows depend on it. |
| **No Claude / Claude Code launch pathway** | Definition-of-done items 17 and 18 — and neither has a ticket. |
| **No broadcast graphics layer** | Nothing to configure, author or cue. |
| **Replay metadata is lifecycle-only** | Clip markers and the replay do not know about each other. |
| **Two class clocks that never meet** | The instructor's `localStorage` anchor and `content_started_at` can disagree by any amount. Anything measuring the show must use `content_started_at`. |
| **Audience read shares the command rate limiter** | 30/min, shared with Go Live. Handled in the client at 15s; the route is unchanged. |
| **One integration test, zero end-to-end tests** | 99.6% unit. The four defects above are what that buys. |
| **The paywall has never refused a person** | L10.7, P0. The most consequential unproven claim here. |

---

## Troubleshooting entry points

Start at the symptom.

| Symptom | Look here first |
|---|---|
| **`go_live` refuses with `ProviderNotReady`** | Was `BROADCAST_ENABLED` on *before* the container started? The health loop reads it once at boot. Then `provider_health` on the occurrence. |
| **`go_live` refuses with `ContentNotStarted`** | `mark_content_started` has not been issued. This is correct behavior — it bounds the preview window. |
| **The stream never starts in Zoom** | The host must be in the **Zoom desktop client**, signed in on the right account. Claim 4. This is the 2026-10-29 failure. |
| **A viewer cannot watch** | Check entitlement before infrastructure. `paid` does not unlock `private` — that is correct, not a bug. Then whether a grant was issued at all. |
| **Video restarts on navigation** | It should be structurally impossible; the `<video>` is a sibling of `<Outlet/>`. If it happens, something has moved the element out of the layout route. |
| **Audience count is zero** | Distinguish zero from unknown — the system is built never to collapse them. Then check that the player is calling the heartbeat (claim 6 is wired, not production-proven). |
| **The deck's pace bar disagrees with the producer clock** | Two clocks, by design today. `content_started_at` is the trustworthy one. |
| **A replay will not play** | Replay bytes come from `/bm/`, not Cloudflare. Check the recording binding and the grant separately. |
| **A re-scheduled class does not air** | Was the occurrence cancelled? `cancelled` is terminal and re-scheduling reports nothing. |
| **A new admin export 401s** | The admin JWT is attached by the `api` interceptor; a plain `<a href>` carries no `Authorization`. |

**For anything not here:** DOC 02 is the contract, DOC 08 is the incident fallback and launch
checklist, `docs/broadcast/ROLLOUT_RUNBOOK.md` has the operational levers, and
`directives/go-live-colaberry-live-broadcast.md` is the airing procedure.
