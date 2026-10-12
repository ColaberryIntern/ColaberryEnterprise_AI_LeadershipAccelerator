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

Two client behaviours cut the real figure well below these, and both are asserted by test:

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
