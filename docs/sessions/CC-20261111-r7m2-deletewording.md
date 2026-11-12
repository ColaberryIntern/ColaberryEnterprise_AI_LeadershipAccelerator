# Session CC-20261111-r7m2 — the student delete control says "Delete"

Follow-on from the admin soft-delete work. Swati emailed Ali on 2026-11-11 asking him to delete a
project because she could not find a delete option in Project Studio.

## She was right, and the control was there the whole time

The student-facing control existed, on the Projects page, labelled **Remove**. The archived list
was headed **Removed builds**. The confirmation dialog said **Remove "..."?** and asked an unnamed
build to be confirmed by typing **REMOVE**.

The word "delete" appeared exactly once in the whole surface, in a sentence reading *"Nothing is
deleted"*. So someone searching for a delete option found nothing, which is precisely what happened.

- [x] Rename the student control to the word people search for
  - Date: 2026-11-11 · Session: CC-20261111-r7m2
  - What changed: the button and its aria-label, the archived-list heading, the dialog heading, the
    loss-list heading, and the confirmation word. `ProjectsPage.tsx` and `ArchiveProjectDialog.tsx`.
  - Verification: frontend `tsc` 0 errors in `src/`; `CI=true npm run build:frontend` compiled with
    no warnings; **853 tests pass** across the 74 projects suites.

### The bug this introduced, and caught

Renaming the rendered instruction to "type DELETE" left `requiredPhrase` comparing against
`'REMOVE'`. The confirm box would have asked for one word and accepted only another, so an unnamed
build could never be deleted at all.

Fixed by extracting `CONFIRM_WORD` and using it in **both** the comparison and the copy, so they
cannot drift apart again. A shared constant is the fix; noticing twice is not.

### Honesty, relocated rather than removed

The dialog used to say "Nothing is deleted", which was true when the button said Remove and becomes
a contradiction when the button says Delete. It now reads:

> This takes it off your Projects page. **It is recoverable** — nothing is erased, and you can put
> it back from *Deleted builds* at the bottom of this page.

That is a stronger sentence than the one it replaced: it says where the project goes and how to get
it back, rather than only what did not happen.

### Two tests updated, neither relaxed

`ArchiveProjectDialog.test.tsx` asserted the literal strings "Nothing is deleted" and
`Remove "Student Early Warning"?`. The PROPERTIES they guard - the dialog leads with reversibility,
and the heading names the project - are unchanged and still asserted; the reversibility test is now
stricter, checking three separate claims instead of one phrase.

### Not done

- **Project Studio still has no delete control.** The rename makes the existing control findable
  for anyone on the Projects page; it does not put one where Swati actually looked. That is a
  larger change and is Ali's call.
- Not deployed.

## Merged

PR #3924 merged 2026-11-12 00:18Z as `15008280`, which is the tip of `main`.

Verified by **file content on `main`**, not by the merge status: `CONFIRM_WORD = 'DELETE'` at
`ArchiveProjectDialog.tsx:53`, `requiredPhrase` reading from it at `:152`, the dialog heading
`Delete “…”?` at `:175`, and `ProjectsPage.tsx` rendering `aria-label={`Delete ${p.name}`}` at
`:217` plus the `Deleted builds` heading at `:899`. A merge that reports success and a merge whose
content landed are two different claims; this is the second one.

https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/3924

### Not live yet

This is a **frontend** change, so merging it changes nothing a student can see. The bundle is
baked into the nginx image at build time, so it needs the `Build images` run on `15008280` to
publish, then a registry-mode deploy that rebuilds nginx. Deploy pending that run.

---

## The rename was HALF DONE, and the half that shipped was wrong

Deployed, then verified the live bundle by grepping the served chunk rather than trusting the
deploy's exit code. The chunk contained **both** vocabularies at once:

```
NEW FOUND in /static/js/3058.d70b6b3d.chunk.js   ("Deleted builds")
OLD FOUND in /static/js/3058.d70b6b3d.chunk.js   ("Removed builds")
```

Four user-facing strings were never renamed, all in `ArchiveProjectDialog.tsx`:

| Line | Shipped text | Why it matters |
|---|---|---|
| 244 | button: **"Remove this build"** / "Removing…" | the heading said *Delete "X"?* and the button the student actually clicks said Remove |
| 231 | hint: *restore it from **"Removed builds"*** | **an instruction to a section that no longer exists** - the heading had just been renamed to *Deleted builds* |
| 84 | "**Removing** it moves you to X." | old verb |
| 86 | "**Removing** it leaves you with no active build." | old verb |

Line 231 is the one that did real harm. Before the rename it was correct. After it, the dialog
told a student to look for a label that was not on the page. **The change made one sentence
worse than it found it**, which is a different and more serious thing than leaving a word alone.

### Why 846 green tests did not notice

Measured, not assumed. Reverting both files to the shipped commit `15008280` and running the
suites gives **846 passed, 9 skipped, 0 failed** with the bug fully present.

The cause is in the test file itself:

```js
const removeBtn = () => Array.from(container.querySelectorAll('button'))
  .find((b) => (b.textContent || '').trim().startsWith('Remove this build'))
```

**The helper that finds the button matched the old label.** So the button never changed, and the
tests that press it kept passing because they were looking for exactly what was still there.
Every assertion in the suite was about the presence of some string; not one was about the
absence of the old vocabulary. Presence and absence can both be satisfied at once, and for one
deploy they were.

- [x] Finish the rename, and make a partial one fail
  - Date: 2026-11-11 · Session: CC-20261111-r7m2
  - What changed: the four remaining strings; `removeBtn` -> `deleteBtn`; four new tests in a
    new `the dialog speaks one word for the action, everywhere` block.
  - Verification: **mutation-tested** - reintroducing the two shipped strings fails 9 tests,
    including all three vocabulary tests; reverting passes 26/26. `tsc` 0 errors in `src/`
    **with a planted control error proving tsc was grading this tree**; `CI=true npm run
    build:frontend` compiled; **850 passed / 9 skipped** across the 74 projects suites
    (846 before, +4 new).

### Correction to the previous entry

The entry above claims "853 tests pass". That number is wrong. The measured baseline at
`15008280` is **846 passed, 855 total**. Nothing was derived from the wrong figure, but a
verification line that cannot be reproduced is worth less than no figure at all, so it is
corrected here rather than quietly left.

### What this says about the first PR

The first change was not wrong in intent and its headline claim held - the control is now called
what people search for. It was wrong in **completeness**, and it was reported as finished. The
lesson is not "rename more carefully"; it is that a vocabulary change needs a test asserting the
old vocabulary is **gone**, because that is the only assertion a half-finished rename can fail.

## Merged (the completion)

PR #3927 merged 2026-11-12 01:09Z as `3d443b81`, the tip of `main`.

Verified by content on `main`, both directions - the five new strings present, and **all four old
strings at zero**:

```
Delete this build                 -> 1      Remove this build  -> 0
Deleting…                         -> 1      Removing…          -> 0
restore it from “Deleted builds”  -> 1      Removed builds     -> 0
Deleting it moves you to          -> 1      Removing it        -> 0
Deleting it leaves you            -> 1
```

Checking the absence is the whole point of this PR, so the verification checks it too rather than
only confirming the replacements arrived.

https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/3927

### A trap worth recording

`git fetch origin main` in this worktree **exits 0, writes `FETCH_HEAD`, and does not advance the
`refs/remotes/origin/main` ref.** Branching from `origin/main` after a fetch put me three commits
behind on a branch I was about to build on - it silently based work on an ancestor of my own merge
commit. Caught because the session-log file showed as untracked when it is committed on `main`.

The remote tip has to come from `gh api repos/<r>/commits/main`. `git update-ref` repairs the ref
only when the object is already in the local store - it worked for `15008280` (pushed from here) and
**failed** for `3d443b81` with "nonexistent object", because a merge commit GitHub created was never
fetched. So the API SHA is the source of truth for *what* the tip is; it is not by itself enough to
make the local ref usable. Both PRs in this session were branched using the API SHA for that reason.

## Deployed and verified on the live surface

Main moved twice during this. The first real deploy attempt **refused**, correctly:

```
[deploy] FAILED: HEAD (3d443b81…) is not origin/main (529e72ec…). Refusing to build.
```

Another session merged #3931 between the dry run and the deploy. The guard did its job - a dry
run is a snapshot, and the only safe thing to do with a moved tip is stop. Re-checked that
`529e72ec` was 2 ahead / 0 behind my merge and still carried the fix, waited for its image, and
deployed that.

- [x] Deploy the completed rename to production
  - Date: 2026-11-11 · Session: CC-20261111-r7m2
  - What changed: nginx recreated from `ghcr.io/colaberryintern/accelerator-nginx:main` at
    `sha-529e72ece08d2b1474aa30d5554891e8979eb8de`. Registry mode. Frontend only; backend
    untouched, which is why only nginx was named.
  - Verification: **the served bundle, not the deploy's exit code.** All **193** JS chunks in the
    live `asset-manifest.json` fetched from `https://enterprise.colaberry.ai` and grepped:
    **0 hits for `Removed builds`, `Remove this build`, `Removing it moves you`**; `Deleted
    builds`, `Delete this build` and `Deleting it moves you` all present in
    `static/js/3058.674aee35.chunk.js`. The chunk hash moved from `3058.d70b6b3d` to
    `3058.674aee35`, so this is a new bundle rather than a cached one.
  - Notes: the deploy reported `Container accelerator-nginx Recreated / Started`. The earlier
    deploy of #3924 reported only `Running`, which is the weaker signal - worth reading, since
    "Running" can mean nothing was replaced.

### What is NOT proved

The strings are verified in the shipped bundle. **Nobody has clicked the button in a browser as a
student.** The confirm-word path is covered by unit tests and the archive/restore behaviour did
not change in either PR, so the risk is low - but "the correct text is in the bundle" and "a
student successfully deleted and restored a build" are different claims and only the first one
has evidence.

### Open, and Ali's call

**Project Studio still has no delete control.** Both PRs made the control on the Projects page
findable and consistent. Neither put one where Swati actually looked when she emailed.
