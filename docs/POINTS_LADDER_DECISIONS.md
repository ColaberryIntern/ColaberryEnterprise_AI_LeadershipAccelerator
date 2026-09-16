# Points Ladder Decisions — 2026-09-16

Decided by Ali on 2026-09-16 against `docs/POINTS_LADDER_AUDIT_2026-09-16.md` §6. This file is the source of truth for the ladder; the audit is the reasoning behind it.

| # | Decision | Choice |
|---|---|---|
| D1 | Ladder shape | **A — Milestone ladder.** Bands above AI Enabled are earned by finishing program milestones, not by evidence-row counts or competency confidence. Competency and readiness stay as displays. |
| D2 | Is curriculum completion a full milestone, equal to a project? | **A — Yes.** Four equal milestones: curriculum complete, project 1, project 2, project 3. Any order. |
| D3 | What is "curriculum complete"? | **A — Every graded card in all 12 weeks completed.** The existing 30% `weekDone` stays as a pacing signal only. |
| D4 | Certification record | **Staff-verified.** The student uploads the certificate in the Cert section of the portal; staff approve it in the admin section. Only an approved record counts. |
| D5 | Do ranks ever go down? | **A — Latch.** A rung, once earned, is kept even if a definition tightens later. |
| D6 | Names | **A — AI Builder I, II, III, IV; IV carries the label "Program Graduate".** Then AI Architect, then Senior AI Architect. |
| D7 | Skill XP tile on the Points tab | **A — Demote** below the milestone checklist. Data keeps being written. |

## The ladder, as decided

| Rung | Requirement | Reachable by |
|---|---|---|
| AI Aware I / II | 0 / 150 engagement points | Everyone |
| AI Enabled I / II | 400 / 900 engagement points | Everyone |
| AI Builder I | 1 of 4 milestones | Build-entitled |
| AI Builder II | 2 of 4 | Build-entitled |
| AI Builder III | 3 of 4 | Build-entitled |
| AI Builder IV · Program Graduate | 4 of 4 (curriculum + three projects) | Build-entitled |
| AI Architect | Program Graduate + approved certification | Build-entitled |
| Senior AI Architect | Architect + a case study that reached `operational_result`, or staff nomination | Manual |

## Milestone definitions

- **Curriculum complete:** every published graded card in each of the 12 weeks is completed by the student. Latched with a date on first satisfaction.
- **Project complete:** a published Student Build Pipeline plan in which every plan story, including STORY-000, is `verified` under the Build Verification Contract. Latched (first-write-wins) on the project.
- **Certification approved:** a `student_certifications` row the student created by upload, that a staff member approved. Pending and rejected rows do not count.

## Invariants kept

Points alone never exceed AI Enabled. Free accounts have no projects and no certification path, so they cannot reach a build band. Every build rung traces to verified commits or a staff approval. Rungs never decrease automatically.
