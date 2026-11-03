# L8.1 — Release packet: migration order, activation control, prior SHA, rollback

Ticket L8.1 · Acceptance LC-18 · Approver: Ali · Drafted 2026-11-02, session `CC-20261021-h9v3`

> **Success metric (the ticket's own words):** "The exact reviewed head is identified, and the
> rollback is a command someone can run, not a paragraph."

**Status: DRAFT, and it cannot close tonight.** L8.1's stated input is L7.6, which is still open
because its remaining half is an *independent* scope-and-evidence review — a second pair of eyes,
not a check that can be run. Everything below is ready for the morning.

---

## 1. The exact reviewed heads

Read from the PRs, not from intent (`gh pr view --json headRefOid`):

| PR | Branch | Head SHA | Checks |
|---|---|---|---|
| [#3598](https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/3598) | `workstream/af63-two-signature-gate` | `77af776c0233dfa63c9a25b08540b824f4773c87` | 11/11 green |
| [#3595](https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/3595) | `workstream/lc10-pin-approver-identity` | `e6be7a97e76c596af1521163492263b8a6ed4519` | 11/11 green |

**Prior SHA — the rollback target.** `origin/main` at the time of writing:

```
fc70cb41627c13712eac300ca314dc659f0d1c35
```

That is the commit to roll back *to* if either merge turns out badly. Record the value that is
`origin/main` immediately **before** the merges, not this one, if anything else lands first.

## 2. Migration order

**There is no migration in these two PRs.** Both are test-only or additive-with-no-caller:

- #3595 adds test files only. No product file changes behaviour.
- #3598 adds `promotionContract.ts` and `promotionSecondSignature.ts` and splits
  `promotionCriteria.ts`. The new gate has **zero callers**, so no runtime path changes.

So the order is simply: merge, then deploy. Neither PR requires a schema change, a backfill, or a
data migration, and neither needs the other to land first — they touch different subtrees.

The Phase 5 lifecycle tables are already applied and are **additive**. A rollback does not drop
them, which matters for step 4 below.

## 3. Activation control

### What is already on, and this is the finding

`ENABLE_PROJECT_LIFECYCLE` is **`true` in production right now**, set durably in
`/opt/colaberry-accelerator/.env`. Measured 2026-11-03 against the `colaberry-accelerator` compose
project.

**The run ledger disagrees**, recording it as *"unset — activation is Phase 8, a documented hard
stop."* The ledger is stale. Something turned the flag on and nothing wrote it down, which is worth
more attention than the flag itself: a ledger that disagrees with production about whether a
feature is activated cannot do the one job it exists for, which is resume.

Two consequences:

1. **L9.1 is dead.** Its 409 is the flag-dark refusal
   (`projectLifecycleRoutes.ts:57,98,157,234` → `409 { lifecycleDisabled: true }`). With the flag
   on, that path is unreachable. Close L9.1 as permanently unobservable, with this as the reason.
2. **L0.4's "deployed versus activated" column has a real answer for the review surface**: it is
   activated, not merely deployed.

### What is still off, and must stay off

| Control | State | Note |
|---|---|---|
| `ENABLE_PROJECT_LIFECYCLE` | **on** | route-level enforcement, live |
| Story authorization gate | **unarmed** | `decomposeService.ts:141` is `if (opts.projectId)`, and `sbpOrchestrator.ts:328` calls `decomposeBuild({brief, document, targets, correlationId})` with no `projectId`, so the gate is unreachable |

**Arming that gate refuses all 62 legacy student builds** — they predate the registration hook and
hold no lifecycle row. It needs either an approved blueprint through the product first, or the same
`LIVE_SINCE` cutoff the registration check already uses. It is L8.4 and it is not a deploy-time
decision.

## 4. Rollback — a command, not a paragraph

```sh
# on the production host, from the stack directory
./scripts/rollback-lifecycle-release.sh --to fc70cb41          # rehearses, changes nothing
./scripts/rollback-lifecycle-release.sh --to fc70cb41 --apply  # does it
```

### ⚠️ The recorded rollback procedure no longer works, and this is why the script exists

`deployment-log.md` documents the rollback as:

```sh
SKIP_PULL=1 ALLOW_DETACHED_HEAD=1 ./scripts/deploy-prod.sh backend nginx
```

That was correct when `DEPLOY_MODE` defaulted to `build`. **It was flipped to `registry` on
2026-10-18** (`deploy-prod.sh:120`). Registry mode then runs this guard unconditionally:

```sh
D_MOVING=$(docker manifest inspect "${IMAGE}:main"            | sha256sum)
D_PINNED=$(docker manifest inspect "${IMAGE}:sha-${HEAD_SHA}" | sha256sum)
if [ "$D_MOVING" != "$D_PINNED" ]; then
  fail "${IMAGE}:main does not match sha-${HEAD_SHA}. Pulling :main would deploy a different commit."
fi
```

On a rollback `HEAD_SHA` is the **old** commit while `:main` points at the **new** one, so the
digests differ *by definition* and the deploy is refused.

**The guard is right.** `docker-compose.production.yml` names
`image: ghcr.io/colaberryintern/accelerator-backend:main` — a moving tag — so a registry pull would
fetch the very release being rolled back. But it means the documented procedure stalls on a
confusing message at the exact moment nobody wants to debug a deploy script. The script forces
`DEPLOY_MODE=build` and says so in its own output.

### What the script refuses, each one exercised before shipping

| Guard | Proven by |
|---|---|
| no `--to` target | refused: "a rollback target is a decision" |
| a sha that is not a commit | refused |
| the commit already running | refused — "a no-op that would report success" |
| a commit that is **not an ancestor of `origin/main`** | refused — "that is not a rollback, it is a deploy of something unreviewed" |
| tracked files modified | refused before `git checkout` discards them |
| not on the production host | refused |
| the positive path | rehearses, prints the three exact commands, exits 0 |

It also **never touches `ENABLE_PROJECT_LIFECYCLE`**. Rolling back code and deactivating a feature
are two different decisions, and conflating them is precisely how a rollback "silently restores an
ungoverned creation path" — which is LC-18's stated concern. The flag is printed, never changed.

### Where it can and cannot be exercised

It runs **only on the production host**: it checks out a commit and calls `deploy-prod.sh`, which
takes the per-box deploy lock shared with the dev stack. The guards above were exercised in a local
worktree; the *deploy* half has never been rehearsed anywhere but production, and the honest
statement is that `DRY_RUN=1` is the first thing it runs for exactly that reason.

## 5. The deploy, once merged

```sh
cd /opt/colaberry-accelerator
git fetch origin && git checkout main && git pull --ff-only
./scripts/deploy-prod.sh backend nginx
```

Notes that have cost time before:
- Backend takes **60–90s** to bind 3001. A 502 inside that window is timing, not failure.
- **Never** two concurrent `deploy-prod.sh` runs, and never `--build nginx`.
- `EXPECT_MARKER` / `EXPECT_IN` proves the change is *in* the container. A deploy that cannot name
  what it shipped has only proved something restarted. Neither PR ships a runtime marker, because
  neither changes runtime behaviour — so for these two, the honest verification is the test suites
  and `git rev-parse HEAD` on the box matching `origin/main`, not a marker grep.
