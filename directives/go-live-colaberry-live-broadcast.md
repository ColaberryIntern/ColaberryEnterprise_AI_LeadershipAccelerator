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

Starting a broadcast has **no UI** (only *ending* does — the End control in the mini player). Each
step is a `POST /api/portal/broadcasts/<occurrence_id>/command` as a staff participant, body:

```json
{ "command": "<name>", "expected_version": <current version> }
```

Both fields are required and the schema is `.strict()`. `expected_version` is optimistic locking: a
**409** means the occurrence moved under you, so re-read it before deciding again — never retry a
409 blindly. The version increments on each accepted command.

4. `enter_backstage` — `scheduled → backstage`. Nothing is offered to viewers yet.
5. `mark_content_started` — stamps `content_started_at`. **This is the clock every access decision
   and the whole preview window is measured from.** Send it when the content actually starts, not
   when the room opens.
6. `go_live` — `→ live`. Discovery now surfaces it, the campus Events Hall lights up, and the
   mini-player popup appears for anyone eligible.

### After

7. **End it** with the End control in the mini player. Ending is **terminal** — there is no un-end
   command. If nobody presses it, the L7.4 safety net ends the occurrence with
   `end_reason: 'auto_stream_gone'` after the stream has been continuously absent past the
   configured window.
8. **Replays publish themselves.** The health loop calls `runReplayTick`, which issues
   `begin_processing` then `publish_replay` once the provider reports a ready recording. Nothing
   manual. The replay then appears on the portal Replays page for **25 days** after `ended_at`.
9. **Revert the access change** if you opened the room for a one-off:
   `PATCH /api/portal/community/rooms/<room_id>  {"privacy":"cohort"}`.

## 4. Outputs
- An occurrence that reaches `live`, then `ended`, then `replay_ready`.
- Viewer telemetry (heartbeat-derived counts) readable at `GET /api/portal/broadcasts/<id>/audience`.
- A replay on the portal Replays page, expiring 25 days after `ended_at`.

## 5. Verification
- **Flag on:** an unauthenticated request to a `/api/portal/broadcasts/*` path returns **401**, not
  404. A 404 means the feature is still dark — the gate answers before auth, which is what makes
  404-vs-401 the honest signal here.
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
- **`access_mode: 'free'` is currently unreachable.** The `free_event` branch is built and
  unit-tested, but the only two writers of `access_mode` both write `'private'`. Opening access is
  therefore done at the *room* layer (§3.2), not the access-mode layer. Do not hand-write
  `access_mode` in the database to work around this.
- **Opening a room widens access to everything in it**, not just the broadcast — messages, resources,
  bookings. For a session room that is normally empty of other content this is fine; check before
  flipping a room that has history.
- **Ending is irreversible.** Confirm before pressing End.
