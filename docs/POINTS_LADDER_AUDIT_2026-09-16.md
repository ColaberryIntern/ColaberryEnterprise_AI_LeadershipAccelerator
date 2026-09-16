# Points & Ladder Audit — 16 September 2026

**Session:** CC-20260916-k4p9 · **Audited against:** `origin/main` @ `ffedec27` (PR #2605 merge, 2026-09-16) · **Trigger:** Farhat Beig has finished all 12 curriculum weeks and is on her second project, yet the platform calls her "Junior Builder". Ali asked for an audit of every point that can be earned anywhere in the system and a plan to make levels represent people correctly.

---

## 1. The short answer

Farhat is stuck because **rank 2 cannot be reached by anyone, by building or by studying.** The gate from Junior Builder to Practitioner requires two pieces of `artifact` evidence. The only card type that produces `artifact` evidence (`artifact_submission`) is archived by the boot reconciler in every week that also has an `implementation_task` — which is every live week. Zero `artifact` rows exist program-wide. This was found on 2026-08-25 (416 students at rank 0, 15 at rank 1, nobody above) and logged as "needs its own decision". The decision was never made.

Her two projects don't help either: a verified build story writes `github_commit` evidence with `architecture` + `github` weights only. It counts toward "github" and "evidence" totals, but not toward artifacts, implementations, evaluations, or prompt-engineering confidence — the other four things rank 2 asks for.

Underneath that is the real problem: **the things Ali names as milestones — curriculum complete, three projects, a certification — do not exist as signals in the ladder at all.** There is no "project complete" event, no "curriculum complete" event (a week counts as done at 30%), and no record anywhere of a certification being passed. The ladder measures evidence-row counts and competency curves that nobody can explain to a student, and it moves one rank per trigger.

---

## 2. What "points" actually is: six ledgers, one of which decides the band

| # | Ledger (table) | What feeds it | What reads it | Decides the band? |
|---|---|---|---|---|
| 1 | **Engagement points** `student_points_events` | 22 award sites: card completes, streaks, podcasts, blog reads, community posts/likes, live-session joins, cert practice, verified stories (mirror), demo prep, resume upload, referrals, rooms recognition | HUD "948 pts", leaderboard, Settings > Points tile 1, community level badge | **Only the free bands** (AI Aware I/II, AI Enabled I/II at 0/150/400/900). Points can never reach AI Builder — by design. |
| 2 | **Skill XP** `xp_events` (learning / builder / community) | Card completes (per-type registry), verified stories (800-per-capstone budget), community | Settings > Points tile 2 "164 XP", Classroom status | **No.** Feeds nothing downstream. Pure display. |
| 3 | **Evidence** `evidence_records` → **competency** `student_competency` | Cards with `evidence_required` (prompt_lab, implementation_task, evaluation…), verified stories (`github_commit`) | Promotion gates (counts by source_type), Architect Readiness % (mean of confidences) | **Yes — via the gates.** |
| 4 | **Rank** `student_level` (0–8: builder … architect) | `promotionService.evaluateForEnrollment` — fires only on a card completion or a newly-verified story; checks rank+1 only | `computeBand` → AI Builder I–VI, AI Architect, Senior AI Architect; company roster shows raw slug | **This is the only thing that sets AI Builder / AI Architect.** |
| 5 | **CAPE proficiency** `cape_*` | Card completions via the CAPE bridge | Today shell "Readiness /100" ring | No |
| 6 | **Cert Prep readiness** `cert_readiness_snapshots` | Practice/mock/diagnostic sittings + verified cert evidence | Cert Prep page; awards ledger-1 points (5/25/40/50/150) | No |

Plus three leftovers still written or read somewhere: legacy `community_members.points/level` (tiers 0/1500/2700/4200), accelerator `enrollment.readiness_score` (public portfolio "AI Architect Readiness Score"), and the case-study maturity ladder (a project-level band, not a person-level one).

**Four different numbers are all labelled "readiness" to students**: competency mean (Points tab), CAPE proficiency (Today), `currentWeek/12` (Path page), accelerator readiness score (public portfolio). **Four threshold sets exist**: 0/150/400/900 (bands), 0/1500/2700/4200 (legacy community), 150/800/2400 (company roster colour tiers), and the 9-rank evidence gates.

---

## 3. Findings, ranked by severity

1. **Rank 2 is unreachable.** `builder_levels.practitioner` needs `min_artifacts: 2`; `artifact` evidence is minted only by `artifact_submission` cards; `buildStationReconciler.reconcileBuildStationLayout()` archives every published one in any week with an `implementation_task`, on every boot (`server.ts` boot sequence). Program-wide artifact rows: 0. Nobody has ever passed rank 1. — `backend/src/services/progression/seeders.ts:59`, `progressionService.ts:32`, `timeline/buildStationReconciler.ts:27-55`.
2. **Shipping a project is worth the wrong evidence.** Verified stories → `source: 'github_commit'`, weights `[architecture 1, github 1]`. No `implementation`, `artifact`, or `evaluation` credit; no `prompt_engineering` confidence. A whole capstone = N github rows. — `sbp/verification/buildVerificationService.ts:96-99, 444-454`.
3. **The milestones Ali cares about are invisible to the ladder.** No `project_complete` event (grep across `backend/src`: not found). "Curriculum complete" exists only as `weekDone` at `WEEK_DONE_THRESHOLD = 0.3` (30% of a week's cards). No table records a passed certification — Cert Prep tracks readiness, not passing. Case studies link to evidence rows ("LINK, NEVER MUTATE") and award nothing. — `curriculumCompletionService.ts:54`, `caseStudy/caseStudyEvidenceSource.ts:5-13`.
4. **Promotion moves one rank per trigger, and only two triggers exist** (card completion; a story newly verified). No nightly re-evaluation, no loop to the highest cleared rank, no admin "recompute". A student with rank-4 evidence needs three more lucky triggers. — `promotionService.ts:104`, callers at `progressionService.ts:162` and `buildVerificationService.ts:513`.
5. **Paid students are told to "Join" the program.** The "Become an AI Builder — Join to unlock" card and the HUD line "Build to unlock AI Builder" show to anyone at ≥400 pts with no build promotion. Nothing checks `isBuildEntitled`. Ali's own screenshot (Cohort July 2026, 948 pts) is this bug. The card also appears from 400 pts (AI Enabled I), not only at the 900 ceiling the comment claims. — `frontend/src/pages/portal/points/PointsDrilldown.tsx:127`, `frontend/src/services/bandLadder.ts:61-69`, entitlement helper already exists at `backend/src/middlewares/requireBuildEntitlement.ts:61`.
6. **The points that define AI Aware/Enabled measure activity, not capability.** 948 pts can be 30 streak claims (up to 30/day), podcast collects (35 each, uncapped), blog reads (10), community likes (1). The 0/150/400/900 thresholds were ported from the Design-E mock on 2026-07-01; no rationale is recorded anywhere. The design doc they trace to (`POINTS_ECONOMY_AND_ARCHITECT_LADDER.md`) was never committed.
7. **AI approval is a stub that disagrees with itself.** Ranks 5–8 `requires_ai_approval`; the write path's `defaultAiApprover` returns `true` for everyone; the read path shows the gap "AI review of your work — pending". — `promotionService.ts:15-16, 69`.
8. **Raw internal slugs leak to managers and teammates.** Company roster and Team section print `Junior Builder · rank 1/8`; community `LevelBadge` never receives the rung name so promoted builders show a free rung; `LevelJourney` can't place "AI Builder III" on its two build rungs and falls back to the points rung; 8+ surfaces still say Apprentice/Builder/Architect/Principal. — `CompanyPage.tsx:205`, `TeamSection.tsx:155`, `LevelBadge.tsx:26-39`, `LevelJourney.tsx:35-39`, `TimelineCard.tsx:31`, `TodayShell.tsx:163`, `PathPage.tsx:125`.
9. **Domain weights are seeded and never used.** `competency_domains.weight` (1.4/1.2/0.8…) is passed as `weight: 1` everywhere; readiness % is an unweighted mean. — `promotionService.ts:50, 108`.
10. **Points hygiene debt** (lower priority, listed so it isn't lost): four registry events never awarded (`open_house_attended` 50, `project_dna_completed` 40, `first_task_complete` 20, `account_created`); `githubEvidenceService` has zero callers; three caps-ON follow-ups from 2026-07-21 never closed; `BUILD_PAID_GATE_ENABLED` still OFF despite the ladder's anti-cheat premise assuming it; `BUILD_VERIFICATION_CONTRACT.md §6` still says the story XP number "is not set"; gap list renders "0 Of 3" (CSS capitalize); `GAP_LABELS` still carries attendance.

---

## 4. Everything a student can earn today (inventory)

### 4a. Engagement points (ledger 1) — 22 award sites

| Trigger | Event type | Amount | Cap |
|---|---|---|---|
| Complete a curriculum card | `card_complete` / `knowledge_check` / `survey_complete` / `evaluation_passed` | Card's "+N pts" badge = learning+builder+community XP (5–160 by type) | Ambient feed types 100/day (flag ON in prod) |
| Complete a legacy lesson | `lesson_complete` | 10 | — |
| Daily streak claim | `daily_streak` | 5 + 3/day, max 30 | 1/day |
| Live session join | `session_attended` | 25 | per session |
| Verified build story | `project_story_verified` | round(800 / stories in plan), e.g. 40–100 | — |
| Demo prep PREP-1..5 / PREP-6 (staff-marked) | `demo` / `presentation` | 40 / 60 | — |
| Deep Dive Field Guide upload | `deep_dive_field_guide` | 100 | per card |
| Podcast / testimonial collect (75% watched) | `card_complete` | 35 / 10 | none |
| Blog read (2 min) | `card_complete` | 10 | — |
| Resume/LinkedIn upload | `profile_completed` | 25 | once |
| Recommend a friend | `referral_submitted` | 25 | once |
| Open House RSVP | `open_house_rsvp` | 10 | per event |
| Community post / comment / like received | `community_*` | 5 / 2 / 1 | 75/day (flag ON) |
| Rooms: verified answer / attend / host | `recognition:*` | 15 / 5 / 25 | — |
| Cert Prep: diagnostic / mock / practice / domain mastered / sustained | `cert_*` | 40 / 25 / 5 / 50 / 150 | practice 40/day |

No admin route can award or adjust points. No script recomputes ranks. Only `backfillCompletionPoints.ts` exists (HUD points from completed cards).

### 4b. Card economy (XP per type, from `typeRegistry.ts`) — the evidence-bearing ones

| Type | L / B / C XP | Evidence source | Competencies |
|---|---|---|---|
| prompt_lab | 10 / 40 / 0 | prompt_lab | prompt_engineering, context_engineering |
| prompt_challenge | 5 / 50 / 0 | prompt_lab | prompt_engineering |
| implementation_task | 0 / 80 / 0 | implementation | architecture, testing, deployment |
| project_task | 0 / 80 / 0 | implementation | architecture, testing |
| evaluation | 0 / 50 / 0 | instructor_review | architecture |
| certification_exercise | 0 / 70 / 0 | instructor_review | architecture, prompt_engineering |
| artifact_submission | 0 / 60 / 0 | **artifact** (archived at boot) | documentation, architecture |
| claude_studio | 30 / 45 / 0 | deliverable | systems_thinking, decision_making, communication, ai_governance, context_engineering |
| architect_mindset | 100 / 40 / 20 | deliverable | systems_thinking, architecture, decision_making, tradeoffs, ai_governance |
| setup_lab | 20 / 100 / 0 | deliverable | claude_code |
| mock_interview / presentation / demo / build_story / ai_video_feedback | 60 / 70 / 50 / 50 / 35 B | deliverable | communication (+leadership / documentation) |

Every other type (video, blog, deep_dive, knowledge_check, reflection, intel cards…) awards Learning XP only and zero evidence. Producible evidence sources today: `prompt_lab`, `implementation`, `deliverable`, `instructor_review` (via evaluation cards), `github_commit` (via stories). **Never written by any live path: `artifact`, `github_pr`, `peer_review`, `portfolio`.**

### 4c. The promotion gates (ledger 4) as seeded

| Rank | Slug → public rung | Evidence | Artifacts | GitHub | Evals | Impl | Competency confidence | AI approval |
|---|---|---|---|---|---|---|---|---|
| 0 | builder (entry) | — | — | — | — | — | — | — |
| 1 | junior_builder → AI Builder I | 3 | 0 | 0 | 0 | 1 | — | no |
| 2 | practitioner → AI Builder II | 6 | **2** | 2 | 0 | 2 | prompt_eng ≥ 0.4 | no |
| 3 | developer → AI Builder III | 10 | 3 | 4 | 1 | 3 | pe 0.5, arch 0.4 | no |
| 4 | senior_developer → AI Builder IV | 15 | 5 | 6 | 2 | 5 | + testing 0.4 | no |
| 5 | engineer → AI Builder V | 22 | 7 | 10 | 3 | 7 | + deployment 0.4 | yes (stub) |
| 6 | senior_engineer → AI Builder VI | 30 | 10 | 15 | 4 | 10 | arch 0.65 … | yes |
| 7 | architect_candidate → AI Architect | 40 | 14 | 20 | 6 | 14 | arch 0.7, comm, lead, sec | yes |
| 8 | architect → Senior AI Architect | 55 | 20 | 28 | 8 | 18 | six domains | yes |

Confidence = weight / (weight + 3); one evidence row at weight 1 = 0.25, two = 0.4, three = 0.5. Attendance was removed from every rank on 2026-09-10.

---

## 5. Recommendation: a milestone ladder

**Principle:** a band is earned by finishing things the program actually asks for, each verified by a deterministic signal a student can see and a staff member can explain in one sentence. Evidence counts and competency curves stay as *information* (the readiness lens, CAPE, skill radar); they stop being the *gate*.

### 5a. The four program milestones + one credential

| Milestone | Definition (deterministic) | Signal today | New work |
|---|---|---|---|
| **Curriculum complete** | All 12 weeks done, where "done" = every published *graded* card in the week completed (or ≥ 90% if a softer bar is wanted). Not the 30% `weekDone`. | `curriculumCompletionService.getStudentWeekBreakdown` (per-week counts exist) | New constant + `curriculum_complete` latch on enrollment |
| **Project complete** (×3) | A published SBP plan where every plan story incl. STORY-000 is `verified` (criteria ticked + named commit, per the Build Verification Contract). | `decideBuild` rollup already computes all-verified | `project_complete` latch (first-write-wins, like `verified_at`) + event |
| **Certification verified** | Staff records a passed CCA-F (or successor) with date, verifier, and proof. "We are the approvers." | None — does not exist | Small table `student_certifications` + admin route + Team/Company UI |

### 5b. The ladder

| Rung | Requirement | Reachable by |
|---|---|---|
| AI Aware I / II | 0 / 150 engagement pts | Everyone (free) |
| AI Enabled I / II | 400 / 900 engagement pts | Everyone (free) |
| **AI Builder I** | 1 of 4 milestones (curriculum, or any project) | Build-entitled only |
| **AI Builder II** | 2 of 4 | Build-entitled |
| **AI Builder III** | 3 of 4 | Build-entitled |
| **AI Builder IV — Program Graduate** | 4 of 4: curriculum + three projects | Build-entitled |
| **AI Architect** | Graduate + certification verified | Build-entitled |
| **Senior AI Architect** | Architect + a case study that reached `operational_result` (an outcome measured in use), or staff nomination | Manual |

Milestones count in any order. The structural anti-cheat invariant survives unchanged: points still cannot reach a build band, free accounts have no projects, and every build rung needs verified commits or a staff-verified credential.

### 5c. Worked examples

- **Farhat** — curriculum ✓, project 1 ✓, project 2 in progress → **AI Builder II** today; Builder III when project 2 fully verifies; Graduate at project 3; AI Architect at certification. (Her curriculum status must be confirmed against the stricter "graded cards" rule with real data — see §8.)
- **Ali's account** — 948 pts, Cohort July 2026, no verified project → **AI Enabled II**, no "Join" card, next line reads "Ship your first build to reach AI Builder I".
- **A free Explorer at 2,000 pts** — AI Enabled II, "Become an AI Builder — Join" card shown. Correct.
- **Swati Raman** (29 evidence, 16 github, 8 impl, 1,600 builder XP, rank 1) — depends entirely on how many of her projects are fully verified; the dry-run backfill answers this for everyone at once.

### 5d. What happens to the existing machinery

- `builder_levels` keeps its table/seeder pattern; gains `min_milestones`, `requires_certification`; the count/confidence columns go to 0 (retained for the readiness lens, not the gate). Six seeded rungs replace nine.
- `evaluateForEnrollment` becomes a full recompute to the highest cleared rung, idempotent, never decreasing (a latch — un-promoting is a conversation, not an automation, consistent with the verification contract). Triggers: milestone events + nightly sweep in `schedulerService` + an admin "recompute" action.
- `computeBand` / `RANK_TO_BAND` shrink to the six rungs. Frontend `READINESS_BAND` duplicate is deleted in favour of the server's rung name.
- Competency confidence, Architect Readiness %, CAPE and Cert Prep readiness are untouched as displays.
- Engagement points, streaks, leaderboard: untouched. Skill XP: keep writing, demote on the Points tab (tile 2 becomes the milestone checklist; XP moves below it).

**Alternative considered (not recommended):** keep the 9-rank evidence ladder and patch the gates (drop `min_artifacts`, map verified stories to `implementation`, add `project_task` weights for prompt_engineering). It unblocks rank 2 in a day, but the ladder stays unexplainable ("evidence 22 of 22, github 10 of 10, evaluations 2 of 3") and the milestones Ali named still don't exist in it.

---

## 6. Decisions needed from Ali

Recommended option listed first in each.

- **D1 — Ladder shape.** (A) Milestone ladder as in §5b. (B) Patch the existing 9-rank evidence gates. (C) Hybrid: milestones gate Builder I–IV, competency confidence additionally gates Architect.
- **D2 — Does curriculum completion count as a full milestone, equal to a project?** (A) Yes, 4 equal milestones, any order. (B) No: curriculum is the floor for Builder I, projects are the rungs (Builder I = curriculum + 1 project … Graduate = curriculum + 3).
- **D3 — What is "curriculum complete"?** (A) Every graded card in all 12 weeks. (B) ≥ 90% of published cards per week. (C) Keep the existing 30% `weekDone` (not recommended; it is a pacing signal, not a completion one).
- **D4 — Certification record.** (A) Staff-verified upload (new table + admin route; Ali/staff approve). (B) Trust Cert Prep "sustained readiness" as a proxy until an external result exists (not recommended — it's practice, not a pass).
- **D5 — Ranks never go down?** (A) Latch: a rung, once earned, is kept even if the definition tightens later. (B) Full recompute every time, including downgrades.
- **D6 — Names.** (A) Keep AI Builder I–IV + "Program Graduate" label on IV. (B) Three Builder rungs only (I/II/III = 1/2/3 projects, curriculum required for I). (C) Something else — Ali's call; names are the part every student sees.
- **D7 — Skill XP tile.** (A) Demote below the milestone checklist. (B) Remove from the Points tab entirely (data kept). (C) Leave as-is.

---

## 7. Plan

Each phase is a separate PR with its own tests and PROGRESS entry. Phase 0 needs no decision and can ship this week. Phases 2–5 wait on D1–D7.

### Phase 0 — Stop the four lies (no ladder change) · ~1 session
1. Gate the "Become an AI Builder — Join" card and the HUD "Build to unlock AI Builder" line on `isBuildEntitled`; entitled copy becomes "Ship your first build to reach AI Builder I". Card only at the 900 ceiling, as its comment intends. (`PointsDrilldown.tsx:127`, `bandLadder.ts:61-69`; server already has the entitlement — expose `buildEntitled` on `GET /api/portal/points`.)
2. `LevelJourney` places any "AI Builder *" / "AI Architect *" rung on its build rung by band slug, not exact name.
3. Company roster, Team section, community `LevelBadge`, `MemberProfileDrawer`, `PeerWinsPanel`, `TimelineCard`, `TodayShell`, `PathPage`: show the canonical rung name from the server; delete the Apprentice/Builder/Architect/Principal name maps.
4. One word per number: "Architect Readiness" stays on the competency mean; CAPE ring becomes "Skill proficiency"; Path page becomes "Curriculum progress"; public portfolio tile becomes "Portfolio score".
5. Read path of AI approval matches the write path (stub approves ⇒ no "pending" gap). Remove `attendance` from `GAP_LABELS`; fix the `text-transform: capitalize` on gap lines.
- Tests: `bandHudNext` entitled/non-entitled; `LevelJourney` placement for "AI Builder III"; `formatGap` unchanged. Verification: `tsc --noEmit`, jest, screenshot of the Points tab on Ali's account and on a free Explorer.

### Phase 1 — Decisions · Ali, 30 minutes
D1–D7 above. Output: one paragraph in `docs/POINTS_LADDER_DECISIONS.md` and the seed table for Phase 3.

### Phase 2 — Milestone signals · ~1–2 sessions
1. `curriculum_complete`: stricter completion rule in `curriculumCompletionService` (new constant, old `weekDone` untouched for pacing), latched on the enrollment with a date.
2. `project_complete`: when `decideBuild`'s rollup flips to all-verified, latch `student_projects.completed_at` (first-write-wins) and emit a domain event; idempotent on re-sync.
3. `student_certifications`: additive table (enrollment_id, track, passed_at, verified_by, evidence_url, unique on enrollment+track); admin route with Zod validation; surfaced on Company/Team pages.
- Tests: happy/failure/boundary/idempotency for each latch (same operation twice ⇒ same state). Governance: the new table is an additive schema change — approval requested here, with this plan.

### Phase 3 — Promotion engine v2 · ~1 session
1. `builder_levels` seeds → six milestone rungs (`min_milestones`, `requires_certification`); count columns to 0.
2. `evaluatePromotion` gains a milestone input; `evaluateForEnrollment` recomputes to the highest cleared rung, latched (D5), idempotent.
3. Triggers: milestone events (Phase 2), nightly sweep in `schedulerService`, admin recompute endpoint. The read path (`getPromotionStatus`) reports gaps in milestone language: "Projects verified — 1 of 3".
4. `computeBand` / `RANK_TO_BAND` / frontend `READINESS_BAND` collapse to the six rungs.
- Tests: pure `evaluatePromotion` matrix (0–4 milestones × cert yes/no), latch never decreases, sweep idempotent. Existing `bandLadder.test.ts` invariants ("points alone never exceed AI Enabled") are kept and re-pinned.

### Phase 4 — Backfill and re-rank in production · ~1 session + Ali's approval
1. Dry-run script (`docker cp` pattern, read-only) prints the before/after distribution: rank counts, every student who moves, and why (which milestones they hold). Farhat and Swati are named rows.
2. Ali reviews the table; on approval the same script runs with `--write`, idempotent, one log line per promotion.
3. Nothing is deleted: evidence rows, XP, points and the old `student_level` values are all kept (old rank/slug copied into `promotion_evidence`).

### Phase 5 — Points tab and HUD tell the milestone story · ~1–2 sessions
1. Tile 2 becomes "Program milestones": Curriculum ✓ · Project 1 ✓ · Project 2 (7 of 12 stories) · Project 3 — · Certification —. Skill XP moves below it (D7).
2. HUD next-line: "1 project to AI Builder III". Level journey shows Builder I–IV + Architect with "You are here" on the actual rung.
3. Certification upload/verification visible to the student ("Verified by Ali, 12 Oct").
- Verification: Playwright on `/portal/settings?tab=points` for three personas (entitled rank-2, entitled rank-0, free Explorer); screenshot review doc per the `screenshot-review` skill.

### Phase 6 — Points hygiene (parallel, low priority)
Delete the four dead registry events or wire them; delete `githubEvidenceService` (no callers); close the three caps-ON follow-ups from 2026-07-21; decide `BUILD_PAID_GATE_ENABLED`; update `BUILD_VERIFICATION_CONTRACT.md §6` to the 800 budget; use the seeded domain weights in readiness or delete the column.

---

## 8. What I could not do this session

- **Production reads were blocked by the auto-mode classifier**, so every number above about live students comes from code and from the 2026-08-25 / 2026-09-10 session logs, not from a query I ran today. The distribution may have moved slightly since (26 at rank 1 after the 2026-09-10 backlog clear). The read-only query Ali can run or approve, against `accelerator-db`:

```sql
-- rank distribution
SELECT level_slug, rank, COUNT(*) FROM student_level GROUP BY 1,2 ORDER BY 2;
-- evidence by source (artifact should be 0)
SELECT source_type, COUNT(*) FROM evidence_records WHERE validated GROUP BY 1 ORDER BY 2 DESC;
-- Farhat
SELECT u.first_name, sl.level_slug, sl.rank, sl.architect_readiness,
       (SELECT COUNT(*) FROM evidence_records e WHERE e.enrollment_id = sl.enrollment_id AND e.validated) AS evidence,
       (SELECT COALESCE(SUM(points),0) FROM student_points_events p WHERE p.enrollment_id = sl.enrollment_id) AS pts
FROM student_level sl JOIN enrollments en ON en.id = sl.enrollment_id JOIN users u ON u.id = en.user_id
WHERE u.first_name ILIKE 'farhat%';
-- projects fully verified per student (the Phase 4 dry-run does this properly)
```

- The design source the code cites (`docs/training-program-2026-q3/POINTS_ECONOMY_AND_ARCHITECT_LADDER.md`) was never committed; its intent survives only in `bandLadder.ts` comments and the build ledger. This document should replace it as the source of truth once D1–D7 are answered.

---

## 9. Decisions already made that this plan keeps

One economy for the HUD (Ali, 2026-07-20). Free bands from points only; build bands from verified work only; structural, not tunable (2026-07-21). Budget-per-build XP, not per-story (Ali, 2026-08-14). DONE = criteria + named commit, no CI bar, no automated revocation (Ali, 2026-08-14). Attendance gates nobody (2026-09-10). Evidence, not practice, for cert readiness (Ali, 2026-09-03). Podcasts pay points (Ali, 2026-09-11). `points_config` is the tuning surface; nothing hardcodes XP at a call site.
