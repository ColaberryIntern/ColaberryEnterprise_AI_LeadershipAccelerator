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
 * It does NOT report "production-verified". That is not a field on a pull request and nothing
 * here observes behaviour.
 *
 * It DOES now report a third transition, pr_deployed, added under ticket C0.14. The reason the
 * original version refused to is still the right reason: "deployed" must never be inferred from
 * "merged". So it is not inferred - it is read off the container runtime. See classifyDeploy()
 * and readRunningBuildTimes() below. The distinction the comment draws for a reader is exact:
 * the CODE is in the build production is running, which is not the same claim as the feature
 * working. Those are different rungs and this watcher reports only the first.
 *
 * Why this gap mattered enough to close: on 2026-11-05, 47 of the 222 open to-dos assigned to
 * Ali carried a merge notice from this watcher and no deploy claim, because nothing ever
 * supplied one. Forty-four of them had shipped. A watcher that can only ever say "merged"
 * manufactures a backlog of finished work, and the backlog reads as overdue.
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
// execFileSync, not exec: the container runtime is called with an argument array and never a
// shell string, so no part of a container name or image id can be read as shell syntax.
const { execFileSync } = require('child_process');

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

// A build is not instantaneous: it starts from whatever main's tip was some minutes BEFORE its
// image is stamped. So a pull request that landed close to the build cannot be resolved by time
// alone, and gets the explicit 'ambiguous' verdict rather than being rounded up. The next tick,
// after the next build, resolves it.
const DEPLOY_MARGIN_MS = 30 * 60 * 1000;

// The running containers that bound a deploy claim. Both are listed because they hold DIFFERENT
// code: the backend image carries the API, the nginx image carries the built frontend. A
// frontend-only change is live only once nginx was rebuilt, so bounding on the backend alone
// would report frontend work deployed whenever the two drifted. classifyDeploy therefore takes
// the OLDEST of these, not the newest.
//
// accelerator-intelligence is deliberately absent. On 2026-11-05 it had been up for seven weeks,
// so including it would hold the bound seven weeks in the past and no deploy would ever be
// reported. A change to that service is OUT OF SCOPE for this signal, which is a limitation to
// state rather than to paper over by quietly dropping the container from the comparison.
const DEPLOY_CONTAINERS = (process.env.PR_WATCH_DEPLOY_CONTAINERS
  || 'accelerator-backend,accelerator-nginx')
  .split(',').map((s) => s.trim()).filter(Boolean);

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

/**
 * Is the code from a merge in the build production is actually running?
 *
 * Pure, so the whole decision is testable without a container runtime. `buildTimes` are the
 * build timestamps of the running images; the bound is the OLDEST of them, because a frontend
 * change lives in a different image from an API change and the claim is only as good as the
 * staler one.
 *
 * Four verdicts, not two. Collapsing the middle two into "deployed" is the only outcome worse
 * than saying nothing, which is the whole reason this watcher refused to guess for so long:
 *
 *   in_build      merged more than `marginMs` before the oldest running image was built
 *   ambiguous     merged inside that margin, so the build may or may not contain it
 *   not_in_build  merged after the oldest running image was built
 *   unknown       no readable build time, or an unparseable merge time
 *
 * Only in_build is ever announced. Note what this cannot tell you even then: that the code is
 * present is not that the feature works, and a feature can ship dark behind a flag.
 */
function classifyDeploy(mergedAt, buildTimes, marginMs) {
  const merged = Date.parse(mergedAt);
  if (!Number.isFinite(merged)) return 'unknown';

  const times = (buildTimes || [])
    .map((t) => (typeof t === 'number' ? t : Date.parse(t)))
    .filter((n) => Number.isFinite(n));
  if (!times.length) return 'unknown';

  const oldest = Math.min(...times);
  const margin = Number.isFinite(marginMs) ? marginMs : DEPLOY_MARGIN_MS;

  if (merged > oldest) return 'not_in_build';
  if (merged > oldest - margin) return 'ambiguous';
  return 'in_build';
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
  // The same backfill rule as adoptedAt, for the deploy event. Stamped the first time a build
  // time could be read. Without it, switching this on would post a deploy notice on every
  // merged pull request in the repository's history, because all of them predate the running
  // image. A null stamp means "not watching deploys yet" and skips every one, so the failure
  // direction is silence rather than a flood.
  const deployAdoptedAt = state && state.deployAdoptedAt ? Date.parse(state.deployAdoptedAt) : null;
  const buildTimes = opts.buildTimes || [];
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

    // A merged pull request earns a SECOND transition later, once its code is in the build
    // production is running. It is evaluated only after the merge notice itself has fired, so
    // the two always arrive in rung order and one tick never posts both.
    //
    // Keyed on merge_commit_sha rather than the head sha: the head sha can still change after a
    // merge (this repository has seen pushes land on an already-merged branch), and a changing
    // key would let the same deploy be announced twice.
    if (status === 'merged' && fired[key] && buildTimes.length && deployAdoptedAt !== null) {
      const mergedMs = Date.parse(pr.merged_at);
      const mergedAfterWeStartedWatching = Number.isFinite(mergedMs) && mergedMs >= deployAdoptedAt;
      if (mergedAfterWeStartedWatching) {
        const deploySha = pr.merge_commit_sha || sha;
        const deployKey = transitionKey(pr.number, 'pr_deployed', deploySha);
        if (!fired[deployKey]
            && classifyDeploy(pr.merged_at, buildTimes, opts.deployMarginMs) === 'in_build') {
          out.push({ pr, ticket, event: 'pr_deployed', sha: deploySha, key: deployKey, silent: false });
        }
      }
    }

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
function buildComment(pr, event, sha, info = {}) {
  const title = escapeHtml(pr.title || '');
  const url = escapeHtml(pr.html_url || '');
  const num = escapeHtml(pr.number);
  const head = {
    pr_opened: 'Pull request opened',
    pr_merged: 'Pull request merged',
    pr_closed_unmerged: 'Pull request closed without merging',
    pr_deployed: 'Code is in the build production is running',
  }[event] || event;

  let detail;
  if (event === 'pr_merged') {
    detail = 'Merged ' + escapeHtml(pr.merged_at) + '. <strong>Merged is not deployed.</strong> '
      + 'A separate notice follows once the code reaches the running build; if one never '
      + 'arrives, it has not.';
  } else if (event === 'pr_deployed') {
    // Says exactly what was measured and exactly what it does not establish. The whole point of
    // this event is that "deployed" was read rather than inferred, so the reader is told what it
    // was read from.
    detail = 'Merged ' + escapeHtml(pr.merged_at) + ', and the oldest running accelerator image '
      + 'was built ' + escapeHtml(info.builtAt || 'unknown') + '. This merge landed before that '
      + 'build, so its code is in the image production is serving. Read from the container '
      + 'runtime, not inferred from the merge, and bounded on the staler of the API and frontend '
      + 'images so a frontend change is not reported live on the strength of a backend rebuild. '
      + '<strong>This is not behavioural verification.</strong> It establishes that the code '
      + 'shipped, not that the feature works, and a feature can ship dark behind a flag. '
      + 'Production-verified remains a separate rung that this watcher does not read.';
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

/**
 * What is actually running, read from the container runtime.
 *
 * This worker runs ON THE HOST, from scripts/cron-env-wrapper.sh, which already shells out to
 * the container runtime itself - so the runtime is reachable here. Two reads per container: the
 * image the container was created from, then that image's build time.
 *
 * WHY NOT `git HEAD` ON THE BOX. Because it is not what is serving. Production deploys from a
 * published registry image, so when no image exists for main's tip the deploy no-ops and the
 * checkout moves on without the container. Measured 2026-11-05: the host sat at a29dfb24
 * (merged 13:16Z) while the running image had been built at 12:24:30Z, an hour behind. A check
 * built on the checkout would have reported code live that was not.
 *
 * Only `inspect` is ever called. Nothing here starts, stops, removes, or executes inside a
 * container, and a test asserts that against the source text rather than trusting this comment.
 *
 * On any failure this returns fewer entries, or none. That is deliberate and it is the safe
 * direction: classifyDeploy returns 'unknown' without a build time, and 'unknown' announces
 * nothing. A runtime that cannot be read must never look like a deploy.
 */
function readRunningBuildTimes() {
  const run = (args) => execFileSync('docker', args, {
    encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();

  const out = [];
  for (const container of DEPLOY_CONTAINERS) {
    try {
      const image = run(['inspect', '-f', '{{.Image}}', container]);
      if (!image) continue;
      const builtAt = run(['image', 'inspect', '-f', '{{.Created}}', image]);
      const ms = Date.parse(builtAt);
      if (Number.isFinite(ms)) out.push({ container, image, builtAt, ms });
    } catch {
      /* unreadable container contributes nothing, which keeps the verdict 'unknown' */
    }
  }
  return out;
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

    const builds = readRunningBuildTimes();
    const buildTimes = builds.map((b) => b.ms);
    const oldest = builds.length ? builds.reduce((a, b) => (a.ms < b.ms ? a : b)) : null;
    log({
      event: 'read_running_build',
      outcome: builds.length === DEPLOY_CONTAINERS.length ? 'success'
        : builds.length ? 'partial' : 'failure',
      context: {
        wanted: DEPLOY_CONTAINERS, read: builds.map((b) => b.container + '@' + b.builtAt),
        bound: oldest ? oldest.container + '@' + oldest.builtAt : null,
      },
    });

    // Same backfill rule as adoptedAt, for the deploy event: stamped the first time a build
    // time is readable, so history is never announced. Until it exists, no deploy is reported.
    if (!state.deployAdoptedAt && execute && buildTimes.length) {
      state.deployAdoptedAt = new Date().toISOString();
      saveState(state);
    }

    const transitions = computeTransitions(prs, state, { buildTimes });
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
          buildComment(t.pr, t.event, t.sha, { builtAt: oldest ? oldest.builtAt : null }));
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
  classifyDeploy,
  alreadyPosted,
  buildComment,
  pruneFiredKeys,
  escapeHtml,
  FIRED_KEY_TTL_MS,
  DEPLOY_MARGIN_MS,
  DEPLOY_CONTAINERS,
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
