# Career Portfolio — CURRENT_STATE (Gate 0)

**Session:** CC-20260823-p4k9
**Base SHA:** `dead58d6` (origin/main, 2026-08-23)
**Branch:** `workstream/career-portfolio`
**Worktree:** `C:/Users/ali_m/acc-portfolio-wt`
**Node/npm:** v22.16.0 / 10.9.2 · **backend tsc:** 5.9.3 (NOT the hoisted root 4.9.5)

> **Tree warning.** The OneDrive checkout at
> `OneDrive/.../Colaberry Enterprise AI Leadership Accelerator` is **2,743 commits behind
> `origin/main`** and contains none of the files this plan references. All Gate 0 findings and
> all implementation are against `origin/main` in the worktree above. Do not work in the
> OneDrive tree.

---

## The 20 Gate 0 questions, answered

### 1. What current route renders Portfolio?

**None in the portal.** There is no `/portal/portfolio` route. `frontend/src/routes/portalRoutes.tsx`
has no portfolio entry.

What does exist:

| Surface | Route | Component |
|---|---|---|
| Public share link | `/portfolio/share/:token` (`frontend/src/App.tsx:50`) | `pages/PublicPortfolioPage.tsx` |
| Portal nav item | — (no `to`) | `pages/portal/today/PortalShell.tsx:82`, `{ label: 'Portfolio', soon: true }` |

The nav item is a **dimmed, disabled placeholder**. `PortalShell.tsx:29` states Portfolio was
"deferred past the P0 launch fence". Activating it is the core of this build.

### 2. What exact paid-tier policy gates it?

Two layers, one shared resolver:

- **Frontend:** `components/paywall/PageGate.tsx` reads `useEntitlement()` →
  `{isStaff, hasFullAccess}` from the cached `/api/portal/onboarding/schedule` payload
  (`pages/portal/useEntitlement.ts`). Renders `PaywallScreen` with copy from
  `components/paywall/gatedFeatures.tsx`.
- **Backend (the real boundary):** `middlewares/requireContentEntitlement.ts` → 402
  `content_requires_paid`. Flag-gated on `CONTENT_PAGE_GATE_ENABLED`, **default OFF**, and
  **fails open** on any lookup error.
- **Shared resolver:** `services/access/contentEntitlement.ts` → `resolveContentPageAccess()`
  (enrollment `payment_status` + cohort type + staff + active comp).

Feature keys today: frontend `GatedFeatureKey = 'classroom' | 'projects' | 'cert-prep'`;
backend `GatedFeature = 'classroom' | 'projects'`. **Both need a `portfolio` member.**

### 3. What record proves a resume exists?

`OnboardingProfile` (`onboarding_profiles`, unique on `enrollment_id`):
`resume_file_name`, `resume_mime`, `resume_data` (base64 in-DB), `resume_uploaded_at`.
Projected to the client as `SettingsView.resume` — non-null means a resume exists.

### 4. Where is the resume parsed today?

`services/cape/capeResumeClaimExtraction.ts` + `capeResumeClaimService.persistResumeSkillClaims`
→ writes `ResumeSkillClaim` rows and bumps `OnboardingProfile.resume_version` /
`extractor_version`. Raw structured output also lands in `OnboardingProfile.extracted` /
`prefill`. **A resume parser already exists — do not build a second one.**

### 5. Where is LinkedIn URL stored?

`OnboardingProfile.linkedin_url` (surfaced as `SettingsView.profile.linkedin_url`).

### 6. Where is the avatar stored?

`Enrollment.avatar_data_url` (base64 data URL).

### 7. How many portfolio systems currently exist?

**Three, all pre-existing, none person-level:**

| # | System | Files | Scope |
|---|---|---|---|
| 1 | Runtime artifact auto-generation | `models/PortfolioArtifact.ts`, `services/runtime/portfolioService.ts` | `enrollment_id` |
| 2 | Project portfolio generator | `services/portfolioGenerationService.ts`, `portfolioEnhancementService.ts` | `Project` |
| 3 | Public share | `services/portfolioShareService.ts`, `routes/publicPortfolioRoutes.ts` | `Project.share_token` |

### 8. Which are project-level vs person-level?

(1) is **enrollment-level** — the closest thing to person-level that exists, and the richest
evidence source. (2) and (3) are strictly **project-level** (`Project.findOne({where:{enrollment_id}})`
— one project per enrollment assumed).

### 9. Which services depend on `portfolioGenerationService`'s output shape?

`PortfolioResult = { portfolio_structure, readme_content, executive_summary, file_hierarchy }`.
**10 consumers** — its shape is frozen for this build:

`routes/projectRoutes.ts`, `services/executiveDeliverableService.ts`,
`services/portfolioEnhancementService.ts`, `services/portfolioShareService.ts`,
`services/projectMentorService.ts`, `services/projectRequirementsContextService.ts`,
`services/projectWorkflowService.ts`, `scripts/setupStudentPlatformBacklog.js`,
plus 2 test files.

### 10. How are old public share links used?

`/portfolio/share/:token` → `GET /api/public/portfolio/:token` → `getPortfolioByShareToken` →
`generatePortfolio(project.enrollment_id)`. Unauthenticated; gated on `share_enabled`; returns a
generic 404 for both "no such token" and "sharing off". **Untouched by this build.**

### 11. Is there already a person-level public slug/profile?

**No.** No slug column, no `/talent` route, no person-level public identity anywhere.

### 12. How are architecture skills calculated?

**CAPE already is the Career Evidence Graph.** This is the single most important Gate 0 finding.

```
student_skill_evidence          (append-only ledger; insert-only findOrCreate;
  band ∈ claim|knowledge|         unique idempotency_key; NO update/delete path)
       application|judgment
  credit, source, source_ref
            │
            ▼  capeProficiencyService.recomputeStudentArchitectureSkill()
               (FULL REPLACE from 100% of ledger rows — never in-place increment)
            │
student_architecture_skill      (derived CACHE: placement/claim/knowledge/
                                 application/judgment/proficiency/confidence/
                                 evidence_count/last_evidence_at)
```

10 canonical skills (`constants/architectureSkills.ts`): `llm_core, prompting, rag, vectors,
agents_mcp, eval_guardrails, system_design, context_engineering, governance, deploy_ops`.

Already exposed at `GET /api/portal/cape/skill-profile` and
`GET /api/portal/cape/skill-profile/:skillId/evidence`.

**The plan's three evidence levels map onto CAPE bands directly:**

| Plan level | CAPE source |
|---|---|
| Resume Experience | band `claim` / `ResumeSkillClaim` |
| Colaberry Verified | bands `knowledge`, `application`, `judgment` |
| Delivery Verified | **no source exists yet** — see Q13 |

### 13. How will the Refactored Experience Ledger be consumed?

**It does not exist.** No `DeliveryProject`, `DeliveryDecision`, `ClientAcceptance`, or
Refactored ledger model is present on main. (`WorkLedgerEvent` / `EventLedger` are ops
constructs, not learner delivery evidence.)

**Decision:** model the `delivery_verified` level in the contract now, resolve it to an empty
source, and document the deferral. See `REFACTORED_INTEGRATION_MAP.md`.

### 14. What GitHub token/repo models exist?

- `GitHubConnection` (`github_connections`): `enrollment_id`, `project_id`, `repo_url`,
  `repo_owner`, `repo_name`, `access_token_encrypted`, `webhook_secret`, `status_json`,
  `file_tree_json`, `commit_summary_json`, `repo_language`, `file_count`, `last_sync_at`.
- `StudentGithubActivity` (`student_github_activity`): aggregate — `commits_last_7d`,
  `open_prs`, `total_stars`, `contribution_graph_json`, `raw_repos_json`.

### 15. Can one person connect multiple accounts/orgs?

**Not modeled.** `GitHubConnection` is one row per repo, scoped to `(enrollment_id, project_id)`.
There is no person-level account catalog and no multi-account concept. Multi-account is a
documented deferral (plan §72 permits it).

### 16. Can repo analysis inspect private repos safely?

Partially — `access_token_encrypted` exists per connection. But there is no analysis pipeline
that reads file *contents*; only cached tree/commit metadata. Private-repo content analysis is
out of scope for this increment.

### 17. Is there already repository intelligence?

**Shallow only:** `repo_language`, `file_count`, `file_tree_json`, `commit_summary_json`. No
technology inference, no architecture-pattern detection, no capability inference. This is the
one genuine gap where Kes's pipeline would add value (Gate 6, deferred).

### 18. Which Kes algorithms add unique value?

See `KES_REUSE_MAP.md`. Short answer: the **deep-analysis phase pipeline** and **multi-repo
selection UX**. Everything else is either already better here (auth, entitlement, skill
provenance, idempotency) or not needed yet (publishing, PDF, GitHub export).

### 19. What current paywall tests exist?

- `backend/src/__tests__/services/access/contentEntitlement.test.ts`
- `backend/src/middlewares/__tests__/requireContentEntitlement.test.ts`
- `backend/src/__tests__/services/portfolioShareService.test.ts`
- `backend/src/__tests__/services/portfolioGenerationService.test.ts`

Baseline results: `BASELINE_TEST_RESULTS.md`.

### 20. What data must never cross tenant/client boundaries?

Tenancy models present: `Tenant`, `Brand`, `BrandDomain`, `PlatformIdentity`,
`PlatformIdentityLink`, `TenantMembership`, `TenantAccessAudit`, `Organization`,
`LeadTenantContext`. Existing analysis in `docs/architecture/multi-tenancy/`.

For this build the boundary is simpler than the general case, because **nothing is published**:
every Career Studio read is scoped to `req.participant.sub` (the caller's own enrollment) and
there is no public projection. See `MULTITENANCY_PRIVACY_MAP.md`.

---

## Scope decision for this increment

The request was: **"Build out the Portfolio section and tab of the user experience."**

That is the authenticated surface — the nav tab, its access gates, and the private Career
Studio it opens. Delivered: **Gates 0, 1, 2, 3, 7 (deterministic), 8, and the readiness half
of 9.**

Explicitly **not** built here (each is its own gate, and none is required for the tab to be
real): repository deep intelligence (6), review workflow write-path (9b), versioned publication
(10), recruiter portfolio (11), PDF + GitHub export (12), talent network (13), employer
analytics (14), job-target mode (15).

Consequence, stated plainly: **this increment ships the private half of the product only.**
Nothing becomes public, no snapshot is minted, no student portfolio is published. That
satisfies plan §73's production boundary by construction.
