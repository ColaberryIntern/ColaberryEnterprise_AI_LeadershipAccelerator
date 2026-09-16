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

- **Curriculum complete:** every published graded card *required of the student's cohort* (D8) in each of the 12 weeks is completed by the student. Latched with a date on first satisfaction.
- **Project complete:** a published Student Build Pipeline plan in which every plan story, including STORY-000, is `verified` under the Build Verification Contract. Latched (first-write-wins) on the project.
- **Certification approved:** a `student_certifications` row the student created by upload, that a staff member approved. Pending and rejected rows do not count.

## Phase 4 dry run — production, 2026-09-16 14:31 UTC (read-only)

485 students assessed. The curriculum carries **89 graded cards** over 12 weeks (evaluation 12, implementation_task 12, knowledge_check 12, prompt_lab 12, reflection 12, architect_mindset 12, claude_studio 12, setup_lab 5).

| | Before (legacy, mapped) | After (latched) |
|---|---|---|
| entry | 456 | 456 |
| AI Builder I | 29 | 27 |
| AI Builder II | 0 | 2 (Firas: 2 complete projects; Quincy Nkwain Ninying: 2 complete projects) |

- **Curriculum complete: 0 students.** Among the 10 students who have done ≥30% of graded cards, every graded type is completed by 5–7 of 10 — except **Claude Studio at 1.1 of 10**. Farhat Beig has completed **77 of 89 graded cards, and her 12 missing cards are exactly the 12 Claude Studio cards** (one per week). Quincy is at 87 of 89, short only weeks 11–12.
- Projects: 7 students hold at least one fully verified build. Farhat: *AI Support Workflow Assistant* 8/8 ✓, *Kashmir Craft AI Order Assistant* 14/15. Swati Raman: *SupplyMind AI* 16/16 ✓.
- 11 students hold a partially verified build and would move on their next verified story.

### D8 — decided (Ali, 2026-09-16): Claude Studio counts from the next batch

> "A but only for this batch because I added it late. Future batches it will count."

Implemented as a rule, not an exemption: a graded card type may declare `curriculum_required_from` (an ISO date) in the type registry, and it is required only of cohorts whose `start_date` is on or after that date. Claude Studio carries `2026-11-01`, so it is not required of the April 2026 and July 2026 cohorts and is required from the November 2026 cohort (starts 2026-11-12) onward. A student with no cohort is held to everything. Any type added late in future gets its own date the same way. (Card `created_at` could not be the rule: the whole July curriculum was authored week-by-week during the cohort, July 9 – Aug 26; only the Studios came after, on Sept 8.)

**Dry run re-run with D8 (read-only, 14:51 UTC):** 77 required graded cards for the July cohort. Curriculum complete: **2** (Farhat Beig 77/77, Quincy Nkwain Ninying 77/77). Movers: **Farhat Beig → AI Builder II** (curriculum + *AI Support Workflow Assistant* 8/8; *Kashmir Craft* 14/15 pending), **Quincy → AI Builder III** (curriculum + CoreOps + Ambit), **Firas → AI Builder II** (Ledgerly + Sifra; curriculum 16/77). After: entry 457 · I 26 · II 2 · III 1.

## Invariants kept

Points alone never exceed AI Enabled. Free accounts have no projects and no certification path, so they cannot reach a build band. Every build rung traces to verified commits or a staff approval. Rungs never decrease automatically.
