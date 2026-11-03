# DOC 02 — Broadcast Architecture & Security Contract

| | |
|---|---|
| **Required by** | `docs/requirements/COLABERRY_LIVE_BASECAMP_BOOTSTRAP_v2.md` §3.1, §8 |
| **Basecamp ticket** | L11.8 |
| **Owner** | Ali Muwwakkil |
| **Written** | 2026-11-03, against the code at `origin/main` |
| **Start here** | DOC 00 |

**This is a contract, not a description.** Everything below is enforced in code and pinned by tests.
Breaking any of it is a security regression, not a refactor. Where the code and the requirements
diverge, the divergence is named rather than smoothed over — the code wins on what the system does,
and the requirements win on what it must become.

The system-level handbook is DOC 11 (not yet written, L11.1); the diagrams are DOC 12 (L11.2). This
document is the contract those two must not contradict.

---

## Approved architecture

```
Zoom → RTMP → Cloudflare Stream Live → HLS → signed/expiring playback → Colaberry persistent player
```

- **Zoom is the interactive production source.** Students speak, Ali shares, the room happens here.
- **Cloudflare Stream Live is the public and in-app delivery layer.** It packages HLS and serves it
  from its own edge.
- **YouTube is a distribution output, not the source of truth.**

Colaberry remains authoritative for session, broadcast occurrence, access, prompts, participation,
build progress, community, replay metadata and Architect conversion.

**Live and replay differ in one way that drives the whole playback design.** Replay serves MP4 bytes
off our own disk through `/bm/` (`broadcastMediaRoutes`). Live cannot: the bytes never touch our
server. So for live, the only thing we control is **who may fetch the stream and for how long** —
which is exactly what the playback grant does, and nothing else.

---

## Canonical lifecycle

The requirements state the happy path:

```
scheduled → backstage → live → reconnecting → ended → processing → replay_ready
```

plus `cancelled`, and `processing → ended` must be allowed when replay processing fails.

**The implemented transition table is that, plus four edges the requirements do not mention**
(`backend/src/services/broadcast/broadcastStateMachine.ts`):

| From | May go to |
|---|---|
| `scheduled` | `backstage`, **`live`**, `cancelled` |
| `backstage` | `live`, **`scheduled`**, `cancelled` |
| `live` | `reconnecting`, `ended`, `cancelled` |
| `reconnecting` | `live`, `ended`, `cancelled` |
| `ended` | `processing` |
| `processing` | `replay_ready`, **`ended`** |
| `replay_ready` | — terminal |
| `cancelled` | — terminal |

```
TERMINAL_STATES = ['replay_ready', 'cancelled']
```

Four rules the table encodes, each of which has cost something to learn:

1. **`processing → ended` means "aired, no replay".** That is a real outcome and must not be
   dressed up as `replay_ready`.
2. **Reconnect is not a restart.** `live → reconnecting → live` preserves occurrence identity.
3. **No transition is driven by the clock.** `broadcastStateMachine.ts:12`: *"NO transition here is
   driven by the clock. Time cannot publish anything."* A scheduled start time or an arbitrary
   webhook must not publish backstage content — `go_live` is refused unless `provider_health` says
   the provider is ready. **This is why flag ordering matters** (see *Operational safety*).
4. **`cancelled` is terminal with an empty outbound list, and that makes "Cancel this airing" a
   one-way door.** Combined with the UNIQUE source-ref index below, one confirmed click permanently
   retires a class from Colaberry Live. The producer is warned before and after the click, and the
   refusal names `cancelled` as its own reason rather than the false `already_aired`. Whether a
   cancelled class should be able to go back on air is an **open product decision** — both candidate
   designs cross a governance boundary.

**Occurrence identity is a database guarantee, not a convention.** `uq_broadcast_source_ref` is
UNIQUE on `(source_type, source_id)` (`ensureBroadcastSchema.ts:168-169`), so a live session holds
**at most one** occurrence. Every session-to-occurrence lookup in the backend goes through that ref.
A session therefore cannot be re-aired, and participation and clip markers are 1:1 for every airing
that exists.

> **A precondition to record before it bites.** The day a session is allowed to hold two
> occurrences, participation merges across both airings silently, because eight tables key on the
> session and none key on the airing: `attendance_records`, `session_pulse`,
> `session_chat_messages`, `session_poll_responses`, `session_broadcast`, `session_guests`,
> `session_guest_poll_responses`, `session_raffle_winners`. Occurrence-keying participation has to
> land **before** re-airing is supported, not after someone notices two classes sharing one
> attendance roll.

---

## Access modes

```
free | paid | preview | private
```

`backend/src/services/broadcast/broadcastEntitlement.ts` layers this dimension on top of the single
existing definition of "has paid" in the codebase. It does not restate the paid rule — there is
exactly one definition, and this module consults it.

What a viewer gets is a separate axis from the mode: `full | preview | denied`. **`preview` is a
time-boxed grant, not a lesser kind of full.**

**The rule that is easiest to get wrong, stated in the module's own header: paid status never
unlocks a private cohort.** Money buys the paid tier, not membership of someone else's room.

**Access must remain fail-closed, on every path.** Failing open on a paid broadcast gives the
content away to everyone, permanently and irreversibly, for the duration of the airing. Two
consequences for anyone changing this code:

- **Every change near entitlement must be tested for the unauthenticated and un-entitled caller**,
  not only the happy path. A route that passes its happy-path tests but does not test "what happens
  when an unauthenticated user calls this" is incomplete.
- **A private occurrence must be omitted from ineligible discovery** — not shown-and-refused, which
  leaks its existence.

`previewSecondsRemaining` returns `null` when the clock has not started — **deliberately not `0`**,
because zero means "the window closed" and null means "the window has not opened", and a client that
conflates them shows the wrong thing to a viewer who arrived early.

---

## Playback contract

Enforced in `backend/src/services/broadcast/broadcastPlaybackGrant.ts` and
`providers/cloudflareStreamProvider.ts`.

| Rule | Detail |
|---|---|
| **No durable client media URL** | The client never holds a URL that keeps working. There is no unsigned URL, no "public unlisted" fallback, no degraded path. |
| **Short-lived signed grant** | `GRANT_TTL_MS = 120_000` — 120 seconds. Deliberately not `mediaStore`'s 15 minutes, which is sized for a different threat. |
| **HMAC-SHA256** | `createHmac('sha256', signingSecret(env))` over the string `key\|expiresAt`, digested `base64url` — mirroring `mediaStore.ts:199-224`. |
| **Renewal during playback** | The client renews; renewal **recomputes** the deadline rather than extending the old one. |
| **The preview deadline beats the TTL** | `expiresAt = min(now + ttl, contentStartedAt + previewSeconds)`. A viewer at minute fourteen of a fifteen-minute preview gets a 60-second token, not a 120-second one. **One piece of arithmetic decides the instant access ends, for live and for replay both**, so there is no second place a deadline can drift. |
| **Range-capable replay transport** | Replay serves bytes with range support; the player seeks without re-downloading. |
| **Persistent app-level player** | The `<video>` survives portal navigation — it is a sibling of `<Outlet/>` in the layout route, so it is literally the same DOM node. |
| **Polling-based active discovery** | One shared tab-level poller on a **server-defined cadence**. Polling rather than `EventSource` because portal auth is a Bearer JWT and `EventSource` cannot attach the required header in the current design. This is a constraint, not a preference. |

**Provider-side specifics worth knowing before touching the Cloudflare adapter:**

- **Signing is local, offline and synchronous.** Cloudflare's `POST /stream/{uid}/token` endpoint is
  documented as being for testing or under 1,000 tokens/day and is rate-limited. At a 120-second
  TTL, one viewer needs ~30 tokens an hour and the 1,000-viewer planning scenario needs ~30,000 —
  the endpoint is the wrong order of magnitude. A network round trip inside the grant path would
  also put a Cloudflare outage between a viewer and a video they have paid for.
- **The token is a path segment, not a query parameter.**
  `https://customer-<code>.cloudflarestream.com/<JWT>/manifest/video.m3u8`. This is why
  `assertSafeUid` and `assertSafeSubdomain` exist: anything interpolated into that URL is a path
  segment, so an unvalidated env var or uid is a URL-shaped injection, not a cosmetic bug.
- **Every failure path throws.** A missing credential, a bad uid, a bad subdomain, an expiry in the
  past and an expiry beyond Cloudflare's own 24-hour ceiling all throw. No branch in that file
  returns a playable URL when something is missing or malformed.

---

## Live delivery provider

**Cloudflare Stream Live**, implemented behind the provider adapter at
`backend/src/services/broadcast/providers/cloudflareStreamProvider.ts`.

**The provider abstraction is not optional and selecting Cloudflare did not retire it.** The
requirements are explicit: *"Do not rip it out because Cloudflare was selected. Cloudflare must be
implemented behind the provider adapter."* The grant contract takes the expiry instant as an
**input** from `computeGrantExpiry` and mints a provider token with the same `exp`; it does not
decide policy. A second provider must be addable without touching entitlement, grants or the state
machine.

---

## What must be preserved

The requirements (§8) list this subsystem's invariants. Any change that breaks one of these is a
regression even if every test still passes, because some of these are not yet covered by tests:

- first-class Broadcast Occurrence;
- the lifecycle state machine;
- fail-closed entitlement;
- private occurrences omitted from ineligible discovery;
- short-lived signed playback;
- playback credential renewal;
- Range-capable replay transport;
- the persistent app-level video player;
- the shared tab-level discovery poller;
- the server-defined polling cadence;
- the current security fixes;
- the current metrics dictionary, test matrix and ADRs where applicable.

**Before implementing any ticket, inspect what is already built.** The requirements say this twice,
and in this subsystem specifically it has been load-bearing: four separate features were complete
server-side with *no reader*, which is indistinguishable from "not built" when read off a ticket
title. `broadcastClipListController.ts:10-14` names the pattern as recurring here. **An unread
feature is not half-working, it is unmeasured** — and in all three closed cases, the act of giving
one a reader is what exposed what was wrong with it.

---

## Operational safety

- **`BROADCAST_ENABLED` is read once at boot.** `broadcastHealthLoop.ts` reads the flag at startup
  and schedules nothing when it is off. Turning it on during a class means the health loop never
  runs, nothing writes `provider_health`, and `go_live` refuses with `ProviderNotReady`. **Enable
  the flag and restart before an airing, never during one.** This is what happened on 2026-10-20.
- **Deploy only through `scripts/deploy-prod.sh`** (`bash scripts/deploy-prod.sh` on the host).
  `DRY_RUN=1` is not honored. Never run two deploys concurrently.
- **The audience read is rate-limited with the producer's own commands** — 30/min, shared, because
  when the route was written no caller existed and "a producer looking at a dashboard, not a player
  polling" was true. A naive 5-second poll would put a viewer counter in competition with **Go
  Live** for the same budget. The client polls at 15s and only while on air; the real fix is the
  route's own limiter.
- **The audience route answers 503 with no count when collection fails, by design.** It must stay a
  separate request from the lifecycle control, which has to survive that.
- **There are two class clocks and they have never met.** The instructor's comes from
  `localStorage.kit_start_<sessionId>`, set by a **Start class** button; the broadcast's comes from
  `content_started_at`, written by `mark_content_started`. The broadcast's is **enforced** —
  `go_live` refuses with `ContentNotStarted` without it. The instructor's is a button somebody has
  to remember, is per-browser, and is resettable. **Anything measuring the show must use
  `content_started_at`**, which is what `broadcastClipMarkerPolicy.ts` calls "the only trustworthy
  class clock". The clip list and the rundown both use it, so they can never disagree about which
  second was minute zero.

---

## External prerequisites

**These cannot be satisfied from repository code, and no ticket may pretend they were.**

### Cloudflare

- confirm Stream is enabled on the account;
- create and retrieve API credentials;
- store them only in approved secret storage or the production environment — **never in the repo**;
- validate API permissions;
- create a test Live Input;
- confirm signed playback capability;
- confirm VOD recording behavior;
- confirm billing and cost visibility.

### Zoom

- verify the account supports **Live Streaming to a Custom Service**;
- enable it at the correct account, group or user scope;
- **verify custom RTMP can be configured for Ali's class host** — see the warning below;
- verify the existing Server-to-Server OAuth and recording configuration remains intact;
- verify no change regresses Zoom cloud recording;
- validate student and guest audio and Ali's share behavior;
- document the fallback if custom RTMP is not available.

> **The open blocker, and the cheapest one in the program.** The Zoom *account setting* is done
> (L1.1). The *operator* half is not: which client, signed in as whom, on what license. On
> 2026-10-29 the host was signed in from something other than the Zoom desktop client and had **no
> way to start the stream**. Until the host has seen the Custom Live Streaming menu item in a
> throwaway meeting on the machine they will actually teach from, this prerequisite is unmet and R9
> is blocked. Ten minutes; no repository work substitutes.

### YouTube

- verify channel ownership and access;
- verify live-stream eligibility;
- verify the stream destination setup;
- document stream key and API handling;
- verify a test or unlisted live event;
- verify post-live replay ownership.

---

## What is not built

| Gap | Note |
|---|---|
| **No production airing has exercised this contract** | Every guarantee above is proven by tests and one private airing, not by production. |
| **Entitlement has never been exercised against a real paywalled airing** (L10.7) | The fail-closed guarantee is the single highest-consequence claim in this document and it is the least production-proven. |
| **Nothing reads `access_mode`** | Both `broadcast_occurrences.access_mode` and `broadcast_series.default_access_mode` are declared and unreachable — the original instance of the declared-but-unreachable pattern. |
| **The audience route's rate limiter is still the command limiter** | Handled in the client; the route is unchanged. |
| **No broadcast graphics layer** | Not a security concern, but it is part of this subsystem's surface and does not exist. |
| **DOC 11 and DOC 12 are unwritten** | The handbook and the ten diagrams that would make this contract navigable. L11.1 and L11.2. |
