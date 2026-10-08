# Watch Commercialization PR Merges

Runbook for the Commercialization PR Merge Watcher. Ticket C0.4, AI Capability Commercialization.

Implementation: `backend/src/scripts/prMergeWatcher.js`
Tests: `backend/src/scripts/__tests__/prMergeWatcher.test.ts`

---

## 1. Purpose

Code tickets in this initiative keep a pull request open for days. Without something watching, the
Basecamp ticket says "in progress" long after the PR merged, and the only way to know a ticket's
real state is for a human to go and look at GitHub. This watcher closes that gap: when a watched
pull request changes state, it posts a comment on the Basecamp to-do that raised it.

It exists so that nobody has to reconcile ticket state by hand. It does not manage the ticket.
**A human still closes the to-do.**

---

## 2. Inputs

| Input | Where it comes from | Notes |
|---|---|---|
| Pull request state | `GET https://api.github.com/repos/{repo}/pulls?state=all` | **Unauthenticated.** The repo is public, so no GitHub credential exists for this job and none needs to be provisioned or rotated. |
| `BASECAMP_ACCESS_TOKEN` | Already in the `cron-env-wrapper.sh` whitelist | The wrapper probes it against a real BC call and refetches from CCPP if stale, so the watcher never deals with a rotated token itself. |
| `PR_WATCH_REPO` | Optional override | Defaults to the accelerator repo. |
| `PR_WATCH_STATE` | Optional override | Defaults to `tmp/ops-engine/pr-merge-watch-state.json`. Point it outside the repo tree on a host where `git reset --hard` runs. |
| `PR_WATCH_LOCK` | Optional override | Defaults to `tmp/ops-engine/pr-merge-watch.lock`. |

**No new environment variable, secret or credential is required to run this.** That is a design
goal, not a coincidence; see Safety constraints.

---

## 3. Steps

### 3.1 Opt a pull request in

A pull request is watched **only** if its body carries a Basecamp to-do link on its own line:

```
Basecamp: https://app.basecamp.com/3945211/buckets/7463955/todos/10379236192
```

Both `app.basecamp.com` and `3.basecamp.com` are accepted. The account, bucket and to-do ids are
read out of that URL, so nothing about which project or list is hardcoded.

**A pull request with no such link is invisible to the watcher.** There is no allow-list to
maintain and no branch-name convention to get wrong. If you want a PR tracked, link its ticket.

### 3.2 Run it by hand (always safe)

```bash
node backend/src/scripts/prMergeWatcher.js
```

Dry run is the default. It prints what it *would* post as structured JSON log lines and writes
nothing to Basecamp. Use this to see the state of the world at any time.

### 3.3 Run it for real

```bash
node backend/src/scripts/prMergeWatcher.js --execute
```

### 3.4 Install the schedule

One crontab line on the VPS. No new shell script: `cron-env-wrapper.sh` already ends in
`exec node "$@"` and already carries `BASECAMP_ACCESS_TOKEN` with a health probe.

```cron
*/15 * * * * /opt/colaberry-accelerator/scripts/cron-env-wrapper.sh backend/src/scripts/prMergeWatcher.js --execute >> /var/log/pr-merge-watcher.log 2>&1
```

Fifteen minutes is chosen against the anonymous GitHub budget of 60 requests per hour per IP. One
list call per tick is four per hour, leaving headroom for the other unauthenticated GitHub caller
in this system (`openclawTechResearchAgent`). **Do not lower this below five minutes** without
re-checking that budget.

---

## 4. Outputs

- **One Basecamp comment per observed transition**, on the linked to-do. That is the entire write
  surface of this job.
- **Structured JSON log lines** on stdout: `scanned`, `would_post`, `posted`, `adopted_silently`,
  `already_in_thread`, `thread_read_failed`, `post_failed`, `pruned`, `skipped_locked`,
  `run_failed`.
- **State file** at `tmp/ops-engine/pr-merge-watch-state.json`:
  `{ adoptedAt, firedKeys: { "<pr>:<event>:<sha>": ISO }, lastSeen: { "<pr>": {...} } }`.

### Transitions it reports

| Event | Means |
|---|---|
| `pr_opened` | A watched PR is open and awaiting review. |
| `pr_merged` | `merged_at` became non-null. |
| `pr_closed_unmerged` | Closed without merging. Nothing reached main. |

### Transitions it deliberately does NOT report

**It does not report "deployed" or "production-verified", and the comment it posts on a merge says
so out loud.** Those are not fields on a pull request. This stack deploys over ssh with
`docker compose`, not through GitHub Deployments, so there is no deployment event to read. A
ticket that says "deployed" because something merged is worse than a ticket that says nothing,
so the watcher reports the merge and states plainly that merged is not deployed.

Closing that gap honestly needs a deploy-side signal. See Known limits.

---

## 5. Verification

Run these in order. Each has an observable signal, not a judgement.

1. **The tests pass, and they can fail.**
   ```bash
   cd backend && npx jest -c jest.ci.config.ts --testPathPattern prMergeWatcher
   ```
   Expect `Tests: 46 passed`. The suite includes seven assertions made against the *source text*
   rather than behaviour, covering the promises that prose cannot prove: no non-GET call to
   GitHub, no merge/close/review/label path, no `completion.json`, exactly one POST, dry run by
   default, and all I/O behind `require.main`. Each was mutation-tested on 8 Oct 2026: breaking
   the property fails the named test, and the file restored byte-identically afterwards.

2. **A dry run reads GitHub and proposes nothing to write.**
   ```bash
   node backend/src/scripts/prMergeWatcher.js
   ```
   Expect a `scanned` line with `"mode":"dry-run"` and a `watched` count. `watched` is 0 until a
   PR carries a Basecamp link, and 0 is the correct answer then.

3. **A real run posts exactly once.** Open a test PR with a `Basecamp:` link to a scratch to-do,
   run with `--execute`, and confirm one comment appears. Then run it again. Expect
   `already_in_thread` or no transition at all, and **no second comment**.

4. **The dedup survives losing the state file.** Delete
   `tmp/ops-engine/pr-merge-watch-state.json` and run with `--execute` again. Expect
   `already_in_thread` and still no second comment: the marker in the Basecamp thread is the
   authority, the state file is only an optimisation.

---

## 6. Edge cases and failure modes

| Situation | Behaviour |
|---|---|
| **A PR opens and merges inside one tick interval** | Announced as `pr_merged`. The watcher compares the PR's `created_at` against `state.adoptedAt` rather than asking "have I seen this before", so a fast PR is live traffic, not history. This is the gap a naive poller loses, and it has a named test. |
| **First run against a repo with thousands of old PRs** | Everything already finished is adopted silently and never announced. `adoptedAt` is stamped on the first `--execute` run. |
| **State file deleted or wiped by `git reset --hard`** | Costs API calls, not duplicate comments. The thread marker still blocks the repost, and the state file heals itself from the thread. |
| **Two invocations overlap** | The second exits immediately with `skipped_locked`. The lock has a 10 minute TTL so a crashed run cannot wedge the job permanently. |
| **GitHub rate limit reached** | The run throws with the reset time and exits non-zero. The next tick retries. Nothing is half-written. |
| **Basecamp thread cannot be read** | Logs `thread_read_failed` and **skips the post**. If it cannot prove the comment is not already there, it does not post. Failing closed is correct here; a missed notification is recoverable, a duplicated one annoys a human. |
| **Basecamp post fails** | Logs `post_failed` and does **not** record the key, so the next tick retries it. |
| **A hostile PR title** | Escaped before it reaches the comment HTML. Tested. |
| **A forged Basecamp link in an outside PR** | The host pattern only matches `basecamp.com` / `basecampapi.com`; `evil.com/...` and `basecamp.com.attacker.net/...` are both rejected. Tested. Note this bounds *which* Basecamp this can address, not *which* to-do: anyone who can open a PR on a public repo can aim a comment at a to-do id they know. The write is one comment by a known automation, which is an acceptable blast radius, but do not extend this job's write surface without revisiting that. |
| **`BASECAMP_ACCESS_TOKEN` missing** | Refuses to run rather than silently no-opping. |

---

## 7. Safety constraints

**It never merges, closes, approves, labels or comments on a pull request. It never writes to
GitHub at all.** Every GitHub call goes through one `ghGet()` that hardcodes `method: 'GET'` and
is the only place `api.github.com` appears in the file. This is asserted against the source text
by the test suite, because a comment promising read-only behaviour is not a control.

**It never completes, closes or reassigns a Basecamp to-do.** Its whole write surface is one
comment per transition. A human closes the to-do. Asserted by test (no `completion.json`,
exactly one POST).

**Dry run is the default.** Nothing is posted unless `--execute` is passed.

**Idempotency** (CLAUDE.md > Idempotency & Replayability) is belt and suspenders, because this
repo has been burned by relying on a state file alone (see
`backend/src/scripts/lib/cbDraftIdempotency.js`: 47 duplicate comments on one to-do):

- **Belt.** A transition is keyed `<pr>:<event>:<sha>` in `state.firedKeys`, written *immediately*
  after each successful post as a crash-safe checkpoint, not at end of run.
- **Suspenders.** Every comment carries an invisible marker and the thread is read and scanned for
  it before posting. The thread is the authority.
- **Lock.** A lock file with a 10 minute TTL stops concurrent invocations double-firing.

**No credential is introduced by this job.** Reads are anonymous because the repo is public;
the Basecamp token already exists and is already kept healthy by the cron wrapper.

---

## 8. Why this shape, and the two options that were rejected

The ticket asked whether a persistent watcher is appropriate at all, or whether something smaller
fits. It is a fifteen-minute cron tick, which is not a persistent watcher, and that is the right
amount of machinery. The two alternatives were considered properly and rejected on evidence:

**A `pull_request`-triggered GitHub Actions workflow.** Rejected.
`.github/workflows/delivery-execution-runner.yml` states this repository's position directly:
workflows here are manual-dispatch only, and "a workflow that fires on push would be" an
unauthorized production agent worker under master plan section 20. The same file carries an
enforced preflight that fails the run if any of `DATABASE_URL MANDRILL_API_KEY BASECAMP_TOKEN
OPENAI_API_KEY AWS_ACCESS_KEY_ID` is present. A workflow posting to Basecamp needs exactly the
credential that check forbids. Separately, a static Actions secret cannot call `refreshBcToken()`
against CCPP, so it would 401 within a token cycle.

**Extending the existing `/api/webhook/github` receiver.** Not rejected on merit, and it is the
right long-term answer, but not today's. That receiver is a per-student multi-tenant path: it
resolves a per-repo HMAC secret via `webhookSecretService` and binds the repo to an enrollment via
`findRepoBinding(owner, repo)`. This repository has no enrollment binding, and **no webhook is
registered on it** (`gh api repos/:owner/:repo/hooks` returns nothing). Turning it on would mean
registering a hook on the main repo, provisioning a secret for a non-student repo, and threading a
second tenancy concept through a receiver shaped around enrollments. That is a larger change than
this ticket, and it needs an admin action on the GitHub repo that no code change can perform.

---

## 9. Known limits

1. **No deploy or production-verified signal.** The watcher reports merged and says plainly that
   merged is not deployed. Reporting a deploy would mean inferring one. Closing this honestly
   needs either a `deployment_status` event (which means the webhook path above) or a deploy-side
   emitter calling back with a commit SHA. Out of scope for C0.4 and named here so nobody assumes
   a silent ticket means "not deployed".
2. **Polling granularity.** State is read every fifteen minutes. The `created_at` rule means a
   fast merge is still announced, but it is announced as a merge, not as an open followed by a
   merge. The intermediate state is genuinely lost, and that is acceptable.
3. **Anonymous rate budget is shared per IP** with any other unauthenticated GitHub caller on the
   same host. If a second such caller is added, re-check the budget before assuming both fit.
