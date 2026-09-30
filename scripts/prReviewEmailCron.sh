#!/bin/bash
# prReviewEmailCron.sh — VPS "email half" of the PR-review autopilot (split topology).
#
# The Anthropic cloud routine does the multi-agent review and commits the result
# (verdicts.json + PR_REVIEW.html + state) to the `bot/pr-reviews` branch. This
# script — a plain node+Mandrill cron, the same shape as every other job in the
# crontab — pulls Mandrill creds from the running backend container, syncs that
# branch into an isolated clone, and emails any not-yet-sent digest to Ali.
#
# Idempotent: sendPrReviewDigest.js dedups on (pr#, head-SHA, recommendation), so
# re-running every 3h re-sends nothing until the cloud routine publishes a new review.
# It never touches the deploy checkout and needs no Claude/gh on the VPS.
#
# Install: copy to /opt/colaberry-accelerator/scripts/ (tracked source of truth),
# then add to crontab (offset 40 min after the cloud review so the artifact is fresh):
#   40 */3 * * * /opt/colaberry-accelerator/scripts/prReviewEmailCron.sh >> /var/log/pr-review-email.log 2>&1
set -e

DEPLOY=/opt/colaberry-accelerator
CLONE=/opt/pr-review-bot
STATE_DIR=/opt/pr-review-bot-state
REMOTE=https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator.git
BRANCH=bot/pr-reviews
LATEST="$CLONE/docs/pr-reviews/latest"

stamp() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

# 1. Pull Mandrill creds from the running backend container (same seam as cron-env-wrapper.sh).
cd "$DEPLOY"
ENV_VARS=$(docker compose -f docker-compose.production.yml exec -T backend env 2>/dev/null | \
  grep -E "^(MANDRILL_API_KEY|MANDRILL_USERNAME)=" | sed "s/^/export /")
eval "$ENV_VARS"
if [ -z "$MANDRILL_API_KEY" ]; then
  echo "[$(stamp)] [pr-review-email] MANDRILL_API_KEY not available from container; aborting" >&2
  exit 1
fi

# 2. Sync the bot branch into a dedicated clone (isolated from the deploy checkout).
mkdir -p "$STATE_DIR"
if [ ! -d "$CLONE/.git" ]; then
  git clone --branch "$BRANCH" --single-branch "$REMOTE" "$CLONE" || {
    echo "[$(stamp)] [pr-review-email] branch $BRANCH not published yet; nothing to do"; exit 0; }
fi
cd "$CLONE"
git fetch origin "$BRANCH" --quiet
git reset --hard "origin/$BRANCH" --quiet

# 3. Email any new digest. State comes from the branch; send-log lives OUTSIDE the
#    clone so `git reset --hard` can never lose the dedup record.
if [ ! -f "$LATEST/verdicts.json" ]; then
  echo "[$(stamp)] [pr-review-email] no verdicts artifact at $LATEST; nothing to send"
  exit 0
fi
export PR_REVIEW_STATE="$CLONE/.claude/pr-review-state.json"
export PR_DIGEST_SENT_LOG="$STATE_DIR/digests-sent.json"

# Run the sender from the DEPLOY checkout (it has node_modules; the fresh clone does not).
node "$DEPLOY/scripts/sendPrReviewDigest.js" "$LATEST/verdicts.json" "$LATEST/PR_REVIEW.html"
echo "[$(stamp)] [pr-review-email] done"
