# Colaberry Live — project documents

Generated from `scripts/artifacts/tickets/l118Data.js`. **Do not hand-edit** — rebuild with
`node scripts/artifacts/buildL118Artifacts.js`, which checks every row below against the disk
before it writes anything.

Bootstrap §3.1 and §17 require **18 documents**, DOC 00 through DOC 17.
**16 are written**, 9 of them under L11.8 on 2026-11-03.

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
| 12 | Architecture Diagrams | L11.2 | In the repo | `docs/colaberry-live/DOC_12_ARCHITECTURE_DIAGRAMS.md` | Written 2026-11-03. Ten diagrams, Mermaid source generated from l112Data.js, 76 required elements checked against the source. 14 nodes across 7 diagrams are drawn dashed and red because they are not built, and the build fails if an unbuilt path is drawn like a working one. |
| 13 | Ali + Piyush Studio Operator Manual | L11.3 | Blocked | — | Needs the studio installed (L6.2, L6.3). A manual for equipment nobody has yet is untested prose. Owner is Piyush, not Claude Code. |
| 14 | Developer & AI Maintenance Runbook | L11.4 | In the repo | `docs/colaberry-live/DOC_14_DEVELOPER_MAINTENANCE_RUNBOOK.md` | Written 2026-11-07. Generated from l114Data.js + l114Sections.js. Every path it tells a reader to open — 35 reference paths and 18 procedure file references — is stat'ed on every build, and every documented env var must be referenced in backend/src. |
| 15 | Testing Strategy & Evidence Matrix | L11.5 | In the repo | `docs/COLABERRY_LIVE_TESTING_STRATEGY.md` | Generated with a self-check. |
| 16 | Ram Executive Brief | L11.6 | In the repo | `docs/colaberry-live/DOC_16_RAM_EXECUTIVE_BRIEF.md` | Written 2026-11-08. Generated from l116Data.js. Fifteen required explanations transcribed from the bootstrap and pinned by count. Two of them, costs/vendors and the 10,000 Architect goal, are not defined anywhere in this repository: they carry an explicit gap marker, name who can settle them, and the build refuses any currency figure inside them. The brief also states that the briefing session the ticket asks for is an event rather than a document, and stays with Ali.

CORRECTED 2026-11-09. The first version asserted the system had never aired, in its lead and in its risk section. Production holds two broadcast_occurrences rows (15 and 20 October) and Basecamp ticket L11.7 names a third recording from 13 October, so the claim was false - it came from reading the repository and then speaking about the world. The true claim is narrower and more useful: it has aired three times and no airing has ever been measured. Both unqualified phrasings are now banned by the self-check so the shorter, false sentence cannot come back. |
| 17 | Case Study Source Pack | L11.7 | In the repo | `docs/colaberry-live/DOC_17_CASE_STUDY_SOURCE_PACK.md` | Written 2026-11-08. Generated from l117Data.js. It was meant to be maintained DURING the build rather than written after it, and the cost of that shows: of the sixteen captures the bootstrap asks for, 10 are captured, 5 need an event that has not happened and 1 is blocked on the studio. A captured item must name its evidence and an uncaptured one must NOT name a file, asserted in both directions, and an attributed quotation anywhere in the document fails the build because the bootstrap permits quotes only when real.

CORRECTED 2026-11-09 after reading ticket L11.7 and production. Three airings have happened (13, 15 and 20 October); none recorded a single viewer, so the counts above are unchanged but the reason is now sourced rather than assumed. A new `airedRecord` field carries external references - Cloudflare video ids, occurrence rows, the viewer census - for uncaptured items, and the check refuses a file path inside it so the asymmetry rule is not quietly relaxed by the field sitting next to it. The pack also now carries the one destructive risk on this ticket: the 13 October recording is the only copy of the first airing, it has no occurrence row, and its live input is marked for deletion when the ticket closes. |

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
