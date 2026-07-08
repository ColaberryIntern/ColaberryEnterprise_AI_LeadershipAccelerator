# Project Workspace — right-side drawer + delivery modes + per-student repo

Branch: `feat/project-workspace` (off `workstream/onboarding-experience`).

Gives the **Projects** page the same kind of "workspace" the advisor app has, as a
right-side slide-over (the labs `Drawer` pattern) instead of an inline expansion —
plus the delivery-mode parameters (UI/UX, Visual, …) and a platform-provisioned
GitHub repo per student. The projects portal stays portal-native (localStorage,
"acts like Basecamp but not wired to it"); only the repo piece talks to the backend.

## What changed

### Part A — the workspace drawer (frontend, self-contained)
- **`frontend/src/services/deliveryModes.ts`** *(new)* — the 8 delivery modes ported
  from the advisor personas (Co-pilot, Just the answer, Visual-first, Explain it to
  me, Checklist doer, Plain & friendly, Social Media, UI/UX Designer). Pure data +
  the selected mode saved to `localStorage` (`te_delivery_mode_v1`).
- **`frontend/src/pages/portal/projects/projectWorkspacePrompt.ts`** *(new)* —
  assembles the Claude Code prompt: base build guidance + build context + acceptance
  + the task's vibe-code prompt + the selected delivery-mode block + a pointer to the
  student's repo + their typed context.
- **`frontend/src/pages/portal/projects/ProjectWorkspaceDrawer.tsx`** *(new)* — the
  workspace, in the shared `Drawer`. Delivery-mode selector, build context, your-
  context box, the repo section, and a **truncated + scrollable** prompt preview
  (`max-height:200px; overflow:auto`) — never the whole prompt at once.
- **`ProjectInterior.tsx`** *(modified)* — clicking a task (or "Open workspace") now
  opens the drawer; the old inline `pjt-detail` expansion and its `CopyBtn` are gone.
- **`projects.css`** *(modified)* — `.pw-*` styles, scoped under `.pj-root`.

### Part B — per-student workspace repo (backend + frontend)
Model (locked with product owner): **platform-provisioned** — one private repo per
student under **ColaberryIntern**, student added as a push collaborator; the student
**commits locally and the portal syncs** (pulls) their repo.

- **`backend/src/services/studentWorkspaceService.ts`** *(new)* —
  `provisionWorkspaceRepo(enrollmentId, githubLogin)` (create repo in org + add
  collaborator, idempotent), `syncWorkspaceRepo(enrollmentId)` (pull tree + recent
  commits into the existing `GitHubConnection`), `getWorkspaceRepo(enrollmentId)`.
  Reuses `GitHubConnection` (one row per enrollment). **The platform token lives only
  in env — never written to the DB.**
- **`backend/src/routes/workspaceRoutes.ts`** *(new)* — `GET /api/portal/workspace/repo`,
  `POST /api/portal/workspace/repo/provision`, `POST /api/portal/workspace/repo/sync`
  (all `requireParticipant`). Mounted in `participantRoutes.ts`.
- **`backend/src/services/__tests__/studentWorkspaceService.test.ts`** *(new)* — unit
  tests (models + `fetch` mocked): provision happy-path, idempotent 422, name reuse,
  missing-token/login guards, sync, not-connected.
- **`frontend/src/services/workspaceRepoApi.ts`** *(new)* — axios client
  (`participant_token`), and the drawer's "Your workspace repo" section: enter GitHub
  username → provision; then repo link + **Commit & sync**. Fails soft with no backend.

## Required env for Part B (server-side)
```
GITHUB_TOKEN          platform PAT/App token with repo-create + collaborator rights
                      in the org (already used by agentGitHubService)
GITHUB_WORKSPACE_ORG  org for student repos (default: ColaberryIntern)
GITHUB_API_URL        default https://api.github.com
```

## Verification status
- **Part A + Part B frontend:** `tsc --noEmit` clean (0 errors in all new/changed
  frontend files; React + axios resolve).
- **Part B backend:** written against the exact existing route/service patterns; every
  `GitHubConnection` / `Enrollment` field used is confirmed on the models. **Not**
  typechecked/tested/run in this environment (backend `node_modules` was absent and
  there is no DB or `GITHUB_TOKEN` here). Before merge, run in the backend:
  `npm install && npx tsc --noEmit && npm test -- studentWorkspaceService`, then verify
  live provisioning against a real `GITHUB_TOKEN` (it creates a real repo + invite).

## Manual test plan
1. Frontend: open a build → click a task → drawer slides in from the right. Switch
   delivery modes; the prompt preview updates and the choice persists. Prompt box
   scrolls; Copy prompt works.
2. Repo: enter a GitHub username → "Create my repo" → repo appears (a private
   `…-workspace-…` under ColaberryIntern; you're invited). Commit + push locally →
   "Commit & sync" → file count / last-synced update.
