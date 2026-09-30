# PORTFOLIO_SOURCE_MAP (Gate 0)

Every portfolio-ish system already on `origin/main`, what owns it, and what this build is
allowed to do to it.

| System | Entry points | Keyed on | Verdict |
|---|---|---|---|
| **Runtime artifacts** — auto-generated employer-facing artifacts on evidence-activity completion | `models/PortfolioArtifact.ts` (`runtime_portfolio_artifacts`), `services/runtime/portfolioService.ts` (`generateArtifact`, `listArtifacts`) | `enrollment_id`, `card_id` | **CONSUME AS-IS.** Primary evidence source for the Studio's Builds section. No schema change. Auto-generation stays exactly as it is (plan §2.2). |
| **Project portfolio generator** — categorised weekly artifacts, README, executive summary, readiness | `services/portfolioGenerationService.ts` (`generatePortfolio` → `PortfolioResult`), `portfolioEnhancementService.ts` | `Project` | **READ-ONLY REUSE.** 10 consumers depend on `PortfolioResult`'s shape; it is frozen. The Studio reads it as one input among many, and never becomes tied to a single Project (plan §2.3). |
| **Public share** — opt-in opaque token per project | `services/portfolioShareService.ts`, `routes/publicPortfolioRoutes.ts`, `Project.share_token` / `share_enabled`, `frontend/src/pages/PublicPortfolioPage.tsx`, `App.tsx:50` | `Project.share_token` | **DO NOT TOUCH.** Legacy links must keep working. This increment publishes nothing, so there is no migration and no regression surface (plan §2.4, §55). |
| **CAPE skill graph** — append-only evidence ledger + recomputed proficiency | `models/StudentSkillEvidence.ts`, `StudentArchitectureSkill.ts`, `ResumeSkillClaim.ts`, `services/cape/capeProficiencyService.ts`, `routes/capePortalRoutes.ts` | `enrollment_id` + `skill_id` | **CONSUME AS-IS.** This *is* the Career Evidence Graph. Building a second one would violate plan §8 ("no duplicate XP or duplicate raw evidence"). |
| **Resume / profile** | `models/OnboardingProfile.ts`, `services/portalSettingsService.ts`, `POST/GET/DELETE /api/portal/settings/resume` | `enrollment_id` | **CONSUME AS-IS.** Single source of truth for resume bytes, LinkedIn URL, parsed claims (plan §2.1, §12). |
| **Paywall** | `middlewares/requireContentEntitlement.ts`, `services/access/contentEntitlement.ts`, `components/paywall/PageGate.tsx`, `gatedFeatures.tsx` | `enrollment_id` | **EXTEND, DO NOT FORK.** Add a `portfolio` feature key to the existing union in both layers. No second subscription check (plan §2.5). |
| **GitHub** | `models/GitHubConnection.ts`, `StudentGithubActivity.ts` | `enrollment_id`, `project_id` | **READ-ONLY REUSE** for repo display. Multi-account/deep analysis deferred (plan §72). |

## The one rule this map exists to enforce

> The Career Studio is a **read-only projection over existing truth**, not a new store.

This increment adds **zero tables, zero columns, zero migrations**. Every number the Studio
shows is recomputed on read from a source that already owns it. That is what makes the
"do not duplicate resume/profile into a second truth store" stop condition (plan §71)
true by construction rather than by discipline.
