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
If the Action opens a conflict PR, **Kes resolves it** — staging is Kes's domain (unprotected,
write access), and Kes knows what feature branches are in flight. Ali only needs to weigh in if
the conflict involves a production-critical change that requires his judgment on which version wins.
Resolve the conflict PR before cutting any new feature branches.
The manual fallback is the documented path if the Action is unavailable.

## Why Kes cannot merge to `main`

`main` branch protection requires **1 approving review**, and GitHub does not let an
author approve their own PR. So a PR targeting `main` needs **Ali's** approval before
it can merge. `require_last_push_approval` is on, so any new commit re-requires
approval. `staging` is intentionally unprotected so Kes can merge into it freely.

> Note: this repo is owned by a personal account, not a GitHub Organization, so the
> hard "restrict who can push to `main`" control is not available. The review gate
> above is the enforcement: Ali is the approver, therefore Ali is the gate.

## PROGRESS.md conflicts (RESOLVED 2026-08-23 — kept for branches cut before the cutover)

> **This class of conflict is fixed.** Sessions no longer share an append region: each
> writes its own `docs/sessions/CC-<YYYYMMDD>-<id>.md`, and `PROGRESS.md` is a sealed
> archive nothing appends to. See "The structural fix, taken 2026-08-23" at the end of
> this section. The diagnosis below is retained because long-lived branches cut before
> the cutover still carry `PROGRESS.md` edits and can still hit it.

`CLAUDE.md` used to make a PROGRESS.md entry a hard gate on every change, so nearly every
PR touched the same append region of the same file. With several Claude sessions open at
once those regions collided constantly.

`.gitattributes` sets `PROGRESS.md merge=union` to deal with that. **It only works
locally.** Git runs merge drivers on your machine; GitHub does not run them
server-side. GitHub decides mergeability with a plain three-way merge, so a PR whose
PROGRESS.md region also moved on `main` is reported `CONFLICTING` in the UI even
though `git merge` resolves it cleanly in a worktree.

This is not a theoretical gap. It is the single most common reason a PR in this repo
is un-mergeable, and it is invisible from the command line.

### How to tell this is what you are looking at

- `gh pr view <n> --json mergeable` returns `CONFLICTING`.
- **The PR reports no checks at all.** GitHub does not run checks on a PR it cannot
  merge, and "no checks" renders almost identically to "checks still pending". Do not
  read one as the other.
- Merging the branch locally succeeds with no conflict.

### How to clear it

Merge `main` **into** the branch locally and push:

```bash
git checkout <branch>
git merge origin/main --no-edit    # the union driver resolves PROGRESS.md
git push origin <branch>
```

This makes `main`'s tip an ancestor of the branch, which leaves GitHub's three-way
merge nothing to do on main's side, and the PR flips to `MERGEABLE`.

### The cost, and why it matters

Branch protection on `main` sets both `dismiss_stale_reviews` and
`require_last_push_approval`. **That push permanently destroys any approval the PR
already had**, and force-pushing back to the previously approved SHA does not restore
it. Only a human re-approval does.

So for an already-approved PR the situation is a genuine deadlock: it cannot merge
while `CONFLICTING`, and the only way to clear the conflict costs the approval that
made it mergeable. In August 2026 this stranded thirteen individually approved PRs at
once; the resolution was to compose all thirteen onto one integration branch and take
a single new approval, rather than pay the approval cost thirteen times.

### Practical guidance

- **Do not sit on an approval.** The window between approval and merge is exactly when
  a PROGRESS-touching PR on `main` can strand yours. Merge promptly after approval.
- **Merge `main` in before requesting review**, not after. Pay the conflict cost while
  the PR is still unapproved and the push is free.
- If several approved PRs are already stranded, compose them onto one integration
  branch and request one approval. Do not re-push the individual branches.

### The structural fix, taken 2026-08-23

The cure proposed here — stop routing every session's progress log through one shared
append region — was approved by the DRI and shipped.

- **Live log:** `docs/sessions/CC-<YYYYMMDD>-<id>.md`, one file per session. Two sessions
  cannot collide on a file only one of them ever opens, so concurrent-instance safety is
  now structural rather than honour-system.
- **`PROGRESS.md`:** frozen in place as a sealed archive with a header stating the
  cutover. Deliberately NOT split into per-session files — that would have been a ~5 MB
  single-commit rewrite repointing every archive `git blame` at the migration commit, for
  no operational gain, since the problem was only ever about future writes.
- **Also changed in the same commit:** `CLAUDE.md`'s hard gate and session protocol,
  `scripts/generateSessionChangelog.js` (reads the per-session file; now exits 1 rather
  than rendering an empty report), `.claude/hooks/session-end-progress-audit.sh` (counts
  real entries instead of passing vacuously), `scripts/prAutoMerge.js` (marker guard
  widened to `docs/sessions/`), and `.claude/workflows/pr-approval-review.js` (accepts a
  session log instead of flagging every PR).

`PROGRESS.md merge=union` is retained in `.gitattributes` only until branches predating
the cutover drain.
