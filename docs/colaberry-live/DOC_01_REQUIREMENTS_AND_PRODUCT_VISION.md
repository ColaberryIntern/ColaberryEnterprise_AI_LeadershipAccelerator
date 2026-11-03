# DOC 01 — Colaberry Live: Requirements & Product Vision

| | |
|---|---|
| **Required by** | `docs/requirements/COLABERRY_LIVE_BASECAMP_BOOTSTRAP_v2.md` §3.1, consolidating §0, §9, §12, §13 |
| **Basecamp ticket** | L11.8 |
| **Owner** | Ali Muwwakkil |
| **Written** | 2026-11-03 |
| **Start here** | DOC 00 |

This is the consolidated product vision: the sixteen things Colaberry Live must be, each with what
the requirements ask for and where the build actually stands. Built-state verdicts are **BUILT**,
**PARTIAL** or **NOT BUILT** — never "in progress", which is not a state the code can be in. Every
verdict traces to `docs/COLABERRY_LIVE_PROGRAM_SPEC.md` §8, audited 2026-10-30 and corrected
through 2026-11-02, or to `docs/COLABERRY_LIVE_TRACEABILITY_MATRIX.md`.

**This document is also the place of record for product-definition changes.** The bootstrap names it
specifically: if the product team changes the definition of an Activated Architect, the decision is
recorded here.

---

## Session setup, similar to Accelerator Sessions

Ali must be able to create a live class the way he creates an Accelerator Session. The setup must
support: title; description; date and time; audience and access mode; duration;
public/private/paid/preview; show or series identity; live provider; YouTube output selection;
replay policy; CTA; build topic; tool mode (Claude, Claude Code, or both); Prompt Drops; polls;
questions; Builder pulse; community/Builder Room; timeline scenes; presenter notes; broadcast
scenes; QR behavior; artifact or challenge; and a post-show media brief.

Readying the session must generate or prepare: a Broadcast Occurrence; a persistent public workspace
URL; a phone companion URL; a QR; a replay identity; a show rundown; prompts; an agent-readable
prompt version; a production brief; a YouTube metadata draft; a launch and readiness checklist; and
analytics or tracking IDs.

**Current state: PARTIAL.** Session creation exists and enabling live for a session creates the
occurrence. **The session builder does not expose most of the fields above** — notably tool mode,
which DOC 04's Claude Code controls depend on. `pasteWhere` and `ccMode` are free text authored per
week rather than a declared tool mode, which is why a real launch control cannot be built yet.

---

## Timeline-generated live experience

The Session Timeline is the show rundown. It must drive the live experience rather than merely
describe it.

**Current state: PARTIAL, and this is the one structural fact that drives most other rows in this
program. There is no timeline runtime.** What exists is the run of show as static template data
(`backend/src/services/classKit/runOfShow.ts`), persisted as a record in `live_sessions.kit_json`,
plus one last-write-wins current-view row `session_broadcast (session_id PK, state JSONB)`. The only
cursor in the system is `slide_index` in that row.

Nothing advances it on a clock — `broadcastStateMachine.ts:12` states the rule outright: *"NO
transition here is driven by the clock. Time cannot publish anything."* Nothing advances it on a
producer action either; the producer commands are lifecycle-only. **The show moves when the
presenter presses a key in the deck tab.** Read every "the timeline drives X" requirement as "the
presenter's keypress drives X, when they reach the slide X was authored onto." Full detail in
DOC 03.

---

## Automatic broadcast occurrence creation

Readying a session must create its airing without a separate manual step.

**Current state: BUILT.** `enableLiveForSession` creates the occurrence, and idempotency is the
database's job rather than a convention: `uq_broadcast_source_ref` is UNIQUE on
`(source_type, source_id)` (`ensureBroadcastSchema.ts:168-169`), so **a live session holds at most
one occurrence.**

Two consequences that matter more than the row itself:

- **A session cannot be re-aired at all**, by constraint. Re-running a class for a second cohort is
  not currently possible.
- **"Cancel this airing" is a one-way door.** `cancelled` is terminal with an empty outbound
  transition list. One confirmed click permanently retires a class from Colaberry Live, and
  re-scheduling it in the admin modal is accepted, writes nothing, and reports nothing. The
  producer is now warned before and after the click, and the refusal names `cancelled` as its own
  reason rather than the false `already_aired`. **Whether a cancelled class should be able to go
  back on air is an open product decision**, not a cleanup — both candidate designs cross a
  governance boundary.

---

## Live viewer experience

A viewer watches inside Colaberry, participates, and is never interrupted by the video restarting.

**Current state: BUILT for the core, PARTIAL for participation.** The desktop `<video>` is a sibling
of `<Outlet/>` in the layout route, so it is literally the same DOM node across navigations —
navigation cannot restart it. Prompt, poll and chat all landed on the desktop surface on 2026-10-31.
**Build progress is NOT BUILT**: nothing in `CompanionState` carries a viewer's position in the lab,
so there is no progress to render. That needs a server-side notion of build steps before it is a UI
task at all. Full matrix in DOC 04.

---

## Desktop and mobile behavior

Desktop: persistent video, prompt, poll, chat and Builder Room, build progress, Claude Code
controls, no forced video interruption. Phone: sticky live video, one-thumb interaction, prompt,
poll, chat, build, the Following/Building/Stuck/Finished pulse, "Open in Claude", and "Save Claude
Code version for later".

**Current state: PARTIAL, and the two surfaces differ in ways that are not obvious.** The desktop
prompt card is *fuller* than the phone's — it is the only surface anywhere that renders `pasteWhere`,
`ccMode` and `rescue`, three fields the instructor deck has been sending since it shipped. The phone
companion renders none of the three. Phone chat, phone build, "Open in Claude" and "Save Claude Code
version for later" are all NOT BUILT. Every control on the phone is at least 56px and the pulse is
optimistic, so one-thumb interaction is genuinely met. Full matrix in DOC 04.

---

## QR and phone companion

One persistent session QR that resolves to the current session context, with the server deciding
what "current" means. A viewer on a computer may scan it and use their phone as a companion
controller.

**Current state: BUILT, with one real gap and one deliberate rejection.**

- The persistent QR works, and "current" means the deck's current slide.
- **The QR does not land on the companion deck.** `sessionPersistentUrl` resolves to
  `/portal/class-checkin/<sessionId>`, which polls companion state and renders polls and prompts
  itself rather than handing off. `/portal/live/<sessionId>/companion` is reached only by typing or
  linking it directly. Whether the two surfaces should converge is a product decision; they are now
  consistent in what they *ask*, which was the part that was corrupting a measurement.
- **Per-moment QR deep links are NOT BUILT, deliberately.** `broadcastSessionLinks.ts:8-13` argues
  for one persistent QR because a per-moment QR makes every previously shared link wrong the instant
  the moment moves. A design decision, recorded as such, not a gap.

---

## Prompt Drops

The instructor drops a prompt; viewers receive it, copy it, and run it.

**Current state: PARTIAL.** The push path and phone rendering are built. A prompt fires **on slide
arrival** — there is no control to drop one ad hoc, which is the gap that matters in a live room.
Copy-to-clipboard is the only prompt action a viewer has.

---

## Claude and Claude Code workflow

A viewer should be able to take the dropped prompt into Claude or Claude Code and build along.

**Current state: PARTIAL, and it is the largest coverage gap in the program.** The desktop prompt
card now tells the viewer which tool and which mode. **Nothing launches anything.** `pasteWhere` and
`ccMode` are free text written per week ("Claude Code", "Plan Mode"), and guessing a destination from
prose sends somebody to a chat window for a terminal exercise. A real launch control needs the
session builder's tool-mode declaration — which is the first requirement in this document.

**Definition-of-done items 17 and 18 — "the Claude pathway works" and "the Claude Code desktop
pathway works" — have no Basecamp ticket at all.** They are specified in requirements §9 and DOC 04
and are not covered by any open todo.

---

## Community and Builder Room

A live class feeds a community thread where builders talk to each other.

**Current state: PARTIAL.** `SessionChatPanel` landed on 2026-10-31 and is the first reader the chat
thread has ever had. Students had been writing into it for months and no student had ever read it.

Giving it a reader immediately surfaced two defects that could not have been observed while nothing
read it: the response handed every classmate the author's `enrollment_id`, and `limit` with
`ORDER BY ASC` returned the *oldest* hundred messages, so a class past a hundred lines would have
shown a thread frozen on its first hour. Both are fixed and pinned by tests. **An unread feature is
not half-working, it is unmeasured** — that is the standing argument in this subsystem for giving
every server-side feature a reader rather than tolerating the gap.

**Still open: nothing reads `access_mode`**, so "Builder Room at the agreed access tier"
(definition-of-done item 19) is unmet, and it has no ticket.

---

## Account conversion

The program's success measure is the funnel, not the audience size.

```
Watch → Participate → Prompt → Build → Save → $0 Colaberry Account → Community
      → Completed Artifact → Architect Progress
```

The bootstrap is explicit: **do not reduce success to YouTube subscribers.** Track live views,
unique viewers, average watch time, returning viewers, Prompt Drop opens, prompt copies, poll votes,
Builder Room participation, build starts, build completions, $0 account creations, completed
artifacts, and Activated Architects.

**Operational definition of an Activated Architect** — has a Colaberry account; has completed at
least one tracked build; has created or submitted at least one artifact. *If the product team
changes this definition, the change is recorded in this document.* Unchanged as of 2026-11-03.

**Current state: NOT BUILT as a measured funnel.** Build starts and build completions have no
server-side representation, so the middle of this funnel cannot be measured today regardless of how
many people watch.

---

## YouTube

YouTube is reach and distribution. Colaberry stays authoritative.

**Current state: NOT BUILT.** Simulcast is L8.1 and has not started. Detail and the retention policy
are in DOC 07.

---

## Replay

An airing ends, processes, and becomes a discoverable replay with honest metadata.

**Current state: PARTIAL.** The lifecycle works end to end, including `processing → ended` when
replay processing fails. Range-capable replay transport exists, and recordings bind to occurrences
(`broadcastRecordingBinding.ts`, with `broadcast_source_refs` UNIQUE). **No chapters, no description,
and nothing joins the clip markers to the replay.** Replay discovery and listing is L8.3.

---

## Media repurposing

One live session becomes a weekly media package: a long-form edit, 5–7 Shorts, transcript,
timestamps, hooks, thumbnails and Prompt Drop assets.

**Current state: the first brick exists and the rest is NOT BUILT.** Clip markers got their reader on
2026-11-01 — `SessionClipList` on the Class Kit, plus a CSV export, which is R7's first real
deliverable. Four things were learned in the process and are worth carrying into DOC 07: a marker is
a start point and an editor needs a range; every slide advance writes a marker so most rows are not
clip candidates; a plain `<a href>` download would 401 because the admin JWT is attached by an
interceptor rather than carried by the browser; and the same unmounted-feature habit exists on the
frontend (`ClassDetailsModal.tsx` is complete, self-fetching, and imported by nothing).

**The seven-phase build plan under-covers this entirely.** Its nearest task, P6-05, is scoped to the
in-portal replay surface. Nothing in P1 through P7 produces an edited long-form video, Shorts,
thumbnails, titles, descriptions, social captions or a videographer handoff. Build the seven phases
to completion and you still do not have R7. Full requirement in DOC 07.

---

## Studio operation

Ali teaches from a real studio: camera, microphone, light, wired network, OBS scenes and Zoom audio
routing with no duplicate audio.

**Current state: NOT BUILT — hardware, owned by Piyush.** The equipment list is researched and
approved (L6.1, done). Install and validation is L6.2; the OBS scene package and Zoom audio routing
is L6.3. **Both are open, and together they block Test 4, the operator manual (DOC 13) and five
launch tickets.** Full requirement in DOC 05.

---

## Test sessions

Six stages, in order, from a provider smoke test to the public production airing. *Do not jump from
a dark feature flag to a public launch.*

**Current state: one airing has happened.** A private airing on 2026-10-20 produced findings that
three tickets now cite. Whether it *satisfies* Test 2's ten checks is an open judgment of Ali's with
six launch tickets behind it, and it was never written up — L10.1 is the write-up. Tests 3 through 6
have not run. Test 6 did not stream on 2026-10-29 because of the Zoom client problem in DOC 00's
blocker list. Full ladder and the required evidence per stage are in DOC 08.

---

## Launch goal

**The hard deadline was October 31, 2026. It passed without a public production airing.** R9 is
unmet. 10 of the 48 definition-of-done conditions are satisfied as of 2026-11-03
(`docs/COLABERRY_LIVE_TRACEABILITY_MATRIX.md`).

The goal itself is unchanged: a real public airing of a live class, produced from the studio,
delivered through the app, participated in from phones, converted into accounts and builds, and
repurposed into a week of media. **Setting a new launch date is Ali's decision and is deliberately
not made in this document.**

---

## What is not built, in one list

Named explicitly rather than omitted, because a requirements document that only describes the target
is unusable for planning.

| Not built | Why it matters |
|---|---|
| **The timeline runtime** | DOC 03's thirteen drivers all degrade to "the presenter pressed a key" |
| **Build progress**, server-side and client-side | Breaks the middle of the conversion funnel; blocks two DOC 04 rows |
| **The Claude / Claude Code launch pathway** | Definition-of-done items 17 and 18 — and neither has a ticket |
| **Phone chat, phone build, "Open in Claude", "Save Claude Code version for later"** | Four DOC 04 phone requirements |
| **Broadcast graphics / lower thirds** | No graphics layer of any kind exists |
| **Replay chapters, descriptions, clip-to-replay join** | Replay metadata is lifecycle-only |
| **YouTube simulcast and the whole media engine** | R7 — and the build plan does not cover it |
| **Studio install, OBS scenes, Zoom audio routing** | Hardware, Piyush, blocks five launch tickets |
| **Avatar and voice** | R6, not started |
| **Anything reading `access_mode`** | Builder Room access tier unmet; the field is declared and unreachable |
| **A measured funnel** | Every conversion metric past "watch" |
| **DOC 10, the Current Build Migration Report** | Required by bootstrap §17; no ticket covers it |

**Deliberately rejected, not missing:** per-moment QR deep links, on both the DOC 03 and DOC 04
sides. One persistent QR is the design.
