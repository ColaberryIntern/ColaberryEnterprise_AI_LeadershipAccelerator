# Session CC-20261102-k9r4 — the content library

Marketing-ops tab, Basecamp list `10467338643`, group `10506782442` (LIB-1 … LIB-4). One
`loop-architect` run, thirteen tasks, one pull request:
[#3999](https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/3999).

Ali, 2026-11-13: *"I have a bunch of youtube links for all our videos we've been collecting. I want
that to be stored in our system and when creating post, able to use those resources on demand.
sohail has tons of ads he's created and they maybe stored on his computer somewhere, but I want
content stored with us in a way that's easy to manage."*

---

## What was built

One library holding two kinds of thing, because the person looking for "the November ad" does not
know or care which it is:

| | |
|---|---|
| a **file** | bytes on the existing uploads volume, `storage_key` set |
| a **link** | a URL nobody stored, `source_url` set, no key |

`kind` says which, and a database CHECK makes every other combination impossible.

Thirteen tasks: the ingest split out of `attachMedia` (T1); the schema, its unit suite and a
constraint proof against real Postgres (T2–T4); model fields and the enumerated consumer audit
(T5–T6); the pure logic (T7); `attachExistingAsset` (T8); six routes (T9); the library screen,
the hub card and the composer picker (T11–T13). T10 was dropped in plan v4 — it aimed at lifting
`videoSource` state, which is pre-commit UI state gated on `content_type === 'video'`, so a link
picked for an image or text draft had nowhere to land.

## The decisions, so they are not re-litigated

Ali, 2026-11-13: one library for links and files; files stay on the **existing local uploads
volume** — no S3, no new paid dependency; Sohail uploads his back catalogue himself; rights are
**recorded and warned on, never hard-blocked**; and on the landing-page collision, **warn and
confirm** rather than replace silently.

## What review caught that CI could not

Every task was graded by an independent verifier. Several failed first time, and the findings were
real. These are recorded because each one is a class of mistake rather than a one-off.

**A new test file broke a file it never touched.** A `.ts` file with no top-level `import` or
`export` is a *global script*, so its top-level `const`s land in global scope. The new integration
suite declared `HAS_DB` and `describeIfDb` exactly as `ensurePublishingSchema.integration.test.ts`
does, and tsc reported "cannot redeclare block-scoped variable" twice in **each** file.

**A 300-second CI hang from a design that read as careful.** Every probe ran inside one
transaction with a SAVEPOINT each, so nothing would commit. But a probe there *expects* an insert
to fail, and once a statement fails inside a Sequelize transaction that transaction is finished as
far as Sequelize is concerned — the next query waits on a connection that never returns. One
savepoint was also named `cross`, a reserved keyword, which aborted the outer transaction and
poisoned four probes including the control whose whole job was proving the others were not vacuous.

**A probe that read the wrong error field.** Sequelize v6 wraps SQLSTATE 23505 as a
`UniqueConstraintError` whose own `.message` is the string `"Validation error"`; the constraint
name lives on `.parent` / `.original`. The duplicate-link probe would have failed against an index
that worked perfectly.

**A post-condition nobody could see fail.** The stated acceptance was "throws when the constraint
is dropped", which was unobservable against the combined entry point: it re-runs the DDL before
checking, so a dropped constraint is silently re-created. `assertMediaLibrarySchema` is now
exported separately and the suite drops the constraint, the index and the nullability in turn.

**Two fields that were computed and then discarded.** `kind` and `will_publish` were added to the
confirmation service and dropped one call later by `buildConfirmation`, which re-maps each asset to
exactly five fields. tsc cannot see this — excess properties on a variable's element type are not
checked at the call site — so the service compiled, CI stayed green, and the PR body described an
effect the code did not have.

**A picker that did not exist on a new post.** The worst one. It was mounted inside the composer's
`mediaSlot`, which is `null` whenever `setupShape(content_type).mediaRole === 'none'` — `text` and
`poll` — and `EMPTY_SETUP` starts a draft as `text`. The gate was in the host component, not in the
picker, so typecheck and build were green on it. Moving it to a sibling of `ComposerSetup` also
fixed two others: the tiles had been squeezed into a third-width column, and pressing Enter in the
search box submitted the form.

**Two claims of mine that were simply untrue.** A comment said the hidden file input stays in the
DOM "so assistive tech sees a labelled control" — of an element marked `aria-hidden` with
`tabIndex={-1}`. And a `CAUTION, AND IT IS NOT THEORETICAL` note about Sequelize sharing one array
reference across instances was written on advice that was afterwards retracted: `toDefaultValue`
does `if (Array.isArray(value)) return value.slice()`. Both removed.

## Two things the audit got wrong, checked rather than accepted

The reader audit said `ensureContentOsSchema.ts:146` must change and that the pinned
`media_assets: 20` column count would break. Both assume the new columns were added to the
`CREATE TABLE`. They were not — they arrive by `ALTER` in a separate module, which that file's own
parity suite *requires*, since it asserts the content-OS DDL contains no `ALTER TABLE`. Proven
rather than argued: the integration suite inserts link rows with a null `storage_key` against a
real Postgres built from that file unchanged.

## Not fixed, and why

**nginx will refuse a library upload over 1 MB at the edge.** The raise in `nginx/nginx.conf` is a
regex location matching only `^/api/admin/content/[0-9a-f-]{36}/media$`; the library's upload path
does not match it, so a file over 1 MB is a 413 with an HTML body before multer's cap is reached.
That file already records this same mistake twice — the gov `attest-zip` path "was added AFTER this
block and missed the list". `nginx/` is escalation-tier under CLAUDE.md, so the route documents the
trap and the change is the DRI's call. Since Sohail uploading his back catalogue is the point of
the feature, it will bite on his first real ad.

## State at the time of writing

Built and CI-green; **not merged, not deployed, not production-verified**. A merged frontend change
is not live until nginx rebuilds, so neither the library screen nor the picker appears from the
merge alone. T14 (ship) and T15 (handoff plus two PDF artifacts per ticket) remain.

One process note worth keeping: the ref for the final review-fix commit was updated through the
GitHub Git Data API at almost the same moment the PR was marked ready for review, and no
`pull_request` event fired — the PR head stayed on the previous commit and no CI ran for forty
minutes. The CI workflow has no `workflow_dispatch`, so the only remedy is another commit. This log
is that commit.
