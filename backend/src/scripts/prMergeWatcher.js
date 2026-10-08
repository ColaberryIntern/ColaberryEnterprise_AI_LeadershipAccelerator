#!/usr/bin/env node
/**
 * Commercialization PR Merge Watcher (ticket C0.4).
 *
 * Polls this repository's pull requests and posts real state transitions back to the Basecamp
 * to-do that raised them, so a ticket's state and its PR's state stop drifting apart silently.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS DELIBERATELY CANNOT DO
 * ---------------------------------------------------------------------------------------
 * It never merges, closes, approves, labels, or comments on a pull request, and it never
 * writes to GitHub at all. Every GitHub call goes through ghGet() below, which hardcodes
 * method GET and is the only place api.github.com appears in this file. A test asserts that
 * property against the source text, because "I promise it only reads" is not a control.
 *
 * It never completes, closes, or reassigns a Basecamp to-do. Its entire write surface is one
 * comment on one to-do per observed transition. The repo does contain an auto-merge script under
 * scripts/; this file does not import it, shell out to it, or name it, and the test asserts that
 * its filename appears nowhere in this source. If you are tempted to reference it here, don't:
 * the tripwire is deliberately blunt so that a merge path cannot be introduced quietly.
 *
 * ---------------------------------------------------------------------------------------
 * HOW A PR OPTS IN  (and why it is opt-in rather than filtered)
 * ---------------------------------------------------------------------------------------
 * A PR is watched only if its body carries a Basecamp to-do link, on its own line:
 *
 *     Basecamp: https://app.basecamp.com/3945211/buckets/7463955/todos/10379236192
 *
 * The ticket requires that this never touches a PR outside its initiative. A filter on branch
 * names or labels would make that a rule I could get wrong; requiring an explicit link makes it
 * structural. A PR with no link is invisible to this watcher, which is the safe default and
 * needs no allow-list to maintain. The bucket and to-do ids are read from the link, so nothing
 * about which project or list is hardcoded here.
 *
 * ---------------------------------------------------------------------------------------
 * WHY POLLING, AND WHY NO CREDENTIALS
 * ---------------------------------------------------------------------------------------
 * Reads are unauthenticated. This repository is public, so GET /repos/{owner}/{repo}/pulls
 * needs no token, which means this job introduces no GitHub credential, no secret to rotate and
 * nothing to leak. One list call per tick against a 60/hour anonymous budget.
 *
 * It is not a GitHub Actions workflow. `.github/workflows/delivery-execution-runner.yml` states
 * the repository's position directly: workflows here are manual-dispatch only, carry no
 * production secrets, and "a workflow that fires on push would be" an unauthorized production
 * agent worker. That same file's preflight (line ~129) lists BASECAMP_TOKEN among the secrets a
 * workflow must not hold. A pull_request-triggered workflow posting to Basecamp would need
 * exactly that secret, and a static Actions secret cannot call refreshBcToken() against CCPP, so
 * it would 401 within a token cycle. The existing /api/webhook/github receiver is a per-student
 * multi-tenant path keyed on enrollment bindings; this repository has no such binding, and no
 * webhook is registered on it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT CAN AND CANNOT OBSERVE  (read this before trusting a ticket's state)
 * ---------------------------------------------------------------------------------------
 * It reports two transitions, because those are the two GitHub actually knows:
 *   pr_opened   first time we see the PR open with a ticket link
 *   pr_merged   merged_at became non-null
 * and pr_closed_unmerged, when a PR is closed without merging.
 *
 * It does NOT report "deployed" or "production-verified". Those are not fields on a pull
 * request, and this stack deploys over ssh with docker compose rather than through GitHub
 * Deployments, so there is no deployment event to read. Reporting them would mean inferring
 * them, and a ticket that says "deployed" because something merged is worse than a ticket that
 * says nothing. Closing that gap honestly needs a deploy-side signal; it is out of scope here
 * and named as such in the runbook.
 *
 * ---------------------------------------------------------------------------------------
 * IDEMPOTENCY  (CLAUDE.md > Idempotency & Replayability, NON-NEGOTIABLE)
 * ---------------------------------------------------------------------------------------
 * Belt and suspenders, because this repo has been burned by relying on a state file alone
 * (see backend/src/scripts/lib/cbDraftIdempotency.js: 47 duplicate comments on one to-do).
 *
 *   Belt       a transition is keyed on `<pr>:<event>:<sha>` in state.firedKeys, written
 *              IMMEDIATELY after each successful post (a crash-safe checkpoint, not at end of
 *              run), so a crash or a retrying scheduler cannot repost what already landed.
 *   Suspenders every comment carries an invisible marker, and the to-do's comment thread is
 *              read and scanned for that marker before posting. The thread is the authority;
 *              the state file is only an optimisation. A wiped state file costs API calls, not
 *              duplicate comments.
 *   Lock       a lock file with a TTL stops two concurrent invocations firing the same
 *              transition.
 *
 * State: tmp/ops-engine/pr-merge-watch-state.json
 *   { firedKeys: { "<pr>:<event>:<sha>": ISO }, lastSeen: { "<pr>": { state, mergedAt, sha } } }
 *
 * Run:
 *   node backend/src/scripts/prMergeWatcher.js              dry run, prints what it would post
 *   node backend/src/scripts/prMergeWatcher.js --execute    posts for real
 *
 * Dry run is the default on purpose, matching the guardrail shape the repo's other PR tooling
 * uses. Nothing is posted unless --execute is passed, so running this by hand to see the state
 * of the world is always safe.
 */

const fs = require('fs');
const path = require('path');

const REPO = process.env.PR_WATCH_REPO || 'ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator';
const GH_API = 'https://api.github.com';
const BC_API = 'https://3.basecampapi.com';
const UA = 'Colaberry PR Merge Watcher (ali@colaberry.com)';

// PR_WATCH_STATE lets a deployment keep state outside the repo tree, so a `git reset --hard`
// on the VPS clone cannot clobber the dedup record. Same reasoning as scripts/prReviewState.js.
const STATE_PATH = process.env.PR_WATCH_STATE
  || path.resolve(__dirname, '../../../tmp/ops-engine/pr-merge-watch-state.json');
const LOCK_PATH = process.env.PR_WATCH_LOCK
  || path.resolve(__dirname, '../../../tmp/ops-engine/pr-merge-watch.lock');

const LOCK_TTL_MS = 10 * 60 * 1000;                  // a lock older than this is stale
const FIRED_KEY_TTL_MS = 90 * 24 * 60 * 60 * 1000;   // prune transition keys after 90 days

// ---------------------------------------------------------------------------
// Pure decision logic. Everything below this banner and above the I/O banner is
// side-effect free and directly unit tested. The worker is shaped this way so the
// tests need no HTTP mocking at all.
// ---------------------------------------------------------------------------

/**
 * Read the Basecamp to-do a PR belongs to out of its body.
 * Returns { bucketId, todoId, url } or null when the PR has not opted in.
 */
function parseTicketLink(body) {
  if (!body || typeof body !== 'string') return null;
  const m = body.match(/https?:\/\/(?:[a-z0-9.]*\.)?basecamp(?:api)?\.com\/(\d+)\/buckets\/(\d+)\/todos\/(\d+)/i);
  if (!m) return null;
  return { accountId: m[1], bucketId: m[2], todoId: m[3], url: m[0] };
}

/** Collapse a GitHub PR into the one word this watcher reasons about. */
function classify(pr) {
  if (pr.merged_at) return 'merged';
  if (pr.state === 'closed') return 'closed_unmerged';
  return 'open';
}

/** The event name for a classification, or null when there is nothing to announce. */
function eventFor(status) {
  if (status === 'merged') return 'pr_merged';
  if (status === 'closed_unmerged') return 'pr_closed_unmerged';
  if (status === 'open') return 'pr_opened';
  return null;
}

function transitionKey(prNumber, event, sha) {
  return String(prNumber) + ':' + event + ':' + String(sha || 'nosha');
}

/** The invisible marker that makes the Basecamp thread the authority on what was posted. */
function marker(prNumber, event, sha) {
  return '<!-- pr-watch:' + transitionKey(prNumber, event, sha) + ' -->';
}

/**
 * Decide what to announce this tick.
 *
 * A PR produces at most one transition per tick.
 *
 * THE BACKFILL PROBLEM, AND WHY created_at DECIDES IT. Pointing this watcher at a repo with
 * three thousand existing PRs must not post three thousand comments, so a PR we have never seen
 * that is ALREADY finished is adopted into state silently. The naive version of that rule
 * ("first sighting of a non-open PR is silent") has a hole a polling worker falls straight into:
 * a PR opened and merged inside one tick interval is also a first sighting of a non-open PR, and
 * would be silently swallowed, which is exactly the transition the ticket exists to catch.
 *
 * So the test is not "have we seen it" but "did it exist before we started watching". state
 * .adoptedAt is stamped on the first run. A PR created before that instant is history and is
 * adopted silently; a PR created after it is live traffic and is always announced, even if the
 * first time we lay eyes on it it is already merged. That closes the open-and-merge-between-
 * ticks gap without reintroducing the backfill flood.
 */
function computeTransitions(prs, state, opts = {}) {
  const announceFirstSighting = opts.announceFirstSighting === true;
  const fired = (state && state.firedKeys) || {};
  const lastSeen = (state && state.lastSeen) || {};
  const adoptedAt = state && state.adoptedAt ? Date.parse(state.adoptedAt) : null;
  const out = [];

  for (const pr of prs) {
    const ticket = parseTicketLink(pr.body);
    if (!ticket) continue;                       // not opted in, invisible to this watcher

    const status = classify(pr);
    const event = eventFor(status);
    if (!event) continue;

    const sha = (pr.head && pr.head.sha) || pr.merge_commit_sha || null;
    const prev = lastSeen[String(pr.number)];
    const key = transitionKey(pr.number, event, sha);

    if (fired[key]) continue;                    // already announced this exact transition

    if (!prev) {
      // Predates the watcher? History, adopt it quietly. Born after we started? Real news,
      // even if it is already merged by the time we first see it.
      const createdMs = Date.parse(pr.created_at);
      const predatesWatcher = adoptedAt !== null
        && Number.isFinite(createdMs)
        && createdMs < adoptedAt;
      if (status !== 'open' && predatesWatcher && !announceFirstSighting) {
        out.push({ pr, ticket, event, sha, key, silent: true });
        continue;
      }
      // No adoptedAt yet means this is the very first run: everything finished is history.
      if (status !== 'open' && adoptedAt === null && !announceFirstSighting) {
        out.push({ pr, ticket, event, sha, key, silent: true });
        continue;
      }
    } else if (prev.event === event) {
      continue;                                  // nothing changed
    }

    out.push({ pr, ticket, event, sha, key, silent: false });
  }
  return out;
}

/** Has this exact transition already been posted to the to-do's thread? */
function alreadyPosted(comments, prNumber, event, sha) {
  const needle = marker(prNumber, event, sha);
  return (comments || []).some((c) => typeof c.content === 'string' && c.content.includes(needle));
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * The comment body. Deliberately factual and short: this is a state transition notice on an
 * internal ticket, not a status report. It says what changed, when, and what it does not know.
 */
function buildComment(pr, event, sha) {
  const title = escapeHtml(pr.title || '');
  const url = escapeHtml(pr.html_url || '');
  const num = escapeHtml(pr.number);
  const head = {
    pr_opened: 'Pull request opened',
    pr_merged: 'Pull request merged',
    pr_closed_unmerged: 'Pull request closed without merging',
  }[event] || event;

  let detail;
  if (event === 'pr_merged') {
    detail = 'Merged ' + escapeHtml(pr.merged_at) + '. <strong>Merged is not deployed.</strong> '
      + 'This watcher reads pull request state only; it has no deploy signal and does not know '
      + 'whether this is running in production.';
  } else if (event === 'pr_closed_unmerged') {
    detail = 'Closed without merging. Nothing from this branch reached main.';
  } else {
    detail = 'Open and awaiting review. This watcher never merges, closes or approves anything.';
  }

  return '<div><strong>' + head + ': <a href="' + url + '">#' + num + ' ' + title + '</a></strong></div>'
    + '<div>' + detail + '</div>'
    + '<div><em>Posted automatically by the Commercialization PR Merge Watcher (C0.4). '
    + 'Ticket state is not changed; a human closes this to-do.</em></div>'
    + marker(pr.number, event, sha);
}

/** Drop transition keys older than the TTL so the state file cannot grow without bound. */
function pruneFiredKeys(state, nowMs) {
  const now = typeof nowMs === 'number' ? nowMs : Date.now();
  const fired = (state && state.firedKeys) || {};
  let pruned = 0;
  for (const k of Object.keys(fired)) {
    const t = Date.parse(fired[k]);
    if (!Number.isFinite(t) || now - t > FIRED_KEY_TTL_MS) { delete fired[k]; pruned++; }
  }
  return pruned;
}

// ---------------------------------------------------------------------------
// I/O. Nothing below here runs on require(); it is all reached from main().
// ---------------------------------------------------------------------------

/**
 * The ONLY place api.github.com is contacted, and it is GET-only by construction.
 * Do not add a method parameter to this function. A write path to GitHub is out of scope for
 * this worker and prMergeWatcher.test.ts asserts that the source contains no such path.
 */
async function ghGet(pathname) {
  const res = await fetch(GH_API + pathname, {
    method: 'GET',
    headers: { 'User-Agent': UA, Accept: 'application/vnd.github+json' },
  });
  if (res.status === 403 || res.status === 429) {
    const reset = res.headers.get('x-ratelimit-reset');
    throw new Error('github rate limited (' + res.status + ')'
      + (reset ? ', resets ' + new Date(Number(reset) * 1000).toISOString() : ''));
  }
  if (!res.ok) throw new Error('GET ' + pathname + ' -> ' + res.status);
  return res.json();
}

function bcHeaders() {
  const t = (process.env.BASECAMP_ACCESS_TOKEN || '').replace(/^bearer\s+/i, '');
  if (!t) throw new Error('BASECAMP_ACCESS_TOKEN is not set; refusing to run');
  return {
    Authorization: 'Bearer ' + t,
    'User-Agent': UA,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

async function bcGet(url) {
  const res = await fetch(url, { headers: bcHeaders() });
  if (!res.ok) throw new Error('BC GET ' + url + ' -> ' + res.status);
  return res.json();
}

async function bcPostComment(accountId, bucketId, todoId, html) {
  const url = BC_API + '/' + accountId + '/buckets/' + bucketId + '/recordings/' + todoId + '/comments.json';
  const res = await fetch(url, { method: 'POST', headers: bcHeaders(), body: JSON.stringify({ content: html }) });
  if (!res.ok) throw new Error('BC POST comment -> ' + res.status + ' ' + (await res.text()).slice(0, 200));
  return res.json();
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch { return { firedKeys: {}, lastSeen: {} }; }
}

function saveState(s) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2) + '\n');
}

function acquireLock() {
  fs.mkdirSync(path.dirname(LOCK_PATH), { recursive: true });
  try {
    const raw = fs.readFileSync(LOCK_PATH, 'utf8');
    const age = Date.now() - Date.parse(JSON.parse(raw).at);
    if (Number.isFinite(age) && age < LOCK_TTL_MS) return false;
  } catch { /* no lock, or an unreadable one we are entitled to take */ }
  fs.writeFileSync(LOCK_PATH, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }) + '\n');
  return true;
}

function releaseLock() {
  try { fs.unlinkSync(LOCK_PATH); } catch { /* already gone */ }
}

async function main() {
  const execute = process.argv.includes('--execute');
  const log = (o) => console.log(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'info', service: 'pr-merge-watcher', ...o,
  }));

  if (!acquireLock()) { log({ event: 'skipped_locked', outcome: 'success' }); return; }

  try {
    const prs = await ghGet('/repos/' + REPO + '/pulls?state=all&per_page=100&sort=updated&direction=desc');
    const state = loadState();
    if (!state.firedKeys) state.firedKeys = {};
    if (!state.lastSeen) state.lastSeen = {};

    // Stamp the watch start on the first real run. Everything already closed at this instant is
    // history; everything raised after it is live traffic. See computeTransitions.
    const firstRun = !state.adoptedAt;
    if (firstRun && execute) { state.adoptedAt = new Date().toISOString(); saveState(state); }

    const transitions = computeTransitions(prs, state);
    const watched = prs.filter((p) => parseTicketLink(p.body)).length;
    log({
      event: 'scanned', outcome: 'success',
      context: { prs: prs.length, watched, transitions: transitions.length, mode: execute ? 'execute' : 'dry-run' },
    });

    for (const t of transitions) {
      const record = () => {
        state.lastSeen[String(t.pr.number)] = { event: t.event, sha: t.sha, at: new Date().toISOString() };
        state.firedKeys[t.key] = new Date().toISOString();
        saveState(state);                       // checkpoint immediately, before the next PR
      };

      if (t.silent) {
        log({ event: 'adopted_silently', outcome: 'success', context: { pr: t.pr.number, state: t.event } });
        if (execute) record();
        continue;
      }

      if (!execute) {
        log({
          event: 'would_post', outcome: 'success',
          context: { pr: t.pr.number, transition: t.event, todo: t.ticket.todoId, url: t.ticket.url },
        });
        continue;
      }

      // Suspenders: the thread is the authority. Read it before writing to it.
      const commentsUrl = BC_API + '/' + t.ticket.accountId + '/buckets/' + t.ticket.bucketId
        + '/recordings/' + t.ticket.todoId + '/comments.json';
      let existing = [];
      try { existing = await bcGet(commentsUrl); } catch (err) {
        log({ level: 'warn', event: 'thread_read_failed', outcome: 'failure', error_class: err.constructor.name, context: { pr: t.pr.number, message: err.message } });
        continue;                                // cannot prove it is unposted, so do not post
      }

      if (alreadyPosted(existing, t.pr.number, t.event, t.sha)) {
        log({ event: 'already_in_thread', outcome: 'success', context: { pr: t.pr.number, transition: t.event } });
        record();                                // heal the state file from the thread
        continue;
      }

      try {
        const c = await bcPostComment(t.ticket.accountId, t.ticket.bucketId, t.ticket.todoId,
          buildComment(t.pr, t.event, t.sha));
        record();
        log({ event: 'posted', outcome: 'success', context: { pr: t.pr.number, transition: t.event, todo: t.ticket.todoId, comment: c.app_url } });
      } catch (err) {
        log({ level: 'error', event: 'post_failed', outcome: 'failure', error_class: err.constructor.name, context: { pr: t.pr.number, message: err.message } });
      }
    }

    const pruned = pruneFiredKeys(state);
    if (pruned && execute) { saveState(state); log({ event: 'pruned', outcome: 'success', context: { keys: pruned } }); }
  } finally {
    releaseLock();
  }
}

module.exports = {
  parseTicketLink,
  classify,
  eventFor,
  transitionKey,
  marker,
  computeTransitions,
  alreadyPosted,
  buildComment,
  pruneFiredKeys,
  escapeHtml,
  FIRED_KEY_TTL_MS,
};

if (require.main === module) {
  main().catch((err) => {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'error', service: 'pr-merge-watcher',
      event: 'run_failed', outcome: 'failure', error_class: err.constructor.name, context: { message: err.message },
    }));
    releaseLock();
    process.exit(1);
  });
}
