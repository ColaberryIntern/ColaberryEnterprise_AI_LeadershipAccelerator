# L8.1 — Release packet: migration order, activation control, prior SHA, rollback

Ticket L8.1 · Acceptance LC-18 · Approver: Ali · Drafted 2026-11-02, session `CC-20261021-h9v3`

> **Success metric (the ticket's own words):** "The exact reviewed head is identified, and the
> rollback is a command someone can run, not a paragraph."

**Status: DRAFT, amended 2026-11-22 by the spine closeout, and it still cannot close.** L8.1's
stated input is L7.6, whose remaining half is an *independent* scope-and-evidence review, a second
pair of eyes rather than a check that can be run. That is still the open input, and this amendment
does not claim otherwise.

What the amendment does change is section 2. **The draft said this release carried no migration.
That is no longer true**, and a release packet that understates its own schema change is worse than
no packet, because the reader stops looking. The spine closeout adds three columns to `projects`.
Section 2 is rewritten against that, and section 1 carries this branch's head.

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

### The spine closeout head (amended 2026-11-22)

| PR | Branch | Head SHA | Checks |
|---|---|---|---|
| the spine closeout PR | `workstream/spine-closeout-connected-demo` | `990bdc6d6bee6fc47c947118f38240e122ed43b3` | recorded on the PR |

- **Reviewed head SHA:** `990bdc6d6bee6fc47c947118f38240e122ed43b3`

**Read that value as of packet time, not as of merge time.** A branch head moves with every
further commit, so the authoritative value is always
`gh pr view <n> --json headRefOid --jq .data`, exactly as the two rows above were read. The SHA
recorded here is the head this packet was written against; a test asserts it is a real commit in
this branch's history, so it cannot become a number that resolves to nothing.

**Prior SHA, the rollback target for this release.** `origin/main` immediately before the merge,
which is the value to read on the day rather than one to copy from here. The rule from the draft
stands: record what `origin/main` actually was before the merge, not a value written in advance.

## 2. Migration order

### The spine closeout release (amended 2026-11-22)

**This release carries one migration.** `ensureConnectedDemoSchema` adds three columns to
`projects`:

| column | type | default |
|---|---|---|
| `demo_share_token` | `TEXT` | null |
| `demo_share_enabled` | `BOOLEAN NOT NULL` | **`false`** |
| `demo_spec` | `JSONB` | null |

Four properties of it decide the order, and each is a property of the code rather than a promise:

1. **It is additive.** Every statement is `ADD COLUMN IF NOT EXISTS`. No existing column is
   altered and no row is rewritten, so there is no backfill and no lock beyond the catalog update.
2. **It is idempotent.** A second run is a no-op, which is what makes a re-deploy and a rollback
   safe to repeat.
3. **It runs at boot**, from `server.ts`, before the routes bind. There is no separate migration
   step to remember and therefore no window in which the code is live and the columns are not.
4. **It REJECTS on failure**, unlike `ensureProjectLifecycleSchema` next door, which applies its
   DDL warn-only and whose caller discards the result. The boot call site still catches and warns,
   because a demo feature must never take the platform down, but the failure is now a value the
   caller could act on rather than a log line nobody reads.

**So the order is: deploy, and the schema applies itself on the way up.** The honest caveat is the
one property above that is not costless: because the boot call site warns rather than exits, a database
where the `ALTER` was refused will serve traffic with the feature broken. What stops that being
silent is `demo_share_enabled` defaulting to `false`. Nothing is public until somebody turns one
on, so the first symptom of a failed migration is a demo that will not publish, not a leak.

**A rollback does not drop the columns.** Three unused additive columns on `projects` cost nothing
and dropping them would be the destructive half of a change whose point was to be reversible.
The rollback target in section 4 is therefore a code rollback only.

### The two earlier PRs in this packet's original scope

Both are test-only or additive-with-no-caller:

- #3595 adds test files only. No product file changes behaviour.
- #3598 adds `promotionContract.ts` and `promotionSecondSignature.ts` and splits
  `promotionCriteria.ts`. The new gate has **zero callers**, so no runtime path changes.

Neither requires a schema change, a backfill, or a data migration, and neither needs the other to
land first: they touch different subtrees.

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
