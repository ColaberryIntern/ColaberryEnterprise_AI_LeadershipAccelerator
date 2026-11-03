# Colaberry Live — project documents

Generated from `scripts/artifacts/tickets/l118Data.js`. **Do not hand-edit** — rebuild with
`node scripts/artifacts/buildL118Artifacts.js`, which checks every row below against the disk
before it writes anything.

Bootstrap §3.1 and §17 require **18 documents**, DOC 00 through DOC 17.
**12 are written**, 9 of them under L11.8 on 2026-11-03.

**Start at [DOC 00](DOC_00_READ_FIRST_AI_OPERATING_BRIEF.md).** Every AI-executable todo links to it, and it carries
the source-of-truth hierarchy, the ticket-selection rule and the current blockers.

## The eighteen

| DOC | Title | Ticket | State | File | Note |
|---|---|---|---|---|---|
| 00 | READ FIRST — Colaberry Live AI Operating Brief | L11.8 | In the repo | `docs/colaberry-live/DOC_00_READ_FIRST_AI_OPERATING_BRIEF.md` | This pass, 2026-11-03. |
| 01 | Colaberry Live — Requirements & Product Vision | L11.8 | In the repo | `docs/colaberry-live/DOC_01_REQUIREMENTS_AND_PRODUCT_VISION.md` | This pass, 2026-11-03. |
| 02 | Broadcast Architecture & Security Contract | L11.8 | In the repo | `docs/colaberry-live/DOC_02_BROADCAST_ARCHITECTURE_AND_SECURITY_CONTRACT.md` | This pass, 2026-11-03. |
| 03 | Session + Timeline + Broadcast Orchestration | L11.8 | In the repo | `docs/colaberry-live/DOC_03_SESSION_TIMELINE_BROADCAST_ORCHESTRATION.md` | This pass, 2026-11-03. |
| 04 | Viewer Experience + Phone Companion | L11.8 | In the repo | `docs/colaberry-live/DOC_04_VIEWER_EXPERIENCE_AND_PHONE_COMPANION.md` | This pass, 2026-11-03. |
| 05 | Studio, Equipment, OBS, Zoom & Piyush Requirements | L11.8 | In the repo | `docs/colaberry-live/DOC_05_STUDIO_EQUIPMENT_OBS_ZOOM.md` | This pass, 2026-11-03. |
| 06 | AI Avatar + Voice AI Recording & Training | L11.8 | In the repo | `docs/colaberry-live/DOC_06_AI_AVATAR_AND_VOICE.md` | This pass, 2026-11-03. |
| 07 | YouTube, Media Production & Weekly Content Engine | L11.8 | In the repo | `docs/colaberry-live/DOC_07_YOUTUBE_MEDIA_PRODUCTION_ENGINE.md` | This pass, 2026-11-03. |
| 08 | Test Plan, Failure Drills & Launch Runbook | L11.8 | In the repo | `docs/colaberry-live/DOC_08_TEST_PLAN_FAILURE_DRILLS_LAUNCH_RUNBOOK.md` | This pass, 2026-11-03. |
| 09 | Traceability Matrix | L0.4 | In the repo | `docs/COLABERRY_LIVE_TRACEABILITY_MATRIX.md` | Generated from l04DodData.js with a self-check — do not hand-edit. |
| 10 | Current State Migration Ledger | **none** | Not written | — | Required by bootstrap §17 as COLABERRY LIVE — CURRENT BUILD MIGRATION REPORT, with six named sections A-F. NO TICKET ON THE BOARD COVERS IT. Found 2026-11-03 while scoping L11.8, by counting §3.1 and §17 against all 61 todos. |
| 11 | System Architecture Handbook | L11.1 | In the repo | `docs/colaberry-live/DOC_11_SYSTEM_ARCHITECTURE_HANDBOOK.md` | Written 2026-11-03. Its capability proof register is generated from l111Data.js and spliced into the document, so the handbook cannot claim a capability is proven when the data says otherwise: 4 of 28 claims have run in a real airing, 10 have never run. |
| 12 | Architecture Diagrams | L11.2 | Not written | — | Ten diagrams, Mermaid source plus rendered. The artifact pipeline renders Mermaid already, so the tooling exists and the diagrams do not. |
| 13 | Ali + Piyush Studio Operator Manual | L11.3 | Blocked | — | Needs the studio installed (L6.2, L6.3). A manual for equipment nobody has yet is untested prose. Owner is Piyush, not Claude Code. |
| 14 | Developer & AI Maintenance Runbook | L11.4 | Not written | — | Needs DOC 11. |
| 15 | Testing Strategy & Evidence Matrix | L11.5 | In the repo | `docs/COLABERRY_LIVE_TESTING_STRATEGY.md` | Generated with a self-check. |
| 16 | Ram Executive Brief | L11.6 | Not written | — | Needs DOC 12 for its diagrams. Definition-of-done item 44. Not launch-blocking. |
| 17 | Case Study Source Pack | L11.7 | Not written | — | Was meant to be maintained DURING the build rather than written after it, so every week it stays open it gets harder rather than easier. |

## The coverage contract

Every requirement below is transcribed from the bootstrap — the document that *defines* the
deliverable — and checked against the file on disk. The check runs requirement → file, in that
direction only: a checker built by reading the documents would pass by construction.

| DOC | Title | Reqs | Transcribed from | Names its gaps in |
|---|---|---|---|---|
| 00 | READ FIRST — Colaberry Live AI Operating Brief | 14 | bootstrap §3.1, DOC 00 bullet list | Current known blockers |
| 01 | Colaberry Live — Requirements & Product Vision | 16 | bootstrap §3.1, DOC 01 bullet list | What is not built, in one list |
| 02 | Broadcast Architecture & Security Contract | 19 | bootstrap §3.1, DOC 02, plus §8 "must be preserved" | What is not built |
| 03 | Session + Timeline + Broadcast Orchestration | 16 | bootstrap §3.1, DOC 03 | What is not built |
| 04 | Viewer Experience + Phone Companion | 7 | bootstrap §3.1, DOC 04 | What is not built |
| 05 | Studio, Equipment, OBS, Zoom & Piyush Requirements | 11 | bootstrap §3.1, DOC 05, which requires all of §10 | Current state and what is not done |
| 06 | AI Avatar + Voice AI Recording & Training | 9 | bootstrap §3.1, DOC 06, which requires all of §11 | Current state and what is not done |
| 07 | YouTube, Media Production & Weekly Content Engine | 15 | bootstrap §3.1, DOC 07, plus §12 and §13 | Current state and what is not done |
| 08 | Test Plan, Failure Drills & Launch Runbook | 22 | bootstrap §3.1, DOC 08, plus the six stages of §15 | Current state, in one table |

129 requirements in all, 69 of them required to be navigable
sections rather than mentions in prose.

## The gap this pass found

**DOC 10 has no ticket.** Bootstrap §17 requires a report named *COLABERRY LIVE — CURRENT BUILD
MIGRATION REPORT* with six named sections, and names `docs/colaberry-live/` as its repository
home. No todo on board 49210714 covers it. It was found by counting §3.1 and §17 against all
61 todos, done and open — a board cannot show this about itself.

That is the fifth such gap on this program. The other four are definition-of-done conditions 17, 18,
19 and 40, recorded in [DOC 00](DOC_00_READ_FIRST_AI_OPERATING_BRIEF.md) and in
[`../COLABERRY_LIVE_TRACEABILITY_MATRIX.md`](../COLABERRY_LIVE_TRACEABILITY_MATRIX.md).
