#!/usr/bin/env bash
#
# L8.1 — the executable rollback for the project-lifecycle release.
#
# L8.1's success metric is that "the rollback is a command someone can run, not a paragraph", and
# that it "must never silently restore an ungoverned creation path". This is that command.
#
#   RUN IT ON THE PRODUCTION HOST, from the stack directory. It cannot be exercised anywhere else:
#   it checks out a commit and calls scripts/deploy-prod.sh, which takes the per-box deploy lock.
#
#   ./scripts/rollback-lifecycle-release.sh --to <sha>            # rehearse, changes nothing
#   ./scripts/rollback-lifecycle-release.sh --to <sha> --apply    # do it
#
# ─────────────────────────────────────────────────────────────────────────────────────────────
# WHY THIS SCRIPT EXISTS AND A COPIED COMMAND DOES NOT
#
# THE RECORDED ROLLBACK PROCEDURE NO LONGER WORKS. `deployment-log.md` documents it as:
#
#     SKIP_PULL=1 ALLOW_DETACHED_HEAD=1 ./scripts/deploy-prod.sh backend nginx
#
# which was correct when `DEPLOY_MODE` defaulted to `build`. It was flipped to `registry` on
# 2026-10-18 (deploy-prod.sh:120). In registry mode the script runs this guard, unconditionally:
#
#     D_MOVING=$(docker manifest inspect "${IMAGE}:main"           | sha256sum)
#     D_PINNED=$(docker manifest inspect "${IMAGE}:sha-${HEAD_SHA}" | sha256sum)
#     if [ "$D_MOVING" != "$D_PINNED" ]; then
#       fail "${IMAGE}:main does not match sha-${HEAD_SHA}. Pulling :main would deploy a
#             different commit."
#     fi
#
# On a rollback `HEAD_SHA` is the OLD commit while `:main` points at the NEW one, so the digests
# differ BY DEFINITION and the deploy is refused. The guard is right -- docker-compose.production
# .yml names `image: ghcr.io/colaberryintern/accelerator-backend:main`, a MOVING tag, so a pull in
# registry mode would fetch the very release being rolled back. But it means the documented
# rollback stalls on a confusing message at the exact moment nobody wants to debug a deploy script.
#
# So this script passes DEPLOY_MODE=build, and says why in its own output.
#
# ─────────────────────────────────────────────────────────────────────────────────────────────
# WHAT IT REFUSES TO DO
#
#   - roll back to a commit that is not an ancestor of origin/main (that is not a rollback)
#   - roll back to the commit already running (a no-op that would read as success)
#   - run outside the stack directory, or with a dirty tree
#   - touch ENABLE_PROJECT_LIFECYCLE. Rolling back CODE and deactivating a FEATURE are two
#     different decisions, and conflating them is how a rollback quietly restores an ungoverned
#     creation path. The flag is printed, never changed. See the note at the end of the output.
#
set -uo pipefail

STACK_DIR="${STACK_DIR:-/opt/colaberry-accelerator}"
SERVICES="${SERVICES:-backend nginx}"
TARGET=""
APPLY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --to)    TARGET="${2:-}"; shift 2 ;;
    --apply) APPLY=1; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

say()  { printf '[rollback] %s\n' "$*"; }
fail() { printf '[rollback] REFUSING: %s\n' "$*" >&2; exit 2; }

[ -n "$TARGET" ] || fail "pass --to <sha>. There is no default: a rollback target is a decision."
# `git rev-parse --git-dir`, not `[ -d .git ]`: in a worktree `.git` is a FILE pointing at the real
# gitdir, so the directory test refused to run in the only place the guards below could be
# exercised before shipping. Asking git is both correct on the production clone and testable.
git -C "$STACK_DIR" rev-parse --git-dir >/dev/null 2>&1 \
  || fail "$STACK_DIR is not a git checkout. This script runs on the production host."
cd "$STACK_DIR" || fail "cannot enter $STACK_DIR"

# TRACKED modifications only, deliberately. `deploy-prod.sh` runs its own, stricter dirty check
# with a `DIRTY_ALLOW` escape hatch for paths production legitimately differs on, and that one is
# authoritative. Duplicating it here with a different definition would mean two answers to the
# same question; what this check is for is refusing to `git checkout` over someone's edits.
if ! git diff --quiet HEAD 2>/dev/null; then
  fail "tracked files are modified, and checking out the rollback target would discard them:
$(git diff --name-only HEAD | head -5)"
fi

git fetch origin --quiet || fail "could not fetch origin"

FULL="$(git rev-parse --verify "${TARGET}^{commit}" 2>/dev/null)" \
  || fail "$TARGET is not a commit in this repository"
CURRENT="$(git rev-parse HEAD)"

[ "$FULL" != "$CURRENT" ] \
  || fail "HEAD is already $FULL. Rolling back to the running commit is a no-op that would report success."

git merge-base --is-ancestor "$FULL" origin/main \
  || fail "$FULL is not an ancestor of origin/main. That is not a rollback -- it is a deploy of
           something unreviewed, which is the thing this script exists to prevent."

BEHIND="$(git rev-list --count "${FULL}..origin/main")"
say "stack      : $STACK_DIR"
say "services   : $SERVICES"
say "running    : $CURRENT"
say "rolling to : $FULL  ($BEHIND commit(s) behind origin/main)"
say "subject    : $(git log -1 --format=%s "$FULL")"
say ""
say "DEPLOY_MODE=build is forced. In registry mode the ':main' tag points at the release being"
say "rolled back, and deploy-prod.sh correctly refuses the mismatch -- see the header of this file."

FLAG="$(grep -E '^ENABLE_PROJECT_LIFECYCLE=' .env 2>/dev/null || echo '(not in .env)')"
say "feature flag, UNCHANGED by this script: $FLAG"

if [ "$APPLY" -ne 1 ]; then
  say ""
  say "REHEARSAL ONLY. Nothing was checked out and nothing was deployed."
  say "Next, in order:"
  say "  git checkout $FULL"
  say "  SKIP_PULL=1 ALLOW_DETACHED_HEAD=1 DEPLOY_MODE=build DRY_RUN=1 ./scripts/deploy-prod.sh $SERVICES"
  say "  SKIP_PULL=1 ALLOW_DETACHED_HEAD=1 DEPLOY_MODE=build           ./scripts/deploy-prod.sh $SERVICES"
  say "Or re-run this with --apply to do all three."
  exit 0
fi

say ""
say "APPLYING."
git checkout "$FULL" || fail "checkout failed"

# DRY_RUN first, every time. The guards are the part most likely to bite, and finding that out
# before the build is the whole reason deploy-prod.sh has the flag.
say "step 1/2: rehearsing deploy-prod.sh guards (DRY_RUN=1)"
SKIP_PULL=1 ALLOW_DETACHED_HEAD=1 DEPLOY_MODE=build DRY_RUN=1 \
  ./scripts/deploy-prod.sh $SERVICES || fail "the DRY_RUN rehearsal failed. NOT building."

say "step 2/2: deploying $FULL"
SKIP_PULL=1 ALLOW_DETACHED_HEAD=1 DEPLOY_MODE=build \
  ./scripts/deploy-prod.sh $SERVICES || fail "the deploy failed. The checkout is still at $FULL."

say ""
say "ROLLED BACK to $FULL."
say "NOW DO THESE TWO THINGS, because neither is automatic:"
say "  1. Re-run the lifecycle schema verification. The Phase 5 tables are ADDITIVE and a"
say "     rollback does not drop them, so every object should still be present. If one is"
say "     missing, the rollback removed something it should not have."
say "  2. Decide the FLAG separately. This script did not touch ENABLE_PROJECT_LIFECYCLE."
say "     Rolling back code with the flag left on can leave routes enforcing against code that"
say "     no longer matches them; turning it off is a second, deliberate decision."
