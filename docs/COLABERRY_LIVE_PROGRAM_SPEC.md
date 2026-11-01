# Colaberry Live — Program Spec and Build Order

**Status:** reconciliation of the governing requirements against what is actually built ·
**Compiled:** 2026-10-30 · **Session:** CC-20261015-t6q2

This document exists because the scope of Colaberry Live was being reconstructed from memory and
from ticket titles. It is not a new specification. It is a map of the two documents that already
specify the program, plus an honest column saying what of each requirement exists in the repository
today, plus the order the requirements themselves prescribe.

Read §1 to find the real requirements. Read §4 if you only have a minute.

---

## 1. The two documents that govern this program

| Document | Date | Authoritative on |
|---|---|---|
| `docs/requirements/COLABERRY_LIVE_BASECAMP_BOOTSTRAP_v2.md` (2,130 lines) | 2026-10-09 | **Scope, release order, ownership, test ladder, definition of done.** Contains the 18 required project docs (DOC 00–DOC 17), the R0–R10 release ladder, the six-stage test ladder, and a 48-point production definition of done. |
| `docs/requirements/CLAUDE_CODE_COLABERRY_LIVE_7_PHASE_BUILD.md` (350 lines) | 2026-10-01 | **Repository implementation tasks.** Seven phases, 56 parent tasks (P1-01 … P7-08), each with its required evidence. |

**Both of these lived only in a Downloads folder until 2026-10-30.** A 2,130-line document that
defines the scope, the order and the acceptance bar of a program with a hard deadline was one disk
failure away from gone, and was not readable by any other session or any teammate. They are now
vendored above. Edits should be made here, not in Downloads.

### Where the two documents disagree

The bootstrap is newer and broader, and wins on scope. One divergence matters enough to name:

**The seven-phase build plan under-covers the weekly content engine.** The bootstrap requires a
fifteen-output media package per session (§6 below). The build plan's nearest task, P6-05, is scoped
to in-portal *"source-grounded summaries, chapters, lesson links and approved teaser clips"* — that
is the replay surface, not an editor handoff. Nothing in P1 through P7 produces an edited long-form
video, Shorts, thumbnails, titles, descriptions, social captions or a videographer handoff. If you
build the seven phases to completion you still do not have R7.

---

## 2. What the system is

Approved architecture, from the bootstrap:

```
Zoom → RTMP → Cloudflare Stream Live → HLS → signed/expiring playback → Colaberry persistent player
```

- **Zoom** is the interactive production source.
- **Cloudflare Stream** is the public/in-app delivery layer.
- **YouTube is a distribution output, not the source of truth.**

Colaberry remains authoritative for session, broadcast occurrence, access, prompts, participation,
build progress, community, replay metadata and Architect conversion. The conversion model the
program is actually measured against is:

```
Watch → Participate → Prompt → Build → Save → $0 Colaberry Account → Community
      → Completed Artifact → Architect Progress
```

The bootstrap is explicit that success is **not** YouTube subscribers. An "Activated Architect" has
an account, at least one tracked build, and at least one submitted artifact.

---

## 3. The release ladder — the order the requirements prescribe

This is §7 of the bootstrap. It is the authoritative order, and the L-numbered Basecamp ticket
ladder maps onto it (L4.x ≡ R4, L7.x ≡ R7, and so on).

| Release | Objective | Primary owner |
|---|---|---|
| **R0** | Project migration + external prerequisites — Cloudflare account/credentials, **Zoom custom RTMP verified**, BC project and access, document fallback if custom RTMP is unavailable. *Marked a launch blocker.* | Ali (human/account actions) |
| **R1** | Live provider connection + first private airtime — live input, Zoom→Cloudflare, provider adapter, signed playback, reconnecting state, grant renewal, first private five-person airing. *"The spine of the project."* | Claude Code + Ali |
| **R2** | Session setup → full broadcast occurrence — occurrence from session setup, one-to-many, workspace URL, companion URL/QR, rehearsal mode, backstage, readiness checklist, go-live control, end, processing and replay state. | Claude Code |
| **R3** | Timeline-driven show orchestration — the timeline drives presenter moments, Prompt Drops, polls, QR state, audience pulse, CTA, current show step, clip markers, companion state. *Preserve the existing Class Kit / Timeline rather than rewriting it.* | Claude Code |
| **R4** | Interactive viewer + companion — desktop persistent player + rail, mobile sticky player, phone companion, Prompt/Poll/Chat/Build, Builder Room, free-view vs account boundaries, Claude and Claude Code paths, audience pulse. | Claude Code + Aleem (UX) |
| **R5** | Studio + production setup — buy and install equipment, camera/mic/light/network, OBS scenes, Zoom+OBS audio routing, local recording, broadcast graphics, dry technical tests. | **Piyush** + Ali (purchases) |
| **R6** | AI Avatar + Voice AI — training footage, voice clone, first HeyGen sample, QA, Real-Ali-vs-AI-Ali policy, videographer SOP. | **Piyush** + Ali (consent) |
| **R7** | YouTube + post-production engine — simulcast, metadata workflow, raw replay classification, replay feed, long-form edit workflow, 5–7 Shorts, transcript/clip identification, content production brief, CTA, metrics. | **Piyush / Sohail / Aleem** + Claude Code (file prep) |
| **R8** | Documentation, enablement, executive communication + case-study evidence — architecture handbook, diagrams, operator manual, maintenance runbook, testing matrix, recorded walkthroughs, Ram brief and briefing. | Claude Code + Ali |
| **R9** | Rehearsal + go-live — private technical test, staff pilot, dress rehearsal, failure drills, readiness report, go/no-go, **first public live**, replay verification, analytics verification, retrospective. | Ali + all |
| **R10** | Post-launch case study + institutionalization, through the Case Study OS. | Claude Code + Ali |

**Hard deadline: 31 October 2026**, with the instruction to air publicly *before* the final day
*"so October 31 is not the first time the system is exposed to real traffic."*

---

## 4. The two findings that should drive reprioritization

### 4.1 The deadline is tomorrow and the first public airing has not happened

The 2026-10-29 Open House was the intended first public airing. It did not stream. R9's "first
public live" — item 34 of a 48-item definition of done — is unmet, and R5, R6 and R7 have not
started. The deadline will not be met as specified. That is a scheduling fact, not a build failure,
and it is Ali's call what moves.

### 4.2 What blocked yesterday was an unclosed R0 prerequisite, not a missing feature

R0 and §14 both require, as explicit human-action tickets:

- verify the Zoom account supports **Live Streaming to a Custom Service**;
- enable it at the correct account/group/user scope;
- **verify custom RTMP can be configured for Ali's class host**;
- **document fallback if custom RTMP is not available.**

The 2026-10-29 airing failed because the host was signed in from something other than the Zoom
desktop client and had no way to start the stream. That is the operator half of an R0 item: the
account setting may well be correct, but *which client, signed in as whom, on what license* was never
written down, so the one person who had to perform it at showtime did not have it.

Four separate things can remove the control, and only one of them is the account setting: the
account-level *Custom Live Streaming Service* tick, the host's license and account tier, the client
and its version, and per-user scoping. `go-live-colaberry-live-broadcast.md` §2 now carries all four
plus the one check that actually proves it — the host seeing the menu item in a throwaway meeting.

This is the cheapest open item in the entire program and it gates R9 completely. It is a paragraph in
a runbook plus one confirmed dry run.

---

## 5. The live participation application — specified, not missed

The application that presents the class and that viewers sign into is specified in four places. It
was not omitted from the plan.

**DOC 03 — Session + Timeline + Broadcast Orchestration.** Establishes the model —
*Accelerator Session = show definition; Session Timeline = show rundown; Broadcast Occurrence = one
airing*, one session to many occurrences. The timeline must ultimately drive: slides, scene cues,
presenter notes, Prompt Drops, QR moments, phone companion state, polls, Builder pulse,
Claude/Claude Code instructions, broadcast graphics, "mark this moment" clip candidates, CTA, and
replay metadata.

**DOC 04 — Viewer Experience + Phone Companion.**

- *Desktop:* persistent video, Prompt, Poll, Chat/Builder Room, build progress, Claude Code
  controls, **no forced video interruption**.
- *Phone:* persistent/sticky live video, one-thumb interaction, Prompt, Poll, Chat, Build, a status
  of **"Following / Building / Stuck / Finished"**, Open in Claude, Save Claude Code version for
  later.
- *Second screen:* a viewer on a computer may scan the session QR and use their phone as the
  companion controller. The persistent QR resolves to the **current** session context — the
  server/timeline decides the current moment — and context-specific QR moments may deep-link to a
  poll or prompt but must still belong to the same session/occurrence.

**§9 — Session builder.** Ali must be able to create a live class the way he creates an Accelerator
Session, configuring tool mode (Claude / Claude Code / both), Prompt Drops, polls, questions, Builder
pulse, Builder Room, timeline scenes, presenter notes, broadcast scenes, QR behavior, artifact, and
**post-show media brief**. Readying a session should *generate* the occurrence, workspace URL,
companion URL, QR, replay identity, show rundown, prompts, an agent-readable prompt version, a
production brief, a **YouTube metadata draft**, a readiness checklist and tracking IDs.

Note what that last list means: the create side already owes the deliver side a production brief and
a metadata draft. R7 is not a bolt-on; §9 wires it into session setup.

**Phase 4 of the build plan** is the engineering form of this: P4-01 Studio setup, **P4-02 backstage
readiness / preview-vs-program / live clock / segment rundown / explicit content-start / Go Live and
End**, P4-03 chat and structured Q&A, P4-04 polls and pinned resources and reactions, P4-05 moderated
stage requests, P4-06 producer metrics and stream health, P4-07 reconnect and producer recovery,
P4-08 two-role rehearsal.

P4-02 contained the gap found on 2026-10-29: **there was no UI to start a broadcast.** Ending had
one; starting was three hand-sent API commands, each needing a version read out of the database.

**Built 2026-10-31.** A producer strip on `/portal/live/<session_id>`, fed by a new staff-only
producer read, now shows the state, the feed health, the version and a button for each legal
command — see §9 item 3 for what had to be solved first.

**Live clock and viewer count added 2026-11-01.** Both were already on the wire and neither was
rendered. Of the remaining P4-02 scope, **preview-vs-program is not a software task in this repo**
and the **segment rundown** is the only item still open — see §9 item 3 for both. The task is not
closed; the part that stopped an airing is.

---

## 6. The content engine — specified in DOC 07 and §12

This is the mechanism for turning one live session into the week's content and handing the files to
the videographer.

**One live session must produce fifteen outputs** (§12):

| | |
|---|---|
| 1 live broadcast | 9. thumbnail options |
| 2. 1 raw replay | 10. titles |
| 3. 1 edited long-form YouTube video | 11. descriptions |
| 4. 5–7 Shorts | 12. social captions |
| 5. Prompt Drop assets | 13. email / community recap |
| 6. clips | 14. replay workspace |
| 7. transcript | 15. next-live CTA |
| 8. chapter markers | |

DOC 07 adds YouTube Live distribution, the raw replay policy, the audience-to-builder funnel, and
*"post-show handoff to Piyush / videographer and marketing."*

**Raw-live retention policy** (§12) — a judgement per airing, not a default:

| Live quality | Disposition |
|---|---|
| strong | keep public |
| acceptable | evaluate after the edited version publishes |
| poor technical quality | unlisted |
| sensitive / failed | private |

> *"Do not automatically delete every raw live and do not automatically keep every raw live public."*

### Who owns which output (§6)

This is the part worth internalizing: **R7 is mostly a human workstream.** Per the ownership model,
Claude Code owns repository implementation and does **not** own the content.

| Owner | Owns |
|---|---|
| **Piyush** | post-production pipeline, clip workflow, recording-quality validation, production scene package, videographer operating SOP |
| **Sohail** | YouTube/channel strategy, titles, descriptions, Shorts distribution, weekly content distribution, CTA strategy, post-live promotion, conversion measurement |
| **Aleem** | thumbnail system, overlays, lower thirds, Prompt Drop graphics, visual scene pack, brand consistency, accessibility review |
| **Claude Code** | the mechanism: getting the recording, transcript, chapter candidates, clip candidates and a production brief out of the system and into the editor's hands, reproducibly |

So "the video editor is human, we just need to prepare the files for him" is exactly what the
requirements say. Claude Code's share of the fifteen outputs is roughly items 2, 6, 7, 8 and 14 plus
the brief that carries the rest.

---

## 7. The test ladder (§15), and where we actually are

> *"Do not jump from dark feature flag to public launch."*

| Stage | Requires | Status |
|---|---|---|
| **Test 1** — provider smoke test | RTMP accepted, HLS created, signed playback in Colaberry, grant renews, end state correct | **Mostly passed.** Two airings exist in the Cloudflare account (a 13 Oct test and the first private technical airing). Grant *renewal over time* is not separately evidenced. |
| **Test 2** — private five-person airing | discovery, persistent player, navigation does not restart video, companion QR, poll, Prompt Drop, Builder pulse, reconnect, end, replay processing | **Never run — and mostly not blocked.** Eight of the ten are built (see §8); Builder-pulse-to-viewers and reconnect are partial. The gap here is an unexecuted test, not missing code. **Run sheet: `directives/run-test-2-private-five-person-airing.md`** — hard gates, the five roles, all ten checks with expected state. |
| **Test 3** — internal staff pilot | **Piyush, Sohail, Aleem present**; evaluate content, UX, audio, video, lighting, camera, graphics, Prompt Drop timing, participation, marketing CTA | **Not run.** Needs R5 studio equipment and a completed Test 2 to be worth three people's time — and two of its ten evaluation criteria (graphics, marketing CTA) have nothing built to evaluate (§8, DOC 03 rows 10 and 12). |
| **Test 4** — full dress rehearsal | actual studio, actual live-class flow, cold open through replay | **Not run.** |
| **Test 5** — failure drills | thirteen deliberate failures; confirm state is honest and **no access fails open** | **Not run** (one of the thirteen, the auto-end window, is written up as an optional check). |
| **Test 6** — production launch | proof of a real production airing | **Not met.** |

`directives/rehearse-colaberry-live-airing-procedure.md` is a console-driven rehearsal of the
operator procedure and the access decision. It was previously named "Test 3: Dress Rehearsal", which
was wrong twice — Test 3 is the staff pilot, Test 4 is the dress rehearsal, and that script is
neither. It now carries a table saying exactly which ladder stages it does and does not cover.

---

## 8. What is actually built, against DOC 03 and DOC 04

Audited 2026-10-30 by reading the code, with the two most consequential findings re-verified by hand.
Every row is BUILT, PARTIAL or NOT BUILT — never "in progress", which is not a state the code can be
in.

### The one structural fact that drives most of the rows

**There is no timeline runtime.** DOC 03 requires a timeline that drives thirteen things. What
exists is: the run of show as *static template data* (`backend/src/services/classKit/runOfShow.ts`),
persisted as a *record* in `live_sessions.kit_json`, plus a single current-view row
`session_broadcast (session_id PK, state JSONB)` that is last-write-wins. The only cursor in the
whole system is `slide_index` inside that row.

Nothing advances it on a clock — `broadcastStateMachine.ts:12` states the rule outright, *"NO
transition here is driven by the clock. Time cannot publish anything."* Nothing advances it on a
producer action either: the only producer commands are lifecycle ones (`enter_backstage`,
`mark_content_started`, `go_live`, `end`, `cancel`, `begin_processing`, `publish_replay`) and none of
them touch content. **The show moves only when the presenter presses a key in the deck tab.**

So every "the timeline drives X" requirement should be read today as "the presenter's keypress drives
X, when they reach the slide X was authored onto."

### DOC 03 — the thirteen things the timeline must drive

| # | Requirement | Verdict |
|---|---|---|
| 1 | slides / deck advance | **PARTIAL** — advance works, nothing drives it but a keypress |
| 2 | scene cues | **PARTIAL** — a per-slide mode class, not a cue system |
| 3 | presenter notes | **BUILT** — two disjoint screens, as specified |
| 4 | Prompt Drops | **PARTIAL** — push path and phone rendering built; fires on slide arrival, and there is no control to drop one ad hoc |
| 5 | QR moments | **NOT BUILT — deliberately rejected.** `broadcastSessionLinks.ts:8-13` argues one persistent QR, because a per-moment QR makes every previously shared link wrong the instant the moment moves. A design decision, not a gap. |
| 6 | phone companion state | **BUILT** — phone polls every 2.5s |
| 7 | polls | **BUILT** — server-side vote lock, tallies, theater reveal |
| 8 | Builder pulse | **PARTIAL** — the aggregate exists and is **instructor-only**; never exposed to viewers |
| 9 | Claude / Claude Code instructions | **PARTIAL**, and the two phone surfaces differ. Authored with `pasteWhere`/`ccMode`/`rescue`. `CompanionDeck` renders none of the three (`CompanionDeck.tsx:174-178`); the check-in page renders `pasteWhere` in its copy-button label and neither of the other two (`ClassCheckinPage.tsx:326`). Both render `expectedResult` and `stopCondition`. `ccMode` and `rescue` reach no viewer on either surface. |
| 10 | broadcast graphics / lower thirds | **NOT BUILT** — no graphics layer of any kind exists |
| 11 | "mark this moment" clip candidates | **BUILT server-side, but automatic.** Every slide advance writes a marker. In-points only. The admin read route has no UI caller, and the deck's own `M` key still writes to an in-memory array lost on tab close. |
| 12 | CTA | **PARTIAL** — a projected slide only; `CompanionState` has no CTA field |
| 13 | replay metadata | **PARTIAL** — lifecycle works; no chapters, no description, and nothing joins the clip markers to the replay |

### DOC 04 — viewer experience

| Surface | Requirement | Verdict |
|---|---|---|
| Desktop | persistent video, never interrupted | **BUILT** — the `<video>` is a sibling of `<Outlet/>` in the layout route, so it is literally the same DOM node across navigations |
| Desktop | Prompt | **BUILT 2026-10-31 (fuller than the phone's).** `LivePromptCard` with `full` is the only surface anywhere that renders `pasteWhere`, `ccMode` and `rescue` — three fields the instructor deck has been sending since it shipped. |
| Desktop | Poll | **BUILT 2026-10-31** — the companion deck, reused rather than reimplemented, so there is one poll loop on the page instead of two. |
| Desktop | Chat/Builder Room | **BUILT 2026-10-31** — `SessionChatPanel`, the first reader this thread has ever had. See finding 2. |
| Desktop | Claude Code controls | **PARTIAL.** The prompt card now tells the viewer which tool and which mode. Nothing launches anything: `pasteWhere`/`ccMode` are free text written per week ("Claude Code", "Plan Mode"), and guessing a destination from prose sends somebody to a chat window for a terminal exercise. A real launch control needs the session builder's tool-mode declaration (requirements §9). |
| Desktop | Build progress | **NOT BUILT.** Nothing in `CompanionState` carries a viewer's position in the lab, so there is no progress to render. This one needs a server-side notion of build steps before it is a UI task at all. |
| Phone | sticky live video | **BUILT** |
| Phone | one-thumb interaction | **BUILT** — every control ≥56px, pulse is optimistic |
| Phone | Prompt | **BUILT (subset)** — see DOC 03 row 9 |
| Phone | Poll | **BUILT** |
| Phone | Chat | **NOT BUILT** in the companion. The older check-in page can ask a question, but no student ever reads the thread — only the instructor deck does. |
| Phone | Build | **NOT BUILT** |
| Phone | "Following / Building / Stuck / Finished" | **BUILT — exact label match** (`CompanionDeck.tsx:50-55`), and the wire values match the DB CHECK constraint |
| Phone | "Open in Claude" | **NOT BUILT** |
| Phone | "Save Claude Code version for later" | **NOT BUILT** — copy-to-clipboard is the only prompt action |
| Second screen | persistent QR resolves to the current session context, server decides | **BUILT** — though "current" means the deck's current slide |
| Second screen | context QR deep-links to a poll/prompt | **NOT BUILT — deliberately rejected**, same decision as DOC 03 row 5 |

### Four findings worth acting on independently of the ladder

1. **The laptop "Watch now" button links to the page it is on.** `resolveSessionMoment` returns
   `watchUrl = sessionWorkspaceUrl(sessionId)` (`broadcastSessionLinks.ts:111`), which is
   `/portal/live/<sessionId>` (`:37-39`) — the exact route that renders `LiveSessionPage`
   (`portalRoutes.tsx:131`). The code comment above it says *"The laptop surface sends the viewer to
   the workspace"*, and there is no separate workspace: this page is it. Verified by hand, not taken
   on report. Desktop viewers can still watch via the persistent mini player, so this is a dead
   affordance rather than a blocked path — but it is a shipped self-link on the primary watch button.

   **Fixed 2026-10-31, inside §9 item 4 rather than as a separate patch**, because the right fix
   depended on what the desktop page became. The page no longer reads `watch_url` at all; the
   workspace's watch control is `BroadcastWatchButton`, which opens the in-app player and renders
   nothing when there is nothing to offer. The server keeps sending the field and is right to: the
   URL is genuinely where a viewer watches, and the defect was a page linking to itself, not a
   wrong URL. A test now fails if any anchor on the page points back at its own route.

2. **Three features are complete server-side with no reader.** Clip markers (admin API, no UI), the
   producer audience read `GET /api/portal/broadcasts/:id/audience` (no caller anywhere in
   `frontend/src`), and the session chat thread (students write, students never read). This is the
   same declared-but-unreachable pattern already recorded for `access_mode` and
   `broadcast_series.default_access_mode`; `broadcastClipListController.ts:10-14` names it as
   recurring in this subsystem.

   **Two now, not three. The chat thread got its reader on 2026-10-31** (§9 item 4), and giving it
   one surfaced two defects that could not have been observed while nothing read it: the response
   handed every classmate the author's `enrollment_id`, and `limit` with `ORDER BY ASC` returned the
   OLDEST hundred messages, so a class past a hundred lines would have shown a thread frozen on its
   first hour with no new message ever arriving. Both are fixed and pinned by tests. That is the
   argument for closing this defect class rather than tolerating it: an unread feature is not
   half-working, it is unmeasured.

   **One now. The audience read got its caller on 2026-11-01** (§9 item 3) — the producer strip,
   which is the surface on the page where a producer already stands. It is still a **separate
   request** from the lifecycle control and must stay one: the audience route answers 503 with no
   count when collection fails, by design, and the control has to survive that.

   Giving it a reader surfaced the same thing the chat thread did — a defect that could only be
   observed once something consumed it. Here it is a **rate limit**, not a response shape: the
   route carries the *command* limiter, 30/min, shared with the producer's own commands, because
   when it was written "a producer looking at a dashboard, not a player polling" was true and no
   caller existed to contradict it. A naive 5s poll would have put a viewer counter in competition
   with Go Live for the same budget. Handled in the client for now (15s, and only while on air);
   the real fix is the route's own limiter, and it is recorded here so the next caller does not
   rediscover it.

   **Only clip markers remain** (admin API, no UI). Three became two became one, and in both closed
   cases the act of reading a feature is what exposed what was wrong with it. That is the argument
   for closing this class rather than tolerating it: an unread feature is not half-working, it is
   unmeasured.

3. **Participation is keyed on `session_id`, not `occurrence_id`** (`ensureLiveSessionSchema.ts:134-169`),
   while clip markers are occurrence-keyed. The keying mismatch is real. The consequence this
   document drew from it was not.

   **CORRECTION, 2026-11-01 — the consequence was backwards.** This said re-airing a session
   "would merge its participation across both airings," which reads as a defect sitting in the
   data today. It is not, because **a session cannot be re-aired at all.**
   `uq_broadcast_source_ref` is UNIQUE on `(source_type, source_id)`
   (`ensureBroadcastSchema.ts:168-169`), so a live session holds **at most one** occurrence — by
   constraint rather than by convention, which is what `broadcastSessionOccurrence.ts` means when
   it says idempotency is the database's job. Every session→occurrence lookup in the backend goes
   through that ref (producer state, session links, clip markers, the active query, the clip
   list); there is no second creation path outside the backfill runner; and the only
   `DELETE FROM broadcast_occurrences` in the repo is that runner's own batch reversal, which
   touches only rows carrying a `batch_id` and so can never remove one created by normal
   operation. Participation and clip markers are therefore 1:1 for every airing that exists.
   Nothing is merged, and nothing in the data needs repairing.

   **What this finding actually is: a precondition, recorded in the wrong order.** The day a
   session is allowed to hold two occurrences — to re-run a class for a second cohort, or to give
   a cancelled one another chance — participation merges across both airings silently, because
   eight tables key on the session and none of them key on the airing: `attendance_records`,
   `session_pulse`, `session_chat_messages`, `session_poll_responses`, `session_broadcast`,
   `session_guests`, `session_guest_poll_responses`, `session_raffle_winners`. So occurrence-keying
   participation is work that has to land **before** re-airing is supported, not after someone
   notices two classes sharing one attendance roll. That ordering is the useful content of this
   finding, and it connects directly to finding 5.

4. **The highest-traffic live surface has no tests, and the QR never reaches the companion.**
   `ClassCheckinPage.tsx` is where the room QR actually lands — `sessionPersistentUrl` resolves to
   `/portal/class-checkin/<sessionId>` (`broadcastSessionLinks.ts:47-49`,
   `sessionReminderEmail.ts:42-44`), routed at `portalRoutes.tsx:126`. It does **not** hand off to
   the companion deck: it polls companion state and renders polls and prompts itself, and its onward
   button goes to the session's room or `/portal/today` (`ClassCheckinPage.tsx:179`). So
   `/portal/live/<sessionId>/companion` is reached only by typing or linking it directly.

   It has zero test coverage while duplicating ~130 lines of companion logic, and the status labels
   were not the same set.

   **CORRECTION, 2026-10-31 — the first version of this finding was wider than the code.** It
   presented three states as what the check-in page *offers*, full stop. Re-read against the file:
   the line reference was right but the scope was not. The page has **two** controllers, and only
   one of them had dropped a state:

   | Controller | States offered, before the fix |
   |---|---|
   | `CompanionDeck` (`/companion`) | Following · Building · Stuck · Finished — exact DOC 04 match |
   | Check-in page, default screen | "I'm here" · Building · "I'm stuck" · Finished — all four, two labels adrift |
   | Check-in page, **Build Mode** | Building · "I'm stuck" · Finished — **`here` missing** |

   So a viewer who is only following along *could* say so on the status screen. What they could not
   do was say so **during Build Mode** — the one segment where an instructor most needs to know who
   is following rather than building — and a student who had already tapped it watched their own
   status disappear from the grid when the instructor moved to a prompt. The under-reporting is real
   but confined to that segment, not to the whole airing. **Test 2's pulse data should be read with
   that narrower caveat, not the broad one this document first gave.**

   **Fixed 2026-10-31.** DOC 04's set now lives in one module (`frontend/src/components/portal/
   livePulse.ts`) that both surfaces import, so the two cannot drift again; both check-in
   controllers render all four through one `PulseGrid`; and the labels match the companion exactly.
   Wire values are untouched, so nothing already recorded is affected.

   **Also fixed: the page now has tests** — 25 of them, the first coverage it has ever had, covering
   attendance recorded exactly once, the sign-in round trip carrying the student back to this URL,
   both pulse controllers, the poll, a question that could be double-posted by pressing Enter twice,
   and the 2026-08-20 lost-connection incident in both directions. `CompanionDeck.tsx:15-21` declined
   to extract from this file *because* it had no coverage; that reason is now gone.

   **Still open here:** the QR still never reaches `/portal/live/<sessionId>/companion`, which
   remains reachable only by typing it. Whether the two surfaces should converge is a product
   decision, not a cleanup — they are now consistent in what they ask, which was the part that
   corrupted a measurement.

5. **"Cancel this airing" is a one-way door, and nothing in the product said so.** Found
   2026-11-01 while checking finding 3, and it is the finding that matters more of the two.

   Three facts that are each individually reasonable:

   | Fact | Where |
   |---|---|
   | `cancelled` has no outbound transition — it is terminal, with an empty list | `broadcastStateMachine.ts` (`cancelled: []`) |
   | A session holds at most one occurrence, by UNIQUE index | `ensureBroadcastSchema.ts:168-169` |
   | Re-timing an occurrence is refused outside `scheduled` and `backstage` | `broadcastSessionOccurrence.ts` (`RETIMEABLE`) |

   Together they mean one confirmed click permanently retires a class from Colaberry Live. The
   producer strip offers **Cancel this airing** with a confirmation on any scheduled occurrence,
   which is exactly the right button to have — a class called off for weather or an absent
   instructor is an ordinary Thursday. What follows is not ordinary: the occurrence can never
   leave `cancelled`, the session can never be given a second occurrence, and re-scheduling the
   class in the admin modal is **accepted, writes nothing, and reports nothing** to the person who
   did it. `enableLiveForSession` logs the refusal to the server and returns void by design
   (a broadcast problem must not fail session creation), the admin page has no error surface at
   all, and the next signal anybody gets is an empty room at the top of the hour.

   **The refusal also named the wrong reason.** Both the aired states and `cancelled` came back as
   `already_aired` — the single thing that is not true about a show cancelled before it ever
   aired, and a reason that sends whoever reads the log looking for a recording of something that
   never happened. **Fixed 2026-11-01**: `cancelled` is its own refusal reason, and a table test
   keyed on `Record<EditorialState, …>` now places all eight states, so a ninth cannot be dropped
   into the wrong bucket by default.

   **Also fixed: the producer is told before the click, and after it.** The confirmation now says
   the class cannot be put back on air and that re-scheduling will not bring the broadcast back;
   a cancelled occurrence explains that instead of answering with "Nothing to do from here", which
   is what it said for a class sitting quietly in backstage. The copy moved into
   `producerStripCopy.ts` and is unit-tested, because a sentence carrying that much consequence
   should not be an assertion buried in a render.

   **Not fixed, because it is not Claude Code's call** (§10 decision 5): whether a cancelled class
   should be able to go back on air at all. Both candidate designs cross a governance boundary —
   one changes the terminal-state set the health loop and discovery both read, the other changes
   occurrence identity — and either one makes finding 3 live on the day it ships.

---

## 9. Recommended order from here

The bootstrap's own tie-breaker for choosing the next task (§16) is: launch blocker → dependency
unlock → external prerequisite → provider spine → testability → user-facing orchestration →
production polish. Applying it:

1. **Close the R0 Zoom item properly.** The four preconditions and the fallback are now written into
   `go-live-colaberry-live-broadcast.md` §2 as part of this change. What remains is the half only a
   human can do: **the host opens a throwaway meeting on the desktop client and confirms the menu
   item is there.** Cheap, five minutes, and it is the thing that cost the last event.

2. **Run Test 2.** This moved to the top of the build-independent work once the audit came back,
   because it turns out Test 2 is **not** blocked on building anything. Eight of its ten items are
   built and deployed — discovery, persistent player, navigation-without-restart, companion QR, poll,
   Prompt Drop, end, replay processing — and the other two (Builder pulse to viewers, reconnect) are
   partial rather than absent. **It has simply never been run with five people.** That makes it the
   cheapest high-information action available: it needs no code, it exercises the whole spine, and
   every one of the four §8 findings would show up in it.

   **The run sheet is `directives/run-test-2-private-five-person-airing.md`**: the four hard gates
   that must be true before five people's time is spent, the five roles and the device each holds,
   all ten §15 checks with what proves a pass and which two are expected to come back partial, the
   evidence to capture, and what a passed Test 2 does *not* establish. It puts one phone on each of
   the two surfaces in §8 finding 4 deliberately, because the difference between them is the most
   valuable thing the run can produce.

   Running it also unblocks Test 3 honestly. The staff pilot asks Piyush, Sohail and Aleem to
   *evaluate* the experience, which is a poor use of three people's time if the first five-person
   airing has not happened yet.

3. **P4-02 — a Go Live / End control. BUILT 2026-10-31.** The procedure depended on three
   hand-sent API calls with a version token, at showtime, by whoever had a console open. That was
   the single largest source of operational risk left in the spine.

   The prerequisite is worth recording, because it is why this took a backend change rather than a
   button. The only endpoint that returned the occurrence `version` was the playback grant
   (`broadcastController.ts:235`, and again on the replay branch at :287). On a `scheduled`
   occurrence there is no live input yet, so `resolvePlaybackTarget` is `'none'` and the route
   answers **503 `ProviderNotReady` with a body of `{ error, reason }` and no version**
   (`broadcastController.ts:205-212`). Discovery could not fill the gap either:
   `ACTIVE_DISCOVERY_STATES` is `['live','reconnecting']`, so a scheduled occurrence is not in it,
   and its columns never included `version`. Since `enter_backstage` is what makes the platform
   start watching for the stream, it must be sent *before* a stream exists — so **the first command
   in the sequence was the one command whose version could not be obtained.**

   **What was built, and why not either option this section first proposed.** Neither "staff
   discovery exposes `version`" nor "the 503 carries it" was taken. Both would have bolted a
   lifecycle fact onto a route that exists for something else — and the second is worse than it
   looks, because it puts the number a producer needs most into an error body they get only when
   the feed is *not* working. Instead:

   - `GET /api/portal/broadcasts/session/:sessionId/producer`, staff-only, keyed on the session
     because that is what a producer holds. It returns state, feed health, version, and **which
     commands are available with the server's reason for each that is not.**
   - That availability is **derived** by running the real state machine
     (`describeProducerCommands`), never restated. A second table of "Go Live needs provider health"
     would have been a second place to forget that going live takes two keys.
   - It is deliberately **not** folded into the audience read, the other producer-facing endpoint,
     which answers 503 with no count field when telemetry collection fails. Coupling the lifecycle
     read to telemetry health would take the control away at exactly the wrong moment.
   - A `ProducerStrip` on `/portal/live/<session_id>` is its caller, laptop-only, polling every 5s
     so the pre-air wait is visible. It renders **nothing** unless the server calls the viewer a
     producer — this page is public and students load it.
   - A latent defect fixed on the way: the End control has read a `version` off a 409 since it
     shipped, and the command route never sent one, so every conflict reported "someone moved this"
     and no way forward. The refusal now carries the version that is actually current, re-read after
     a lost write race rather than echoing the one that just failed.

   **The live clock and the viewer count. Built 2026-11-01.** Both of these were already on the
   wire and neither was rendered, which is the same defect class as §8 finding 2 and worth counting
   as one: `content_started_at` and `scheduled_start_at` came back on every producer read and went
   unread, and `GET /api/portal/broadcasts/:id/audience` had **no caller at all** from the day it
   was written.

   - **The clock counts up past a missed start** rather than resting a countdown at 0:00. That is
     the reading that changes a decision: four minutes past the hour with Go Live still blocked is
     a different situation from thirty seconds early, and the strip could already show the *reason*
     for the pre-air wait but never its cost. It also reports how long a finished airing ran, from
     `content_started_at` and `ended_at` — and shows nothing when `ended_at` is null, which real
     production rows are, because nothing wrote that column until recently.
   - **The clock is the producer's laptop against the server's timestamps**, and that is stated in
     `producerClock.ts` rather than hidden. A start instant slightly ahead clamps to 0:00; one more
     than a minute ahead shows **no clock at all**, because a wrong duration rendered confidently
     is worse than a blank. A clock skewed into the past is *not* handled and cannot be from the
     client alone — the fix, if it ever matters, is a server `now` on the producer read.
   - **Zero watchers and a broken counter stay different sentences.** The route goes to real trouble
     to keep them apart — a collection failure answers 503 with **no count field at all**, so no
     client can print a fabricated zero — and the usual `?? 0` on the way in would have undone all
     of it in one character. The chip reads `0 watching`, `not measuring`, or `no answer`, and a
     kept number marked `not updating`; three different faults, three different sentences.
   - **The count is a second request on a slower cadence, and that is a rate limit rather than
     taste.** The audience route carries the **command** limiter, 30/min, shared with the producer's
     own commands — it was written before any client called it, when "a producer looking at a
     dashboard, not a player polling" was true. At the state read's 5s this control would spend 12
     of those 30 a minute, and a go-live sequence that hit a version conflict could find its
     commands throttled by a viewer counter nobody acts on. It polls at **15s**, and **only while
     on air**. If a later surface needs it fresher, the route needs its own limiter — the argument
     `producerStateLimiter` already makes on the backend — not a smaller number in the client.

   **Preview-vs-program is not a software task in this repo, and should stop being listed as one.**
   There is exactly one provider input (`cloudflareStreamProvider.ts`). Cutting between a preview
   bus and a program bus is a vision-mixer function: it belongs to the studio in **P4-01/R5**, which
   is Piyush's, and a software imitation of it — a second player labelled "preview" fed from the same
   single input — would be worse than its absence, because it would read as a monitor that is not
   monitoring anything. Note also that `PreviewBound` in `broadcastPlaybackGrant.ts` is **not** this:
   it is the paywall's free-preview window for an Explorer, which shares only the word.

   **The cancel button now says what it costs, 2026-11-01.** Adding a control for every command
   the state machine offers meant shipping **Cancel this airing**, and checking what it actually
   does turned up §8 finding 5: cancelling permanently retires a class from Live, and the
   confirmation said only "This cannot be undone" — true of the airing, silent about the class.
   The confirmation now reaches past the airing, a cancelled occurrence explains itself instead of
   answering "Nothing to do from here", and the backend stops reporting a never-aired show as
   `already_aired`. The copy lives in `producerStripCopy.ts` and is unit-tested: it is the only
   warning anyone gets before an irreversible action, which is a poor thing to leave as a string
   inside a render. Whether the door should open again is §10 decision 5.

   **Still open in P4-02:** the segment rundown, and only that.
4. **The desktop viewer — R4's largest hole. Built 2026-10-31.** Five of DOC 04's six desktop
   requirements were missing: Prompt, Poll, Chat/Builder Room, build progress and Claude Code
   controls all existed only in the phone branch.

   **The question this item posed answered itself: the desktop page is now the interactive
   surface**, not a status card. DOC 04 asks the laptop for the rail, and once it has one there is
   nowhere for a "Watch now" link to go — so the self-link in §8 finding 1 died here rather than in
   a patch of its own, exactly as this item proposed.

   - `LiveWorkspace` (`frontend/src/components/portal/LiveWorkspace.tsx`) is the two-column laptop
     rail: prompt and poll on the left, chat on the right, collapsing to one column under 900px.
     It renders no video of its own, and a test fails if it ever does — the persistent player is a
     sibling of `<Outlet/>` in the layout route, which is how "no forced video interruption" is
     implemented as a DOM fact rather than a promise.
   - `LivePromptCard` was extracted from the companion deck so both surfaces share one
     implementation and differ only in how much of a prompt fits. The laptop's `full` variant is
     the first thing anywhere to render `pasteWhere`, `ccMode` and `rescue`.
   - `SessionChatPanel` is DOC 04's Chat/Builder Room and the first reader of
     `GET /api/portal/sessions/:id/chat`. Two latent defects fell out of reading it; see §8
     finding 2.
   - The composer states who can see a message, because the same thread has been written into
     through "Ask a question" with only an instructor on the other end.

   **Still open in item 4, and named rather than quietly dropped:** build progress (needs a
   server-side notion of a viewer's position in the lab — nothing in `CompanionState` carries one),
   a launch control for Claude/Claude Code (needs requirements §9's tool-mode declaration), and
   chat on the *phone* companion, which is a different design problem: a scrolling thread under a
   thumb competes with the one-tap controls the surface exists for.

5. **R5 studio, in Piyush's stated order** — equipment, then HeyGen, then sample, then production.
   This is unblocked today, is not Claude Code work, and gates Tests 3 and 4. It should run in
   parallel with everything above, because it belongs to a different person.

6. **R7, starting with the file-out path.** The first brick is getting the recording, transcript and
   clip candidates out of the system in a form an editor can open, plus the production brief §9 of
   the requirements already expects session setup to generate. The other ten outputs belong to
   Piyush, Sohail and Aleem, and they need the files before anything else matters.

7. **R8 and R10** are reporting layers over the above and should trail them.

**What I would reorder, and why.** Two things changed my own first answer, and both are worth stating
plainly because they cut against the instinct to build:

- **R7 should not come next.** It is five releases downstream of a deadline that has already passed
  its useful date, and more importantly there is nothing to run through it. A content engine built
  before there is a recording to process is the most expensive possible ordering — it would be tested
  against synthetic input and then meet its first real session with no coverage that counts.
- **Almost nothing above item 4 is a build task.** The Zoom check is five minutes of one person's
  time. Test 2 is an event, not a feature. R5 is Piyush's. The only engineering on the critical path
  is P4-02 and its small version prerequisite. That is a much cheaper week than it looked like
  yesterday, and the reason it looked expensive is that the content engine was being treated as the
  next thing when the requirements put it sixth.

---

## 10. Decisions that are Ali's, not Claude Code's

1. **The deadline.** 31 October cannot be met as specified. What moves — the date, the scope of the
   first public airing, or the definition of "public" — is a scheduling decision.
2. **Publication consent for student-visible material.** Clips, Shorts and the long-form video will
   contain participants. The requirements state that public/promotional clips *"require publication
   approval and cannot include paid/private material without an explicit policy grant."* No such
   grant exists yet.
3. **How recordings reach an external contractor.** Every route in the system today requires a portal
   participant JWT. There is no export, no download, no share link and no external credential. How
   Piyush receives a file is an access-model decision, not an implementation detail.
4. **The raw-live retention call per airing** (§12's four-way policy) needs a named decider.
5. **Can a cancelled class go back on air?** Raised 2026-11-01 by §8 finding 5. Today the answer
   is no, permanently, and that is now said out loud in the producer's own confirmation rather
   than discovered at showtime. Whether it should stay no is a product question — "this airing is
   off" and "this class is retired from Live" are different promises, and the button says the
   first while the system does the second.

   Both ways of changing it cross a governance boundary, which is why neither was taken:

   | Option | What it costs |
   |---|---|
   | **A. Make `cancelled` non-terminal** for an occurrence that never started content, reusing the existing `return_to_scheduled` command with a `content_started_at IS NULL` guard | Changes `TERMINAL_STATES`, which the health loop and discovery both read. The guard is necessary rather than optional: `cancel` is reachable from `live`, so some cancelled occurrences did air, and reviving one of those is how an airing silently inherits the previous audience's participation (finding 3). |
   | **B. Re-point the source ref** to a fresh occurrence, leaving the cancelled one in history unlinked | No schema change and every reader follows the ref, so it is the smaller diff — but `occurrence_key` is UNIQUE and embeds the start instant, so re-enabling a class at the *same* date and time collides. Avoiding that means changing what an occurrence's identity is, which is the one thing the backfill's convergence depends on. |

   **A third answer is legitimate and may be the right one:** leave it permanent, and put the
   warning in front of the button — which is what shipped. Cancelling a broadcast is rare, and a
   control that is honest about being irreversible is better than a revival path with a guard
   nobody maintains. What is **not** acceptable is the state before this change, where the button
   under-described what it did and the re-schedule that followed failed in silence.

   Either A or B makes finding 3's participation keying load-bearing on the day it ships, so that
   work is a precondition and not a follow-up.

---

## 11. The 48-point definition of done

§19 of the bootstrap lists 48 conditions, and opens with the line worth quoting in full:

> **"Colaberry Live is not complete merely because broadcast code exists."**

The 48 points span the Basecamp project and access (1–4), the provider spine (5–9), session setup and
participation (10–19), the studio (20–23), avatar and voice (24–26), distribution and replay (27–30),
testing and launch (31–36), documentation and enablement (37–44), and artifacts and case study
(45–48).

**This document does not give a completion count, because an honest one is not currently
obtainable.** Items 1–4 and 45 require reading the Basecamp project, items 20–26 require a status
report from Piyush on physical equipment and avatar training, and item 6 is the Zoom account setting
that §4.2 shows was never verified end to end. What can be said without guessing: the provider spine
(5, 7, 8, 9) and replay processing (28, 29) are satisfied; 30, 31, 32, 34, 35 and 36 are not; and the
unsatisfied items cluster in the studio, avatar, distribution and documentation blocks — which is to
say, in the releases that have not started rather than in the code that has been written.
