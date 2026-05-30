# AI Systems Architect Accelerator — Integration Plan

**Status:** Draft v1 for Ali's critique
**Authored:** 2026-05-30 (CC-20260530-training)
**Target launch:** 2026-07-10 (41 days from today)
**Source research:** ChatGPT conversation "Claude Code Training Guide" (https://chatgpt.com/share/6a1b710e-0bf4-83ea-83fe-17f334d5e02e)

---

## 0. Executive Summary

We are taking the strategy laid out in the ChatGPT research and turning it into a launchable program **on the existing Colaberry Enterprise AI Leadership Accelerator platform** (`enterprise.colaberry.com`). This is NOT a green-field new system. It is the next layer on top of what already runs there.

**The bet:** Anthropic owns the upstream knowledge layer (Skilljar courses, the Claude Certified Architect – Foundations cert). Colaberry owns application, accountability, portfolio, community, and consulting downstream. Every student arrives with their own venture idea, the platform turns that idea into a 12-week build, they graduate with a working AI system, a GitHub portfolio, the CCA-F cert, and a community/consulting tail.

**Headline integration points (where each piece lands):**
1. **Project Builder** — frontend/backend feature that captures "Project DNA" Week 1 and drives every subsequent week's personalized lab. *Owner: AI Team. ETA: end of week 3 (Jun 20).*
2. **Anthropic Companion Platform** — wrapper around every Anthropic Skilljar course with pre-work, in-flight coaching, post-work labs, portfolio artifacts. *Owner: Website Team + AI Team. ETA: end of week 4 (Jun 27).*
3. **Anthropic Intelligence Layer** — 7-tier monitoring system that watches Anthropic content/docs/news/partner portal nightly and triggers curriculum updates. *Owner: AI Team. ETA: levels 1–3 by week 4, levels 4–7 deferred to v1.1.*
4. **6 AI Agents** (Curriculum / Mentor / Community / Portfolio / Architect / Success Coach) — slot into `backend/src/services/agents/`. Reuse the @CB nudge engine pattern we shipped 2026-05-30. *Owner: AI Team. ETA: 3 agents by launch, 3 deferred.*
5. **Architect Portfolio Dashboard** — new portal page replacing the current generic dashboard, sourcing from GitHub API + Skilljar + Colaberry assessment data. *Owner: Website Team. ETA: end of week 4 (Jun 27).*
6. **In-platform community (Skool replacement)** — discussions, build logs, project communities. *Owner: Website Team. ETA: minimum viable forum by launch; rich community features deferred to v1.1.*
7. **Pricing/enrollment flow** — $499 × 4 intensives + $1,497 bundle + $79/mo + $149/mo Pro. Stripe wiring. *Owner: Website Team. ETA: end of week 5 (Jul 4).*
8. **TWC compliance documentation** — 4 independent seminar outcomes documented per legal requirement. *Owner: Ali + outside counsel review. ETA: end of week 2 (Jun 13).*
9. **Marketing site / viral video pipeline** — landing pages per intensive, Build Log auto-formatter (LinkedIn post + short script per student per week). *Owner: Marketing Team + AI Team. ETA: marketing site by week 4, auto-formatter by week 5.*

**Critical path:** Anthropic Partner Network status (10 employees through 4 courses). Without that, the CCA-F cert is not free for our cohort, the curriculum mapping loses its anchor, and the "powered by Anthropic" positioning is shaky. The countdown report I shipped 2026-05-26 fires daily until 2026-06-12.

---

## 1. Program identity (final, from the research)

**Brand:** AI Systems Architect Accelerator
**Powered by:** Anthropic + Claude Code (Partner Network branding once secured)
**One-line:** "Bring your idea. We help you turn it into a real AI system."
**Positioning:** "Learn from Anthropic. Build through Colaberry. Deploy in the real world."

**Reject these names:** Prompt Engineering / AI Bootcamp / Learn Claude / ChatGPT Training.

**Differentiation:** Anthropic certifies knowledge; we certify capability. Every student leaves with a unique project, not an identical capstone. Project-Builder-first model — the project IS the curriculum generator.

**Buyer personas / track segments:**
- Career changers and working professionals
- Future consultants / future architects
- Enterprise employees building internal company tools
- Aspiring AI side-hustlers and indie founders

**Industry tracks (student picks at Week 1):** Insurance / Healthcare / Education / Government / Recruiting / Real Estate / Freight / Manufacturing / Personal Brand / Small Business / Faith Based / Nonprofit / Custom.

---

## 2. Curriculum structure (final, from the research)

**12 weeks total. Mon (Architecture Day, 2hr) + Thu (Build Day, 2hr).**

**TWC-compliant seminar split** — 4× independent 3-week "Architect Intensives" at $499 each, bundled at $1,497:

| # | Market name | Tech name | Weeks |
|---|---|---|---|
| 1 | Build Your AI Foundation | Claude Code Foundations | 1–3 |
| 2 | Create Your AI Team | Agent Engineering | 4–6 |
| 3 | Connect AI To The Real World | MCP & Enterprise Integration | 7–9 |
| 4 | Design AI That Scales | AI Systems Architecture | 10–12 |
| (opt) | Applied AI Consulting Lab | Apprentice on real Colaberry projects | post-grad |

**Per week, every student delivers:** GitHub repo update / architecture doc / 5-min demo video / reflection / community build log post.

**Week-by-week themes** (each builds on the prior — "Lego model", one coherent system across 12 weeks, NOT 12 separate projects):

1. Claude Code Foundations + Architect Workspace setup
2. Agent Skills (3 project-specific skills)
3. Claude API + Business Workflow Assistant
4. Prompt Engineering + Enterprise Prompt Library
5. MCP Foundations + First MCP Server
6. Advanced MCP + Business System Integration
7. Subagents + Multi-Agent Team
8. Claude Code Workflows + Development Automation
9. Reliability Engineering + AI Quality Layer
10. Governance + AI Governance Engine
11. Systems Architecture + Solution Architecture Package
12. Capstone (production-readiness polish, NOT a new build) + Architect Expo

**TWC tension to resolve:** the Lego model means weeks 4–6 build on weeks 1–3, which can read as "one course chopped up." The 4-seminar split needs the artifacts and outcomes per intensive to be defensibly independent — even though they live in the same student's project repo, each intensive should produce a SELF-CONTAINED deliverable (e.g., Intensive 1 = working Architect Workspace + 3 Skills + Workflow Assistant; Intensive 2 = working Multi-Agent System; etc.). Ali to confirm with TWC-aware counsel.

**Assessment / cert:**
- External: Claude Certified Architect – Foundations (CCA-F), ~60 questions, ~$99, free for first 5K Anthropic Partner Network employees.
- Internal Colaberry: per-module 10 scenario questions + reflection + AI Mentor review.
- **AI Architect Readiness Score** 0–100 across MCP / Claude Code / Architecture / Reliability / Governance.

---

## 3. Where each piece lands in THIS codebase

This is the integration map. For each component: existing system or new build, file path / module, owner team, ETA, and dependencies.

### 3.1 Project Builder (centerpiece)

- **Status:** Existing on platform per the ChatGPT conversation ("Study the attached project builder"). Needs Week-1 wizard added.
- **Lands at:** `frontend/src/pages/portal/ProjectBuilder*.tsx` (existing) + new `frontend/src/pages/portal/ProjectDnaWizard.tsx`. Backend: `backend/src/services/projectDnaService.ts` (new) writing to a new `project_dna` table.
- **What it captures:** Business questions (problem / who uses / industry / internal vs external / revenue vs operational / systems involved). Technical questions (web app / agent / workflow / mobile / dashboard / data sources). AI questions (Claude / MCP / Agents / RAG / Workflows). Plus: Industry track selection.
- **What it emits:** A `project_dna` record that drives every subsequent week's personalized lab recommendations.
- **Owner:** AI Team (project_dna writer) + Website Team (wizard UI).
- **ETA:** end of week 3 (2026-06-20).

### 3.2 Anthropic Companion Platform (course wrapper)

- **Status:** New build.
- **Lands at:** `frontend/src/pages/portal/learning/AnthropicCourseWrapper.tsx`. Backend: `backend/src/services/skilljarSyncService.ts` (new, pulls Skilljar progress via SSO or webhook), `backend/src/models/AnthropicCourse.ts`, `backend/src/models/StudentAnthropicProgress.ts`.
- **For each Anthropic Skilljar course, wraps it with:**
  - **Before:** Learning objectives / Vocabulary / Warmup assessment (5 questions)
  - **During:** Progress tracker + AI Coach (slide into the @CB handler pattern — new "course coach" tool)
  - **After:** Colaberry lab + 10-question quiz + reflection + portfolio artifact generation
- **Database new:** `AnthropicCourses`, `AnthropicLessons`, `StudentAnthropicProgress`, `ColaberryLabs`, `ColaberryCapstones`.
- **Owner:** Website Team + AI Team.
- **ETA:** end of week 4 (2026-06-27).

### 3.3 Anthropic Intelligence Layer (7 tiers)

- **Status:** Net new system. The conversation specifies 7 levels; for launch we ship levels 1–3 only, defer 4–7.
- **Lands at:** `backend/src/intelligence/anthropicWatcher/` (new subsystem, sibling to existing `backend/src/intelligence/`).
- **Levels (launch scope):**
  - Level 1 — `Anthropic_ContentRegistry` table (course / docs / news / partner-portal URLs, current hash, last checked, last modified, status). *New table + nightly cron job.*
  - Level 2 — Change Detection Engine: nightly diff. New script `backend/src/scripts/anthropicChangeDetector.js` similar pattern to the dispatcher. Outputs change events to a new `anthropic_change_events` table.
  - Level 3 — AI Curriculum Impact Agent: gpt-4o-mini call per change event. Generates severity (1–10), affected programs, action items, timeline, owner, estimated effort. Emails Ali on severity ≥7.
- **Deferred to v1.1 (post-launch):** Strategic Opportunity Agent (L4), Anthropic Alignment Dashboard (L5), Certification Blueprint Monitoring (L6), Steering Committee tooling (L7).
- **Owner:** AI Team.
- **ETA:** L1 end of week 2 (2026-06-13); L2 end of week 3 (2026-06-20); L3 end of week 4 (2026-06-27).

### 3.4 The 6 AI Agents (slot into agent registry)

- **Status:** All new. Pattern: same as the @CB nudge engine and exit_intern_preview tool already shipped 2026-05-30. Each agent is a tool/loop using OpenAI function-calling (we picked OpenAI over Anthropic for @CB because the key was already plumbed — same call applies here for v1; can swap to Claude later).
- **Lands at:** `backend/src/services/agents/training/`. Each agent gets its own file matching existing patterns.
  - `curriculumAgent.ts` — watches Anthropic, detects changes, creates recommendations (wraps Anthropic Intelligence Layer 1–3)
  - `mentorAgent.ts` — reviews student submissions, provides feedback, suggests improvements. Triggered on GitHub push + lab submission.
  - `communityAgent.ts` — welcomes users, answers questions, routes conversations. *Deferred to v1.1.*
  - `portfolioAgent.ts` — monitors GitHub, tracks progress, updates portfolio, calculates readiness score. Daily cron, leverages existing `dailyInternNudges` pattern.
  - `architectAgent.ts` — evaluates projects, suggests next artifacts, identifies gaps. Weekly cron.
  - `successCoachAgent.ts` — attendance / progress / completion / nudges. **Reuses the dailyInternNudges engine we just shipped.** Standard target: 3 updates/week (matching Jackie's old rate, not the 3/day Ali raised for interns — students are paying, different bar).
- **Launch scope:** Mentor + Portfolio + Architect + SuccessCoach (4 of 6). Curriculum + Community deferred to v1.1.
- **Owner:** AI Team.
- **ETA:** ship 4 agents by end of week 5 (2026-07-04), 1 week buffer before launch.

### 3.5 Architect Portfolio Dashboard

- **Status:** New page. Replaces the generic portal home for enrolled students.
- **Lands at:** `frontend/src/pages/portal/ArchitectDashboard.tsx`. Backend: `backend/src/routes/portal/architectRoutes.ts`.
- **Components:**
  - AI Architect Readiness Score (0–100, by MCP / Claude Code / Architecture / Reliability / Governance)
  - GitHub activity (commits / repos / PRs / stars) via GitHub API
  - Anthropic Skilljar progress
  - Colaberry lab + assessment progress
  - Current week's required artifacts + status
  - Build Log feed (their own + community)
  - Project Story (auto-generated chronicle per student)
- **Owner:** Website Team.
- **ETA:** end of week 4 (2026-06-27).

### 3.6 GitHub integration

- **Status:** New. Mandatory — "every artifact must live in GitHub."
- **Lands at:** `backend/src/services/githubIntegrationService.ts`. OAuth flow + webhook receiver.
- **Captures:** repo creation, commits per day, PR activity, stars, contribution graph. Pushes to a new `student_github_activity` table. Feeds the Portfolio Agent + the Readiness Score.
- **Owner:** AI Team + Website Team.
- **ETA:** end of week 3 (2026-06-20).

### 3.7 Build Log auto-formatter (viral marketing engine)

- **Status:** New. This is the explicit viral content engine Ali keeps mentioning.
- **Lands at:** `backend/src/services/buildLogFormatter.ts`. Triggered weekly per student. Reads their week's GitHub activity + reflection + artifact metadata. Generates:
  - LinkedIn post (~150 words, "Building In Public" tone)
  - Short video script (60-second hook, what changed this week, demo callout)
  - Architecture update (1-paragraph summary for the project's public page)
  - Demo summary (5-min video script outline)
- **Output destinations:** Email to student (their content to publish) + auto-post option (with their consent) to the Colaberry community feed.
- **Owner:** AI Team + Marketing Team.
- **ETA:** end of week 5 (2026-07-04).

### 3.8 Project Marketplace (downstream consulting funnel)

- **Status:** New. Connects graduates to real Colaberry client work (Patriot, Education, Freight, Mortgage projects already in the org).
- **Lands at:** `frontend/src/pages/portal/projects/Marketplace.tsx`. Backend: `backend/src/services/projectMarketplaceService.ts`.
- **Launch scope:** read-only list of available projects + "express interest" form. **Project assignment workflow / governance / liability** is an open question (see Section 5). For launch we ship the list; assignment stays manual.
- **Owner:** Website Team.
- **ETA:** end of week 5 (2026-07-04). Defer governance to v1.1.

### 3.9 In-platform community (Skool replacement)

- **Status:** New. This is the biggest unscoped piece.
- **Lands at:** `frontend/src/pages/portal/community/`. Backend: `backend/src/services/communityService.ts` + new tables.
- **Launch-minimum scope:**
  - Global community feed (build logs from all students)
  - Per-cohort discussion thread
  - Per-industry community (Insurance AI / Healthcare AI / etc.) — read-only at launch
- **Deferred to v1.1:** Project communities (Basecamp-style per project), file sharing, events calendar, certification communities.
- **Owner:** Website Team.
- **ETA:** end of week 5 (2026-07-04).

### 3.10 Architect Expo platform

- **Status:** New, but only needed at end of Week 12 — first cohort hits this ~2026-10-02 (12 weeks after 2026-07-10).
- **Decision:** **Defer entirely to a v1.2 sprint in late September.** Not on the 41-day launch critical path.

### 3.11 Pricing / enrollment flow

- **Status:** New. Existing site doesn't have e-commerce for this product yet.
- **Lands at:** `frontend/src/pages/public/intensive/[slug].tsx` (one landing page per intensive + bundle). Backend: Stripe wiring in `backend/src/services/billingService.ts` (new).
- **SKUs at launch:**
  - 4 individual seminars at $499
  - "AI Systems Architect Accelerator" bundle at $1,497
  - Architect Network Membership $79/mo and $790/yr (graduate-only)
  - Architect Pro $149/mo (graduate-only)
- **Owner:** Website Team + Ali for Stripe account / tax setup.
- **ETA:** end of week 5 (2026-07-04). Hard gate for launch.

### 3.12 TWC compliance documentation

- **Status:** Net new strategic deliverable.
- **Lands at:** `docs/training-program-2026-q3/twc-compliance/` (new folder, gitignored as it includes legal-review material).
- **Deliverables:**
  - 4 independent seminar outcome statements (one per intensive)
  - 4 independent artifact catalogs (one per intensive)
  - "Seminar vs. course" defensibility narrative
- **Owner:** Ali + outside counsel for review.
- **ETA:** end of week 2 (2026-06-13). **Hard gate** — selling a "course" without TWC approval is a legal/operational risk.

### 3.13 CCPP integration (student progress + cert tracking)

- **Status:** New tables, existing DB.
- **Lands at:** new tables in CCPP: `ADF_AISystemsArchitect_Cohort`, `ADF_AISystemsArchitect_StudentProgress`, `ADF_AISystemsArchitect_Certifications`. Sequelize models in `backend/src/models/`.
- **Why CCPP and not Postgres:** CCPP is the source of truth for all Colaberry school enrollments (per existing memory). New program enrollments go where existing ones go.
- **Owner:** AI Team + DB owner.
- **ETA:** schema by end of week 2 (2026-06-13), sync flow by end of week 3 (2026-06-20).

---

## 4. Team structure (4 teams + roles)

You said you'll be training 4 teams + AI team + future builds. Mapping:

| Team | Lead role | What they own for this launch |
|---|---|---|
| **Website Team** | Frontend lead | Marketing site, intensive landing pages, portal redesign (Architect Dashboard, ProjectBuilder wizard UI, Companion Course wrapper, Community MVP, Marketplace v1), Stripe + enrollment. |
| **Sales Team** | Sales lead | Pricing / discounting playbook, B2B (enterprise-employee track) outreach scripts, conversion funnel optimization, Founding Cohort sales push. Plus the Anthropic Partner Network sell-in for partner-employee referrals (free CCA-F for first 5K). |
| **Marketing Team** | Marketing lead | Brand assets, landing-page copy, viral video pipeline, LinkedIn auto-post review queue (someone must spot-check before AI posts publish), Architect Expo content strategy (for Q4). |
| **AI Team** | You (Ali) + future hire | The 6 agents (4 at launch), Anthropic Intelligence Layer (L1–3), Project Builder + Project DNA, GitHub integration, Build Log auto-formatter, CCPP integration. Also: keep extending @CB. |
| **Ops (you wear this hat for now)** | Ali | Anthropic Partner Network finish-line push (until 2026-06-12), TWC compliance docs, Stripe + legal entity confirmation, instructor sourcing for Architect Pro tier mentors. |

**Anthropic Partner cohort:** 10 employees through 4 courses (already in motion per the countdown report). Names per the existing project (47477101): Angela, Srinivas, Swati, Taiwo, Jackie, Aleem, Sohail, Sai Tejesh, Karun, Kes. The 4 specific courses needed for partner status are not in the ChatGPT transcript — Ali to confirm with the existing Partner playbook he has separately.

---

## 5. The 41-day plan (week-by-week)

Today = 2026-05-30 (Friday). Launch = 2026-07-10 (Friday, 6 weeks out).

| Week | Date range | Gates / hard milestones | Team focus |
|---|---|---|---|
| **0** | May 30 – Jun 6 | TWC compliance docs drafted; AI Team agent design review; Marketing brand finalized | All — kickoff |
| **1** | Jun 7 – Jun 13 | TWC docs to counsel; Anthropic Partner status secured (deadline Jun 12); CCPP schema for new tables | Ops + Ali |
| **2** | Jun 14 – Jun 20 | Project Builder + Project DNA shipped; GitHub OAuth + sync shipped; Anthropic L1 Content Registry live | AI Team + Website |
| **3** | Jun 21 – Jun 27 | Anthropic Companion course wrapper shipped (5 courses); Architect Portfolio Dashboard shipped; Anthropic L2 + L3 shipped | All |
| **4** | Jun 28 – Jul 4 | 4 AI Agents (Mentor / Portfolio / Architect / SuccessCoach) shipped; Build Log auto-formatter shipped; Stripe + enrollment shipped; Community MVP shipped; Marketplace v1 shipped | All |
| **5** | Jul 5 – Jul 10 | End-to-end QA on a test cohort of 3 Colaberry staff; marketing site goes live; first paid enrollment opens; Founding Cohort price ($1,497) launched | All |

**Cohort start date:** Set for **Monday 2026-07-13** (Monday after the Friday launch). 12 weeks × Mon+Thu puts cohort finish around 2026-10-02 (Architect Expo).

---

## 6. Open decisions (need Ali's call before / shortly after launch)

These came directly out of the research:

1. **Cohort cadence:** quarterly (default), monthly, or rolling enrollment?
2. **Cohort size cap:** Conservative revenue model assumes 100/yr (~25/cohort). Hard cap?
3. **CAC target / marketing budget:** Viral is the strategy. What's the paid-channel backstop and budget?
4. **Skilljar progress sync architecture:** API, webhook, manual cert upload, or all three?
5. **Require Anthropic cert upload for graduation?** Currently soft-required.
6. **Architect Pro mentor sourcing:** internal staff, paid alumni, contractors?
7. **Project Marketplace governance:** assignment rules, vetting, compensation, liability for real client work performed by students.
8. **TWC seminar-independence test:** Lego model vs. defensibly-independent outcomes. Counsel needed.
9. **Refund / drop policy.**
10. **Mid-cohort Anthropic blueprint change:** what's the response workflow if the cert exam blueprint shifts during Week 6 of a running cohort?
11. **Capstone evaluation rubric.**
12. **Architect Expo logistics:** virtual / in-person / hybrid. Recording rights / IP.
13. **The 4 specific Anthropic courses needed for partner status:** referenced as "in the playbook," not named in the transcript.
14. **The 5 additional partner-onboarding candidates beyond the original 10:** not named.
15. **Capacity:** can the 6-agent platform actually self-manage with cohort size N? What N starts to break?

---

## 7. Cost model (high-level)

**Build cost (41 days):**

| Bucket | Estimate |
|---|---|
| AI Team time (you + 1 contract dev) | ~280 person-hours |
| Website Team (1 lead + 1 contract dev) | ~280 person-hours |
| Marketing (lead + freelance designer + copywriter) | ~120 person-hours |
| Sales lead | ~80 person-hours |
| Legal / TWC counsel | ~$3K–$5K one-time |
| Stripe + tax setup | ~$500 + ongoing 2.9% + 30¢ per |
| Initial hosting bump (compose stack already running) | negligible |
| Initial marketing spend (Founding Cohort push) | TBD |

**Cost of delivery per cohort (assuming 25 students × 12 weeks):**

- Platform: existing, marginal cost negligible.
- Mentor reviews (if Architect Pro mentors are paid contractors at $50/hr × ~2 hrs/student/week × 12 weeks × ~10 Pro students): ~$12K per cohort.
- Anthropic Skilljar: free for partner-network employees (the cohort if we hit that gate).
- Per-student Claude Code: BYO ($17–$20/mo paid by student).

**Revenue projections (from the research):**

| Model | Year-one revenue |
|---|---|
| Conservative (100 students, 60% retention to $79/mo + 20 Architect Pro at $149/mo) | **~$242K** (training $149.7K + recurring $92.6K) |
| Aggressive (500 active members at $99/mo blended) | **~$594K** + consulting upside |

Note: aggressive uses the $99/mo number from Ali's original pricing, not the $79/$149 split I'm using above. Reconcile.

---

## 8. What ships at launch vs. what's deferred

**Ships at launch (2026-07-10):**
- Marketing site (4 intensives + bundle)
- Stripe enrollment
- Project Builder + Project DNA wizard
- Companion Course wrapper around 5 priority Anthropic courses (Claude 101, Claude Code 101, Intro to MCP, Intro to Subagents, Claude API)
- GitHub OAuth + sync + activity capture
- Anthropic Intelligence Layer L1–L3
- 4 AI agents (Mentor / Portfolio / Architect / SuccessCoach)
- Architect Portfolio Dashboard
- Build Log auto-formatter
- Community MVP (global feed + per-cohort thread)
- Project Marketplace v1 (read-only list)
- CCPP tables + sync
- TWC compliance documentation

**Deferred to v1.1 (~Aug 2026):**
- Curriculum Agent + Community Agent (the 2 missing of 6)
- Anthropic Intelligence Layer L4–L7
- Per-industry / per-project community subspaces
- Project Marketplace assignment + governance workflow
- Architect Pro mentor scheduling

**Deferred to v1.2 (~late Sep 2026, before first Architect Expo):**
- Architect Expo platform
- Mid-cohort blueprint-change workflow
- Refund / drop policy + handling

---

## 9. How this connects to existing Colaberry systems

- **CCPP:** new tables for cohort/student/cert tracking. Sequelize models added. Same DB as existing internship enrollments.
- **@CB nudge engine (shipped 2026-05-30):** the SuccessCoachAgent reuses this entire pattern. Same `internActivityTracker` module, same nudge file-mode toggle, same escalation levels. Different cadence (3/week for paying students vs. 3/day for unpaid interns).
- **Basecamp:** every cohort gets its own Basecamp project for the 12-week build. Existing pattern.
- **`/admin/reports` admin UI (shipped 2026-05-30):** new reports for cohort progress, intensive-by-intensive completion rates, marketplace activity, viral content fired per week.
- **`/api/portal/project/telemetry` BuildManifest:** every new component emits BuildManifests so the state maps stay coherent.
- **@CB exit_intern_preview tool:** the equivalent for paid students is more sensitive (they paid; need refund logic). Defer to v1.1.

---

## 10. Risks (top 5)

1. **Anthropic Partner Network status not secured by 2026-06-12** — every downstream promise ("powered by Anthropic", free CCA-F for cohort) is at risk. Mitigation: countdown report already running.
2. **TWC compliance fails the seminar-independence test** — the Lego curriculum model puts this at risk. Mitigation: counsel review by 2026-06-13.
3. **41 days is aggressive for 9 net-new platform features** — the Website Team is the bottleneck. Mitigation: cut Community MVP and Marketplace to placeholder pages if needed; ship enrollment + Project Builder + Dashboard at all costs.
4. **Founding Cohort doesn't fill** — Founding Cohort math depends on word-of-mouth / Anthropic Partner referrals at launch. No prior cohort to viral-loop off. Mitigation: book Ali for 5 LinkedIn lives in week 5, line up 3 testimonials from current Anthropic Partner cohort.
5. **The 6 AI agents don't actually self-manage at scale** — Ali wants minimal touch post-launch. Realistically v1 will need human-in-the-loop on Mentor reviews + Marketplace matches. Mitigation: explicit human-review queue in Mentor Agent.

---

## 11. Decisions I made on Ali's behalf (call them out if wrong)

1. **OpenAI over Claude for v1 agents** — matches the @CB precedent. Can swap once Anthropic API key is plumbed.
2. **Defer Architect Expo platform** — not on critical path for 41-day launch.
3. **Defer Curriculum + Community Agents** — keep launch scope to 4 of 6 agents.
4. **Project Marketplace = read-only at launch** — assignment governance is too messy to ship in 6 weeks.
5. **Pricing reconciliation:** I used the $79/$149 graduate-membership split from the research's "final recommended" table. Ali's earlier number was $99/mo with Claude bundled. The research explicitly rejected the bundled model. **Confirm.**
6. **SuccessCoachAgent target rate = 3 updates/week for paying students** (not the 3/day for unpaid interns). Different bar, different population.
7. **Cohort kickoff Mon 2026-07-13.** First Architect Expo ~2026-10-02.

---

## Appendix A — Research provenance

This plan is built from:
- The ChatGPT conversation "Claude Code Training Guide" (full transcript captured by a parallel research agent on 2026-05-30; raw transcript at agent worker temp dir).
- Existing system state per `CLAUDE.md`, `PROGRESS.md`, and observed prod code as of 2026-05-30.
- Existing Anthropic Partner Network countdown report (deadline 2026-06-12).
- The intern report v3.1 + @CB nudge engine shipped 2026-05-30 (CC-20260530-nudge2).

## Appendix B — Reference URLs from the research

Anthropic Skilljar courses referenced as the source curriculum (the 5 priority for launch):

- Claude 101
- Claude Code 101 — https://anthropic.skilljar.com/claude-code-in-action
- Intro to MCP — https://anthropic.skilljar.com/introduction-to-model-context-protocol
- Intro to Subagents
- Claude API — https://anthropic.skilljar.com/claude-with-the-anthropic-api

Full course catalog at: https://anthropic.skilljar.com/

Claude Certified Architect – Foundations exam guide: https://claudecertifications.com/claude-certified-architect/exam-guide

Claude Partner Network info: https://www.anthropic.com/news/claude-partner-network
