# Directive — Test 3: Colaberry Live Dress Rehearsal

**Purpose.** Prove, before an audience is watching, that every step of putting a broadcast on air
works — and that a non-staff viewer can actually see it. Tests 1 and 2 proved the stream. This one
proves the **procedure**, because the procedure is the part nobody has run under time pressure.

Companion to `go-live-colaberry-live-broadcast.md`, which is the reference for what each step means.
This is the rehearsal script.

---

## 0. Why this rehearsal is shaped the way it is

Three facts drive every decision below.

- **Ending is terminal.** There is no un-end command. So the rehearsal runs on a **throwaway
  session**, never on the real event's occurrence. Rehearsing on the real one would consume it.
- **One airing per room.** A partial unique index permits a single live airing per room. A
  rehearsal sharing a room with the real event can therefore *block the real event*. The throwaway
  must be its own session, which gets its own room.
- **Staff cannot test access.** `isAdmin` short-circuits the top of both `decideBroadcastAccess`
  and `roomEntitlementService.isEligible`. A broadcast that denies its entire audience looks
  perfect in a staff browser. **The rehearsal is not complete without a second, non-staff account.**

Everything here runs from the **browser console of a staff session on the portal**. No database
access and no production shell are required, which matters because the one thing that reliably is
not available at showtime is someone with a terminal open.

---

## 1. Prerequisites

| | |
|---|---|
| Accounts | **Two.** A staff account, and a non-staff account whose cohort is NOT the rehearsal session's cohort. |
| Flags | `BROADCAST_ENABLED=true` and `COMMUNITY_ROOMS_ENABLED=true`. With rooms off, occurrence creation refuses `no_room` and nothing exists at all. |
| Session | A **throwaway** session with Broadcast ticked, scheduled for today, in a cohort you are happy to disturb. Not the real event's session. |
| Stream | A live input you can start **on cue**, exactly as it will be for the real thing. Do not start it in advance — step 3 has you enter backstage first, and a rehearsal without a feed cannot prove steps 3 to 5. |

Creating the session auto-creates two rows: a community room (`privacy: 'cohort'`) and the
occurrence (`access_mode: 'private'`).

---

## 2. The console helper

Open the portal as staff, open devtools, and define this once per tab. It carries the same
participant token the app itself uses, including a "View as" token if this tab has one.

```js
const T = sessionStorage.getItem('view_as_participant_token')
       || localStorage.getItem('participant_token');
const api = async (method, path, body) => {
  const r = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + T },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null; try { data = await r.json(); } catch (e) { /* empty body */ }
  console.log(method, path, '->', r.status, data);
  return { status: r.status, data };
};
```

If `T` is null you are not signed in on this origin. Sign in before continuing; do not paste a
token from anywhere else.

---

## 3. The rehearsal

### Step 1 — find the occurrence

```js
await api('GET', '/api/portal/broadcasts/active');
```

The response carries a `states` array naming exactly which editorial states this endpoint
surfaces — read it rather than assuming — and `broadcasts`, one row per occurrence. Find your
rehearsal row.

**This row answers most of what you need**, so read all of it rather than only taking the id:

| Field | Why it matters |
|---|---|
| `id` | The occurrence id every call below uses. |
| `room_id` | The room to flip in step 4. There is no other way to learn it from the browser. |
| `access_mode` | `private` on anything the system created. |
| `editorial_state` | Where in the ladder this occurrence currently sits. |
| `can_watch`, `reason` | **The access decision, evaluated for whoever is calling.** As staff this is always true — which is exactly why step 4 re-reads it as someone else. |

If your occurrence is not listed, it is either in a state outside `states` or it was never created.
Check the session really has Broadcast ticked.

### Step 2 — get the version, and prove it can play

```js
await api('POST', '/api/portal/broadcasts/<ID>/playback', { asset: 'master.m3u8' });
```

`asset` is **required** — the schema has no default, so an empty body is a 400 rather than a
sensible fallback. `master.m3u8` is the slug every call site in the app sends.

**This one call answers two separate questions**, which is why it comes before any command.

| Answer | Means | Do |
|---|---|---|
| **200** with `version`, `is_producer: true` | Entitled, and there is something to play. | Note `version`. Continue. |
| **503 `ProviderNotReady`** | The occurrence is real and you are entitled — **there is no live input**. | **Stop.** This is the failure that looks healthy from everywhere else. Start the feed, retry. |
| **403 `NotEntitled`** | An access problem. As staff this should be unreachable; if you see it, something is wrong with the staff context, not the occurrence. | Stop and investigate. |

A 503 here is the single most valuable result this rehearsal can produce, because at showtime it
would present as a correctly gated, correctly lit, completely silent broadcast.

### Step 3 — the three commands

Starting has no UI. Each command is version-guarded, and **each response returns the new version**
— use it for the next call rather than re-fetching.

**The stream and these commands are two different systems, and the order is forced.** Starting Zoom
alone changes nothing a viewer sees: the Events Hall, the popup and the player are all driven by
`editorial_state`, and only a command moves it. No transition here is driven by the clock, so a
scheduled start time publishes nothing either. And the command alone is refused — `go_live` fails
unless `provider_health` is `ready`.

**So `enter_backstage` comes before you start streaming.** The health loop observes `backstage`,
`live` and `reconnecting` only; a `scheduled` occurrence is never polled, so until it is backstage
nothing is watching for your feed and health cannot become `ready`.

```js
let v = <version from step 2>;
let r;

// 3a. Backstage FIRST — this is what starts the platform watching for your stream.
r = await api('POST', '/api/portal/broadcasts/<ID>/command', { command: 'enter_backstage', expected_version: v }); v = r.data.occurrence.version;

// 3b. NOW start the Zoom stream, and re-run step 2 until it returns 200 rather than 503.
//     That 200 is the platform confirming provider_health is ready. go_live is refused until then.

// 3c. Only once the grant returns 200:
r = await api('POST', '/api/portal/broadcasts/<ID>/command', { command: 'mark_content_started', expected_version: v }); v = r.data.occurrence.version;
r = await api('POST', '/api/portal/broadcasts/<ID>/command', { command: 'go_live',              expected_version: v }); v = r.data.occurrence.version;
```

Run them **one at a time**, reading each result before sending the next. A refused `go_live` almost
always means health is not ready yet — wait and re-check the grant rather than retrying in a loop.

- `mark_content_started` stamps the clock **every access decision and the whole preview window is
  measured from**. Send it when content actually starts, not when the room opens.
- A **409** means the occurrence moved under you. Re-read with step 2 and decide again. Never retry
  a 409 blindly.
- A **429** means you are being rate limited (30/min). The UI currently reports this as a generic
  failure, so in the console trust the status code over any message.

### Step 4 — the verification that actually counts

On the **non-staff** account, in a different browser or a private window.

Start with the precise answer rather than squinting at the UI. Define the helper from §2 again in
*that* browser, then:

```js
(await api('GET', '/api/portal/broadcasts/active')).data.broadcasts
  .map(b => ({ id: b.id, state: b.editorial_state, can_watch: b.can_watch, reason: b.reason }));
```

`can_watch` is the server's access decision for **this** viewer, and `reason` names the exact
branch that produced it — `not_room_eligible`, `guest`, `not_watchable`, `room_member`,
`free_event`. That is the whole access question answered in one line, by the only account whose
answer means anything.

Then confirm it in the product, because a true `can_watch` still has to become a picture:

1. Open the portal. The live affordance should appear — the mini player popup, and the Events Hall
   lit on the campus map.
2. Walk into the Events Hall. The class should play **on the hall's own screen**, with controls and
   fullscreen.
3. Press play. Confirm **audio and video actually arrive**, not merely that a player rendered.

If the viewer is denied, the room is still `cohort`. Open it:

```js
await api('PATCH', '/api/portal/community/rooms/<ROOM_ID>', { privacy: 'public' });
```

Then re-check on the non-staff account. `{ privacy: 'cohort' }` puts it back.

**Do not skip this step and do not perform it as staff.** It is the only part of the rehearsal that
tests the thing most likely to be wrong.

### Step 5 — tear down

End the rehearsal from the **End control in the mini player** — the one producer action that does
have a UI. Confirm the Events Hall goes dark and the popup disappears for the non-staff viewer.

**Closing Zoom is not ending the broadcast**, and this is worth rehearsing deliberately because it
is the step most likely to be skipped under relief that the show went well. The occurrence stays
`live` over dead air, still advertised, until the safety net ends it with
`end_reason: 'auto_stream_gone'` after the stream has been **continuously** absent for
`BROADCAST_AUTO_END_WINDOW_SECONDS` — default 300s, clamped 60–3600. That is what 2026-10-20's five
minutes of dead air was.

If you want to prove the safety net itself, stop the stream and *don't* press End: the occurrence
should end on its own about five minutes later. Worth doing once, on a rehearsal, never on a real
airing.

Then revert the room if you opened it, and leave the real event's session untouched.

---

## 4. What a passing rehearsal has proved

- The occurrence exists, is addressable, and **has a live input**.
- All three commands are accepted in order, and each returns a usable next version.
- A real, non-staff human can see and hear it.
- The Events Hall lights, docks the player, and goes dark again on end.

## 5. What it has NOT proved

- **Scale.** One viewer is not an audience; nothing here exercises concurrent load.
- **The replay path.** Replays publish themselves later, on the health loop's own schedule.
- **The real event's access.** A rehearsal in a different room proves the *procedure*, not the real
  occurrence's audience. The real one still needs its own step 4.
- **Recovery.** Nothing here rehearses the stream dropping mid-air.

## 6. Known rough edges you will meet

- Beams and spotlight rings on the campus map are CSS-gated to `live` **exactly**, so a `backstage`
  occurrence gives evening light and a marquee but no spotlights. That is correct, not a fault.
- `access_mode` has no writer, so opening access is done at the room layer. See
  `go-live-colaberry-live-broadcast.md` §7 for the trade-off against a direct database write.
- There is no UI to start a broadcast. Step 3 is the whole reason this directive exists.
