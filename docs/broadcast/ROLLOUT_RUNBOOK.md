# Colaberry Live — rollout runbook

Operational decisions and levers for the broadcast surface. One section per decision, each
recording what was chosen, what it rules out, and how to change it without a deploy.

Session: `CC-20261002-b3k8`. Branch: `workstream/colaberry-live`.

---

## P3-09 — live-state transport: polling, server-paced

**Decision: poll, at a cadence the server chooses.** Not SSE, not WebSockets.

### Why not SSE, which already exists here

`frontend/src/hooks/useRealtimeAwareness.ts` is the only realtime transport in this
application. It is an `EventSource` serving the **admin** cognitive stream, and it
authenticates with `withCredentials` — cookies.

The portal authenticates with a Bearer JWT (`utils/portalApi.ts` attaches it per request), and
`EventSource` has no API for request headers. Carrying a participant token over SSE would
therefore mean one of:

- putting the JWT in the query string, where it lands in nginx access logs, in any
  intermediary's logs, and in `Referer` headers; or
- minting a cookie session for the portal, which is a new authentication path for a feature
  that does not need one.

Both are worse than a slow poll of a small payload. This is a hard constraint, not a
preference.

### Why not WebSockets

A connection per signed-in viewer, plus a new piece of infrastructure to operate and monitor,
to deliver a payload measured in hundreds of bytes at a cadence measured in tens of seconds.
The badge does not need sub-second latency; the player is opened deliberately by a click.

### The cadence, and where it lives

| Setting | Value | Where |
|---|---|---|
| Default | **45 s** | `broadcastPollPolicy.DEFAULT_POLL_MS` |
| Floor | 15 s | `MIN_POLL_MS`, clamped server-side **and** client-side |
| Ceiling | 300 s | `MAX_POLL_MS` |
| Override | `BROADCAST_DISCOVERY_POLL_MS` | prod backend env |

45 s was chosen against the cadences this portal already runs — 1 s, 2.5 s, 3 s, 4 s, 15 s,
20 s, 30 s, 45 s, 60 s — so it introduces no new load profile; it sits in the slow half of an
established range. A viewer learns a class went live within 45 s of the producer saying so,
which is well inside the time it takes to join one.

**The server sends `poll_after_ms` in every discovery response.** That is the operational
point: the cadence can be slowed during an incident with an env change and a backend restart,
with no frontend build. A client that picks its own interval cannot be turned down when it
matters. The client clamps the value it is handed anyway, because a stale or misconfigured
answer must not be able to drive a one-second loop.

### Load at the Phase 1 planning scenarios

**CORRECTION, 2026-10-09.** An earlier version of this section claimed "Phase 1 never defined
audience scenarios — `request.md` and `discovery-architecture.md` contain no concurrency
figures". That was false. `request.md:182`, the P1-05 row, reads: *"expected audience scenarios
(100/500/1,000 are planning scenarios, not measured traffic)"*. The scenarios were defined, by
number, in the file named as not containing them — and the substituted table then used
100/500/**2,000**, getting the third figure wrong.

The claim came from a grep for `audience of` and a numeric pattern, neither of which matches
"audience scenarios" or "100/500/1,000". A path- or pattern-limited search returning nothing
is not evidence of absence, which is a rule this run had already paid for twice before.

The figures below are now the ones Phase 1 actually named. Note what they are: **planning
scenarios, not measured traffic** — `request.md` says so itself, so this is a projection
against agreed planning numbers, not a measurement, and it should not be read as one.

Payload is ~200 B per airing broadcast plus ~80 B of envelope, so 680 B per response at three
airings; the active set is bounded by a partial UNIQUE index permitting one airing per room,
and by `ACTIVE_DISCOVERY_LIMIT = 25`. KB below is 1 000 B, and the arithmetic is
`viewers / 45 s * 680 B` — stated so the next reader can check it rather than trust it.

| Concurrent signed-in viewers | Requests/s at 45 s | Egress at 3 airings |
|---|---|---|
| 100 | 2.2 | ~1.5 KB/s |
| 500 | 11.1 | ~7.6 KB/s |
| 1 000 | 22.2 | ~15.1 KB/s |

**THESE NUMBERS ASSUME ONE POLL PER TAB, and that is an architectural commitment rather than
an observation.** `useBroadcastDiscovery` keeps all of its state in `useState`/`useRef`: it
has no shared cache and no dedupe, so every component that calls it is an independent poller
with its own timer. P3-04 puts the live state in several places at once (the badge, the room
pane, and more later), and if each called the hook directly the real request rate would be the
figures above multiplied by the number of surfaces — which would make this table quietly false
the moment those placements shipped.

`contexts/BroadcastDiscoveryContext.tsx` is what keeps it true: one provider at the portal
layout route owns the single poll, every placement reads it, and
`contexts/__tests__/broadcastDiscoveryContext.test.tsx` asserts that five consumers produce
exactly one request and one armed timer. **If a future placement calls `useBroadcastDiscovery`
directly, this table is wrong and that test is the thing that should have stopped it.**

Two client behaviors cut the real figure well below these, and both are asserted by test:

- **A hidden tab polls not at all.** Most open portal tabs are in a background window. The
  table above is therefore an upper bound on *open* tabs, not on *visible* ones.
- **A failing endpoint backs off** (×2, capped at 300 s) instead of hammering a struggling
  server. Discovery answering 503 means it could not work out what is airing.

Each request is one indexed read plus the viewer's entitlement facts. If the figure ever
matters, raise `BROADCAST_DISCOVERY_POLL_MS` first — it needs no deploy — and only then
consider caching the active set across viewers.

### Revisit when

- A MEASURED concurrency figure exists. The table above is a projection against Phase 1's
  planning scenarios; replace it with observed numbers once the feature has run live.
- Sub-45-second latency becomes a product requirement. That is the trigger for reconsidering
  a push transport, and it brings the portal-authentication question above with it.
- The active set stops being small. The query is index-backed only while
  `ACTIVE_DISCOVERY_STATES` stays a subset of `idx_broadcast_occ_active`'s predicate;
  `broadcastActiveQuery.test.ts` fails if that stops being true.

---

<!-- Added 2026-11-02, session CC-20261015-t6q2, ticket L0.2 (documentation-as-code upkeep).
     The P3-09 section above was re-verified claim by claim against the implementation on that
     date and was accurate in every particular; nothing in it was changed. What follows are the
     four levers that shipped AFTER this runbook was written on 2026-10-09 and were never added
     to it. The runbook's own opening promises "one section per decision ... how to change it
     without a deploy", so each missing lever was a gap by the document's own standard. -->

## BROADCAST_ENABLED — the master flag, and the ordering it forces on an airing

**Decision: one boolean gates the whole surface, and it is OFF by default.**

| Setting | Value | Where |
|---|---|---|
| Flag | `BROADCAST_ENABLED` | prod backend env, read at `config/env.ts:422` |
| Default | **false** | so the routes 404 rather than 401 |

### What it rules out, and the trap

The flag gate runs **before** auth on every broadcast route (`broadcastRoutes.ts:30`), so a
disabled feature returns a clean 404 instead of a 401 that reads like a broken login. That is
deliberate and it is also why an unauthenticated probe of these routes tells you nothing about
whether the feature is on: a dark feature 404s, an unknown path 401s, and both look like a
problem with your credentials.

**THE ORDERING TRAP, AND IT HAS ALREADY COST ONE AIRING.**
`startBroadcastHealthLoop()` reads this flag **once, at boot**, and returns `false` without
scheduling anything when it is off (`broadcastHealthLoop.ts:97`). The flag needs a container
recreate to change. So:

> **Flip `BROADCAST_ENABLED=true` and recreate the backend BEFORE the airing, not during it.**
> Flip it after the show has started and the health loop never schedules, nothing ever sets
> `provider_health`, and `go_live` refuses with `ProviderNotReady` for the whole class.

That is exactly what happened during Test 2 on 20 Oct, when an engineer had to feed the
provider event by hand after reading Cloudflare directly. The ticket that exists because of it
is L5.5. Note also that L5.3's acceptance criteria require the flag to be returned to `false`
after a test — which stops the health loop again, so the next airing needs the same pre-flight.

### Revisit when

The flag stops being toggled around individual airings. Once broadcasting is permanently on,
this ordering constraint disappears and the pre-flight step can come out of the operator
manual (L11.3).

---

## L5.4 — which Cloudflare live input a new occurrence is bound to

**Decision: one durable input shared by every class, by default.** Configurable, because the
choice has real trade-offs and it is Ali's rather than the implementation's.

| Setting | Value | Where |
|---|---|---|
| Strategy | `BROADCAST_INPUT_STRATEGY` | `shared` (default) \| `per_occurrence` \| `per_series` |
| The input | `CLOUDFLARE_STREAM_LIVE_INPUT_UID` | resolved at `broadcastInputBinding.ts:64` |
| Resolver | `resolveLiveInput()` | `broadcastInputBinding.ts:52`, env injected rather than read globally |

### What each strategy rules out

- **`shared`** — one stream key to configure in Zoom, once. Rules out two classes airing at the
  same time, and a leaked key affects everything.
- **`per_occurrence`** — clean isolation and per-class keys, at the cost of a Cloudflare object
  per class and a Zoom destination that must be reconfigured on the day. That manual work on
  the day is the thing L7.1's checkbox existed to remove, so this strategy partly undoes it.
- **`per_series`** — the middle ground: a weekly show keeps its key, different shows are
  isolated.

### How to change it without a deploy

Set `BROADCAST_INPUT_STRATEGY` in the prod backend env and recreate. The resolver takes its
environment as an argument, so nothing is cached across a restart.

**If no input can be resolved, creation REFUSES.** It does not produce an occurrence that looks
correct and cannot play — an unplayable occurrence is discovered by an audience, not by an
admin. An unset `CLOUDFLARE_STREAM_LIVE_INPUT_UID` therefore breaks occurrence creation
loudly, which is the intended behavior and not a fault to work around.

### Revisit when

Two classes need to air simultaneously. That is the trigger for `per_series`, and it brings the
Zoom-destination question with it.

---

## L7.4 — the auto-end window

**Decision: a live occurrence ends itself after the stream has been CONTINUOUSLY gone for a
configured window.** A timeout with hysteresis, never a webhook making the decision.

| Setting | Value | Where |
|---|---|---|
| Window | `BROADCAST_AUTO_END_WINDOW_SECONDS` | default **300** (5 minutes) |
| Named at | `AUTO_END_WINDOW_ENV` | `broadcastAutoEndPolicy.ts:44` |

### Why it is a timeout and not an event

The state machine deliberately forbids a provider event from ending a broadcast: an arbitrary
webhook must not be able to kill a live class, and a ten-second network blip must not end a
real session mid-sentence — that is what the `reconnecting` state exists for. The rule is sound
and is not removed by this. What auto-end adds is the producer decision that the rule always
required and never had, expressed as a sustained condition rather than a single event.

### How to change it without a deploy

Set the seconds in the prod backend env and recreate. **Lower it with care:** the window is the
only thing standing between a brief upstream wobble and a class that ends itself in front of an
audience. Raise it freely; the cost of a long window is dead air on the portal, which is what
the five-minute default was chosen against after an occurrence stayed live over dead air from
about 14:04 to 14:09 UTC on 20 Oct.

An auto-end writes an audit trail that distinguishes it from a producer-initiated end
(`ensureBroadcastEndReasonSchema.ts`), so "why did this class end" is answerable later.

### Revisit when

A real airing produces either a premature auto-end or a complaint about dead air. Both are
observations the default was set without.

---

## L5.5 — the health-loop cadence, and the one cadence you cannot tune

**Decision: every minute, hardcoded.**

| Setting | Value | Where |
|---|---|---|
| Cadence | `HEALTH_CRON = '* * * * *'` | `broadcastHealthLoop.ts:18` |
| Override | **none** | there is no env var for this |
| Occurrences per tick | 50 | `loadObservableOccurrences()`, `LIMIT 50` |
| States polled | `backstage`, `live`, `reconnecting` | from `OBSERVED_STATES`, never retyped |

### Why this is worth a section even though there is nothing to set

**It is the exception to this runbook's own principle.** Every other cadence in this subsystem
is server-paced so that it can be slowed during an incident with an env change and a backend
restart — that is the operational point the P3-09 section above makes at length. The health loop
is not: it is one minute, which is `node-cron`'s finest granularity and the house scheduler's
cadence, and there is no way to slow it without a deploy.

So if the provider is struggling and you want to stop hammering it, the lever is not a cadence
but the feature flag, which stops the loop entirely. Know that before an incident rather than
during one.

Two ticks share the schedule: one watches what is on air, the other watches for a finished
recording to become playable. A terminal occurrence is never polled — asserted against the
query text in `broadcastHealthLoop.query.test.ts`, not just against behavior.

### Revisit when

A provider rate limit or a cost line makes one call a minute per airing matter, or a real
incident makes the missing override painful. Either is the trigger for an env-backed cadence
with the same clamp treatment `broadcastPollPolicy` already gives discovery.
