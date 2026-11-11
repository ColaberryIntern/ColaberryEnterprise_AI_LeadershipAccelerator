# DOC 18 — Ticket reconciliation against the P1-07 UX prototype

**Built:** 2026-11-11 · **Session:** CC-20261015-t6q2 · **Against:** `main` at `11f7619`
**Inputs:** `COLABERRY_LIVE_UX_BUILD_PROMPT.md`, `Colaberry Live UX Prototype.html`, the 88-todo board (read in full, text not status)

This is **Task 1 only**. No Basecamp ticket was created, edited, closed or commented on. `BROADCAST_ENABLED` was not touched. Phase 2 (identity, lifecycle, entitlement, playback grants) was read and not modified.

---

## 0. Read this first: four findings that change the plan

### 0.1 The record-only option is not free. It breaks every phone in the room.

**FC0.3 offers "stream it live" or "record only for class 1" as if they were equal.** They are not.

`resolveSessionMoment` (`backend/src/services/broadcast/broadcastSessionLinks.ts:92-122`) derives the session's `moment` **solely from `broadcast_occurrences.editorial_state`**, joined through `broadcast_source_refs`. It reads no session start or end time at all. No occurrence row ⇒ `not_started` (`:107`).

The companion deck renders only when `moment === 'live'` (`LiveSessionPage.tsx:247`), and the desktop workspace is behind the same gate (`:193`).

**Therefore: a record-only class leaves every phone on "This class has not started yet" for the entire session.** No poll, no follow-along, no status buttons. The QR works and lands on a dead screen.

This was Ali's correction 10, raised as "verify, and raise it if true". It is true. **FC0.3 cannot be answered without this on the ticket**, and "record only" means FC2.x delivers nothing on the day.

### 0.2 The guest path has no front end at all.

FC2.2 is written as "add a guest pass". It is larger than that.

- The title gate is real: `sessionGuestService.ts:52` refuses unless the title matches `/open house/i`.
- The backend guest routes exist: `participantRoutes.ts:440-442`.
- **No frontend code calls them.** Zero hits for `joinAsGuest` or `guest-join` under `frontend/src`.

So FC2.2 is: replace the title gate with an explicit setting (Studio setup), **and build the guest join UI that has never existed**. Two tickets, not one.

Related: there is **no Watch button for a signed-out viewer**. `BroadcastWatchButton` returns null unless `airing.can_watch` (`BroadcastWatchButton.tsx:50`), and discovery is auth-gated (`BroadcastDiscoveryContext.tsx:70`). The prototype's signed-out phone shows a Watch button. It cannot today.

### 0.3 The copy cleanup is a repo-wide lint rule, not a four-file fix.

Correction 12 named four files. The real scope: **266 files** under `frontend/src/components/portal/` and `frontend/src/pages/portal/` contain an em dash or en dash, and **334 lines carry one inside a string literal or JSX text**. Emoji appear in at least 25 files beyond the three named.

The reason they accumulated: **there is no gate.** `scripts/artifacts/checkAmericanSpelling.js:35` sets `SCAN_DIRS = ['scripts/artifacts']`. Frontend strings are unchecked by anything.

Ticket this as a lint rule plus a sweep, ordered so the rule lands first and the sweep cannot regress.

### 0.4 The placeholder air date is self-contradictory, and it is mine.

Every first-class due date back-solves from **"Thursday 2026-11-20"**. **2026-11-20 is a Friday.** Verified. The nearest Thursdays are **19 November** and **26 November**.

Nothing has been re-dated. All 26 FC due dates stay as they are until Ali sets the real date, at which point every one of them moves together.

---

## 1. Ali's 15 corrections, verified against source

The prototype follows the code on most of these. Three do not survive contact with the source.

| # | Claim | Verdict | What the code actually says |
|---|---|---|---|
| 1 | Eight editorial states; terminal `replay_ready`, `cancelled`; health `unknown/ready/degraded/down` | **CONFIRMED** | `broadcastStateMachine.ts:31-36,52`. Full transition map at `:39-50` — the prompt omitted it; it is reproduced in §5 below because the state matrix needs it. `canTransition` treats `from === to` as legal (`:59`). A provider webhook may move only `live ⟷ reconnecting` (`:361-365`) — it can never publish or end. |
| 2 | `mark_content_started` sets the anchor, not the state | **CONFIRMED** | `:165`, handler `:189-196`. Refuses outside backstage/live/reconnecting with reason `content_start_requires_backstage_or_live`. Idempotent: a second mark is a noop. **Eight** commands exist (`:81-96`); only **six** are client-sendable (`broadcastSchema.ts:29-31` excludes `begin_processing`, `publish_replay`). |
| 3 | Two go-live guards with raw reason strings | **CONFIRMED** | `:200-213`. `ProviderNotReady` → `provider_health is unknown, expected ready`; `ContentNotStarted` → `mark_content_started_first`. Rendered verbatim at `ProducerStrip.tsx:420-424`. |
| 4 | Strip shows only available commands; six labels; inline confirm | **CONFIRMED** | `ProducerStrip.tsx:330,379`. Labels exact at `producerStripCopy.ts:15-22`. Confirm: `Yes, end broadcast` / `Keep going` (`:390,393`). The confirm *questions* are longer than the prompt states — `producerStripCopy.ts:42-45`. |
| 5 | `ended → processing → replay_ready` | **PARTLY WRONG** | `:47` is `processing: ['replay_ready', 'ended']`. **Processing can fail back to `ended`** — "aired, no replay" is a real outcome. The state matrix needs a row for it. Also the producer cannot drive this path: both commands are non-sendable and fire from `broadcastReplayRunner.ts:39`. End reasons confirmed: `producer`, `auto_stream_gone` (`:109`). |
| 6 | Live page is a standalone card outside the portal shell | **CONFIRMED** | `portalRoutes.tsx:131-132` — public, outside `PortalProtectedRoute` and `PortalLayout`. `.clv-card` 440px, `.is-wide` 980px. Badge and player are `position:fixed` siblings of `<Outlet/>`. |
| 7 | Chat exists; polls reach signed-in remote viewers | **CONFIRMED, and better than stated** | `SessionChatPanel.tsx` exists, rendered `LiveWorkspace.tsx:66` in a 340px column (`:95`). The poll gate is **cohort enrollment only** — `sessionLiveController.ts:12-16`, no room, attendance or presence check. A signed-in remote cohort member already gets and can answer the poll. **Open decision 4 in the brief is answered in code.** Caveat: the whole rail is behind `isAuthenticated` (`:60`). |
| 8 | Never-zero already implemented | **CONFIRMED, with a nuance that matters** | `ProducerStrip.tsx:136-151`. Strings exact. **But `0 watching` does render when the count is genuinely zero** (`:143`). The rule covers *unmeasurable*, not *zero*: `not measuring` (503, count omitted), `no answer` (first read failed), or nothing at all. Any new count must preserve that three-way distinction, not collapse it. |
| 9 | Signed-out phone sees class state, Watch button and a sign-in line | **PARTLY WRONG** | No 403 — correct. Copy exact at `LiveSessionPage.tsx:263`. **But it renders only when `moment === 'live'`** (`:247`); before air the phone shows `COPY.not_started` (`:71-75`). **And there is no Watch button when signed out** (see §0.2). |
| 10 | Companion deck gated on `moment === 'live'`; record-only may be dead | **CONFIRMED — the failure is real** | See §0.1. This is the most consequential finding in the audit. |
| 11 | Pre-live strip and rundown sit in a 440px card | **CONFIRMED** | `is-wide` only when `showWorkspace` (`:193,200`). Usable width 380px. `ProducerStrip` renders regardless of moment (`:278`). |
| 12 | Copy violations in four files | **PARTLY WRONG — badly incomplete** | See §0.3. Emoji claims confirmed (`CompanionDeck.tsx:61-63`, `livePulse.ts:37-40`, `BroadcastWatchButton.tsx:45` `▶ Watch here`). Em dashes in the named files are mostly **comments**; the real user-visible set is 334 lines across 266 files. |
| 13 | `frontend/CLAUDE.md` says "navy/blue palette" and is stale | **CONFIRMED** | `frontend/CLAUDE.md:20`. Contradicted by `colaberry/tokens/colors.css:4,16` and `brand-bridge.css:8-9,16`. Also stale: `AnthropicCourseWrapper.tsx:40` comment says "navy #FB2832". |
| 14 | White on `#FB2832` is 3.85:1; `#E5121D` is 4.74:1 | **CONFIRMED** (4.734, so 4.73) | `colors.css:16,17,131,134`. 14px bold is not large text (needs ≥18.66px bold), so AA is 4.5:1: cherry **fails**, red-600 **passes**. **The portal's primary button is exactly the failing case today** — `TodayShell.css:423` `.te-btn.cherry{background:var(--cherry);color:#fff}` at 14px/700 (`:419`). |
| 15 | `.clv-wordmark` re-sets the wordmark in Quicksand, which BRAND.md forbids | **CONFIRMED** | `LiveSessionPage.tsx:205-207,323`; prohibition at `TodayShell.css:33-36`. **Two more instances**: `classCheckinStyles.ts:34`, `PublicNavbar.tsx:357`. |

### One correction to the prompt's design-system section

The prompt treats the token layer as one thing. **There are two, and a third hardcode.**

- `frontend/src/styles/tokens.css` — legacy `--color-*` names. `brand-bridge.css` overrides **exactly 21** of them (`--color-primary`, `--color-accent`, `--color-bg`, … `--font-mono`).
- `frontend/src/colaberry/tokens/{fonts,colors,typography,spacing,base}.css` — the newer layer (`--red-500`, `--action-bg`), entry point `frontend/src/colaberry/styles.css`.
- `TodayShell.css:6` **hardcodes** `--cherry:#FB2832` instead of referencing either.

A component that reads `tokens.css` values directly gets the pre-bridge answer. Design against the rendered result, and say in each new component which layer it consumes.

---

## 2. Cross-cutting requirement added 2026-11-11: admin-navigable, own tab

> *"Allow us to be able to navigate via the admin portal, but any time you open this, it will be a new tab separate from the system."* — Ali, 2026-11-11

**This is already supported. Do not invent a pattern.**

- `adminNav.ts:21` — `NavLink` carries `newTab?: boolean`.
- `AdminLayout.tsx:61-67` — a `newTab` link renders as `<a href target="_blank" rel="noopener noreferrer">` instead of a router `<Link>`. Precedents: My Day (`adminNav.ts:52`), AI Training (`:56`).
- `adminRoutes.tsx:145-158` — two routes already render **outside** `AdminLayout` while staying inside `ProtectedRoute`, with the reasoning written out: the Client Review Room, because wrapping a client-facing surface in the operations sidebar "makes the eventual mistake easy".

**The rule for every new Live surface** (`#studio`, `#preflight`, `#clips`, `#handoff`, `#picker`):

1. Route **outside `AdminLayout`**, **inside `ProtectedRoute`**.
2. Nav entry in `adminNav.ts` with `newTab: true`.
3. **Fully deep-linkable from the URL.** A new tab carries no in-app state; everything comes from the route params and the server.
4. **No in-app "back".** The tab closes. Any "next step" link stays within that tab.
5. **Announce the new tab.** `AdminLayout.tsx:63` has no `aria-label` or visually-hidden text saying the link opens a new tab. That is an existing accessibility gap and it is in the draft ticket below.

---

## 3. Ticket-by-ticket verdict, all 88

Verdicts: `aligned` · `needs edit` · `superseded` · `conflicts` (Ali must choose).

### First-class ladder — list 10496600129, 26 todos, all open, zero comments

| Ticket | Screen | Verdict | Proposed edit |
|---|---|---|---|
| FC0.1 pick topic and day kind | `#picker` | needs edit | Name the Content Picker as the tool. State that day kind selects one of four fixed run-of-shows and therefore the whole presenter surface. |
| FC0.2 audience: cohort or guests | `#studio` | needs edit | Becomes a field on Studio setup, not a standalone decision. Add: choosing guests requires FC2.2, which is **build the guest UI**, not a flag (§0.2). |
| FC0.3 stream or record only | `#producer` | **conflicts** | The ticket presents two equal options. Record-only leaves every phone dead for the whole class (§0.1). Add that consequence, or the decision is being made blind. |
| FC1.1 session row, Present renders | `#sessions` | aligned | Add: `ensureOccurrenceForSession` is wrapped in a try/catch that logs and continues (`acceleratorService.ts:88-97`), so a failed occurrence is silent. The existing AC already catches the null `provider_session_id` case; extend it to the swallow. |
| FC1.2 author the deck | `#presenter`, `#picker` | needs edit | Input now comes from the Content Picker's `classSessionPlan` output. The "three interaction slides" AC stays. |
| FC1.3 build, attach, verify deck | `#presenter` | aligned | — |
| FC1.4 rehearse, teaching guide | `#preflight` | needs edit | Fold the walkthrough into the pre-flight checklist rather than a separate rehearsal. |
| FC2.1 which QR the room scans | `#companion` | needs edit | The premise is wrong. **Before the class is live both scans land on the same "not started yet" screen** (`LiveSessionPage.tsx:247`). The difference appears only once live. Rewrite the AC to test both scans *while live*. |
| FC2.2 guest join without the title hack | `#studio`, `#companion` | **needs edit — split** | Split into (a) replace the `/open house/i` gate with the Studio setup field, backend; (b) build the guest join UI, which does not exist. See §0.2. |
| FC2.3 QR from a phone, non-staff | `#companion` | aligned | Depends on FC2.2(b) existing first if guests are chosen. |
| FC3.1 install camera, mic, light, network | `#preflight` | aligned | Mirrors L6.2. Keep the dependency pointer; do not duplicate. |
| FC3.2 OBS scenes, no duplicate audio | `#preflight` | aligned | Mirrors L6.3. |
| FC3.3 Zoom custom RTMP dry run | `#preflight` | aligned | — |
| FC3.4 local recording baseline | `#preflight` | aligned | — |
| FC4.1 pre-flight the morning of | `#preflight` | aligned | Nine checks map one-to-one onto the prototype list. |
| FC4.2 name a producer | `#studio`, `#producer` | needs edit | Producer is a Studio setup field with a rule: producer ≠ presenter, enforced before Create. Add rehearsal mode so their first sight of the strip is not live. |
| FC4.3 run the show | `#producer` | needs edit | The ticket implies a four-step ladder. There are **eight states and six sendable commands**, and the strip shows only the available ones. Rewrite the AC against the real state machine (§5). |
| FC4.4 post-show state check | `#handoff` | aligned | The `provider_session_id` check is the 20 October trap and is already in the prototype. |
| FC5.1 capture and verify the master | `#handoff` | aligned | — |
| FC5.2 pull the transcript | `#studio`, `#handoff` | needs edit | Add the Studio setup checkbox confirming Zoom cloud recording with transcription is on **before** the class. Checking after is too late. |
| FC5.3 export the clip list | `#clips` | needs edit | Add live clip marking carrying the segment's `publicValue`, and the `in,out,segment,public_value,source` CSV contract. |
| FC5.4 videographer brief | `#handoff` | aligned | The prototype assembles it from the clip list; keep the one-page constraint. |
| FC6.1 any event can air | `#sessions` | aligned | Add the irreversibility notice the prototype draws. |
| FC6.2 meeting link, room, recorded | `#sessions` | aligned | — |
| FC6.3 download route for the streamed copy | `#replays` | aligned | Still required. The resolver is registered only inside its own test. |
| FC7.1 Content Picker | `#picker` | aligned | Strongest-specified ticket on the board. Quote provenance as a first-class UI element, not a tooltip. |

### Build ladder — 62 todos (61 plus L0.5)

| Ticket(s) | Screen | Verdict | Note |
|---|---|---|---|
| L0.1 reconcile board ✅, L0.2 docs upkeep, L0.3 weekly risk, L0.4 traceability, L0.5 DOC 10 | — | aligned | Governance. No prototype surface. L0.5 is in PR #3857. |
| L1.1 ✅ Zoom, L1.2 ✅ Cloudflare token, L1.3 ✅ creds installed | — | aligned | Done. |
| L1.4 YouTube eligibility, L1.5 Cloudflare consolidation | — | aligned | External, no screen. L1.4 blocks L8.1. |
| L2.1 ✅ replay adapter, L2.2 ✅ signed Range transport | `#replays` | aligned | **Phase 2 — do not touch.** |
| L3.1-L3.5 ✅ schema, state machine, entitlement, routes, backfill | all live screens | aligned | **Phase 2 — do not touch.** This is the contract every screen reads. |
| L5.1 ✅ provider adapter, L5.2 ✅ Zoom→Cloudflare | — | aligned | Done. |
| L5.3 first private airing | `#producer` | **superseded in part** | Production holds occurrences for 15 and 20 October plus a 13 October recording. The work happened; the ticket is the board's oldest open item. Close or re-scope — do not re-run. |
| L5.4 bind occurrence to live input | `#sessions`, `#studio` | aligned | Studio setup must surface a refusal rather than create an unplayable occurrence — the ticket already says so. |
| L5.5 provider health loop | `#producer` | aligned | Feeds the `feed:` chip and the go-live guard. |
| L4.1-L4.5 ✅ mini-player, a11y, badge, cue, Watch hand-off | `#viewer` | aligned | Built. Do not redesign. |
| L4.6 heartbeat route, unavailable-never-zero | `#producer` | **needs edit** | The never-zero *read* is built (`ProducerStrip.tsx:136-151`). Narrow the ticket to the ingestion route and the EXPLAIN, and record that the chip is done. |
| L4.7 phone companion | `#companion` | **superseded in part** | The companion surface exists. Narrow to what is genuinely missing. |
| L4.8 Events/Community placements | `#viewer` | aligned | Deferred by decision; the prototype does not draw it. |
| L4.9 wire the player to the heartbeat | `#viewer` | aligned | Measurement records nothing until this lands. |
| L6.1 ✅ equipment list, L6.4 ✅ laptop | `#preflight` | aligned | Done. |
| L6.2, L6.3 install and OBS | `#preflight` | aligned | **Blocks DOC 13 and L10.3.** Both P0, both open, both Piyush. |
| L7.1 ✅ occurrence from session, L7.2 ✅ workspace/companion/QR | `#sessions`, `#companion` | aligned | Built. |
| L7.3 timeline drives the show | `#presenter`, `#producer` | aligned | The rundown is the spine of both screens. |
| L7.4 end without an engineer | `#producer` | **superseded in part** | End plus auto-end exist (`broadcastAutoEndPolicy.ts`, end reasons `producer`/`auto_stream_gone`). Narrow to the audit trail and the configurable window. |
| L8.1 YouTube simulcast | — | aligned | No screen. |
| L8.2 one airing to an edit plus shorts | `#clips`, `#handoff` | aligned | The clip list is its input. |
| L8.3 replay discovery | `#replays` | **superseded in part** | `ReplaysPage`/`ReplayList` exist with locked labels. Narrow to what the prototype adds: resume, chapters, the not-playable row. |
| L8.4 bind recordings to occurrences | `#replays` | aligned | Prerequisite for FC6.3. |
| L9.1-L9.4 avatar and voice | — | aligned | Out of scope for this prompt. L9.4's usage policy is the one with reach beyond the build. |
| L10.1 Test 2, L10.2 Test 3 staff pilot, L10.3 Test 4 dress rehearsal, L10.4 Test 5 failure drills, L10.5 Test 6 go/no-go, L10.6 post-launch | `#preflight`, `#states` | aligned | L10.4's failure drills are the executable form of the state matrix. Tie them together. |
| L10.7 prove the paywall | `#viewer` | aligned | Entitlement has never been exercised by a real non-staff viewer. |
| L11.1-L11.8 project documents | — | aligned | DOC 13 blocked on L6.2/L6.3. |

---

## 4. Draft tickets — surfaces and elements with no ticket

Not created. Drafted here for approval.

| Draft | Title | Screen | Acceptance criteria (observable) | Files |
|---|---|---|---|---|
| **D1** | Copy gate: no emoji, no em dashes, in frontend strings | all | A lint rule fails on an emoji or em/en dash inside a user-visible string under `frontend/src`; the rule runs in CI; the existing 334 lines are swept; a deliberately added violation fails the build (mutation evidence) | new lint rule; `checkAmericanSpelling.js` SCAN_DIRS; 266 files |
| **D2** | Plain-language blocked reasons on the producer strip | `#producer` | Go live blocked by health reads a sentence, not `provider_health is unknown, expected ready`; blocked by content reads a sentence, not `mark_content_started_first`; the raw reason is still logged; no server reason code reaches a person | `ProducerStrip.tsx:420-424`, `producerStripCopy.ts` |
| **D3** | State matrix document and viewer-visible tests | `#states` | 17 states × 4 surfaces in `docs/colaberry-live/`; one test per row asserting what a **non-staff** viewer sees; backstage is byte-identical to scheduled for a non-staff viewer | new doc; `frontend/src/**/__tests__/` |
| **D4** | Studio setup screen | `#studio` | Opens in its own tab from admin nav; deep-linkable; Create disabled until all four summary items read Done; producer ≠ presenter blocks Create; access mode requires an explicit acknowledgement; the chosen mode is echoed as a sentence about what remote viewers get; audience is an explicit field that replaces the title match | new route outside `AdminLayout`; `adminNav.ts`; `sessionGuestService.ts` |
| **D5** | Guest join UI | `#companion` | A signed-out phone can join with one tap and no typing; the guest can read the question and vote; status buttons are disabled with a sentence saying why; a guest cannot reach anything else | new; `participantRoutes.ts:440-442` already exists |
| **D6** | Producer: wide card for staff in every state | `#producer` | A staff viewer gets the 980px card before the class is live, not 380px | `LiveSessionPage.tsx:193,200` |
| **D7** | Producer: rehearsal mode | `#producer` | An amber banner states nothing reaches viewers or the recording; every command behaves as on the day; nothing is written to the occurrence | `ProducerStrip.tsx` |
| **D8** | Producer: room count, stuck count, end reason | `#producer` | Room and stuck counts sit beside the audience chip and obey the three-way unmeasurable rule; after End the reason (`producer` or `auto_stream_gone`) is shown with a link to the post-show check | `ProducerStrip.tsx` |
| **D9** | Presenter on-air badge | `#presenter` | The projected screen shows Off air / Backstage / On air / Reconnecting / Cancelled, read from the occurrence; legible at 1080p from 10 feet | Class Kit Present |
| **D10** | Live clip marking | `#producer`, `#clips` | Enabled once content has started; one press stamps the timecode and carries the segment's `publicValue`; marks appear in clip review labelled "Marked live" | `ProducerStrip.tsx`, new |
| **D11** | Clip review and CSV export | `#clips` | One row per run-of-show segment with Keep/Cut, `break` defaulting to Cut; CSV columns `in,out,segment,public_value,source` | new route, own tab |
| **D12** | Videographer handoff checklist | `#handoff` | Post-show check of four lines including `provider_session_id`; package checklist of six; an amber notice while anything is missing; the brief assembles from the clip list | new route, own tab |
| **D13** | Replays: resume, chapters, not-playable row | `#replays` | A resume chip on the row; chapters from the run of show; a recording with a null `provider_session_id` renders as "Not playable yet", never as a healthy card | `ReplaysPage.tsx`, `ReplayList.tsx` |
| **D14** | Wordmark: use the artwork, three places | all | `.clv-wordmark`, `.cbck-wordmark` and `PublicNavbar.tsx:357` use `/colaberry-icon.png` or the horizontal lockup; no hand-set Quicksand wordmark remains | 3 files |
| **D15** | Cherry button contrast | all | Decision from Ali (§6); whichever is chosen, `/fixing-accessibility` passes at AA for 14px bold, and `TodayShell.css:6` stops hardcoding the hex | `TodayShell.css` |
| **D16** | New-tab links announce themselves | admin nav | A `newTab` nav link carries visually-hidden text or an `aria-label` saying it opens a new tab | `AdminLayout.tsx:63` |
| **D17** | `frontend/CLAUDE.md` palette is stale | — | The "navy/blue palette" line is corrected to cherry/leaf/berry; `AnthropicCourseWrapper.tsx:40` comment fixed | 2 files |
| **D18** | Occurrence creation failure is silent | `#sessions`, `#studio` | A failed `ensureOccurrenceForSession` surfaces in the UI instead of only `console.warn`; Studio setup refuses rather than producing an unplayable occurrence | `acceleratorService.ts:88-97` |

---

## 5. The real state machine, for the state matrix

Transcribed from `broadcastStateMachine.ts:39-50`. The prototype's 12-row table is missing the `processing → ended` outcome.

```
scheduled   → backstage, live, cancelled
backstage   → live, scheduled, cancelled
live        → reconnecting, ended, cancelled
reconnecting→ live, ended, cancelled
ended       → processing
processing  → replay_ready, ended        <-- "aired, no replay"
replay_ready→ (terminal)
cancelled   → (terminal)
```

`from === to` is legal. A provider webhook may move only `live ⟷ reconnecting`. Health: `unknown, ready, degraded, down`.

**Add to the matrix:** *Processing failed* — presenter not applicable; phone "class has ended"; producer sees it aired with no replay and why; remote viewer gets an honest "this class aired but the replay is unavailable", never a silent empty shelf.

---

## 6. Decisions for Ali — not made here

1. **FC0.3, now with its real cost.** Record-only leaves every phone on "not started yet" for the whole class (§0.1). Stream it, or accept a dead follow-along, or fund a fix to `resolveSessionMoment`.
2. **FC0.2 cohort or guests** — and if guests, accept that FC2.2 is two tickets and the guest UI has never existed.
3. **Live participation in scope?** Q&A, resources, reactions, stage. Four unticketed surfaces, all needing backend first.
4. **The real first air date.** 2026-11-20 is a Friday. 19 or 26 November are Thursdays.
5. **Cherry button contrast.** Keep `#FB2832` at 3.85:1 and accept the AA failure on 14px bold, or move primary buttons to `#E5121D` at 4.73:1. This affects every button in the portal, not only Live.
6. **Staff always get the wide card?** (D6.)

---

## 7. Where the prototype is wrong about the code

Recorded because the prompt asked for it, and because the code wins.

1. **Signed-out phone shows a Watch button.** It cannot — discovery is auth-gated and `can_watch` is false (§0.2).
2. **Signed-out phone shows the sign-in line before the class.** It does not — that line is behind `moment === 'live'`; before air it reads "This class has not started yet".
3. **The producer strip is drawn as four fixed steps.** It renders only *available* commands out of six sendable ones, and the labels are the six in `producerStripCopy.ts`.
4. **"Content started" is drawn as a step with Done state.** It does not move the state; it sets the preview anchor and is idempotent.
5. **The state matrix has 12 rows.** It needs 17 — `processing → ended` is missing (§5).
6. **The prototype says "Twelve states the backend already has".** There are eight editorial states plus four health values; the matrix rows are scenarios, not states. Reword.
7. **`#presenter` is a proposal, not a redraw.** Class Kit Present was not read by either of us. Treat the whole screen as unverified.

---

*Generated by hand against measured source, 2026-11-11. Every file:line in this document was read during the audit. The 88 ticket bodies were pulled from Basecamp on 2026-11-11 and read as text, not status.*

---

## 8. Decisions taken, 2026-11-11

Answered by Ali after reading §6. Recorded here so the build does not re-litigate them.

| # | Decision | Answer | Consequence for the build |
|---|---|---|---|
| 1 | FC0.3 stream or record only | **Stream it live** | Producer and viewer surfaces are in scope. The `resolveSessionMoment` record-only failure (§0.1) is therefore **not** on the critical path, and stays recorded as a known limitation rather than becoming a ticket now. L6.2 and L6.3 (studio install, Piyush, both P0 and both open) are on the critical path. |
| 2 | Cherry button contrast | **New Live buttons use `#E5121D`; the existing portal is untouched** | Everything built from here passes AA at 14px bold. The existing `.te-btn.cherry` failure at 3.85:1 remains and is now a *stated* decision, not an oversight — D15 is narrowed to recording it and to stopping `TodayShell.css:6` hardcoding the hex. A visible inconsistency between old and new buttons is accepted deliberately. |
| 3 | Live participation (Q&A, resources, reactions, stage) | **Deferred** | Build order items 1-9 proceed; item 10 does not. P4-03, P4-04 and P4-05 stay unticketed and unbuilt, and the `#viewer` screen ships without the proposed participation column. Chat and polls already exist and already reach signed-in remote cohort members, so the viewer is not left empty. |
| 4 | Real first air date | **Not set** | All 26 FC due dates stay as they are. Nothing is re-dated. |

### Build priority, as instructed

Ali: *"make it a priority of getting this studio setup"*, and *"priority based on due dates"*.

Studio setup (**D4**) is therefore phase 1, ahead of the prompt's own ordering, because it is the
configuration surface the whole day depends on and the only one that does not exist in any form.
The copy gate (**D1**) is scoped **to the new Live surfaces only** in that phase, so new code
cannot add violations, and the repo-wide sweep of 334 lines becomes its own later phase rather
than a large, low-value first PR.

### A constraint stated rather than discovered later

Ali asked for a PR after each phase and a deploy at the same time. **The merge is his click** —
Claude cannot merge, so each phase ends with a green PR waiting on him, and the deploy follows
the merge rather than accompanying the PR. Separately, every surface here ships behind
`BROADCAST_ENABLED`, which is unset in production and which this prompt forbids touching, so a
deploy does not make any of it visible to a viewer.
