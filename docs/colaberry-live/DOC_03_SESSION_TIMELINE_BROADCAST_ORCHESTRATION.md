# DOC 03 — Session + Timeline + Broadcast Orchestration

| | |
|---|---|
| **Required by** | `docs/requirements/COLABERRY_LIVE_BASECAMP_BOOTSTRAP_v2.md` §3.1 |
| **Basecamp ticket** | L11.8 |
| **Owner** | Ali Muwwakkil |
| **Written** | 2026-11-03. Built-state rows audited 2026-10-30, corrected through 2026-11-02. |
| **Start here** | DOC 00 · contract in DOC 02 · viewer surfaces in DOC 04 |

---

## The three-way model

| Concept | What it is | Where it lives |
|---|---|---|
| **Accelerator Session** | **The show definition.** Title, description, time, audience, access mode, duration, show identity, build topic, tool mode, CTA. One per class. | `live_sessions` |
| **Session Timeline** | **The show rundown and orchestration.** The ordered run of segments, slides, cues, prompts, polls and notes that make the class happen. | `backend/src/services/classKit/runOfShow.ts`, persisted in `live_sessions.kit_json` |
| **Broadcast Occurrence** | **One airing.** The thing that goes backstage, goes live, reconnects, ends, processes and becomes a replay. | `broadcast_occurrences` |

Read it as: the Session says *what the show is*, the Timeline says *how it runs*, the Occurrence is
*this particular performance of it*.

---

## A Session can have more than one Broadcast Occurrence

**This is a requirement. It is not what the code does, and the gap is the most consequential
requirement-versus-code divergence in the program.**

`uq_broadcast_source_ref` is UNIQUE on `(source_type, source_id)`
(`ensureBroadcastSchema.ts:168-169`), so **a live session holds at most one occurrence, by
constraint.** Idempotency is deliberately the database's job rather than a convention — which is
good engineering for the single-airing case and makes the multi-airing case impossible rather than
merely unimplemented.

Three things follow, and they should be read together:

1. **A class cannot be re-run for a second cohort** as a second airing of the same session. A second
   airing today means a second session.
2. **Canceling is permanent.** `cancelled` is terminal, the session cannot be given another
   occurrence, and re-scheduling in the admin modal is accepted, writes nothing, and reports
   nothing — the next signal anybody gets is an empty room at the top of the hour.
   `enableLiveForSession` logs the refusal server-side and returns void by design, because a
   broadcast problem must not fail session creation, and the admin page has no error surface.
3. **Supporting multiple occurrences requires occurrence-keying participation first.** Eight tables
   key on the session and none key on the airing: `attendance_records`, `session_pulse`,
   `session_chat_messages`, `session_poll_responses`, `session_broadcast`, `session_guests`,
   `session_guest_poll_responses`, `session_raffle_winners`. The day a session may hold two
   occurrences, participation merges across both airings silently. **That ordering is the useful
   content of this finding:** the keying work lands *before* re-airing is supported, not after
   someone notices two classes sharing one attendance roll.

Clip markers, by contrast, are already occurrence-keyed. So the keying is mixed today and
consistent only because the constraint forces a 1:1.

---

## There is no timeline runtime

**This is the one structural fact that drives most of the rows below, and it should be understood
before reading them.**

What exists is:

- the run of show as **static template data** (`runOfShow.ts`);
- persisted as a **record** in `live_sessions.kit_json`;
- plus a single current-view row `session_broadcast (session_id PK, state JSONB)`, **last-write-wins**;
- and the only cursor in the whole system is `slide_index` inside that row.

**Nothing advances it on a clock.** `broadcastStateMachine.ts:12` states the rule outright: *"NO
transition here is driven by the clock. Time cannot publish anything."* That rule is correct and
deliberate — a scheduled start time must not publish backstage content to an audience.

**Nothing advances it on a producer action either.** The only producer commands are lifecycle ones —
`enter_backstage`, `return_to_scheduled`, `mark_content_started`, `go_live`, `end`, `cancel`,
`begin_processing`, `publish_replay` — and **none of them touch content.**

> **The show moves only when the presenter presses a key in the deck tab.**

So read every "the timeline drives X" requirement below as **"the presenter's keypress drives X, when
they reach the slide X was authored onto."** Nothing is wrong with the authored data; what is missing
is a runtime that advances it, reacts to it, or lets anyone but the presenter move it.

---

## The thirteen things the timeline must drive

Verdicts are BUILT, PARTIAL or NOT BUILT — never "in progress", which is not a state the code can be
in.

| # | Requirement | Verdict |
|---|---|---|
| 1 | **slides / deck advance** | **PARTIAL** — advance works; nothing drives it but a keypress |
| 2 | **scene cues** | **PARTIAL** — a per-slide mode class, not a cue system |
| 3 | **presenter notes** | **BUILT** — two disjoint screens, as specified |
| 4 | **Prompt Drops** | **PARTIAL** — push path and phone rendering built; fires on slide arrival, and there is no control to drop one ad hoc |
| 5 | **QR moments** | **NOT BUILT — deliberately rejected.** `broadcastSessionLinks.ts:8-13` argues for one persistent QR, because a per-moment QR makes every previously shared link wrong the instant the moment moves. A design decision, not a gap. |
| 6 | **phone companion state** | **BUILT** — the phone polls every 2.5s |
| 7 | **polls** | **BUILT** — server-side vote lock, tallies, theater reveal |
| 8 | **Builder pulse** | **PARTIAL** — the aggregate exists and is **instructor-only**; never exposed to viewers |
| 9 | **Claude / Claude Code instructions** | **PARTIAL**, and the two phone surfaces differ. Authored with `pasteWhere` / `ccMode` / `rescue`. `CompanionDeck` renders **none** of the three (`CompanionDeck.tsx:174-178`); the check-in page renders `pasteWhere` in a copy-button label and neither of the other two (`ClassCheckinPage.tsx:326`). Both render `expectedResult` and `stopCondition`. **`ccMode` and `rescue` reach no viewer on either phone surface.** |
| 10 | **broadcast graphics / lower thirds** | **NOT BUILT** — no graphics layer of any kind exists |
| 11 | **"mark this moment" clip candidates** | **BUILT, and automatic rather than marked.** Every slide advance writes a marker; nobody presses anything. |
| 12 | **CTA** | **PARTIAL** — a projected slide only; `CompanionState` has no CTA field |
| 13 | **replay metadata** | **PARTIAL** — lifecycle works; no chapters, no description, and nothing joins the clip markers to the replay |

### Row 11 in detail, because it is the one that shipped and taught the most

Clip markers got their reader on 2026-11-01 — `SessionClipList` on the Class Kit, plus a CSV export,
which is R7's first real brick. Four things surfaced that a passing test suite could not have shown,
and all four belong in DOC 07's planning:

- **A marker is a start point and an editor needs a range.** One row per advance, no end. The out
  point is the next marker's in point — derivable from rows already held — and for the *last* marker
  it is the end of the recording, which is only knowable from `ended_at`. Real rows have a null
  `ended_at`, so **the last clip of an airing legitimately has no end** and is reported as unknown
  rather than measured against `now`, which would grow a duration every time the file was
  downloaded.
- **Every advance writes a marker, so most rows are not clip candidates.** A 38-minute class produces
  dozens and a handful are worth cutting. Handing an editor forty undifferentiated rows leaves him
  scrubbing the video, which is the precise cost this feature exists to remove. The authored note is
  recoverable because the policy's label precedence is
  `publicValue || segmentLabel || slideTitle` — a label equal to neither fallback is the authored
  sentence. The proper fix is for the write path to store what it chose, which needs a column on a
  shipped table and would only help future markers; deriving it works on the rows that already
  exist.
- **A plain `<a href>` download would 401**, and that is a trap for every future admin export. The
  admin JWT lives in `localStorage` and is attached by the `api` interceptor as a Bearer header, so
  an anchor straight to the CSV route carries no `Authorization` at all. The file is fetched through
  `api` and saved client-side.
- **Two things are still open on this row:** the deck's own `M` key writes to an in-memory array lost
  on tab close, and a `deck_drifted` advance records nothing at all.

---

## What the Session builder must ultimately generate

Readying a session is supposed to produce, automatically: a Broadcast Occurrence; a persistent public
workspace URL; a phone companion URL; a QR; a replay identity; a show rundown; prompts; an
agent-readable prompt version; a production brief; a YouTube metadata draft; a launch and readiness
checklist; and analytics or tracking IDs.

**Current state: PARTIAL.** The occurrence, the persistent URL, the QR, the replay identity and the
rundown exist. The production brief, the YouTube metadata draft, the readiness checklist and the
agent-readable prompt version do not.

**The missing input that blocks the most downstream work is tool mode.** Requirements §9 asks the
session setup to declare Claude / Claude Code / both. It does not, so `pasteWhere` and `ccMode` are
free text authored per week ("Claude Code", "Plan Mode") — and guessing a destination from prose
sends somebody to a chat window for a terminal exercise. **Every "launch the tool for me" feature in
DOC 04 waits on this one field.**

---

## The two class clocks

Found 2026-11-02 while building the segment rundown, which could not be built without choosing one.

| Clock | Minute zero comes from | What it governs |
|---|---|---|
| **The instructor's** | `localStorage.kit_start_<sessionId>`, set by a **Start class** button in the Present tab (`classKit/kitDeckScript.ts`) | The deck's pace bar — ON TIME / BEHIND n MIN — and the instructor-facing advice that reads off it |
| **The broadcast's** | `content_started_at`, written by the `mark_content_started` producer command | The free-preview window, every clip marker's timecode, the producer strip's clock, and the rundown |

**Neither reads the other, and the asymmetry is the finding:**

- The broadcast's anchor is **enforced** — `go_live` refuses with `ContentNotStarted` unless it is
  set, because going live without it would leave every viewer's preview window unbounded. It cannot
  be forgotten without the class failing to start.
- The instructor's anchor is **a button somebody has to remember.** Forget it and the pace bar reads
  "Not started" for a class that is on air. Press it twice, or open Present on a second machine, and
  it reads a different elapsed time — it is per-browser, resettable, and auto-stopped after three
  hours or when the room empties.

So the two can disagree by any amount, and since 2026-11-02 they disagree **visibly**: the
instructor's pace bar and the producer's rundown show the same reading computed from different
starts. `broadcastClipMarkerPolicy.ts` had already chosen `content_started_at` and said why — *"the
only trustworthy class clock"* — so the rundown uses the same one, and the clip list and the rundown
can never disagree about which second was minute zero.

**Not fixed, deliberately.** Seeding the deck's clock from `content_started_at` when the class is
airing is a contained change to a 653-line browser script, but it changes what **Start class** means
in front of a live room mid-program, and the Present tab doubles as the screen-recording source.
That is a product call about the teaching surface, and not one to land in the same week as an
airing.

---

## What is not built

| Gap | Consequence |
|---|---|
| **The timeline runtime itself** | Rows 1, 2, 4 and 12 are all "authored correctly, driven by a keypress". This is one piece of missing infrastructure, not four separate UI gaps. |
| **An ad hoc Prompt Drop control** | The instructor cannot drop a prompt that is not on a slide — the commonest live need. |
| **Broadcast graphics / lower thirds** (row 10) | No layer exists. Nothing to configure, author or cue. |
| **Builder pulse for viewers** (row 8) | Built, instructor-only. Viewers cannot see the room they are in. |
| **`ccMode` and `rescue` on either phone surface** (row 9) | Authored since the deck shipped, rendered to no phone viewer. |
| **Replay chapters, description, clip-to-replay join** (row 13) | The clip markers and the replay exist and do not know about each other. |
| **Session-builder tool mode** | Blocks DOC 04's Claude Code controls and definition-of-done items 17 and 18, neither of which has a ticket. |
| **Multiple occurrences per session** | A requirement of this document that the schema forbids. Needs the eight-table keying change first. |
| **The deck's `M` key, and `deck_drifted` advances** | Marker loss on tab close; silent non-recording on drift. |
