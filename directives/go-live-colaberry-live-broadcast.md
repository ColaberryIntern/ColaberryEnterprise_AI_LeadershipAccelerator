# Directive — Put a Colaberry Live Broadcast On Air

**Status:** active · **Owner:** Ali · **System:** Colaberry Live (in-portal broadcast) · **Established:** 2026-10-28 (first air: Open House, 2026-10-29)

> **This is not the Open House directive.** `run-open-house-live-experience.md` covers the
> `/opt/openhouse-live` deck service — slides, phone polls, raffle, seat claims — which is how
> prospects attend an Open House. This directive covers the *separate* in-portal broadcast that
> signed-in portal users watch. The Open House does not depend on this working; Colaberry Live is
> additive. Treat a failure here as a degraded bonus, never as a reason to delay the event.

## 1. Purpose
Take a scheduled Accelerator session from "created" to "on air in the portal", with the right
people able to watch it, and prove it with an account that is not staff.

This is the operator procedure only. For what the program as a whole is meant to be, the release
order, and what is built versus specified, see `docs/COLABERRY_LIVE_PROGRAM_SPEC.md` and the
governing requirements it maps — `docs/requirements/COLABERRY_LIVE_BASECAMP_BOOTSTRAP_v2.md`.

## 2. Inputs
- **An Accelerator session** created in the admin UI with **Broadcast ticked**. Creating it is the
  only supported way to mint an occurrence (`broadcastSessionOccurrence.ensureOccurrenceForSession`).
- **Preconditions that must already be true:**
  - `env.broadcastEnabled` on, or every `/api/portal/broadcasts/*` path answers **404 before auth**.
  - `env.communityRoomsEnabled` on. Without it `resolveRoomId` returns null and occurrence creation
    refuses with `no_room` — **no occurrence exists at all**. Colaberry Live has a hard dependency
    on community rooms.
- **A portal session token for a staff account** (producer commands authenticate a *participant*
  and derive producer rights from the staff context on that token — there is no admin-app path).
- **A non-staff test account** outside the session's cohort. See §7.
- **The host signed into the Zoom DESKTOP CLIENT.** This is not a preference, it is the whole
  ingest path, and it is what stopped the 2026-10-29 airing. See immediately below.

### The Zoom precondition that has no error message

**The stream is started from the Zoom DESKTOP client**, via
*More → Live on Custom Live Streaming Service*. On 2026-10-29 the host was signed in from something
other than the desktop client and had no way to start the stream; the account was fine, the
occurrence was fine, and the airing did not happen. Every vendor procedure for custom RTMP describes
the desktop app as where you start it, so **use the desktop client** and do not plan an airing around
any other client without first proving the control is there.

Confirm all four of these **before** the day, not at showtime:

| | |
|---|---|
| Account capability | In the Zoom **web portal**: Account Settings → *In Meeting (Advanced)* → *Allow livestreaming of meetings*, with **Custom Live Streaming Service** ticked. Livestreaming can be on while the custom option is not — that is the common trap. |
| Host license and tier | A **licensed** host on Pro / Business / Education / Enterprise. Sub-accounts can lack the ability entirely. |
| Host identity and client | The host is on the **desktop client**, at or above Zoom's minimum version for custom streaming, signed in as **the account actually running the class** — the setting is scoped per user, so verifying it on an admin account proves nothing about Ali's. |
| Visible control | The host can see *More → Live on Custom Live Streaming Service* in a throwaway meeting. **Seeing the menu item is the only proof that holds** — the four rows above are the things that remove it. |

**Fallback if custom RTMP is unavailable to the host:** there is no in-portal substitute — the player
is fed by the Cloudflare live input and nothing else writes to it. The options are to have a host who
*does* have the capability start the meeting and stream, or to run the event without the in-portal
broadcast and treat Colaberry Live as the degraded bonus this directive's header already says it is.
Decide which before the event, not during it.

## 3. Steps

### T-1 day — access

1. **Create the session with Broadcast ticked.** This auto-creates two rows:
   - a community room, `privacy: 'cohort'`, linked to the session's cohort (`roomService.ts:41`)
   - the occurrence, `access_mode: 'private'` (`broadcastSessionOccurrence.ts:116`, an explicit
     literal, not a column default)

2. **Decide who may watch, and set it deliberately.** As created, only three groups get in: staff,
   anyone whose current cohort matches the session's cohort, and anyone holding an active membership
   row in that room. Everyone else is denied `not_room_eligible` **with no upgrade path offered**.

   To open it to **every signed-in portal user** (the normal choice for an Open House, alumni event,
   or anything cross-cohort), flip the room to public:

   ```
   PATCH /api/portal/community/rooms/<room_id>    {"privacy":"public"}
   ```

   `isEligible` then short-circuits `true` for any viewer, the occurrence stays `private`, and
   entitlement grants `full` with reason `room_member`. The change emits `RoomAccessChanged`, so it
   is audited, and `{"privacy":"cohort"}` puts it back.

   Find the room id:
   ```sql
   SELECT o.id AS occurrence_id, o.title, o.editorial_state, o.access_mode,
          o.version, o.room_id, r.privacy, o.scheduled_start_at
     FROM broadcast_occurrences o
     LEFT JOIN community_rooms r ON r.id = o.room_id
    ORDER BY o.scheduled_start_at DESC NULLS LAST
    LIMIT 10;
   ```

   **There is no UI for this.** `updateRoom` exists on the backend with no frontend caller, so it is
   an API call or nothing. Privacy is settable in the UI only at room *creation*, and a session's
   room is created by the system.

3. **Verify as a non-staff account** (§7). Do not skip this. Staff cannot detect this class of
   failure.

### T-15 min — put it on air

**There is now a control for this, and it is the supported path.** Open
`/portal/live/<session_id>` signed in as staff on a laptop: the **producer strip** shows the
occurrence's state, the feed health, the version, and a button for each command that is legal right
now. It polls every 5s, so the pre-air wait for the platform to see your feed is visible instead of
invisible, and End asks before it fires. A command it does not offer is one the server would refuse;
when Go Live is withheld, the strip prints the server's own reason.

The raw API below remains correct and is the fallback — use it when the portal is unreachable, when
you need a command the strip does not offer (`begin_processing` and `publish_replay` are deliberately
not sendable), or to understand what the strip is doing. Each step is a
`POST /api/portal/broadcasts/<occurrence_id>/command` as a staff participant, body:

```json
{ "command": "<name>", "expected_version": <current version> }
```

Both fields are required and the schema is `.strict()`. `expected_version` is optimistic locking: a
**409** means the occurrence moved under you, so re-read it before deciding again — never retry a
409 blindly. The version increments on each accepted command.

**THE ZOOM STREAM AND THESE COMMANDS ARE TWO DIFFERENT SYSTEMS, AND THE ORDER IS FORCED.**
Starting the stream alone changes nothing a viewer can see — the Events Hall, the popup and the
player are all driven by `editorial_state`, and only a command moves that. **No transition here is
driven by the clock**, so a scheduled start time publishes nothing either. And the command alone is
refused: `go_live` fails unless `provider_health` is `ready`. "The producer said go" and "the feed
is actually usable" are deliberately two columns, so a stray webhook or a calendar entry can never
put backstage content on air.

4. `enter_backstage` — `scheduled → backstage`. Nothing is offered to viewers yet.

   **This used to be the one command whose `version` you could not look up**, which is why there
   was no Go Live button for so long. The playback grant was the only endpoint returning `version`,
   and on a `scheduled` occurrence with no live input it answers 503 `ProviderNotReady` with a body
   of `{ error, reason }` only — so the first command in the sequence was the one whose version was
   unobtainable. There is now a producer read that answers it:

   ```
   GET /api/portal/broadcasts/session/<session_id>/producer
   ```

   Staff-only, keyed on the **session** rather than the occurrence, and it returns the occurrence's
   state, feed health, version, and which commands are available with the reason for each that is
   not. The strip above is its caller. Reading the version out of the database (the §2 query) still
   works and is the fallback.

   **Do this BEFORE starting the stream.** The health loop observes `backstage`, `live` and
   `reconnecting` only — a `scheduled` occurrence is never polled, so until it is backstage nothing
   is watching for your feed and `provider_health` cannot become `ready`. Entering backstage first
   is what makes step 6 possible at all.

5. Start the Zoom stream, and **wait for the platform to see it.** Re-run the §2 playback grant: a
   200 means it is ready, a 503 `ProviderNotReady` means it is not yet.
6. `mark_content_started` — stamps `content_started_at`. **This is the clock every access decision
   and the whole preview window is measured from.** Send it when the content actually starts, not
   when the room opens.
7. `go_live` — `→ live`. Discovery now surfaces it, the campus Events Hall lights up, and the
   mini-player popup appears for anyone eligible. A refusal here almost always means health is not
   `ready` yet; wait rather than retrying in a loop.

### After

8. **End it** with the End control — in the producer strip on `/portal/live/<session_id>`, or the
   one in the mini player. Both ask before firing. Ending is **terminal** — there is no un-end
   command.

   **CLOSING ZOOM DOES NOT END THE BROADCAST.** The occurrence stays `live` over dead air, still
   advertised, still lighting the Events Hall. That is exactly what happened on 2026-10-20 for five
   minutes. If nobody presses End, the L7.4 safety net ends it with
   `end_reason: 'auto_stream_gone'` once the stream has been **continuously** absent for
   `BROADCAST_AUTO_END_WINDOW_SECONDS` — **default 300s**, clamped to 60–3600. That window is long
   on purpose: it has to survive a presenter restarting OBS or riding out bad hotel wifi. Press End;
   do not rely on it.

   A brief drop is handled separately and needs no action: `live → reconnecting → live` keeps the
   same occurrence **and the same `content_started_at`**, so a blip cannot silently refill
   everyone's preview window.
9. **Replays publish themselves.** The health loop calls `runReplayTick`, which issues
   `begin_processing` then `publish_replay` once the provider reports a ready recording. Nothing
   manual. The replay then appears on the portal Replays page for **25 days** after `ended_at`.
10. **Revert the access change** if you opened the room for a one-off:
    `PATCH /api/portal/community/rooms/<room_id>  {"privacy":"cohort"}`.

## 4. Outputs
- An occurrence that reaches `live`, then `ended`, then `replay_ready`.
- Viewer telemetry (heartbeat-derived counts) readable at `GET /api/portal/broadcasts/<id>/audience`.
- A replay on the portal Replays page, expiring 25 days after `ended_at`.

## 5. Verification
- **Flag on — and you must probe INSIDE the backend container.** With the flag dark a
  `/api/portal/broadcasts/*` path answers **404**; with it on, **401**. The gate runs before auth,
  which is what makes 404-vs-401 the honest signal. But that signal is **not readable from outside**:
  measured 2026-10-29 against `enterprise.colaberry.ai`, the broadcast path, a deliberately unknown
  path and `/api/health` all returned 401 alike, because the edge answers before the flag gate is
  ever reached. A 401 from the public hostname therefore proves nothing. Read the flag directly:
  `docker exec accelerator-backend sh -c 'echo $BROADCAST_ENABLED'`.
- **Occurrence exists and is correctly addressed:** the §2 query returns one row for the session,
  with a non-null `room_id` and a non-null `provider_session_id`. A null `provider_session_id` means
  the occurrence is real, correctly gated, and **unplayable** (`no_live_input`).
- **Access is what you intended:** a non-staff account outside the cohort loads the portal and sees
  the live affordance (§7). This is the only verification that proves anything about access.
- **On air:** `GET /api/portal/broadcasts/active` returns the occurrence; the campus Events Hall
  screen lights and plays.
- **Replay:** within the provider's processing window, the occurrence reaches `replay_ready` and the
  Replays page lists it.

## 6. Edge cases / failure modes
- **The host cannot find "Live on Custom Live Streaming Service":** they are on the browser client,
  or custom streaming is not enabled for *their* user. See §2. Nothing in the portal can work around
  this, and no error surfaces anywhere — the occurrence simply sits in `backstage` with
  `provider_health` never reaching `ready`, which looks identical to a stream that has not started
  yet. **This cost the 2026-10-29 airing.**
- **Every path 404s from outside:** `app.colaberry.com` does not proxy the API. Probe from inside
  the backend container.
- **409 on a producer command:** the occurrence moved. Re-read its `version` and decide again.
- **`no_room` refusal, no occurrence created:** community rooms flag is off. See §2.
- **`undeterminable_start` refusal:** the session has no derivable start instant. Nothing guesses one
  — an occurrence at a guessed instant is worse than none, because the preview window and the whole
  access decision are measured from it. Fix the session's date/time and re-save.
- **`already_aired`:** re-timing is only honest from `scheduled` or `backstage`.
- **Occurrence sat in `live` over dead air:** happened on 2026-10-20 for five minutes. Press End, or
  wait for the safety net.
- **Viewer denied `requires_payment` / `preview_expired`:** the occurrence is `paid` or `preview`.
  Not reachable through any current writer — if you see it, something wrote `access_mode` out of band.

## 7. Safety constraints
- **STAFF CANNOT TEST ACCESS.** `isAdmin` short-circuits at the very top of *both*
  `decideBroadcastAccess` and `roomEntitlementService.isEligible`. A broadcast that denies its entire
  audience looks perfect in a staff browser. Every access check must be run from a non-staff account
  outside the session's cohort, or it has verified nothing.
- **Signed-out visitors can never watch.** `if (!viewer.enrollmentId) return denied: guest` runs
  before every access-mode branch, including `free`. Prospects without portal logins cannot be served
  in-portal by any configuration — they attend through the Open House deck service instead.
- **No code writes `access_mode` — yet production holds a value no code could have written.** The
  `free_event` branch is built and unit-tested; occurrence creation hard-codes `'private'`
  (`broadcastSessionOccurrence.ts:116`) and the column defaults to `'private'`. Yet the ended
  occurrence `Colaberry Live - First Private Technical Airing` carries `access_mode = 'free'`, read
  from production on 2026-10-29. Someone set it directly and that airing completed. So the honest
  statement is not "`free` is unreachable" but "`free` is reachable only out of band".

  Two ways to open access, and they are **not** equivalent:

  | | Room flip (§3.2) | Direct `access_mode` write |
  |---|---|---|
  | Supported by code | yes — `updateRoom`, audited via `RoomAccessChanged` | no writer; a manual `UPDATE` |
  | Requires the occurrence to have a room | **yes** | no |
  | Side effects | widens the room's *other* content too | none beyond this occurrence |
  | Reverting | `{"privacy":"cohort"}` | `UPDATE … SET access_mode = 'private'` |

  Prefer the room flip: it leaves an audit trail and is a supported code path. Fall back to the
  direct write only when the occurrence has no room — and record it in the session log when you do,
  because nothing else will.

- **The "configure it properly" path does not exist yet.** `broadcast_series.default_access_mode` is
  declared in DDL, CHECK-constrained to the valid modes, and asserted by a schema test — and is
  **never read by any service, controller or script**. Nothing ever writes `series_id` on an
  occurrence either, so no occurrence has a series for a default to be inherited from. Wiring only
  the read would therefore change nothing: it would add a fifth unreachable branch while appearing
  to fix the fourth. Until both halves are built, the two rows above are the whole set of options.
  Same defect class as `roomEligible: false` awaiting P2-07 and the command-less
  `ended → processing` path — declared, tested, unreachable.
- **Opening a room widens access to everything in it**, not just the broadcast — messages, resources,
  bookings. For a session room that is normally empty of other content this is fine; check before
  flipping a room that has history.
- **Ending is irreversible.** Confirm before pressing End.
