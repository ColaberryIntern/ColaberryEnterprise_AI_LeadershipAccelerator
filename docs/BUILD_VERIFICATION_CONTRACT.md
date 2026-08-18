# Build Verification Contract

**How the platform learns that a student's story is actually finished.**

Status: implemented, not yet deployed. Scope: the Student Build Pipeline (SBP)
workspace repos under the `ColaberryIntern` org.

---

## 1. The loop, end to end

```
  PLATFORM                          STUDENT'S REPO                    PLATFORM
  ────────                          ──────────────                    ────────

  publish plan ──▶ renderDocs ──▶ .colaberry/progress.json
                                  (every story, every criterion,
                                   all passed:false)
                                  CLAUDE.md managed block
                                  (tells Claude Code what
                                   finishing a story writes)

                                        │
                                        │  student + Claude Code build
                                        ▼

                                  progress.json  ── passed:true, files_touched
                                  git commit     ── "Story: STORY-001" trailer
                                  git push

                                        │
                     student presses    │
                     "Sync from GitHub" │
                                        ▼

                                  repoProgressReader ──▶ verifyDecision (pure)
                                  · progress.json raw          │
                                  · commits + changed files    │
                                                               ▼
                                              student_tasks.verification_json
                                              (every story, every sync)

                                              markTaskVerifiedComplete
                                              recordEvidence('github_commit')
                                              (verified stories only, once)

                                                               │
                                                               ▼
                                              project tree DTO
                                              → portal + the student's own
                                                Command Center
```

Two artefacts leave the platform and one comes back. The managed block in
`CLAUDE.md` is the instruction; `.colaberry/progress.json` is the channel.

---

## 2. Why a JSON file the agent maintains

Three options were on the table. This one won.

| Option | Why not |
|---|---|
| **Parse commit messages** | Commit messages are prose. Students amend, squash and rewrite them; models phrase them differently every time. Any parser is guessing, and a guess that awards credit is worse than no parser. |
| **Scrape markdown checkboxes** in `docs/stories/STORY-nnn.md` | Those files are the student's — they are explicitly invited to edit and restructure them. A regex over `- [x]` breaks the first time somebody reorders a list or rewraps a line, and it breaks silently. |
| **A JSON file the agent maintains** ✅ | Deterministic to read, survives reformatting, and validated at the boundary. Decisive factor: we already control the instructions the agent follows, through the managed block in their `CLAUDE.md`. A structured file we ask for in that block is the one artefact we can specify exactly and check exactly. |

---

## 3. What counts as DONE

> **Decision — Ali Muwwakkil, 2026-08-14.** DONE = ticked acceptance criteria
> **and** a commit. Both required. Neither sufficient alone.

Concretely, a story reaches `verified` when **both** hold:

1. **Every** acceptance criterion on that story is marked passing in
   `.colaberry/progress.json`. Not a majority, not the important ones — all of
   them. The criteria list comes from the **stored published plan**, never from
   the file.
2. **And** there is a commit in the repo that changes at least one file and
   names the story: a `Story: STORY-nnn` trailer on its own line, or the story
   id in the commit's subject line.

The subject-line fallback is not generosity. The definition-of-done text has
shipped in every rendered student `CLAUDE.md` since the pipeline started writing
them, telling students to write `STORY-001: add the roster endpoint`. Refusing
to honour that would mean the platform stopped recognising work that followed
the instructions it gave.

### Tests passing in CI is NOT the bar today

Deliberately. Most student repos have no CI, and gating credit on a pipeline
that does not exist would leave a cohort permanently unverified.

**Where it slots in when we raise the bar:** a third clause in `decideStory`
(`backend/src/services/sbp/verification/verifyDecision.ts`), alongside the
criteria check and the commit check — plus a `checks` field on `CommitFact`
populated by the reader from the GitHub Checks API for the evidence commit's
sha. The reader already fetches per-commit detail, so it is one more field on a
call that is already being made. No part of the loop's shape has to change.

---

## 4. The schema

`.colaberry/progress.json`, `schema_version: 2`. Validated with Zod at the read
boundary (`backend/src/services/sbp/verification/progressContract.ts`).

v2 added the platform-owned `verification` block per story and the `totals`
rollup, so a static page can render build progress with no API. Both are
optional, and v1 files still read — see the version rule in §4.1 below.

```json
{
  "schema_version": 2,
  "project": "Sponsor Dashboard",
  "totals": {
    "stories_total": 1,
    "stories_verified": 0,
    "stories_submitted": 1,
    "stories_in_progress": 0,
    "stories_not_started": 0,
    "criteria_total": 2,
    "criteria_passed": 1,
    "points_awarded": 0
  },
  "stories": [
    {
      "id": "STORY-001",
      "release": "R1",
      "acceptance_total": 2,
      "criteria": [
        {
          "text": "The roster endpoint returns 200 with a list of members",
          "passed": true,
          "evidence": "GET /api/roster returns the 4 seeded members"
        },
        {
          "text": "An unauthenticated caller gets 401",
          "passed": false
        }
      ],
      "files_touched": ["src/routes/roster.ts", "src/services/rosterService.ts"],
      "tests_added": ["src/services/__tests__/rosterService.test.ts"],
      "notes": "401 path blocked on the auth middleware landing in STORY-002",
      "updated_at": "2026-08-14T09:12:00Z",
      "verification": {
        "state": "submitted",
        "criteria_passed": 1,
        "criteria_total": 2,
        "verified_at": null,
        "commit_sha": null,
        "commit_url": null,
        "commit_at": null,
        "points_awarded": null,
        "outstanding": ["An unauthenticated caller gets 401"]
      }
    }
  ]
}
```

**Who owns what.** The platform owns `schema_version`, `project`, the story
list, `release`, `acceptance_total`, the `text` of every criterion, and — new in
v2 — the whole `verification` block and the top-level `totals` rollup. Claude
Code owns `passed`, `evidence`, `files_touched`, `tests_added`, `notes`,
`updated_at`.

**Do not write `verification` or `totals` from the repo side.** They are the
platform's own conclusion, mirrored down so a static page can render it without
an API. Anything an agent writes there is overwritten on the next sync, and a
page that trusted it would be showing a number its reader could have typed
themselves. `mergeProgressFile` merges the agent's side up and re-derives these
two from the platform's side.

**Nothing volatile lives in this file.** `verified_at` is first-write-wins and
never moves; there is deliberately no `checked_at`. A field that moved on every
run would change the file's bytes every sync, and the writer commits on a
content hash — so the student's git history would fill with commits that say
nothing. Freshness lives in `.colaberry/manifest.json` alone.

**Seeding the criterion text is load-bearing.** The agent flips a boolean rather
than retyping a sentence, so honest claims match the plan exactly and the
rejection path fires only on genuinely invented criteria.

**Republishing merges rather than replaces** (`mergeProgressFile`, applied in
`repoWriter`). Same ownership model as the managed block in `CLAUDE.md`: our
side is replaced, their side is carried across by story id and normalised
criterion text. A criterion the plan **reworded** does not carry its tick over —
the sentence the student ticked is not the sentence now being asked for.

### Rejection is loud, never silent

A malformed file is **rejected with a reason**. It is never downgraded to "an
empty progress file", because those two states look identical to a naive parser
and mean opposite things: one says *you have not started*, the other says *we
cannot read what you did*. Telling a student the first when the truth is the
second sends them off to redo work they already did.

| `error_class` | When | What the student sees |
|---|---|---|
| `ProgressFileMissing` | file absent or empty | "Sync your build plan from the portal to get it." — a normal state, not an error |
| `ProgressFileNotJson` | `JSON.parse` threw | "not valid JSON … a trailing comma or an unclosed brace is the usual cause" |
| `ProgressFileSchemaMismatch` | Zod rejected the shape | "does not match the expected shape … it needs a top-level `schema_version` number and a `stories` array" |
| `ProgressFileUnsupportedVersion` | `schema_version` is outside 1…2 | "declares schema_version N, but this platform reads versions 1 to 2" |

The schema-mismatch sentence deliberately does **not** say "sync to restore the
file". The platform writes repo files with `process.env.GITHUB_TOKEN`, and on a
bring-your-own repo that identity often holds only `pull` — so for the student
who most needs the advice, a Sync can never deliver it. The shape is what they
can fix, so the shape is what we name.

A rejected read **awards nothing** and **revokes nothing**. Revocation is not
something this loop does at all.

It does, however, write ONE thing: `verification_json.read_error`, the
student-facing sentence, on every non-verified story of the build. Returning
early having written nothing sounds conservative and is not — the row keeps the
last **readable** verdict and the portal renders it as this push's answer. A
student in exactly that position was shown *"None of the 5 acceptance criteria
are marked as passing yet"* for hours while every sync was failing to parse her
file, and she went back to re-verify code that was already correct. See
`annotateReadError` in `verificationLatch.ts`.

What the annotation may touch is the **prose only**: `state`,
`criteria_passed`, `criteria_total`, `outstanding`, the commit fields and
`checked_at` are all carried forward untouched, because an unreadable file can
neither advance a story nor lower one. Verified stories are skipped entirely,
`verified_at` / `verified_by` / `verified_ref` are never written, and the
operation is a fixed point — re-running a rejected sync converges on one state.

**`read_error` suppresses the outstanding list in the UI.** While it is set,
those criteria are the last verdict we could reach, not a verdict on the push
that just landed; rendering them beside the error would restate the exact lie
the field exists to retire.

### 4.1 The version rule is a RANGE, not an equality

The check accepts `MIN_READABLE_PROGRESS_VERSION`…`PROGRESS_SCHEMA_VERSION`
(currently 1…2) and refuses only the future. The asymmetry is deliberate: a file
from the future is unreadable because we cannot know what its fields mean, while
a file from the past is readable because every bump so far has only ADDED
optional fields.

This is load-bearing, not cosmetic. `mergeProgressFile` falls back to the freshly
rendered file whenever it cannot parse the existing one — so an equality check
would make the v1→v2 bump **silently wipe every criterion every student's agent
had ticked**. Version is also checked BEFORE the shape, so a v3 file reports
"written for a newer platform" rather than "your file is malformed".

---

## 5. Per-story tracking

Stored on `student_tasks.verification_json`, refreshed on every sync, exposed on
the project tree DTO as `task.verification`.

| State | Meaning |
|---|---|
| `not_started` | No entry in the progress file, no commit naming the story. |
| `in_progress` | A commit exists, or the file has an entry, but no criterion passes yet. |
| `submitted` | Some criteria pass but not all — **or** all pass but no qualifying commit. |
| `verified` | All criteria pass **and** a qualifying commit exists. |

### `submitted` is a resting state, not a failure

Most stories live there for a while, and that is the system working. A story at
3 of 4 is `submitted`, and `outstanding` carries the **exact text** of the
criterion still missing so the UI can say what is left rather than leaving the
student wondering why nothing happened. `reasons` carries the same thing as a
sentence, including "no commit in the repo names STORY-001 and changes a file"
when that is the half that is missing.

The two halves fail independently and are tested independently: ticked-but-not-
committed stays `submitted`; committed-but-not-ticked stays `in_progress`.

### Roll-up

`project.build_verification` on the same DTO: stories by state, criteria passed
of total, distinct evidence commits, XP earned, and `last_checked_at`. It is
derived from the per-story verdicts already on the tree, so it can never
disagree with the stories underneath it. `null` until the project has been
synced once — a zeroed roll-up and a never-checked project must not look the
same.

Both the portal and the student's own Command Center read the same DTO. The
Command Center is the student's app hitting the platform API, so exposing the
field on the tree *is* the Command Center surface; no separate endpoint exists
or is needed.

---

## 6. What happens on verification

1. `markTaskVerifiedComplete(projectId, storyId, evidence)` — stamps
   `student_tasks.verified_at` / `verified_by` / `verified_ref`, the last being
   the commit sha frozen at award time. This function existed with **no caller**
   until now; the verification loop is its first and only one. It is still not
   reachable from any route.
2. `recordEvidence({ source: 'github_commit', sourceRef: 'STORY-001@<sha>' })` —
   the commit sha is the evidence reference, so every award traces back to a
   specific push. The story id is prefixed so two stories legitimately finished
   in one commit each get their own record.

### The rule: evidence lives in our database, the repo is only where verification happens

> When a story verifies, the commit sha, which criteria passed, the timestamp
> and the XP are written to **our** tables. If the student deletes the repo,
> revokes our access, or rewrites history, **their record and their points
> survive**. We lose the ability to verify NEW work and nothing else.

`student_tasks.verified_at` is an **immutable latch**. `verification_json` is a
**mutable view** of the last repo read. Three defects were caught by auditing
this loop against that one sentence, and all three were the same mistake — the
repo-derived blob was read as though it were the record: a successful sync of a
repo whose `.colaberry/` had been deleted rendered six verified stories as
`not_started`; a story whose evidence commit aged out of the 100-commit window
silently dropped from `verified` to `submitted` with no misbehaviour at all; and
`xp_earned` was looked up under a key re-derived from the *current* sha, so a
force-push orphaned a banked award and that story read 0 XP forever. The fix is
`applyVerificationLatch` in
`backend/src/services/sbp/verification/verificationLatch.ts`, applied on the
write **and** again in `toTaskVerificationDto` on the read. **If you are adding
a new display surface for verification state, read it through that function and
pass the latch columns with the blob.** Reaching for `verification_json` alone
is exactly what this code did, and it is a reasonable-looking mistake: the blob
is right there, it has a `state` field, and it is correct almost all of the
time — right up until the one moment a student is most likely to panic.

### Idempotency: three independent layers

Reading the same commit twice awards **once**.

1. `markTaskVerifiedComplete` is first-write-wins — a replay never moves
   `verified_at`.
2. Evidence is recorded only on the **transition** into verified (the task had
   no `verified_at` when the run read it).
3. `recordEvidence` keys on `(enrollment, source, sourceRef)` behind a unique
   index, so even two concurrent syncs that both saw `verified_at = null`
   produce exactly one row.

The evidence commit is pinned to the **oldest** qualifying commit, not the
newest, so the reference does not move as the student keeps pushing.

### Points: the number is not set

`points_config` carries a row at `scope='type_default'`, `key='project_story_verified'`,
seeded by `seedBuildStoryPointsConfig()`. **`builder_xp` is NULL.**

Ali has not decided whether a story is worth a fixed amount, or a share of a
fixed per-build budget divided across its stories. Those produce different
numbers. `getTypeXp` resolves NULL to 0, so verification records complete,
auditable, replayable evidence today and moves **zero XP** until somebody sets
the value in the table. No number is hardcoded anywhere in the loop.

Seeding a plausible placeholder was rejected: once it is live it is
indistinguishable from a decision.

---

## 7. Anti-gaming: what is actually true

**A student can open `.colaberry/progress.json` and type `"passed": true` on
every line.** Nothing in this design stops that, and nothing in the code
pretends to.

What the platform actually has:

- **The plan is the authority.** The criteria list comes from the stored
  published plan. A file cannot add a criterion to make itself easier, cannot
  delete criteria to shrink the bar, and cannot claim a story id the plan does
  not have. Invented claims are recorded in `rejected_claims` and counted
  nowhere.
- **A commit is required, and it must change files.** An empty commit is a
  sentence, not work. Faking a verification therefore takes both a hand-edit and
  a real push.
- **The sha is the evidence reference.** Every award names the commit behind it.
  A dispute is answerable by opening that commit and reading the diff.
- **Every award is auditable.** `evidence_records` holds the idempotency key,
  the source ref and the XP; `student_tasks.verified_by` names the verifier;
  every run emits a structured log line with the correlation id. Nothing is
  awarded that cannot be traced.
- **Vacuous truth is refused.** A story the plan gave no acceptance criteria can
  never be verified — "all zero criteria pass" would hand out credit for a
  planning gap.
- **A contradictory file resolves pessimistically.** The same criterion claimed
  both `true` and `false` reads as not passing.

**This is a learning platform, not a payments system.** The point of the loop is
that a student sees honest, specific feedback about what is left on their build,
and that the platform's records match reality when nobody is trying to break
them. It is deliberately not built to survive a determined adversary, because
the only person a student defrauds here is themselves — and the cost of
adversarial hardening (mandatory CI, signed commits, server-side test
execution) is paid by every honest student in friction.

---

## 8. Failure modes

| Failure | Behaviour |
|---|---|
| GitHub rate limit (429, or 403 with a rate-limit marker) | `error_class: RateLimited`, retry-after surfaced. Reported as a rate limit, **never** as zero progress. Nothing written. |
| Repo deleted or renamed | `RepoNotFound`. Nothing written. |
| Platform token cannot read the repo | `Unauthorized` — and the message says it is our side, not the student's. |
| GitHub hangs | `UpstreamTimeout` after 15s. 3 attempts, linear backoff, transient statuses only. |
| Progress file malformed | Rejected with the classes in §4. Nothing written, nothing revoked. |
| Progress file missing | Normal state. Stories judged on commits alone, which by the rule can never reach `verified`. |
| No published plan | `NoPublishedPlan`. Clear state, not a crash. |
| No workspace repo | `NoWorkspaceRepo`. Clear state, not a crash. |
| Plan has a story with no matching task row | Logged as `sbp_verification_task_missing` (it means the student cannot see that story at all) and the rest of the run continues. |
| Verification itself throws | The **sync still succeeds** — the repo pull is what the student asked for. The defect is logged loudly and the response carries `VerificationUnavailable`. |
| Commit window overflow | Only the most recent 100 commits are read, and at most 40 per-commit detail fetches. `window_truncated` says so on the summary. A story whose only qualifying commit is older than the window will not verify — see §9. |

Retry strategy at the boundary: 3 attempts, 300ms × attempt backoff, retrying
**only** 429 and 5xx. A 4xx is terminal, because retrying a request GitHub
already refused just burns the rate limit that refused it.

---

## 9. Deliberately not built

- **A GitHub webhook.** This is the right trigger and it is not built tonight.
  It needs a public endpoint, signature verification against a shared secret,
  and the bot-commit filter that stops the pipeline's own writes re-triggering a
  sync (`BOT_COMMIT_PREFIX` exists for exactly this, unused so far). Half a
  webhook — an endpoint with no signature check — is worse than none, so the
  trigger today is the **Sync button that already exists** in the workspace.
  Syncing is already the moment we have fresh commits and a fresh progress file,
  so verification costs one extra read and no new button for a student to learn.
- **Re-verification on a schedule.** Nothing runs unless a student presses Sync.
  A student who finishes a story and never syncs stays unverified until they do.
- **Test execution.** We read that `tests_added` names files. We do not run them
  and we do not check they exist. See §3 for where CI slots in.
- **Revocation.** Nothing un-verifies a story. If a student force-pushes away
  the evidence commit, `verified_at` stays — and since the latch landed, so does
  everything derived from it: the story still reads `verified`, still names the
  original sha, and still carries its XP. Deliberate: a one-way latch is
  predictable, and un-awarding credit is a conversation, not an automation.
- **A commit window beyond 100.** A story whose only qualifying commit has
  scrolled out of the window cannot **newly** verify. One that already verified
  is unaffected — the latch holds it (§6). Acceptable while a build is a 13-week
  project with a few dozen commits; if that stops holding, the fix is to search
  commits by story id rather than paginate, not to raise the number.
- **Multi-branch.** Only the default branch is read.
- **A portal UI for the new state.** The DTO carries `task.verification` and
  `project.build_verification`; nothing renders them yet.

---

## 10. Code map

| File | Role |
|---|---|
| `backend/src/services/sbp/verification/progressContract.ts` | Zod schema, parse/reject, render, merge. Pure. |
| `backend/src/services/sbp/verification/verifyDecision.ts` | The completion rule. Pure, no I/O, fully unit-tested. |
| `backend/src/services/sbp/verification/verificationLatch.ts` | The rule in §6: a verified story cannot be lowered by a later repo read. Pure. Applied on both the write and the read. |
| `backend/src/services/sbp/verification/repoProgressReader.ts` | The GitHub boundary: timeouts, capped retries, error classes. |
| `backend/src/services/sbp/verification/buildVerificationService.ts` | Orchestration, persistence, evidence, idempotency. |
| `backend/src/services/sbp/renderDocs.ts` | Writes the managed `CLAUDE.md` block and the seeded progress file. |
| `backend/src/services/sbp/repoWriter.ts` | Merges the progress file instead of replacing it. |
| `backend/src/services/projects/projectTreeDto.ts` | `TaskVerificationDto`, `BuildVerificationRollupDto`. Pure. |
| `backend/src/routes/workspaceRoutes.ts` | The Sync trigger. |
| `backend/src/services/progression/seeders.ts` | The `project_story_verified` points row (value unset). |
| `backend/src/db/ensureSbpSchema.ts` | `student_tasks.verification_json`, asserted against the catalog. |
