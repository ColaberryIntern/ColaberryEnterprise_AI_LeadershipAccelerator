# CC-20261119-k9r4 — the upload guard that was green while the bug shipped

**Date:** 19 November 2026, Central
**Tab:** marketing ops
**Tickets:** [LIB-5](https://app.basecamp.com/3945211/buckets/7463955/todos/10528817231) (opened today) · out of [LIB-3](https://app.basecamp.com/3945211/buckets/7463955/todos/10506782489)
**PR:** [#4237](https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/4237)

## What this was

LIB-3 found the media library upload refused at 1 MB by nginx. The offer made on that
ticket was to add a CI test pairing every multer-bearing route with an nginx location, so
the next miss would be a red build instead of something Sohail finds by uploading a real
ad. Ali said go.

## The first thing found was that the test already existed

`backend/src/__tests__/nginxUploadLimits.contract.test.ts` was written after this trap bit
three times. Its stated job is to fail when an upload route has no nginx location. It was
green while the library upload shipped broken, and it is still green on main today.

So the work changed shape before it started: not "write the guard" but "work out why the
guard did not guard". That is the more useful question anyway — a guard that misses
silently is worse than no guard, because somebody trusts it.

## Why it missed

The detector matched exactly one spelling of an upload mount —
`<something>Upload.single(` directly inside `router.post('literal'` — and walked `routes/`
only. Six other spellings are in use in this repo:

| Shape | Where |
|---|---|
| local wrapper, `uploadSingle('file')` | `contentLibraryRoutes` — the LIB-3 defect itself |
| wrapper passed by reference, `acceptUploads` | `caseStudyOutsideIntakeRoutes` |
| multer invoked inside the handler | `govQualificationRoutes` |
| path held in a constant | `careerPortfolioRoutes` |
| template-literal path | `explorerKnowledgeRoutes` |
| multer living in a controller | `communityRoomsController` — unreachable, the walk never left `routes/` |

The nginx side had two faults of its own. It read regex `location` blocks only, so an
exact `location =` raise was invisible — which matters directly, because the block
proposed on LIB-3 is exactly that shape, and would have stayed invisible even after being
merged. And its character class excluded `{`, which silently truncates any quoted pattern
containing braces, such as the content-media `[0-9a-f-]{36}`.

## What was actually out there

**26 upload routes exist. The guard was checking 14.**

Nine are raised, seventeen sit at the 1 MB default. Eleven of those seventeen were already
written down as accepted decisions. Six were not:

| Route | multer cap | who |
|---|---|---|
| `/api/admin/marketing/library/file` | 200 MB | the LIB-3 defect |
| `/api/portal/community/rooms/:id/resources/file` | 50 MB | **students** |
| `/api/admin/explorer-growth/knowledge/documents` | 20 MB | staff |
| `/api/admin/factory/contract/:deliveryProjectId/ingest-proposal` | 25 MB | staff |
| `/api/admin/factory/dossier/documents` | 20 MB | staff |
| `/api/admin/gov-contracts/:projectId/sources` | 20 MB | staff |

## What changed

One test file. No source. Nothing in `nginx/` — that stays escalation-tier. The PR records
what is unraised; it does not raise anything.

- the detector follows multer through the module graph (imports, namespace imports,
  wrapper functions, controllers) to a fixpoint, instead of matching one spelling
- it models real nginx precedence: exact, then longest `^~`, then first regex in file
  order, then longest prefix. Which block nginx would *actually pick* is a different
  question from whether some regex in the file happens to match
- params concretize to a 36-character uuid, because several nginx patterns spell that
  length out and a 16-character stand-in reports a raised route as unraised
- the six routes are written into the decision list, so they are visible rather than unknown
- **new control:** a file that carries multer but yields no route fails by name

## Verification

Every claim here was established by making a check fail first.

| Control | Result |
|---|---|
| new upload route with no nginx block | guard failed, named `/api/admin/planted-control/upload` |
| multer mounted in a shape the detector cannot read | guard failed, named the file |
| planted type error, `Backend typecheck` | **not** reported — that gate excludes `__tests__` |
| planted type error, `Test-file typecheck` | reported by name; clean, the file is baseline-clean |
| `jest -c jest.ci.config.ts --ci` | 11 passed |

The typecheck pair is worth keeping: the gate that holds a test file up is
`checkTestTypecheck.js`, not `tsc -p backend/tsconfig.json`, and the former reports a false
zero unless run with `--max-old-space-size=8192`.

## 2026-11-21 — all seventeen raised, decision list empty

Ali chose all six on 19 Nov, then all eleven of the pre-existing exceptions on 21 Nov.

The eleven were not discoveries. They were written down as **accepted** five weeks earlier,
because the only nginx raise ever approved (12 Oct) covered the build-lab path. Seven of
them are routes a student hits: a work submission and a NotebookLM export (50 MB caps), a
certificate (15 MB), a field guide (5 MB), a certification record (15 MB), a signed
internship document (25 MB), a community photo (8 MB). A phone photo clears 1 MB without
trying. A student who gets an HTML 413 from the edge cannot read it and will not file a
useful bug — they stop, and it looks like disengagement rather than a broken upload.

`KNOWN_UNRAISED` is now empty, which created a new hazard: an empty list makes the
"raised or listed" assertion pass trivially, so the suite would be at its greenest exactly
when it was checking least. Two assertions were added for that.

| New assertion | What it stops |
|---|---|
| every upload route raised AND the list empty | the end state asserted directly, not inferred from emptiness |
| nine specific route→limit pairs | a block that raises the **wrong** path, which leaves a real upload broken while every count-based check stays green |

Both proven by planting a failure. Changing the field-guide block from `5m` to `7m` failed
with *"expected 5m, got 7m"*. Deleting the community upload block failed three assertions,
each naming the route. And inserting the eleven blocks *before* removing their list entries
turned the suite red on exactly those eleven and nothing else — which is the step that
proves the blocks match the routes under real nginx precedence, rather than merely looking
correct.

13 tests, 432 lines, green under the real CI config.

## 2026-11-21, later — rebased onto main, and three things main taught us

The branch went `CONFLICTING`. Main had moved: `c6692b15a` (L12.2 intake) added its own
nginx block in the same place. Rebasing onto current main surfaced three things worth more
than the conflict itself.

**1. The guard caught two live upload routes nobody had raised.** Comms Hub event photos
and thumbnail uploads shipped on 20 Nov, after this work started, both at the 1 MB default
with a 10 MB app cap. Found by the test, not by a person. That is the whole point of it,
demonstrated within two days of being written.

**2. The guard had a false positive, and reading real code found it.** It flagged
`/api/admin/comms-hub/events/:id/thumbnails/:thumbId/change`, which carries no multer
middleware at all. Its handler contains `row.source === 'upload'` — the identifier matcher
was reading *inside string literals*. Fixed by blanking quoted strings and comments before
matching, with template literals deliberately left intact (route paths live in them, and
`${...}` is real code; blanking those would trade a false positive for a false negative,
which is the direction that ships broken uploads). A new assertion pins the behavior, with
the sibling `/upload` route as its paired control so it cannot pass by the detector simply
going blind.

**3. The L12.2 author was right about something I had wrong.** Their block sets `26m` for a
25 MB cap, "room for the multipart envelope." `client_max_body_size` is measured against
the *whole request body* — file, multipart boundaries, and any text fields — so a limit set
exactly equal to multer's `fileSize` refuses a file at the **top** of the range multer would
have accepted, at the edge, as HTML. That is precisely the failure this work exists to
remove, and every comment I had written claimed the opposite. All nineteen blocks are now
cap + 1m, so the app's cap is the binding one.

Final state after that pass: 29 upload routes, all raised, decision list empty.

## 2026-11-21, later still — rebased a second time, and it caught same-day work

Eight PRs merged to main while this sat approved, so it went `CONFLICTING` again and the
merge click could not land. Rebasing a second time, the guard failed — on work merged
**hours earlier**.

PR #4288 (Enterprise intake v2) added `config/enterpriseIntakeUpload.ts` and
`controllers/enterpriseIntakeScheduleController.ts`. Both carry multer; neither mounts a
route of its own, so the anti-blind-spot control reported them by name rather than letting
the checked set quietly shrink. Both are now declared. Their route,
`/api/enterprise/intake/:token/files`, was already raised to `26m` — that team had worked
out the multipart-envelope margin independently, which is some evidence the margin is the
right call and not a private theory.

That is three separate occasions in three days where this test found an unraised or
undeclared upload path before a person did.

Final state: **30 upload routes, all raised**, decision list empty, 14 tests, 476 lines.

## Open after this

Nothing to decide. The PR needs Ali's merge, and **nginx must be rebuilt afterwards** — a
merged nginx change is not live until then. Verify with `nginx -t` in the container, then
an upload over 1 MB. The control worth running is a file over the route's own cap: it
should be refused by the app with JSON, which proves the limit moved rather than vanished.

## Trap worth remembering

Three worktrees' worth of local tooling disagree about TypeScript: the workspace root
carries 4.9.5 while `backend/package.json` requires ^5.7.3, so a local `tsc` run is a
phantom. `backend/node_modules` has to be junctioned from a worktree that ran
`npm install` inside `backend/`, which is also the layout CI builds.
