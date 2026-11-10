# Production deployment and verification (Phases H + I)

## Phase H - deploy preconditions (all required before the deploy command runs)

1. Target environment is unambiguous - this repo has exactly one production target:
   `ssh root@95.216.199.47`, stack at `/opt/colaberry-accelerator`,
   `docker-compose.production.yml`.
2. `main` is the deploying branch; the PR merged cleanly (1 review + 4 checks green).
3. All plan tasks are `passed` (not `blocked`/`skipped`) and the full quality gate
   (Phase G) is green.
4. Migrations, if any, are backward-compatible or a migration task in the plan
   explicitly handled sequencing (never a raw destructive `ALTER`/`DROP` without a
   task covering it - see CLAUDE.md Idempotency & Replayability).
5. Rollback path is concrete: the last-known-good commit SHA is recorded before
   deploying the new one.
6. `git diff` against `main`'s previous tip contains only in-scope changes.
7. No concurrent deploy is in flight. `scripts/deploy-prod.sh` enforces this with a
   flock; never bypass it with a bare `compose up`.
8. **The merge is not already live.** Other sessions deploy main several times a day.
   If the box's `HEAD` already contains the merge commit and the containers were
   created after it, do not redeploy: record who/when in `deployment-log.md` and go to
   Phase I.
9. **CI has published the image for main's tip** (registry mode). Deploying before it
   exists pulls the previous image and reports success.

## Deploy execution

```bash
ssh root@95.216.199.47
cd /opt/colaberry-accelerator
git rev-parse HEAD                                   # "previous SHA", for rollback
git merge-base --is-ancestor <merge-sha> HEAD && echo ALREADY-LIVE   # precondition 8
./scripts/deploy-prod.sh backend nginx               # pulls, locks, deploys, proves running
git rev-parse HEAD                                   # "deployed SHA"
```

Run multi-line remote work from a script file (`scp` + `bash`), never inline through
PowerShell. Capture in `deployment-log.md`: command run, previous SHA, deployed SHA,
timestamp, target environment, resulting URL(s), which service(s) were rebuilt, and -
when precondition 8 held - which deploy actually shipped it. Container image revision
labels are empty in this repo, so "deployed SHA" is the box's `HEAD`, proven against
behaviour in Phase I, never against a label.

Never invent a "deployed successfully" result. If SSH access, a passing quality gate,
or a required migration step is missing, stop Phase H and report exactly what's
missing - do not proceed to Phase I on an unconfirmed deploy.

## Phase I - `loop-production-verifier` checklist

The producer that deployed the build never grades its own deployment. The verifier
runs fresh, from the live system, using whichever of these it has tools for:

1. **Resolves** - the production URL(s) return a successful response.
2. **Right release is live** - a version marker, deployed SHA, or observable
   behavioral fingerprint matches the SHA recorded in `deployment-log.md` (e.g. hit a
   `/health` or `/version` endpoint if one exists; otherwise check for the specific
   new behavior itself).
3. **Primary user journey works** - the main flow the request was about, exercised
   live (HTTP calls, or browser automation if Playwright/browser tools are available).
4. **Changed behavior specifically works** - not just "site is up," but the actual
   thing this run built. For UI, **measure what a reader sees, not what the DOM
   holds**: a video, chart or panel passes only with a non-zero rendered size
   (`getBoundingClientRect()`), after the page has hydrated. The hire case-study page
   shipped with every walkthrough video in the DOM at 0x0, hidden by one CSS rule,
   because checks asked "is the element there?" Where the run reproduces a reference
   surface, screenshot both side by side and list what the reference shows that the
   build does not.
5. **API/health checks pass** - any existing health endpoints return healthy.
6. **Auth/authorization correct** - if the change touches a protected route, confirm
   both the authorized and unauthorized paths behave as expected.
7. **Responsive/browser check** - only when the change is UI-facing and browser tools
   are available; otherwise note as not-applicable rather than skipping silently.
8. **No new errors in logs** - `docker logs` / application logs show nothing new tied
   to the deploy, when log access is available.
9. **Rollback is usable** - the previous SHA and the exact redeploy command are present
   and correct in `deployment-log.md`.
10. **No secrets leaked** - none of the verifier's own output (or anything it observed)
    contains an env var value, token, or credential.

**Criteria that need a production write** ("a newly published person appears within
120s", "a withdrawn person disappears within the TTL") cannot be proven by a read-only
verifier. Decide at PLAN time how each will be proven - a named, reversible fixture the
owner has approved, or an explicit carve-out in the execution contract. A criterion
nobody planned for comes back NOT VERIFIABLE, and the verdict must list it rather than
pass over it.

**PASS requires all applicable critical checks (1-6) to pass.** Checks 7-10 are
recorded as pass/not-applicable/fail but a "not applicable" on 7-10 does not block PASS
by itself - a fail on any of them does.

## Verifier output format

```markdown
## Production verification - cycle <n>

1. Resolves: PASS/FAIL - <evidence>
2. Right release live: PASS/FAIL/NA - <evidence>
3. Primary journey: PASS/FAIL - <evidence>
4. Changed behavior: PASS/FAIL - <evidence>
5. Health checks: PASS/FAIL/NA - <evidence>
6. Auth/authz: PASS/FAIL/NA - <evidence>
7. Responsive/browser: PASS/FAIL/NA - <evidence>
8. No new errors: PASS/FAIL/NA - <evidence>
9. Rollback usable: PASS/FAIL - <evidence>
10. No secrets leaked: PASS/FAIL - <evidence>

Verdict: PASS | FAIL

If FAIL: exact symptom, suspected cause, and whether a redeploy or a code fix is needed.
```

## Cycle rules

Up to 2 production fix/deploy/verify cycles. A cycle = (fix if needed) -> redeploy ->
fresh `loop-production-verifier` pass. 2nd-cycle FAIL: stop, leave the last known-good
deploy in place if the new one is broken (roll back), and report exactly what failed.

Never report production success from a local preview, a green build log, or the
deploy command's own exit code alone - only from this verifier's live evidence.
