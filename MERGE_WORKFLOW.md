# Merge Workflow (Kes + Ali)

How changes flow from a feature branch into production (`main`) for this repo
(`ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator`).

## Roles

- **Kes** (`KesetebirhanDelele`, Write access): builds features, merges his own PRs
  into `staging`, tests locally. Cannot merge to `main`.
- **Ali** (`ColaberryIntern`, Admin): the only person who merges to `main` (production).

## Branches

| Branch     | Purpose                          | Who merges in        |
|------------|----------------------------------|----------------------|
| `main`     | Production. Deployed to the VPS. | Ali only             |
| `staging`  | Integration / local test target. | Kes (and Ali)        |
| `workstream/*` | Feature branches.            | Author opens the PR  |

## Kes's loop

1. Branch off `staging` (or `main` if you need the latest production base):
   ```
   git checkout staging && git pull
   git checkout -b workstream/<short-name>
   ```
2. Build, commit, push:
   ```
   git push -u origin workstream/<short-name>
   ```
3. Open a PR **into `staging`** (not `main`):
   ```
   gh pr create --base staging --head workstream/<short-name>
   ```
4. Merge your PR into `staging`, then pull and test locally:
   ```
   gh pr merge --merge        # or use the GitHub UI
   git checkout staging && git pull
   ```
5. Verify the change works locally on `staging`.

## Promotion to production (Ali only)

When `staging` is verified, Ali opens and merges a PR `staging -> main`:
```
gh pr create --base main --head staging --title "Promote staging -> main"
# Ali reviews + approves, then merges
```

## Back-merge: syncing main → staging after every production merge

Every merge to `main` (hotfixes, direct commits, any promotion) must be reflected back into
`staging` so the integration base never drifts. **This is automated** via a GitHub Action
(`.github/workflows/sync-main-to-staging.yml`) that fires on every push to `main`.

### What the Action does

1. Detects how far behind `staging` is.
2. If staging already contains all of main → no-op (nothing to do).
3. If a clean fast-forward or no-conflict merge is possible → merges directly into `staging` and pushes.
4. If there are merge conflicts → opens a `sync/main-to-staging-*` PR for manual review.

### Manual fallback (if the Action fails or is disabled)

Run these four commands locally:

```bash
git checkout staging && git pull
git merge origin/main --no-edit
git push origin staging
git checkout -     # return to your feature branch
```

Then verify `git rev-list --count staging..origin/main` returns `0`.

### Rule

After Ali merges `staging → main`, the back-merge happens automatically via the Action.
If the Action opens a conflict PR, Ali or Kes resolves it before cutting any new feature branches.
The manual fallback is the documented path if the Action is unavailable.

## Why Kes cannot merge to `main`

`main` branch protection requires **1 approving review**, and GitHub does not let an
author approve their own PR. So a PR targeting `main` needs **Ali's** approval before
it can merge. `require_last_push_approval` is on, so any new commit re-requires
approval. `staging` is intentionally unprotected so Kes can merge into it freely.

> Note: this repo is owned by a personal account, not a GitHub Organization, so the
> hard "restrict who can push to `main`" control is not available. The review gate
> above is the enforcement: Ali is the approver, therefore Ali is the gate.
