# Session CC-20261028-w7k5 — Phase 2 deployed, migrated, and the guard that cried wolf

Continues `CC-20261028-w7k5-phase2.md`. PR #3539 merged as `abd8f688` on 2026-10-31 at 19:36Z.
This log covers getting it into production, applying the migration, verifying it against real rows,
and the one real defect that showed up in the process.

Tickets: **AF3.7** — https://app.basecamp.com/3945211/buckets/7463955/todos/10462839544
and **AF3.8** — https://app.basecamp.com/3945211/buckets/7463955/todos/10463597994

---

## What was already true when I looked

**The code was already live, deployed by another session.** Prod runs main's TIP, not my commit, and
by the time I checked, main had moved four merges past `abd8f688` to `499592ee`. That tip's image
built `completed/success`, and the registry-mode deploy ran at 10:59:05Z and 11:00:59Z. All four of
my new modules were present in the running container, compiled 10:55-10:56.

So there was nothing for me to deploy. Worth recording because the honest check is not the deploy
log, it is whether the FILES are in the container: `abd8f688` is an ancestor of `499592ee`, verified
with `git merge-base --is-ancestor`, and `ls dist/db/ensureAgentDomainStoryLadderSchema.js` inside
the container is what actually proves the code shipped.

I did not start a deploy of my own. A backend container reporting `Up 2 minutes` and a held
`/var/lock/colaberry-deploy.lock` meant another session was mid-run, and two concurrent deploys on
this host have produced a 521 before.

---

- [x] Apply the autonomy release migration to production and verify it by query
  - Date: 2026-11-01
  - Session: CC-20261028-w7k5
  - What changed: no code. `node dist/scripts/migrateAgentDomainAutonomyReleases.js --apply` run in
    the prod backend container, after a dry run against the same live data. **100 releases created,
    513 stories re-parented, 964 projected, 0 failed, 0 unrecognised.** Identical to the numbers the
    pre-flight checker produced against yesterday's snapshot, which is the point of having run it.
  - Verification: queried independently of the script's own report. All ten boards carry exactly 13
    releases (10 rungs + 3 kept, all three retitled "superseded by the ladder"); every rung
    `autonomy:R0..R9` exists on all ten boards; 1,477 stories with **0** lacking a rung, **0**
    lacking a kind, **0** whose `release_key` disagrees with `autonomy_stage`, **0** still on
    `r0/r1/r2`, and **0** carrying a bare un-namespaced rung. Kinds split exactly as the generator
    predicted: 964 release_behaviour + 443 implementation + 50 research + 10 command_center + 10
    legacy_migration. The three kept releases hold **0** stories each. 58 rows carry a
    `verified_at` and all 58 still do.
  - Notes: **Idempotency proved on row versions, not on the script's word.** A second `--apply` run
    reported all ten domains `unchanged`, and the `md5` of every `(id, xmin)` pair across all 1,477
    rows is byte-identical before and after: `b27ffd54e37d2ae15230a90e199223dc`. `xmin` because
    `updated_at` renders to whole seconds through `String(Date)` and would hide a rewrite.

    **The truncation repair is the part only production could confirm.** Exactly **17**
    `implementation` story ids now exceed the old 60-character ceiling - 61 to 69 characters,
    including `curriculum.CAP.certification_item_rubric_review_and_improvement`, which production
    held as `..._improvem`. Those 17 are precisely the rows the planner would have orphaned under a
    superseded release while inserting a duplicate of each beside them. All 17 are parented on the
    rung their `autonomy_stage` names, and there are **0** duplicate `story_id` groups.

    One verification query of mine was wrong before it was right, and the first answer was
    frightening: "62 rows still sit at exactly 60 characters" reads as 62 surviving truncations. It
    is not. An id can legitimately be 60 long. The real signature is an id that is a strict prefix
    of another id in the same project - and the blunt version of that test returned 964 pairs,
    which is exactly the count of rung stories, because `X` and `X.autonomy:Rn` are a prefix pair
    **by design**. Excluding that one legitimate relationship gives **0**. A test whose failure
    count equals a by-design population is measuring the design, not a defect.

- [x] Fix the ladder schema assert, which reports a violation that is not real on every boot
  - Date: 2026-11-01
  - Session: CC-20261028-w7k5
  - What changed: `db/ensureAgentDomainStoryLadderSchema.ts` - the introspection query now filters
    `table_schema = 'public'`, matching its own sibling `ensureAgentDomainProjectSchema`, and the
    problem strings name `public.student_tasks.*` so the next reader knows which table was judged.
    New `db/__tests__/ensureAgentDomainStoryLadderSchema.integration.test.ts`, 7 tests against a
    real Postgres 16 holding two schemas.
  - Verification: 7/7 green. **Then mutation-tested**: with the `table_schema` filter removed, 3 of
    the 7 fail, including the two controls. A suite that passes against the broken code proves
    nothing, and this one had to be shown to have teeth rather than asserted to.
  - Notes: On the first production boot after Phase 2 shipped, the backend logged
    `agent_domain_story_ladder_schema_invariant_violated` at `level: 'error'` saying `story_id` was
    still `varchar(60)`. It was not. All four DDL statements had succeeded - no
    `ladder stmt skipped` warning appears anywhere in the logs, while other modules' skipped
    statements do - and `public.student_tasks.story_id` was `varchar(120)`.

    This database holds **three** tables named `student_tasks`: `public`, plus the frozen backups
    `snap_quincy_20260819` and `snap_quincy_20260819_after`. The four statements are unqualified and
    so correctly touched only `public`; the assert's query filtered on `table_name` alone and saw
    all three. With no `ORDER BY` the `Map` keeps whichever row arrived last, so **the verdict was
    arbitrary** - it resolved to a backup still at 60.

    Being loud was the lucky direction. Reversed, the same omission is silent: a `public` column
    that genuinely was never widened, masked by a backup that happens to be wide enough - a
    post-condition announcing success over the exact failure it exists to catch. That is now a test
    (`CONTROL, THE SILENT DIRECTION`), and it is one of the three that fail without the fix.

    It also mattered more than a noisy log line because the event's own `impact` text says *"the
    release migration must not run"* and its `remedy` sends the reader to re-run statements that had
    already succeeded. The guard did not just cry wolf, it gave instructions that were wrong.

    Not a design question: 48 occurrences across 37 files already filter on `table_schema`. This
    file was the outlier in its own family. `ensureBrandPixelSchema.ts` has the same gap; it checks
    presence only, it is not this ticket's owner, and it is recorded on AF3.8 rather than quietly
    changed.

## Not done, and why

- **The three unowned domains** — `executive` (212 stories now), `learner_success` (116),
  `website` (92) — are still untouched. An owner decision.
- **R8 remains a specification, not a deliverable.** Agent-to-agent handoff does not exist in this
  platform, so every R8 story carries that disclosure. Whether those move to the `platform` domain
  is a scoping call for the owner.
- **Phase 3** (wiring `evaluatePromotion()`, 22 refusal codes and still zero callers, plus the tool
  grant endpoint in AF3.5) is not started. It now has a rung to be promoted from.
