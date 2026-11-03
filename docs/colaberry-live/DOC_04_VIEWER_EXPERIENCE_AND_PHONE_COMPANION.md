# DOC 04 — Viewer Experience + Phone Companion

| | |
|---|---|
| **Required by** | `docs/requirements/COLABERRY_LIVE_BASECAMP_BOOTSTRAP_v2.md` §3.1 |
| **Basecamp ticket** | L11.8 |
| **Owner** | Ali Muwwakkil |
| **Written** | 2026-11-03. Built-state rows audited 2026-10-30, corrected through 2026-11-02. |
| **Start here** | DOC 00 · orchestration in DOC 03 |

This is the surface a viewer actually touches. Three sets of requirements — desktop, phone,
second-screen — each with the verdict and the file that settles it.

**The most useful thing to know before reading the tables: the desktop prompt surface is *fuller*
than the phone's.** That is the opposite of what a "phone companion" program implies, and it means
the phone is the surface with the real gaps.

---

## Desktop

| Requirement | Verdict |
|---|---|
| **Persistent video, never interrupted** | **BUILT.** The `<video>` is a sibling of `<Outlet/>` in the layout route, so it is literally the same DOM node across navigations. Navigation cannot restart it — this is structural, not a reconnection trick. |
| **Prompt** | **BUILT 2026-10-31, and fuller than the phone's.** `LivePromptCard` with `full` is the only surface anywhere that renders `pasteWhere`, `ccMode` and `rescue` — three fields the instructor deck has been sending since it shipped. |
| **Poll** | **BUILT 2026-10-31.** The companion deck's poll was reused rather than reimplemented, so there is one poll loop on the page instead of two. |
| **Chat / Builder Room** | **BUILT 2026-10-31.** `SessionChatPanel` — the first reader this thread has ever had. See *The unread-feature pattern* below. |
| **Claude Code controls** | **PARTIAL.** The prompt card now tells the viewer which tool and which mode. **Nothing launches anything.** `pasteWhere` / `ccMode` are free text written per week ("Claude Code", "Plan Mode"), and guessing a destination from prose sends somebody to a chat window for a terminal exercise. A real launch control needs the session builder's tool-mode declaration (requirements §9, see DOC 03). |
| **Build progress** | **NOT BUILT.** Nothing in `CompanionState` carries a viewer's position in the lab, so there is no progress to render. **This needs a server-side notion of build steps before it is a UI task at all** — it is not a frontend ticket. |
| **No forced video interruption** | **BUILT** — same structural reason as row 1. |

---

## Phone

| Requirement | Verdict |
|---|---|
| **Sticky live video** | **BUILT** |
| **One-thumb interaction** | **BUILT** — every control ≥56px, and the pulse is optimistic so a tap registers before the round trip |
| **Prompt** | **BUILT (subset).** Renders `expectedResult` and `stopCondition`; renders none of `pasteWhere`, `ccMode`, `rescue` (`CompanionDeck.tsx:174-178`). |
| **Poll** | **BUILT** |
| **Chat** | **NOT BUILT** in the companion. The older check-in page can ask a question, but no student ever reads the thread — only the instructor deck does. |
| **Build** | **NOT BUILT** |
| **"Following / Building / Stuck / Finished"** | **BUILT — exact label match** (`CompanionDeck.tsx:50-55`), and the wire values match the DB CHECK constraint |
| **"Open in Claude"** | **NOT BUILT** |
| **"Save Claude Code version for later"** | **NOT BUILT** — copy-to-clipboard is the only prompt action a viewer has |

**Definition-of-done items 17 and 18 are exactly these last two rows plus the desktop pathway, and
neither has a Basecamp ticket.** They are specified in requirements §9 and in this document, and no
open todo covers them. L7.3 is the timeline and does not mention them.

---

## Second-screen behavior

A viewer watching on a computer may scan the existing session QR and use their phone as the
companion controller. The same persistent session QR should normally resolve to the current session
context, with the server or timeline determining the current moment.

| Requirement | Verdict |
|---|---|
| **Persistent QR resolves to the current session context, server decides** | **BUILT** — though "current" means the deck's current slide, because that is the only cursor in the system (DOC 03). |
| **Context QR deep-links to a poll or prompt** | **NOT BUILT — deliberately rejected**, same decision as DOC 03 row 5. A per-moment QR makes every previously shared link wrong the instant the moment moves. |

### The QR does not land on the companion

**This is the real second-screen gap and it is easy to miss**, because both surfaces work.

`sessionPersistentUrl` resolves to `/portal/class-checkin/<sessionId>`
(`broadcastSessionLinks.ts:47-49`, `sessionReminderEmail.ts:42-44`, routed at
`portalRoutes.tsx:126`). That page does **not** hand off to the companion deck: it polls companion
state and renders polls and prompts itself, and its onward button goes to the session's room or
`/portal/today` (`ClassCheckinPage.tsx:179`).

**So `/portal/live/<sessionId>/companion` is reached only by typing or linking it directly.** The
room QR has never once landed a student on the companion deck.

Whether the two surfaces should converge is a **product decision, not a cleanup.** They are now
consistent in what they *ask*, which was the part that was corrupting a measurement — see below.

---

## The pulse label incident, and why it matters for reading Test 2 data

`ClassCheckinPage.tsx` is the highest-traffic live surface in the product. Until 2026-10-31 it had
**zero test coverage** while duplicating ~130 lines of companion logic, and its status labels were
not the same set as the companion's.

The first version of this finding was **wider than the code**, and the correction is the useful part.
The page has two controllers, and only one had dropped a state:

| Controller | States offered, before the fix |
|---|---|
| `CompanionDeck` (`/companion`) | Following · Building · Stuck · Finished — exact match to this document |
| Check-in page, default screen | "I'm here" · Building · "I'm stuck" · Finished — all four, two labels adrift |
| Check-in page, **Build Mode** | Building · "I'm stuck" · Finished — **`here` missing** |

So a viewer who was only following along *could* say so on the status screen. What they could not do
was say so **during Build Mode** — the one segment where an instructor most needs to know who is
following rather than building — and a student who had already tapped it watched their own status
disappear from the grid when the instructor moved to a prompt.

> **Read the 2026-10-20 airing's pulse data with that narrower caveat, not a broad one.** The
> under-reporting is real and confined to Build Mode segments.

**Fixed 2026-10-31.** This document's label set now lives in one module
(`frontend/src/components/portal/livePulse.ts`) that both surfaces import, so the two cannot drift
again; both check-in controllers render all four through one `PulseGrid`; and the labels match the
companion exactly. Wire values are untouched, so nothing already recorded is affected.

**Also fixed: the page has tests** — 25 of them, its first coverage ever, covering attendance
recorded exactly once, the sign-in round trip carrying the student back to this URL, both pulse
controllers, the poll, a question that could be double-posted by pressing Enter twice, and the
2026-08-20 lost-connection incident in both directions. `CompanionDeck.tsx:15-21` had declined to
extract from this file *because* it had no coverage; that reason is gone.

---

## The unread-feature pattern

Four features in this subsystem were complete server-side with **no reader**. From a ticket title
that is indistinguishable from "not built"; from the code it looks finished.
`broadcastClipListController.ts:10-14` names the pattern as recurring here. All four now have
readers, and **in every closed case the act of reading the feature is what exposed what was wrong
with it:**

| Feature | Reader landed | What reading it exposed |
|---|---|---|
| **Session chat thread** | 2026-10-31 | The response handed every classmate the author's `enrollment_id`; and `limit` with `ORDER BY ASC` returned the **oldest** hundred messages, so a class past a hundred lines would have shown a thread frozen on its first hour with no new message ever arriving. Both fixed and pinned by tests. |
| **Producer audience read** (`GET /api/portal/broadcasts/:id/audience`) | 2026-11-01 | A **rate limit**, not a response shape. The route carries the *command* limiter, 30/min, shared with the producer's own commands — correct when written, when no caller existed. A naive 5s poll would put a viewer counter in competition with **Go Live** for the same budget. Client polls at 15s and only while on air; the route's limiter is the real fix and is still open. |
| **Clip markers** | 2026-11-01 | Four things, all in DOC 03 row 11 — a marker is a start point and an editor needs a range; most rows are not clip candidates; a plain `<a href>` export would 401; and the same unmounted-feature habit exists on the frontend. |
| **`access_mode`** | **still nothing** | The original instance. Both `broadcast_occurrences.access_mode` and `broadcast_series.default_access_mode` are declared and unreachable, which is why definition-of-done item 19 — Builder Room at the agreed access tier — is unmet. |

**An unread feature is not half-working, it is unmeasured.** That is the argument for giving every
server-side feature a reader rather than tolerating the gap, and it held on all three closed cases.

**It is not only a backend habit.** `ClassDetailsModal.tsx` is 211 lines, self-fetching, and its own
header comment says it is *"opened by clicking a session's Title in the admin Accelerator sessions
table"* — and it is imported by nothing. A complete feature with no mount point. Recorded rather than
fixed, because wiring it up means editing `AdminAcceleratorPage.tsx`, which is 1,555 lines, and
`CLAUDE.md`'s file-size ceiling makes splitting that page the price of the next change to it.

---

## A fixed defect worth remembering

**The laptop "Watch now" button used to link to the page it was on.** `resolveSessionMoment` returned
`watchUrl = sessionWorkspaceUrl(sessionId)` (`broadcastSessionLinks.ts:111`) — which is
`/portal/live/<sessionId>`, the exact route that renders `LiveSessionPage`. The code comment above
it said *"The laptop surface sends the viewer to the workspace"*, and **there was no separate
workspace: that page is it.**

**Fixed 2026-10-31**, as part of building the desktop surface rather than as a separate patch,
because the right fix depended on what the desktop page became. The page no longer reads `watch_url`
at all; the workspace's watch control is `BroadcastWatchButton`, which opens the in-app player and
renders nothing when there is nothing to offer. The server still sends the field and is right to —
the URL is genuinely where a viewer watches, and the defect was a page linking to itself, not a wrong
URL. **A test now fails if any anchor on the page points back at its own route.**

---

## What is not built

| Gap | Note |
|---|---|
| **Build progress**, desktop and phone | Needs a server-side notion of build steps first. Not a UI ticket. |
| **Phone chat** | Students can write a question; no student reads the thread. |
| **"Open in Claude"** and **"Save Claude Code version for later"** | Definition-of-done items 17 and 18. **No ticket.** |
| **Claude Code launch controls**, desktop | Blocked on the session builder's tool mode (DOC 03). |
| **`ccMode` and `rescue` on either phone surface** | Authored since the deck shipped; rendered to no phone viewer. |
| **The QR reaching the companion deck** | A product decision about whether the two surfaces converge. |
| **Builder pulse visible to viewers** | Built, instructor-only. |
| **Anything reading `access_mode`** | Definition-of-done item 19. **No ticket.** |
| **Per-moment QR deep links** | **Not a gap — deliberately rejected.** One persistent QR is the design. |
