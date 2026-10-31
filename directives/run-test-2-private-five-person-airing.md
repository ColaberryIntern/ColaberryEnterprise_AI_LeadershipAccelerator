# Directive — Run Test 2: Private Five-Person Airing

**Status:** active · **Owner:** Ali · **System:** Colaberry Live (in-portal broadcast) · **Established:** 2026-10-31

> **This is a test, not an event.** The purpose is to find out what breaks with real people on
> real phones. Nothing here is promoted, nobody outside the five is invited, and a failed check
> is a successful run.

## 1. Purpose

Execute **Test 2** of the §15 test-session ladder in
`docs/requirements/COLABERRY_LIVE_BASECAMP_BOOTSTRAP_v2.md`: a private five-person airing that
proves ten things end to end.

**Why this is the next thing.** Eight of the ten checks are already built and deployed
(`docs/COLABERRY_LIVE_PROGRAM_SPEC.md` §8). Test 2 is not blocked on building anything — it has
simply never been run with five people. It needs no code, it exercises the whole spine, and every
one of the four open findings in §8 of the spec would surface in it.

It also unblocks Test 3 honestly. Test 3 asks Piyush, Sohail and Aleem to *evaluate* the
experience, which is a poor use of three people's time before the first five-person airing has
happened.

**This directive does not replace the operator procedure.** Putting the broadcast on air is
`go-live-colaberry-live-broadcast.md`, and every command, query and access decision lives there.
This file is the test wrapped around it: who to gather, what to watch, and what counts as proof.

## 2. Hard gates — do not gather five people until all four are true

| Gate | How to confirm | If it fails |
|---|---|---|
| **The Zoom custom-RTMP control is visible to the host** | The host opens a throwaway meeting on the **desktop client** and sees *More → Live on Custom Live Streaming Service*. Seeing the menu item is the only proof that holds. | Stop. This is what cost the 2026-10-29 airing, and no error surfaces anywhere — the occurrence sits in `backstage` with `provider_health` never reaching `ready`, which looks identical to a stream that has not started. See `go-live-colaberry-live-broadcast.md` §2. |
| **Test 1 is passed** | Zoom produces RTMP, Cloudflare accepts it, HLS is created, signed playback works in Colaberry, the grant renews, end state is correct. | Run Test 1 first with technical staff only. Do not spend four other people's time discovering a provider fault. |
| **Flags are on** | `docker exec accelerator-backend sh -c 'echo $BROADCAST_ENABLED'` and the community-rooms flag. Probe **inside the container** — a 401 from the public hostname proves nothing. | Without `communityRoomsEnabled` no occurrence exists at all (`no_room`). |
| **The occurrence exists and is addressable** | The §2 query in the go-live directive returns one row with a non-null `room_id` **and** a non-null `provider_session_id`. | A null `provider_session_id` means the occurrence is real, correctly gated, and unplayable. |

**Access:** decide before the day whether the five testers get in by cohort membership or by
flipping the room to public, and prefer the room flip — it is audited. **At least one of the five
must be a non-staff account outside the session's cohort.** `isAdmin` short-circuits at the top of
both `decideBroadcastAccess` and `roomEntitlementService.isEligible`, so a broadcast that denies
its entire audience looks perfect in a staff browser. A five-person test staffed by five staff
accounts verifies nothing about access.

## 3. The five people, and what each one holds

Five is the minimum that makes the checks separable. One person cannot test "navigation does not
restart the video" and "phone reconnect" at the same time.

| Role | Device | Watching for |
|---|---|---|
| **Presenter** (Ali) | Zoom desktop client + deck tab | Starts the stream; advances the deck. The show only moves when this person presses a key — nothing is driven by the clock. |
| **Producer** | Console / API client, staff token | Sends `enter_backstage` → `mark_content_started` → `go_live`, then presses End. Records timings. |
| **Viewer A — desktop** | Laptop, **non-staff account outside the cohort** | Checks 1, 2, 3. Navigates around the portal mid-stream on purpose. |
| **Viewer B — phone via QR** | Phone, scans the printed QR | Checks 4, 5, 6, 7 on the surface a real student reaches. |
| **Viewer C — phone, companion direct** | Phone, opens `/portal/live/<sessionId>/companion` | Same checks on the surface DOC 04 specifies. Also runs check 8. |

**Viewers B and C are on two different surfaces, and that is deliberate.** See §5.

## 4. The ten checks

Record each as **PASS**, **FAIL** or **PARTIAL**, with one line of what was observed. Expected
state is given so a known gap is not recorded as a surprise.

### 1. Viewer discovery
**Do:** With the occurrence `live`, Viewer A loads the portal without being given a direct link.
**Pass:** `GET /api/portal/broadcasts/active` returns the occurrence, the campus Events Hall screen
lights and plays, and the mini-player popup appears.
**Expected:** built. The real question is whether a viewer who was *not told where to look* finds it.

### 2. Persistent player
**Do:** Viewer A starts watching, then uses the portal normally for several minutes.
**Pass:** Playback is never interrupted.
**Expected:** built. The `<video>` is a sibling of `<Outlet/>` in the layout route, so it is literally
the same DOM node across navigations.

### 3. Navigation does not restart the video
**Do:** Viewer A navigates to at least four different portal pages while the stream plays.
**Pass:** No reload, no re-buffer, no jump to live edge, no audio gap. Position is continuous.
**Expected:** built — and this is the check most likely to expose a route that was added outside the
layout. Note which pages were visited; a pass over four pages is not a pass over all of them.

### 4. Companion QR
**Do:** Viewer B scans the QR as printed, from a phone, ideally before signing in.
**Pass:** The QR resolves to the current session context without anyone re-minting a link.
**Expected:** built, with a wrinkle that matters — **the QR lands on the check-in page, not the
companion deck.** See §5. Record which surface the phone actually reached.

### 5. Poll
**Do:** Presenter reaches a slide carrying a question. All three viewers vote; one tries to change
their answer; one votes twice.
**Pass:** Every vote registers once, the tally is correct, the server-side vote lock holds, and the
theater reveal fires when the presenter reveals.
**Expected:** built on both phone surfaces.

### 6. Prompt Drop
**Do:** Presenter reaches a slide carrying a prompt. Viewers B and C both copy it.
**Pass:** The prompt arrives on the phone and copies cleanly.
**Expected:** built, and it fires on **slide arrival** — there is no control to drop one ad hoc, so
do not wait for a producer button. **The two phone surfaces render prompts differently; record
which fields each one shows** (paste target, expected result, stop condition). That difference is
itself a Test 2 finding.

### 7. Builder pulse
**Do:** Viewers B and C both set a status, changing it at least once.
**Pass (as built):** The aggregate updates on the **instructor deck**.
**Expected: PARTIAL, and record it as such.** The pulse aggregate is instructor-only and is never
exposed to viewers, so no viewer can see the room's state. There is a second, sharper problem:
the two surfaces do not offer the same states.

| Surface | States offered |
|---|---|
| Companion deck (`/companion`) | **Following** 👀 · **Building** 🛠️ · **Stuck** ✋ · **Finished** ✅ — the exact DOC 04 contract |
| Check-in page (the QR target) | **Building** 🛠️ · **"I'm stuck"** ✋ · **Finished** ✅ |

**The QR surface has no "Following".** That is the one state a viewer who is only watching can
press. So anyone who arrives by QR and is simply following along has no way to say so, and the
instructor's read of the room will under-report. Expect the aggregate from Test 2 to be wrong in
that specific direction, and do not treat it as a stream fault.

### 8. Reconnect behavior
**Do:** Two separate failures, one at a time, with the producer noting the clock.
- **Viewer side:** Viewer C turns wifi off for ~30 seconds, then on.
- **Stream side:** stop the Zoom stream briefly, then restart it.

**Pass:** The viewer rejoins without re-authenticating or losing the session. The occurrence goes
`live → reconnecting → live`, keeps the same occurrence **and the same `content_started_at`**, so a
blip cannot silently refill everyone's preview window.
**Expected: PARTIAL.** Treat whatever happens as the finding. **Keep the stream-side drop well under
`BROADCAST_AUTO_END_WINDOW_SECONDS` (default 300s)** or the L7.4 safety net will end the airing with
`end_reason: 'auto_stream_gone'` and the rest of the run sheet is over.

### 9. End
**Do:** Producer presses the End control in the mini player. Do not just close Zoom.
**Pass:** The occurrence reaches `ended`, discovery stops offering it, and the Events Hall goes dark.
**Expected:** built — ending is the one part of the lifecycle that *has* a UI.
**Ending is terminal. There is no un-end command.** And closing Zoom does not end the broadcast: on
2026-10-20 an occurrence sat `live` over dead air for five minutes, still advertised.

### 10. Replay processing
**Do:** Nothing. Check back after the provider's processing window.
**Pass:** The occurrence reaches `replay_ready` without manual intervention and the replay appears on
the portal Replays page. Confirm a **non-staff** account can play it.
**Expected:** built and automatic — the health loop calls `runReplayTick`, which issues
`begin_processing` then `publish_replay`. The replay expires 25 days after `ended_at`.

## 5. The two phone surfaces — read this before briefing Viewers B and C

There are two phone surfaces, they are not the same code, and the QR goes to the one DOC 04 did
not specify:

| | Check-in page | Companion deck |
|---|---|---|
| URL | `/portal/class-checkin/<sessionId>` | `/portal/live/<sessionId>/companion` |
| Reached by | **the QR** — this is what students scan | typed or linked directly |
| Public before sign-in | yes | yes |
| Pulse states | three, no "Following" | four, exact DOC 04 labels |
| Automated test coverage | none | `CompanionDeck.test.tsx` |

The check-in page polls companion state and renders polls and prompts itself rather than handing
off to the companion deck; its onward button goes to the session's room or `/portal/today`. So the
QR path never reaches the companion.

**Run both.** Viewer B is the honest measurement of what a student gets. Viewer C is the
measurement of the surface the requirements describe. Where they differ, that is a finding, not a
test error — and it is the most valuable output of the run.

## 6. Evidence to capture

Per §6.1 of the requirements, evidence should be cheap and sufficient — not a recording of
everything.

- The ten checks with PASS/FAIL/PARTIAL and one observed line each.
- **Producer timings:** when each command was sent and accepted, when the stream was started, when
  the platform first reported ready, when End was pressed.
- **One screenshot per viewer** of the surface they held while the broadcast was live.
- The occurrence row after the run: `editorial_state`, `access_mode`, `version`, `ended_at`,
  `end_reason`.
- Any **409** received, and what the version was before and after. A 409 means the occurrence moved
  under you; re-read before deciding again, and never retry a 409 blindly.
- The audience read: `GET /api/portal/broadcasts/<id>/audience`. **It has no UI caller**, so this is
  an API call or nothing — and it is the only numeric evidence of who was actually watching.

## 7. Rules during the run

- **Do not fix anything live.** Record it and continue. A test that stops at the first fault yields
  one finding; a test that runs to the end yields ten.
- **Do not skip a check because an earlier one failed**, unless the failure makes it physically
  impossible. Checks 9 and 10 are reachable even if nothing else worked.
- **Do not let a staff account stand in for a viewer.** See §2.
- **Press End.** Do not rely on the safety net.
- **Revert the access change** afterwards if the room was opened for the occasion:
  `PATCH /api/portal/community/rooms/<room_id> {"privacy":"cohort"}`. Opening a room widens access to
  everything in it, not just the broadcast.

## 8. What this test does and does not establish

**Does:** that the provider spine, discovery, the persistent player, the two phone surfaces, the
poll, the Prompt Drop, the end transition and replay publication work with real people on real
devices and real networks.

**Does not:** anything about the studio, lighting, camera, audio quality, graphics, the AI avatar,
the marketing CTA, or the content engine. Those are Tests 3 and 4, and R5 through R7. A passed
Test 2 is not evidence the system is ready for an audience — it is evidence it is ready for the
staff pilot.

**Nor does it discharge Test 5.** The two drops in check 8 are two of the thirteen failure drills,
and the other eleven — expired playback grant, Cloudflare failure, entitlement failure,
invalid/private access, replay-processing failure, provider API timeout and the rest — remain
unrun. Do not cite this run as evidence that access cannot fail open.

## 9. Related

- `go-live-colaberry-live-broadcast.md` — the operator procedure, every command and query
- `rehearse-colaberry-live-airing-procedure.md` — console rehearsal of the procedure and the access
  decision; covers three of this file's ten checks with no audience
- `docs/COLABERRY_LIVE_PROGRAM_SPEC.md` — §7 the ladder, §8 what is built, §9 the order
- `docs/requirements/COLABERRY_LIVE_BASECAMP_BOOTSTRAP_v2.md` — §15 the ladder as specified
