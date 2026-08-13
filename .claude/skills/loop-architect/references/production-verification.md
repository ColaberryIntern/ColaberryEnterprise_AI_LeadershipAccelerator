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
7. No concurrent deploy is in flight (check for a running `compose ... up` build on the
   box - the repo has a documented race condition here; never overlap two deploys).

## Deploy execution

```bash
ssh root@95.216.199.47
cd /opt/colaberry-accelerator
git status                      # confirm clean; do not deploy over uncommitted changes
git rev-parse HEAD               # record as "previous SHA" for rollback before pulling
git pull origin main
git rev-parse HEAD               # record as "deployed SHA"
docker compose -f docker-compose.production.yml up -d --build <service>
```

Wait for the backend's normal ~60-90s boot window before treating a 502 as a failure.
Capture in `deployment-log.md`: command run, previous SHA, deployed SHA, timestamp,
target environment, resulting URL(s), and which service(s) were rebuilt.

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
   thing this run built.
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
