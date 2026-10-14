# Operator runbook — Unified AI Project Lifecycle

**For:** whoever is on call, or the DRI acting as operator. Assumes shell access to the
production host and the stack directory. **No host address, account or directory is written in
this file, because this repository is public.** Run every command from the stack directory.

**State as of 2026-10-14:** activated on release `afeb04bb`. Session `CC-20261001-q7m4`.

---

## 1. What is switched on, in one paragraph

`ENABLE_PROJECT_LIFECYCLE=true` makes the admin lifecycle and review screens reachable. Before
it, those seven route handlers returned a "not enabled" response. It also arms a gate that
requires an approved blueprint before work can be planned — but **that gate is not reachable from
the live plan generator**, so nothing is refused today. Registration of new projects does **not**
depend on this setting and has been running since 2026-10-12.

## 2. The 30-second health check

```bash
docker ps --filter name=accelerator-backend --format '{{.Status}}'
docker exec accelerator-backend printenv ENABLE_PROJECT_LIFECYCLE
git rev-parse HEAD
```

Expect `Up …`, `true`, and `afeb04bb2ff47b616e6d1120d824cf3d03f24a72`.

**Health alone is not sufficient** and has misled this project before: the site returns 200 while
the backend is down, because nginx serves the static frontend without it. Check the container
status, not the page.

## 3. Rollback — two levers, smallest first

### Lever 1 — deactivate only (seconds, no code change)

Use when the screens misbehave but the rest of the system is fine.

```bash
cp .env .env.before-deactivation-$(date +%Y%m%d%H%M)
grep -v '^ENABLE_PROJECT_LIFECYCLE=' .env > .env.tmp && mv .env.tmp .env
SKIP_PULL=1 ./scripts/deploy-prod.sh backend
docker exec accelerator-backend printenv ENABLE_PROJECT_LIFECYCLE || echo 'absent — deactivated'
```

A pre-activation backup already exists as `.env.backup-before-lifecycle-activation-20261014` and
restoring it is equivalent.

**This never re-opens an ungoverned project-creation path**, which is what LC-18 requires.
Registration is on the project model and is independent of the setting, so deactivating removes
the screens and the (currently unreachable) gate, and nothing else.

### Lever 2 — full application rollback

Use when the release itself is bad, not just this feature.

```bash
git checkout f2782e2a
SKIP_PULL=1 ALLOW_DETACHED_HEAD=1 DRY_RUN=1 ./scripts/deploy-prod.sh backend   # rehearse first
SKIP_PULL=1 ALLOW_DETACHED_HEAD=1 ./scripts/deploy-prod.sh backend             # then execute
```

`f2782e2a3ca71f433a107d834ef8d101a840bc49` is the pre-deploy SHA.

**Both environment variables are required, not optional.** A plain redeploy is refused when
`HEAD` is not `origin/main` — the guard exists so a dirty or detached tree cannot silently ship
stale code, and a rollback is exactly the legitimate case for overriding it. A rollback planned
without them would be refused at the one moment it was needed; that error was caught in planning
rather than in an incident.

## 4. Never do these

- **Never** `docker compose … up -d --build` by hand. Always `./scripts/deploy-prod.sh`. It holds
  an exclusive lock; six concurrent-deploy collisions in one session is why it exists, and a
  check-then-build is not a lock.
- **Never** `git stash` on this host. It has stolen another session's stash before. The deploy
  script ignores untracked files, so scratch under `tmp/` does not block a deploy and does not
  need clearing.
- **Never** run two deploys at once. The lock prevents interleaving, but a second invocation will
  wait, and a Cloudflare 521 has resulted from racing deploys in the past.
- **Never** re-declare `ENABLE_PROJECT_LIFECYCLE` in `docker-compose.production.yml`. A
  `${…:-false}` fallback there would **override** the host value and silently switch the feature
  off. It is carried by `env_file` only, deliberately, like `AI_NEWS_INGEST_ENABLED`.

## 5. What to look for in the logs

```bash
docker logs accelerator-backend --since 10m > /tmp/bl.txt
grep -c fatal /tmp/bl.txt                       # expect 0
grep 'project lifecycle schema ensured' /tmp/bl.txt
grep 'project tenant schema ensured' /tmp/bl.txt
grep sbp_story_authorization /tmp/bl.txt         # expect NOTHING today, see below
```

`sbp_story_authorization_*` lines are expected to be **absent**, because the gate is not reachable
from the live generator. If they start appearing, someone has wired `projectId` into the plan
generator — which is the intended next change, but it means every project now needs an approved
blueprint and refusals will follow.

**Known-noisy and unrelated:** `intel-card-content` / `IncompleteGeneration` errors and
`[aiNews] feed failed`. Ten such error lines were present at activation and predate it. Do not
read them as lifecycle failures.

## 6. Metrics worth watching for the first week

| Metric | How | Healthy |
|---|---|---|
| New projects getting a lifecycle record | count projects created since 2026-10-12 with no lifecycle row | **0 missing** |
| Duplicate lifecycle rows | group lifecycle rows by project, having count > 1 | **0** |
| Orphaned lifecycle rows | lifecycle rows whose project id does not exist | **0** |
| Unattributed projects | projects with a null tenant | **0** |
| Story-gate refusals | `sbp_story_authorization_refused` in logs | **0 today**; non-zero means the gate was wired |

At activation these measured 0 missing of 10, 0 duplicates, 0 orphans and 0 unattributed of 72.

## 7. Known gaps, so an incident is not misdiagnosed as one of them

1. **Itemised reapproval impact is not built** (LC-11 partial). A material change blocks stale
   downstream work but does not list exactly what is affected.
2. **The delivery-project path is unexercised in production.** Four such projects exist, all
   predating the hook. Registration is live on that path but has never fired.
3. **One authenticated conflict refusal has never been observed in production**, because it needs
   a program-section admin token the build process cannot mint.
4. **The review surface has not been seen rendering.** As of this file's writing it is activated
   and unviewed; the owner's Test 1 is the confirmation.
5. **Phase 7's assurance packets are deferred** by DRI decision: the corpus cases, replay cases,
   legacy assessor, pilot and gate packets. The gates that are live carry Phase 6's verification,
   not Phase 7's.

## 8. If you need to resume the build

The run state is in `.loop-architect/runs/20261001-unified-project-lifecycle/`, which is
gitignored. `deployment-log.md` there records this deploy and activation with every measurement.
`verification-log.md` records the independent gradings. The next planned change is wiring
`projectId` into the plan generator, and it must not be done until at least one blueprint has been
approved through the product.
