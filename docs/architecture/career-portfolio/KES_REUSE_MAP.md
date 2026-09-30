# KES_REUSE_MAP (Gate 0 / plan §3, §4)

**Reference repo:** `https://github.com/KesetebirhanDelele/portfolio`
**Reviewed at:** shallow clone, 2026-08-23, `C:/Users/ali_m/kes-portfolio-ref`
**Stack:** plain JS — Express (`backend/server.js`) + React/Vite (`frontend/src/*.jsx`)

Classification per plan §3: `REUSE IDEA` / `ADAPT CODE-PATTERN` / `REFERENCE ONLY` / `DO NOT IMPORT`.

## Verdicts

| Kes component | LoC | Verdict | Reasoning |
|---|---|---|---|
| `frontend/src/PortfolioBuilder.jsx` | 2,445 | **REUSE IDEA** | The Career Studio's information architecture (mini preview, grouped skills, featured projects, repo selection, manual refinement) is a good product shape. The code is a single 2,445-line component — it violates this repo's 500-line hard ceiling (root CLAUDE.md) and cannot be imported. Adapted as composed sections. |
| `frontend/src/PublicPortfolio.jsx` | 1,195 | **REFERENCE ONLY** | Recruiter-facing layout. Not built in this increment (Gate 11 deferred). |
| `backend/routes/portfolios.js` | 1,153 | **REFERENCE ONLY** | 14 endpoints covering draft/public state, narrative generation, publish, PDF, LinkedIn PDF ingest, GitHub repo publish. Concept-mapped; none adapted yet since publication is Gate 10+. |
| `backend/services/resumeDataResolver.js` | 34 | **REUSE IDEA (principle only)** | Its principle — *resume/LinkedIn data is person-level truth, never copied into each portfolio* — is adopted wholesale. Its storage is not: Enterprise already has `OnboardingProfile` (plan §3.5 explicitly says do not create Kes's separate store unless Gate 0 proves the current one inadequate; it did not). |
| `backend/services/deepAnalysisPipeline.js` + `fileClassification.js`, `semanticChunking.js`, `intelligenceAgents.js`, `inferenceEngine.js` (765), `phaseTracker.js` | ~2,500 | **ADAPT CODE-PATTERN — DEFERRED (Gate 6)** | This is the one place Kes is genuinely ahead: Enterprise repo intelligence is only `repo_language` / `file_count` / `file_tree_json`. The checkpointed, retryable, phase-tracked structure is worth adapting behind an Enterprise interface. Out of scope for the tab. |
| `backend/services/githubPortfolioPublisher.js` | — | **REFERENCE ONLY — DEFERRED (Gate 12)** | One-way export w/ topic marker + full-sync semantics. Explicitly deferrable per plan §72. |
| `backend/services/pdfGenerator.js` | — | **REFERENCE ONLY — DEFERRED (Gate 12)** | Needs an approved snapshot to render from; snapshots are Gate 10. |
| `backend/services/githubApp.js`, `githubTokenResolver.js`, `githubTokenCrypto.js`, `routes/githubAccounts.js` | — | **DO NOT IMPORT** | Enterprise already owns GitHub connection + token encryption (`GitHubConnection.access_token_encrypted`). Plan §4 lists this under "do not copy as platform truth". |
| `backend/routes/auth.js`, `middleware/`, users model | — | **DO NOT IMPORT** | Enterprise has `requireParticipant` + participant JWT. A second auth system is a stop condition (plan §71). |
| `backend/services/encryption.js`, `resumeDataCrypto.js` | — | **DO NOT IMPORT** | Duplicate crypto surface; Enterprise has its own. |
| `frontend/src/RecruiterSearch.jsx` | — | **REFERENCE ONLY — DEFERRED (Gate 13)** | Talent network. |
| `backend/services/colaberry*` (`colaberryProjectScraper`, `colaberryLiveLogin*`, `colaberrySqlClient`) | — | **DO NOT IMPORT** | These scrape/impersonate the Colaberry platform from outside. Inside the platform they are not just redundant but wrong — we have first-party data access. |
| `backend/services/openai.js`, `openaiUsageTracker.js`, `analysisQueue.js`, `heavyTaskQueue.js` | — | **DO NOT IMPORT** | Enterprise has its own AI instrumentation (`services/runtime/runtimeAi.ts`, `chatJson`). Plan §14: "integrate with Enterprise job/AI instrumentation instead of creating a parallel platform." |

## What was actually taken in this increment

Honestly: **product ideas and information architecture only. Zero lines of Kes code.**

- The Career Studio section model (Overview / Profile / Skills / Builds / Evidence) is adapted
  from `PortfolioBuilder.jsx`'s IA.
- The `resumeDataResolver.js` principle (person-level resume truth, referenced not copied) is
  the reason the Studio reads `OnboardingProfile` instead of snapshotting it.
- Everything with real algorithmic value in Kes (deep analysis) sits in a gate this increment
  does not reach.

## What was deliberately not copied

Kes's **one-click publishing policy**. Plan §6.3 / §23 require publication to be *earned* —
private by default, human-approved, versioned. Kes publishes on a `PATCH /:id/publish` with no
review gate. That difference is a product decision, not an implementation detail, and it is why
this increment ships the private half only.
