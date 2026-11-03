# Colaberry Live — Traceability Matrix (DOC 09)

> **"Colaberry Live is not complete merely because broadcast code exists."**

Generated from `scripts/artifacts/tickets/l04DodData.js`. **Do not hand-edit** — rebuild with `node scripts/artifacts/buildL04DodArtifacts.js`.

Requirement axis: docs/requirements/COLABERRY_LIVE_BASECAMP_BOOTSTRAP_v2.md §19 (lines 1893-1950). Board status: Basecamp project 49210714, all 61 todos, read 2026-11-02 inside the prod backend container via refreshBcToken().
Produced for L0.4 criterion 1 on 2026-11-03, session CC-20261015-t6q2.

## Where the program stands

| Status | Count | Means |
|---|---|---|
| Satisfied | 10 | Met, with the evidence named in the row. |
| Partial | 13 | Part of the condition is met; the row says which part is not. |
| Not met | 15 | Not done, and doable — no external blocker. |
| Not assessable | 10 | Needs hardware, an external account or a live event. Reading the repo cannot settle it. |

**10 of 48 satisfied.** 10 conditions are launch blockers. 10 cannot be assessed from the repository or the board, so the honest denominator for anything this session can move is 38.

A partial is not counted as progress toward a yes. It means part of the condition is
met and the row says which part is not.

## By band

| Band | Items | Satisfied | Partial |
|---|---|---|---|
| Basecamp and access | 1–4 | 2 | 1 |
| Provider spine | 5–9 | 3 | 2 |
| Session setup and participation | 10–19 | 3 | 6 |
| Studio | 20–23 | 0 | 0 |
| Avatar and voice | 24–26 | 0 | 0 |
| Distribution and replay | 27–30 | 1 | 2 |
| Testing and launch | 31–36 | 0 | 1 |
| Documentation and enablement | 37–44 | 1 | 1 |
| Artifacts and case study | 45–48 | 0 | 0 |

## Requirements with no Basecamp ticket

Measured against all 61 todos on the board, done and open — not only the 39 open ones.
A board cannot surface this about itself; it is only visible by walking the requirement
list and asking what covers each item. This is the inverse of the L0.3 finding: there
the board overstated what was left, here it understates what is in scope.

- **17. Claude pathway works.**
  The Claude pathway is specified in requirements §9 and DOC 04 and scheduled nowhere. The nearest board item, L7.3, is the timeline and does not mention it.
- **18. Claude Code desktop pathway works.**
  The Claude Code desktop pathway. DOC 04 names two phone actions — "Open in Claude" and "Save Claude Code version for later" — and neither exists or is ticketed.
- **19. Builder Room/community participation works at the agreed access tier.**
  Builder Room participation AT THE AGREED ACCESS TIER. The thread exists; nothing reads access_mode. L4.8 is discovery placements, which is a different thing.
- **40. Ali + Piyush have a recorded walkthrough and can explain/operate the system.**
  The Ali and Piyush operating walkthrough. L11.6 covers the Ram briefing (item 44); this item is the operators themselves and has no ticket.

Item 47 also has no ticket and is **not** counted as a gap: it is downstream of an airing that has not happened, so a ticket now would have nothing to do.

## The matrix

### Basecamp and access (1–4)

| # | Requirement | Owner | Todo | Repo files | Evidence | Status | Blocker | Notes |
|---|---|---|---|---|---|---|---|---|
| 1 | Basecamp Colaberry Live project exists. | Ali | L0.1 | scripts/artifacts/tickets/l03Data.js (META.project) | Board read 2026-11-02: project 49210714, 10 groups, 61 todos | Satisfied | no | The one condition on this list that was never in doubt. |
| 2 | Ali, Piyush, Sohail, and Aleem have the intended access. | Ali | L0.1, L1.4 | — | Board read 2026-11-02: all four hold assigned todos (Ali, Piyush, Sohail, Aleem) | Partial | no | Project membership is proven by assignment. The word "intended" is not: no document states what access each person was meant to have, so there is nothing to compare against. Sohail's YouTube console access is separately open as L1.4. |
| 3 | All project docs exist and are AI-readable. | Ali | L11.8, L11.1, L11.2, L11.3, L11.4, L11.5, L11.6, L11.7, L0.4 | docs/COLABERRY_LIVE_TESTING_STRATEGY.md (DOC 15); this matrix (DOC 09) | 2 of the 18 required documents (DOC 00-17) exist as canonical Markdown | Not met | no | DOC 15 landed 2026-11-03 in PR 3619; DOC 09 is this artifact. The remaining 16 are L11.8 (DOC 00-08, eight of them), L11.1 (11), L11.2 (12), L11.3 (13), L11.4 (14), L11.6 (16), L11.7 (17). DOC 10 was delivered as a Basecamp artifact under L0.1 rather than as a repo document. |
| 4 | Current historical work has been migrated/reconciled. | Ali | L0.1 | — | L0.1 closed 2026-10-17 with the published gap list | Satisfied | no | Satisfied as a migration event. It has since drifted again, which is item 48 rather than this one: L0.3 measured ten open tickets holding finished work on 2026-11-02. |

### Provider spine (5–9)

| # | Requirement | Owner | Todo | Repo files | Evidence | Status | Blocker | Notes |
|---|---|---|---|---|---|---|---|---|
| 5 | Cloudflare Stream is live and credentialed. | Ali | L1.2, L1.3, L5.1 | backend/src/services/broadcast/ (Cloudflare provider adapter) | L1.2 and L1.3 closed; credentials installed in the production environment | Satisfied | no | L1.5 asks whether the three Cloudflare accounts stay split. That is a tidiness question and changes no DNS, so it does not hold this item open. |
| 6 | Zoom custom RTMP is verified and usable. | Ali | L1.1 | directives/go-live-colaberry-live-broadcast.md §2 | Spec §4.2: the 2026-10-29 airing failed because the host was signed in from something other than the Zoom desktop client and had no way to start the stream | Partial | yes | THE CHEAPEST OPEN ITEM IN THE PROGRAM, and it gates R9 completely. L1.1 closed the account-level setting. Four separate things can remove the control and only one is that setting — the account tick, the host license and tier, the client and its version, and per-user scoping. The runbook now carries all four. What is missing is the one check that proves it: the host seeing the menu item in a throwaway meeting. Ten minutes of Ali's time, and no repository work can substitute for it. |
| 7 | Zoom can feed Cloudflare. | Ali | L5.2 | backend/src/services/broadcast/broadcastInputBinding.ts | L5.2 closed; two airings exist in the Cloudflare account (13 Oct, and Test 2 on 20 Oct) | Satisfied | no | Proven by airings that happened rather than by configuration that looks right. |
| 8 | Cloudflare HLS plays in the Colaberry persistent player. | Ali | L2.2, L4.1 | frontend/src/components/portal/LiveMiniPlayer.tsx; frontend/src/services/broadcastPlaybackAdapter.ts | L2.2 and L4.1 closed. Spec §8: the <video> is a sibling of <Outlet/> in the layout route, so it is the same DOM node across navigations | Satisfied | no | The persistence requirement is met structurally rather than by re-mounting logic, which is why navigation cannot restart the video. |
| 9 | Signed playback works and renews. | Ali | L2.1, L3.3 | backend/src/services/broadcast/ (grant and renewal path) | L2.1 closed ("mid-playback credential renewal"); L3.3 closed (fail-closed entitlement, deadline-bounded grant) | Partial | no | The renewal code exists and is tested. Spec §7 records that renewal OVER TIME is not separately evidenced — nobody has watched a grant expire and renew during a real airing. That is a Test 1 residue, not missing code. |

### Session setup and participation (10–19)

| # | Requirement | Owner | Todo | Repo files | Evidence | Status | Blocker | Notes |
|---|---|---|---|---|---|---|---|---|
| 10 | Session setup can create/prepare a Broadcast Occurrence. | Ali | L7.1, L5.4 | backend/src/services/broadcast/broadcastSessionOccurrence.ts:204; broadcastInputBinding.ts | a72546fb; broadcastInputBinding.test.ts; BROADCAST_INPUT_STRATEGY in .env.example | Satisfied | no | L7.1 created occurrences that could not resolve playback; L5.4 bound them to a live input. Both halves are needed for this item and both are on main. |
| 11 | A live workspace URL is generated/available. | Ali | L7.2 | backend/src/services/broadcast/broadcastSessionLinks.ts | L7.2 closed: workspace URL, companion URL and QR at session readiness | Satisfied | no | The watch button on that page used to link to the page it was on; fixed 2026-10-31 and now pinned by a test that fails if any anchor points at its own route. |
| 12 | The phone companion/QR path works. | Aleem | L4.7 | frontend/src/components/portal/CompanionDeck.tsx; LivePromptCard.tsx; livePulse.ts | 97398e19; CompanionDeck.test.tsx; route portalRoutes.tsx:132 | Partial | no | Built and in production — sticky player, four pulse states, exact label match on Following/Building/Stuck/Finished. L4.7's first criterion is a real phone with screenshots from the device, which is Aleem's to produce and no test can stand in for. |
| 13 | Timeline moments can drive audience participation. | Ali | L7.3 | backend/src/services/classKit/runOfShow.ts; backend/src/services/broadcast/broadcastRundown.ts | e4d0e590 (rundown + ProducerRundown.tsx); spec §8, the thirteen DOC 03 rows | Partial | no | There is no timeline RUNTIME. The run of show is static template data and the only cursor is slide_index in a last-write-wins row; broadcastStateMachine.ts:12 states the rule outright — "Time cannot publish anything." So every "the timeline drives X" requirement reads today as "the presenter's keypress drives X". Participation does reach the audience; a clock does not drive it. |
| 14 | Polls work. | Ali | L7.3 | backend/src/db/ensureLiveSessionSchema.ts:160 (session_poll_responses); backend/src/services/sessionLiveStateService.ts (recordPollResponse, getPollTally) | In production. UNIQUE (session_id, enrollment_id, poll_key); server-enforced PollLockedError to 409; guest voting via session_guest_poll_responses | Satisfied | no | This item was nearly built a second time on 2026-11-02, in the broadcast tree, with ON CONFLICT DO NOTHING instead of the production table's update-on-re-answer. Caught before commit. The real one lives outside the broadcast_* tree, which is why it reads as missing to anyone searching there. |
| 15 | Prompt Drops work. | Ali | L7.3 | frontend/src/components/portal/LivePromptCard.tsx; CompanionDeck.tsx | Spec §8, DOC 03 row 4 and DOC 04 desktop Prompt row | Partial | no | The push path and both renderings exist. Two gaps, both named in §8: a drop fires on slide arrival and there is no control to drop one ad hoc, and the phone renders a subset — ccMode and rescue reach no viewer on either phone surface. |
| 16 | Builder pulse works. | Ali | L7.3 | frontend/src/components/portal/livePulse.ts; backend/src/db/ensureLiveSessionSchema.ts (session_pulse) | Spec §8, DOC 03 row 8; CompanionDeck.tsx:50-55 wire values match the DB CHECK constraint | Partial | no | Viewers can set their pulse and the aggregate exists. It is instructor-only and has never been exposed to viewers, so "Builder pulse works" is true of the capture half and not of the room seeing itself. |
| 17 | Claude pathway works. | Ali | *none* | frontend/src/components/portal/LivePromptCard.tsx (pasteWhere, ccMode, rescue) | Spec §8, DOC 04 "Claude Code controls" row: PARTIAL, nothing launches anything | Partial | no | NO BASECAMP TICKET COVERS THIS. The prompt card tells a viewer which tool and which mode; pasteWhere and ccMode are free text authored per week ("Claude Code", "Plan Mode"). Guessing a destination from prose sends somebody to a chat window for a terminal exercise. A real launch control needs the session builder's tool-mode declaration, which requirements §9 specifies and no ticket schedules. |
| 18 | Claude Code desktop pathway works. | Ali | *none* | frontend/src/components/portal/LivePromptCard.tsx | Spec §8, DOC 04 phone rows: "Open in Claude" NOT BUILT; "Save Claude Code version for later" NOT BUILT — copy-to-clipboard is the only prompt action | Not met | no | NO BASECAMP TICKET COVERS THIS. Distinct from item 17: 17 is knowing which tool, 18 is getting there from the device in your hand. Neither phone action specified in DOC 04 exists. |
| 19 | Builder Room/community participation works at the agreed access tier. | Ali | *none* | frontend/src/components/portal/SessionChatPanel.tsx; backend/src/db/ensureLiveSessionSchema.ts (session_chat_messages) | Spec §8: desktop Chat/Builder Room BUILT 2026-10-31; phone Chat NOT BUILT; access_mode and broadcast_series.default_access_mode recorded as declared-but-unreachable | Partial | no | NO BASECAMP TICKET COVERS THIS. L4.8 is Events and Community DISCOVERY PLACEMENTS, a different thing. The thread got its first reader on 2026-10-31, and giving it one immediately exposed two defects invisible while nothing read it: the response handed every classmate the author's enrollment_id, and limit with ORDER BY ASC returned the oldest hundred messages. The "agreed access tier" half is the unreachable part — nothing reads access_mode. |

### Studio (20–23)

| # | Requirement | Owner | Todo | Repo files | Evidence | Status | Blocker | Notes |
|---|---|---|---|---|---|---|---|---|
| 20 | Studio equipment is purchased and installed. | Piyush | L6.1, L6.2 | — | L6.1 closed (list researched and approved with live pricing); L6.2 open | Not assessable | yes | Blocked on Piyush and physical hardware. L6.2 is the longest dependency chain on the board: it blocks L6.3, L6.4, L10.3, L10.4, L10.5 and L11.3, and no code shortens it. **Settled by:** Piyush installing the equipment and filing L6.2's evidence: the reviewed A/V sample, the lighting check, the wired network and the setup photos. |
| 21 | Ali camera/audio/light/network quality passes. | Piyush | L6.2 | — | L6.2 criteria: reviewed A/V sample, no clipping, even lighting, wired network, photos | Not assessable | yes | Blocked on item 20. A quality pass needs installed equipment to assess. **Settled by:** A reviewed A/V sample from the installed studio showing no clipping, even lighting and a wired connection. |
| 22 | OBS setup is documented and repeatable. | Piyush | L6.3 | — | L6.3 criteria: five-minute two-voice recording, exported scene collection, routing diagram | Not assessable | yes | Blocked on item 20 plus a second speaker in the room. **Settled by:** L6.3's three artifacts: the exported OBS scene collection, the audio routing diagram, and a five-minute two-voice recording with no duplicate audio. |
| 23 | Piyush has an operating production workflow. | Piyush | L6.3, L11.3 | — | L11.3 is the operator manual and has not started | Not assessable | yes | Blocked on items 20-22. L11.3 is an operator manual for a studio that is not installed, and L10.3 cannot run without it. **Settled by:** Items 20-22, then L11.3 written and proven followable by Piyush running a show from it. |

### Avatar and voice (24–26)

| # | Requirement | Owner | Todo | Repo files | Evidence | Status | Blocker | Notes |
|---|---|---|---|---|---|---|---|---|
| 24 | HeyGen avatar training is complete. | Piyush | L9.1, L9.2 | — | L9.1 open (verify the current official workflow on the execution date); L9.2 open | Not assessable | no | L9.1 alone is writable from a desk — it is sourced research, naming the product and citing duration and consent from official documentation with URL and access date. The training itself needs Ali in front of a camera. L0.3 proposes the whole avatar group as the first cut: no launch test depends on it. **Settled by:** L9.1's sourced research first — the current official workflow, cited with URL and access date — then Ali recording the approved footage under L9.2 with the consent wording captured verbatim. |
| 25 | Voice-AI/voice-clone training is complete if selected. | Piyush | L9.3 | — | L9.3 open: select provider, verify requirements, record, QA | Not assessable | no | Conditional on a selection that has not been made, so the condition has no subject yet. First cut candidate; no launch test depends on it. **Settled by:** Piyush naming a provider under L9.3, or a written decision not to clone a voice at all. Either answer closes this item; the absence of a decision is what holds it open. |
| 26 | AI Ali sample is reviewed. | Ali | L9.4 | — | L9.4 open: scored per dimension, outside reviewer, usage policy, disclosure answered | Not assessable | no | Needs items 24 and 25 plus a reviewer outside the project. L9.4 blocks nothing. **Settled by:** A sample scored per dimension by a reviewer outside the project, plus the Real Ali versus AI Ali usage policy and an answered disclosure question. |

### Distribution and replay (27–30)

| # | Requirement | Owner | Todo | Repo files | Evidence | Status | Blocker | Notes |
|---|---|---|---|---|---|---|---|---|
| 27 | YouTube live distribution is tested. | Sohail | L1.4, L8.1 | — | 31a889ed shipped a release packet and rollback under L8.1 — not the simulcast proof | Not met | no | Blocked on the YouTube channel console, which is Sohail's. L8.1 asks for simulcast proven with a real test event rather than configured and assumed, and L1.4 has to confirm ownership and live eligibility first. |
| 28 | Replay processing works. | Ali | L8.4 | backend/src/services/broadcast/broadcastRecordingBinding.ts; backend/src/db/ensureBroadcastSchema.ts:153 (broadcast_source_refs UNIQUE) | cf603349; broadcastPopulationService.ts; the replay list that depends on it is live | Satisfied | no | Resolution could not be broken without the replay listing breaking with it, which is the cheapest available proof that the binding resolves. |
| 29 | Replay discovery/listing exists for users who should see it. | Ali | L8.3 | backend/src/services/broadcast/broadcastReplayQuery.ts; route broadcastRoutes.ts:100; frontend ReplaysPage via portalRoutes.tsx:181 | 5e443c17; replaysNavGate.test.ts | Partial | no | Endpoint, portal surface, entitlement filter and nav gate all exist and are tested. L8.3's third criterion is mutation evidence naming the test that fails when the filter is reversed — producible from this repo today, and not yet produced. |
| 30 | Long-form/Shorts media handoff exists. | Piyush | L8.2 | backend/src/services/broadcast/ (clip markers); the Class Kit CSV | Spec §8 finding 2: clip markers got their reader on 2026-11-01 — SessionClipList plus the CSV, described there as "R7's first brick" | Partial | no | The handoff has a first brick and not a workflow. Spec §1 records that nothing in P1 through P7 produces an edited long-form video, Shorts, thumbnails, titles, descriptions or captions, so building the seven phases to completion still does not deliver R7. L8.2 needs a real recording to cut. |

### Testing and launch (31–36)

| # | Requirement | Owner | Todo | Repo files | Evidence | Status | Blocker | Notes |
|---|---|---|---|---|---|---|---|---|
| 31 | Failure drills are passed. | Ali | L10.4 | directives/rehearse-colaberry-live-airing-procedure.md | Bootstrap §15 Test 5 lists thirteen deliberate failures; none has been exercised live | Not met | yes | Several of the thirteen now have code and tests behind them — expired grant renewal, fail-closed entitlement, provider timeout, auto-end. L10.4's criterion is that every failure mode is EXERCISED rather than reasoned about, so test coverage does not discharge it. Needs item 32 first. |
| 32 | Full dress rehearsal is passed. | Piyush | L10.3 | — | Not run. Four dependencies, two of them the uninstalled studio and the unwritten manual | Not assessable | yes | Blocked on items 20-23 and 37. **Settled by:** L10.3 run start to finish in the real studio, with the operator manual followed as written and per-segment timings recorded. |
| 33 | Production launch readiness report is approved. | Ali | L10.5 | — | Not produced | Not met | yes | Needs items 31 and 32. The report is the go/no-go. |
| 34 | A real production Colaberry Live session airs. | Ali | L10.5 | — | Spec §4.1: the 2026-10-29 Open House was the intended first public airing and did not stream | Not met | yes | The item the deadline was set by. It did not happen, and §4.1 is explicit that this is a scheduling fact rather than a build failure — R5, R6 and R7 have not started. What moves is Ali's call. |
| 35 | Replay is verified after the live. | Ali | L10.5, L10.6 | — | Needs item 34 | Not met | no | The code path is item 28 and is satisfied. This is the verification after a real airing, which has not happened. |
| 36 | Analytics are verified. | Ali | L10.6, L4.6, L4.9 | backend/src/services/broadcast/broadcastTelemetryService.ts (readLiveAudience); route broadcastRoutes.ts:131; frontend LiveMiniPlayer.tsx posts beats | 3fac2543; 2467360c; 97d20e66; broadcastTelemetryQuery.test.ts asserts the query as text; liveMiniPlayer.heartbeat.test.tsx asserts the call | Partial | no | Collection and the unavailable-never-zero read both exist, and the defect that made measurement record nothing — a player that never called the endpoint — is fixed and pinned by a test. Verifying the numbers needs an airing to produce some. L10.6 also requires every number to cite its dictionary definition. |

### Documentation and enablement (37–44)

| # | Requirement | Owner | Todo | Repo files | Evidence | Status | Blocker | Notes |
|---|---|---|---|---|---|---|---|---|
| 37 | The operator runbook is complete. | Piyush | L11.3 | — | Not started | Not assessable | yes | DOC 13. Blocked on item 22 — a manual has to be followable as written in the real studio, and the studio is not installed. L10.3 cannot run without it. **Settled by:** Item 22, then L11.3 written and walked through in the installed studio by somebody who did not write it. |
| 38 | System Architecture Handbook is complete and current. | Ali | L11.1 | — | Not started | Not met | no | DOC 11. Writable from this repository. Needs L11.8 first so that the handbook is not written on top of a picture the board has already been shown to overstate. |
| 39 | Required architecture diagrams are complete and rendered. | Ali | L11.2 | scripts/artifacts/ (the Mermaid rendering pipeline exists) | Not started. Ten diagrams required; the tooling to render them is already in the repo | Not met | no | DOC 12. L0.3 proposes a partial cut: the three diagrams L11.3 actually needs — signal path, state machine, deploy topology — against the other seven, which are for readers who do not exist yet. |
| 40 | Ali + Piyush have a recorded walkthrough and can explain/operate the system. | Ali | *none* | — | No ticket; no recording. Searched all 61 todos for "walkthrough" and "recorded" | Not met | no | NO BASECAMP TICKET COVERS THIS. L11.6 is the Ram brief and briefing session, which is item 44. The bootstrap §18.1 schedules a 10-15 minute walkthrough recorded FOR Ram; this item is Ali and Piyush being able to operate the system themselves, which is a different artifact and a different audience. |
| 41 | Developer & AI Maintenance Runbook is complete. | Ali | L11.4 | docs/broadcast/ROLLOUT_RUNBOOK.md (partial: five operational levers) | Extended 2026-11-03 from one documented lever to five (PR 3619) | Partial | no | DOC 14. The rollout runbook is a component of it, not the whole: the deploy, rollback and test paths all exist and are documented in pieces. L11.4's criterion is that it be readable by a future session with no chat history. |
| 42 | Testing Strategy & Evidence Matrix is complete. | Ali | L11.5 | docs/COLABERRY_LIVE_TESTING_STRATEGY.md | Generated from scripts/artifacts/tickets/l115Data.js; merged 2026-11-03 in PR 3619; 73 suites / 1,208 tests measured, with the command to re-derive each count | Satisfied | no | DOC 15, and the only one of the 48 to move to satisfied this week. It records what is NOT covered as a condition of rendering: the integration tier is one file behind a HAS_DB skip, and broadcast E2E is deliberately zero. |
| 43 | Ram Executive Brief is complete. | Ali | L11.6 | — | Not started | Not met | no | DOC 16. Needs item 39 for its diagrams. On L0.3's cut list — a communication artifact about the launch rather than an input to it. |
| 44 | Ram has received a walkthrough/briefing and follow-up actions are captured. | Ali | L11.6 | — | Not scheduled | Not met | no | Needs item 43. |

### Artifacts and case study (45–48)

| # | Requirement | Owner | Todo | Repo files | Evidence | Status | Blocker | Notes |
|---|---|---|---|---|---|---|---|---|
| 45 | Every Basecamp task has at least one required artifact. | Ali | L0.1, L0.4 | scripts/artifacts/tickets/ (18 Colaberry Live modules) | Board read 2026-11-02 captured status, title, owner and due date for all 61 todos. Descriptions were NOT read: a second read was refused by the auto-mode classifier | Not assessable | no | The one item on this list blocked by tooling rather than by the world. Judging it needs every todo's "Deliverable / artifact" section, which means reading 61 descriptions from inside the production container. What can be said: every ticket this session worked shipped a durable artifact, and L0.3 records that nine of the ten built-not-marked tickets still carry their own evidence criteria. **Settled by:** A read of all 61 todo descriptions from inside the production backend container, checking each "Deliverable / artifact" section. The auto-mode classifier refused the second such read on 2026-11-02, so this needs Ali to authorize it or run it. |
| 46 | Case Study Source Pack is complete through first production airing. | Ali | L11.7 | — | Not started | Not met | no | DOC 17. It was specified to be maintained DURING the build rather than written after it, so every week it stays open it gets more expensive, not less. L0.3 puts it on the cut list and says so there too — cutting it has a real cost. |
| 47 | Final Colaberry Live case study has been created through the Case Study OS after launch. | Ali | *none* | — | Needs item 34. The Case Study OS exists as a platform capability | Not met | no | Post-launch by construction. Not counted as a coverage gap: it is downstream of item 46 and of an airing that has not happened, so a ticket now would have nothing to do. |
| 48 | Basecamp final state matches repository and production truth. | Ali | L0.1, L0.3, L0.4 | scripts/artifacts/tickets/l03Data.js; scripts/artifacts/tickets/l04DodData.js | L0.3, 2026-11-02: ten of the 39 open tickets hold finished work, merged and in several cases deployed a fortnight earlier | Not met | no | Measured, not estimated, and the board overstates what is left by about a quarter. The cost is not the bookkeeping — it is that every plan drawn from the board is wrong in the same direction. Closing this needs review states Ali sets, not code. |

## How status was decided

A condition is **satisfied** only when the row names where that was found — a file, a
commit, a test, or the board read. Commit-message scanning is explicitly not trusted:
this ticket's first pass walked `git log origin/main --merges` and reported that 33 of
39 open tickets had no merged code, when three shipped P0s had landed as direct
commits and one of them names no ticket in its subject at all. Module existence at a
named commit replaced it.

Where a condition demands something no amount of code can supply — installed hardware,
an external account, a live airing — the row says **not assessable** and names what
would settle it, rather than being scored on how complete the code around it is.

