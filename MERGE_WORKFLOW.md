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

## Why Kes cannot merge to `main`

`main` branch protection requires **1 approving review**, and GitHub does not let an
author approve their own PR. So a PR targeting `main` needs **Ali's** approval before
it can merge. `require_last_push_approval` is on, so any new commit re-requires
approval. `staging` is intentionally unprotected so Kes can merge into it freely.

> Note: this repo is owned by a personal account, not a GitHub Organization, so the
> hard "restrict who can push to `main`" control is not available. The review gate
> above is the enforcement: Ali is the approver, therefore Ali is the gate.
