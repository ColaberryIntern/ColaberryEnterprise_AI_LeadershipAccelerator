# Claude Code Architecture Audit
**Repo:** Colaberry Enterprise AI Leadership Accelerator
**Audit date:** 2026-05-19
**Reference:** [How Claude Code Works in Large Codebases — Best Practices](https://claude.com/blog/how-claude-code-works-in-large-codebases-best-practices-and-where-to-start)
**Auditor:** Claude Opus 4.7
**Requested by:** Ram (relayed via Ali)

---

## Executive Summary

The repo has a **strong bespoke operating contract** in `CLAUDE.md` (849 lines) and a working **project-level skills directory** with 5 user-invokable design skills. We score well on operating philosophy, testing strategy, idempotency, and failure-first design — all things the article does not even cover at this depth.

We score **poorly on the foundational Claude Code primitives the article actually focuses on**: layered CLAUDE.md hierarchy, `.claudeignore`, project-level `.claude/settings.json`, hooks, plugins, LSP integration, and MCP exposure of internal systems. The bespoke layer is excellent. The Claude Code foundation underneath it is mostly missing.

### Score at a glance

| Theme | Score | Comment |
|---|---|---|
| CLAUDE.md presence and substance | 9 / 10 | Substantive but bloated |
| Layered CLAUDE.md (subdirectory files) | **0 / 10** | Zero subdirectory CLAUDE.md files; everything in root |
| Skills | 6 / 10 | 5 well-defined design skills; no operational/security/review skills |
| Hooks | **0 / 10** | None configured |
| Plugins | **0 / 10** | None; skills not packaged for distribution |
| LSP integration | 2 / 10 | TS LSP via VSCode only; not surfaced to Claude; JS files unscoped |
| MCP servers | 3 / 10 | Gmail/Calendar/Drive at runtime; no internal-system MCPs |
| Subagents | 3 / 10 | Used ad hoc; no codified pattern |
| `.claudeignore` / `.ignore` | **0 / 10** | Missing |
| Project-level `.claude/settings.json` | **0 / 10** | All settings live in user-level; not shared across team |
| DRI / agent manager | **0 / 10** | No named owner of Claude Code config |
| Permissions hygiene | 2 / 10 | User-level allowlist is bloated and contains JWTs |
| Operating philosophy / testing / observability | 9 / 10 | Strong, exceeds article |
| Documentation drift | 5 / 10 | CLAUDE.md references non-existent legacy dirs; current dirs unmapped |

**Overall: approximately 35 / 100 against the article's specific recommendations.** The remediation list at the bottom turns most of those zeros into eights in roughly a week of focused work, mostly without touching production code.

---

## Strong Areas (Already in Place)

These are things the article does not cover but the repo already does well, and they should be preserved:

1. **Operating contract.** CLAUDE.md's "Autonomy Model," "Confidence/Diagnostic Mode/Stall Detection," "Escalation Protocol," and "Build-Break-Harden Loop" sections are more sophisticated than anything in the Anthropic article. These define HOW Claude makes decisions, not just WHAT context it has.
2. **PROGRESS.md hard gate.** Forces a per-change audit trail tied to verification evidence. Not in the article, but a strong workflow rule.
3. **Failure-First Design + Idempotency rules.** Required-for-every-feature engineering hygiene that the article doesn't address.
4. **BuildManifest telemetry.** The portal-side `state_graph.json` / `database_map.json` / `ui_map.json` that auto-update from build telemetry is unique and well-designed.
5. **Modular composition rules.** Explicit file/function size targets with grandfathering of legacy files. Article does not address this.
6. **Test pyramid + risk-based prioritization.** Explicit unit/integration/E2E ratios with risk-weighted investment. Stronger than typical.
7. **Project skills exist** (`.claude/skills/baseline-ui`, `fixing-accessibility`, `fixing-motion-performance`, `frontend-design`, `ui-ux-design`) — properly defined with SKILL.md frontmatter and `user-invocable: true`.
8. **Per-language `tsconfig.json`** for `backend/` and `frontend/` — matches the article's "scope test/lint per subdirectory" recommendation, even if for the wrong reason.

---

## Gap-by-Gap Audit

### 1. CLAUDE.md is too long
**Article rule:** "root file for the big picture, subdirectory files for local conventions" · "Lean and focused: everything else drifts into noise"

**Current state:** 849 lines, single file. Five distinct policies are stuffed in that should live elsewhere:

| Section | Current location | Belongs in |
|---|---|---|
| Telemetry Synchronization Contract (~70 lines) | CLAUDE.md | Standalone doc + a `telemetry-emission` skill |
| Required Review Screenshot Protocol (~60 lines) | CLAUDE.md | `screenshot-review` skill |
| Screenshot Verification Safety Protocol (~35 lines) | CLAUDE.md | `screenshot-review` skill (combined with above) |
| UI/UX Design Policy (~50 lines) | CLAUDE.md | Already duplicated by 5 skills — REMOVE from CLAUDE.md |
| Outreach Byline Policy (~25 lines) | CLAUDE.md | `openclaw-outreach` skill |

**Why this matters:** the article explicitly calls out the "load everything into CLAUDE.md instead [of skills]" pattern as the #1 confusion. Every session loads the full CLAUDE.md upfront. Sections that only apply to specific workflows waste context on every other workflow.

**Fix:** Extract those 5 sections into skills under `.claude/skills/`, leave a one-line reference in CLAUDE.md pointing to each. Should drop CLAUDE.md from ~849 lines to ~550.

### 2. Zero subdirectory CLAUDE.md files
**Article rule:** "Layered architecture: Claude loads CLAUDE.md files additively as it traverses directories" · "the root file describes only the highest-level structure, and subdirectory CLAUDE.md files provide the next level of detail"

**Current state:** Only `./CLAUDE.md` exists. No `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `directives/CLAUDE.md`, `scripts/CLAUDE.md`, `system/CLAUDE.md`, `tests/CLAUDE.md`.

**Why this matters:** Working on a frontend component shouldn't require loading the full backend operating contract. Working on `scripts/` shouldn't require the React design system. Each subdirectory has distinct conventions that today have to be inferred or repeated.

**Fix:** Add 6 subdirectory CLAUDE.md files. Each should be ≤60 lines, naming local conventions only (not duplicating root-level rules). Concrete suggestions:

- `backend/CLAUDE.md` — Sequelize patterns, Zod validation expectations, route file structure, where models go, error-class naming conventions
- `frontend/CLAUDE.md` — page/component/route file boundaries, link to design skills, Bootstrap-not-custom-CSS rule
- `backend/src/scripts/CLAUDE.md` — one-shot script naming (`sendXxx.js`, `basecampXxx.js`), Mandrill SMTP pattern reference, signature/em-dash rule pointer
- `directives/CLAUDE.md` — directive structure, required sections, "no business logic in directives" enforcement
- `system/CLAUDE.md` — portal-owned maps, do-not-edit warning, BuildManifest emission reference
- `tests/CLAUDE.md` — Playwright patterns, where new test files go, naming conventions

### 3. No `.claudeignore`
**Article rule:** "Use .ignore files to exclude generated files, build artifacts, and third-party code"

**Current state:** `.gitignore` covers `node_modules/`, `dist/`, `build/`, `coverage/`, `.env`, but Claude Code may still scan large auto-generated artifacts during searches. Specific noise sources observed:

- `system/intelligence/state_graph.json` (auto-generated, can be large)
- `system/database/database_map.json` (auto-generated)
- `system/ui/ui_map.json` (auto-generated)
- `docs/screenshots/**/*.png` (binary, large, never useful to Claude as text)
- `tmp/suralink/` (60+ MB of extracted tax docs)
- `tmp/suralink-zips/`, `tmp/suralink-profile/` (Chromium profile data)
- `backend/src/scripts/*.output` (background-task output files)

**Why this matters:** every Glob/Grep wastes time and tokens on these. LSP recommendations in the article specifically call out preventing "wasteful file opening" — `.claudeignore` is the deterministic version.

**Fix:** Add a `.claudeignore` at repo root listing the above.

### 4. No project-level `.claude/settings.json`
**Article rule:** "Commit permissions.deny rules in .claude/settings.json so every developer on the team gets the same noise reduction"

**Current state:** All settings live in user-level `~/.claude/settings.json`. The user-level file has 50+ permission allow rules, several of which include verbatim JWT tokens and one-off bash invocations from past sessions (security concern — see #11 below). No project-level settings.json means every dev (Ali, Tejesh, Ram, future hires) configures their own from scratch.

**Why this matters:** the article frames this as the highest-leverage shared-config investment after CLAUDE.md.

**Fix:** Create `.claude/settings.json` at repo root with team-wide defaults:
- `permissions.deny`: anything destructive (`git push --force`, `rm -rf`, `DROP TABLE`)
- `permissions.allow`: the safe defaults that apply across the team (curl, ssh to prod with limited paths, npm install, docker exec read-only)
- Project-wide hook config (see #5)
- Project-wide skill discovery
- Commit it. Use `.claude/settings.local.json` for per-developer overrides (already supported by Claude Code, gitignored).

### 5. No hooks configured
**Article rule:** "Most valuable use is continuous improvement" · "Stop hooks can propose CLAUDE.md updates while the context is fresh" · "Start hooks can load team-specific context dynamically" · "Hooks for automated checks like linting and formatting"

**Current state:** Zero hooks. PROGRESS.md compliance is enforced by Claude reading the rule each session and (sometimes) following it — not by a hook that blocks/reminds. Em-dash and signature rules are enforced by me grepping before each Mandrill send — not by a hook.

**Fix priorities (in order of leverage):**
- **PostToolUse hook on Edit/Write** that runs em-dash check on any file path matching `backend/src/scripts/send*.js`. Currently I forget this; a hook makes it deterministic.
- **Stop hook** that runs the "session-end PROGRESS.md audit" CLAUDE.md mandates. Currently this is supposed to happen but is unenforced — multiple recent sessions ended without it.
- **PreToolUse hook on Bash** to block destructive patterns (`rm -rf`, `git push --force`, `DROP`, `TRUNCATE`) regardless of permission rules.
- **SessionStart hook** to dynamically inject "what's recent in PROGRESS.md" so I don't have to read 1000+ lines of PROGRESS.md to know what shipped this week.

### 6. No plugins
**Article rule:** "Plugins bundle skills, hooks, and MCP configurations into a single installable package" · "Prevent tribal knowledge: distribute working setups across the org"

**Current state:** 5 design skills exist but only on Ali's machine. Tejesh, Ram, and any new dev don't have them. No plugin packaging.

**Fix:** Once #4 (project settings) and #5 (hooks) exist, package them as a single Colaberry plugin so installing it on a fresh dev machine gives everyone the same setup. Article describes this as the single highest-leverage anti-fragmentation move.

### 7. No LSP integration surfaced to Claude
**Article rule:** "LSP gives Claude symbol-level precision" · "For multi-language codebases, this is one of the highest-value investments"

**Current state:** TypeScript LSP works in VSCode for the developer but Claude doesn't use it. Repo is multi-language (TypeScript backend + TypeScript frontend + JavaScript scripts + Python scripts in `execution/` per old references + JSON state maps). Today, Claude searches by text grep, which is what the article specifically warns against.

**Why this matters:** when refactoring (e.g., renaming `findOrCreateVisitor`), today I'd grep for the string. With LSP, Claude would see only true call sites of that exact symbol, not every comment, log message, or string literal that contains those words.

**Fix:** install a Claude Code LSP plugin pointing at the workspace's TypeScript server. Lower priority than #1-#5 because the repo is well-typed, but a clear future win once team size grows.

### 8. MCP exposes consumer apps, not internal systems
**Article rule:** "The most sophisticated teams built MCP servers exposing structured search as a tool Claude can call directly" · "MCP servers connect Claude to internal documentation, ticketing systems, or analytics platforms"

**Current state:**
- ✓ Gmail MCP (used for the Coca-Cola / Olasiji / Tejesh emails)
- ✓ Google Calendar MCP (deferred, surfaced when needed)
- ✓ Google Drive MCP (deferred)
- ✗ No MCP for the central portal API (every project state query goes through `curl https://enterprise.colaberry.ai/api/...`)
- ✗ No MCP for Basecamp (every Basecamp interaction is a custom script that fetches the rotating token)
- ✗ No MCP for CCPP SQL Server (every Colaberry school query goes through SSH + docker exec)
- ✗ No MCP for the Postgres `visitors`/`leads`/`visitor_sessions` tables (the lead pipeline and tracker work would have been faster with a direct query MCP)

**Fix:** Three high-value MCP servers, in order:
1. **Portal API MCP** — exposes the half-dozen `/api/portal/project/*` endpoints CLAUDE.md already documents. Saves curl plumbing on every state-check.
2. **Postgres analytics MCP** — read-only access to `visitor_sessions`, `visitors`, `page_events`, `campaign_leads`, `leads` for the kind of audit work that just took 2 hours during the tracker rollout.
3. **Basecamp MCP** — token rotation + list/create todos. Eliminates the 6 ad-hoc Basecamp scripts in `backend/src/scripts/`.

### 9. Subagents used ad hoc, not codified
**Article rule:** "Spin up a read-only subagent to map a subsystem and write findings to a file, then have the main agent edit with the full picture"

**Current state:** I do this sometimes (the Coca-Cola research deployed 3 parallel research agents successfully). It is not documented in CLAUDE.md as a default pattern. Most other work happens in-context.

**Fix:** Add a subagent usage section to CLAUDE.md (~15 lines) defining when to spin one up: (a) any research task expected to read >5 files, (b) any audit/review task, (c) any cross-codebase impact analysis. Otherwise the pattern stays tribal.

### 10. No DRI for Claude Code configuration
**Article rule:** "The minimum viable version is a DRI: one person with ownership over the Claude Code configuration" · with "authority to make calls on settings, permissions policy, the plugin marketplace, and CLAUDE.md conventions, and the responsibility to keep them current"

**Current state:** No one is named. CLAUDE.md is edited by whoever is in session that day. Skills haven't been touched since March. Permissions allowlist accreted ad hoc.

**Fix:** Name Ali as DRI explicitly (since he is the only person currently editing this config anyway). Add a 3-line "Claude Code Config Ownership" section to CLAUDE.md naming the DRI, the review cadence (every 6 months per the article), and the change-process (PR to `.claude/` or `CLAUDE.md` requires DRI approval).

### 11. Permissions allowlist contains JWTs (security concern)
**Article rule:** Implied by the general "code review parity" rule and standard security hygiene.

**Current state:** `~/.claude/settings.json` lines for `TOKEN="eyJ..."` contain at least two verbatim JWT tokens, one of which (`eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjMsImVtYWlsIjoiYWRtaW5Ab3Bwb3J0dW5pdHlwdWxzZS5jb20iLCJyb2xlIjoiYWRtaW4i...`) gives admin role to opportunitypulse.com. These got added when Claude needed to use them in a one-off curl and they were never cleaned up.

**Why this matters:** these tokens are stored in plaintext in a config file that probably gets backed up to OneDrive (the path is under `c:\Users\ali_m\OneDrive\...`). If any of them are still valid, that's an unintended credential exposure.

**Fix:** **Immediate:** rotate any of those tokens that are still valid, then strip them from `~/.claude/settings.json`. **Ongoing:** the permissions allowlist should never store secrets. Use `Bash(curl:*)` (broad permission) and let one-off tokens live in env vars or `.env` files, never in the allowlist.

### 12. Documentation drift in CLAUDE.md
**Current state:** CLAUDE.md line 87 says "The legacy top-level `/execution` and `/agents` folders referenced in earlier versions of this file do not exist in this repo." But `ls` shows `execution/`, `intelligence/`, and `system/` DO exist at the top level, and CLAUDE.md's "Folder Responsibilities" section doesn't mention them at all.

**Fix:** Update the Folder Responsibilities section to list every actual top-level directory: `backend`, `frontend`, `directives`, `docs`, `nginx`, `scripts`, `tests`, `tmp`, `execution`, `intelligence`, `system`, `preview-db-init`. Remove the contradictory "do not exist" line.

### 13. `.claude/.claude/` nested artifact
**Current state:** There's a `.claude/.claude/` subdirectory containing nothing useful (just a stale `scheduled_tasks.lock`). Probably created by an accidental command nesting.

**Fix:** Delete `.claude/.claude/` — it's noise.

### 14. No repo-root codebase map markdown
**Article rule:** "For non-conventional structures, use a lightweight markdown file at the repo root listing each top-level folder with a one-line description"

**Current state:** CLAUDE.md's "Folder Responsibilities" section covers some of this but mixes it with operational rules. Not a clean one-line-per-folder map.

**Fix:** Once #12 is done, the Folder Responsibilities table effectively becomes the codebase map. Alternatively split it out as `docs/CODEBASE_MAP.md` and have CLAUDE.md link to it.

### 15. No regular configuration review cadence
**Article rule:** "Expect to do a meaningful configuration review every three to six months"

**Current state:** CLAUDE.md was clearly written for an earlier model generation (mentions "guided through patterns it used to struggle with" indirectly, with rules like "5 silent assumptions per iteration" that may be over-tuned for current models).

**Fix:** Calendar a quarterly review. Specifically check: which CLAUDE.md rules are still earning their context cost vs. which were added to compensate for limitations that no longer exist. The article calls this out as the highest single source of configuration debt.

---

## Prioritized Remediation List

Ordered by leverage. The first 5 take ~2 days of work and close 70% of the gap.

| # | Action | Effort | Owner | Outcome |
|---|---|---|---|---|
| 1 | Create `.claudeignore` at repo root | 15 min | Ali (DRI) | Stops Glob/Grep noise from generated maps, screenshots, tmp/, output files |
| 2 | Create `.claude/settings.json` with team-wide permissions allow/deny | 1 hr | Ali | Every dev gets the same baseline, no more ad-hoc per-user allowlists |
| 3 | Rotate JWTs in `~/.claude/settings.json` allowlist, then strip them | 30 min | Ali | Closes a credential-exposure hole |
| 4 | Add 6 subdirectory CLAUDE.md files (≤60 lines each) | 4 hrs | Ali | Layered context loading, root CLAUDE.md shrinks |
| 5 | Extract 5 CLAUDE.md sections into skills (telemetry, screenshot, byline) | 3 hrs | Ali | Root CLAUDE.md drops from ~849 to ~550 lines |
| 6 | Fix CLAUDE.md documentation drift (real top-level dirs) | 30 min | Ali | Removes the contradiction in line 87 |
| 7 | Delete `.claude/.claude/` artifact | 30 sec | Ali | Cleanup |
| 8 | Name Ali as DRI in CLAUDE.md, schedule quarterly review | 15 min | Ali | Names the owner |
| 9 | Build first hook: PostToolUse em-dash check on send scripts | 1 hr | Ali | Stops the failure mode I keep hitting |
| 10 | Build second hook: Stop hook PROGRESS.md audit | 1 hr | Ali | Enforces the CLAUDE.md rule that gets skipped |
| 11 | Build Portal API MCP server | 4 hrs | Ali | Direct portal queries, no curl boilerplate |
| 12 | Build Postgres analytics MCP server (read-only) | 4 hrs | Ali | Direct visitor/lead/event queries |
| 13 | Package skills + hooks + settings as a Colaberry plugin | 2 hrs | Ali | Onboarding for any future dev (Tejesh, Ram) is one install |
| 14 | Install Claude Code LSP plugin pointing at TypeScript server | 1 hr | Ali | Refactor accuracy across the multi-language repo |
| 15 | Quarterly CLAUDE.md review (first one now, then every 90 days) | 2 hrs / quarter | Ali | Prevents instructions from outliving their usefulness |

**Total to close to ~85/100:** roughly 1 focused week of config work, zero production code changes.

---

## What I would NOT change

Several things in the current setup look like deviations from the article but are actually correct for this repo's scale:

- **PROGRESS.md hard gate** — article doesn't recommend this; it's a Colaberry-specific workflow rule and a good one. Keep.
- **BuildManifest contract** — bespoke and excellent. Keep.
- **Modular composition limits** — file/function size targets aren't in the article but they're sound. Keep.
- **Failure-First Design + Idempotency** — operational hygiene rules that exceed article scope. Keep.
- **Build-Break-Harden Loop** — execution discipline; keep.
- **Test pyramid** — explicit ratios; keep.

The bespoke layer is the strongest thing in this repo's Claude config. The audit's recommendation is to **add the foundational primitives the article describes**, not to replace the bespoke layer.

---

## Closing note for Ram

The headline number — 35/100 — looks bad but is misleading. The repo scores low on the foundational Claude Code primitives (skills, hooks, plugins, LSP, MCP, layered CLAUDE.md) but exceptionally high on the operating discipline that Anthropic's article doesn't even touch. Once items 1-5 of the remediation list land (about 2 days of work), the score jumps to roughly 70/100 with no production code changes and no risk. Items 6-15 take it to ~85/100 over a couple of weeks.

The biggest single risk uncovered by this audit is item #3: real JWT credentials sitting in plaintext in a OneDrive-synced config file. Fix that first regardless of the rest of the roadmap.
