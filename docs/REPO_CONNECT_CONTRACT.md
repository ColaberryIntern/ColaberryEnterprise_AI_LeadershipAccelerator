# Repo Connect Contract

**How a student's existing project folder becomes the build's workspace repo.**

Status: implemented, not deployed. Scope: the Student Build Pipeline (SBP).

---

## 1. The decision

> **DECISION — Ali Muwwakkil, 2026-08-14. STUDENT-OWNED REPOS.**
> The platform stores pointers and evidence, never the code.

Written down with its reasoning because it will be re-litigated.

- **The cost of hosting is not storage, it is CUSTODY.** A project is a few
  megabytes. What hosting actually buys is security review, compliance, deletion
  requests, breach liability, and running a Git host — none of which is this
  business.
- **Corporate clients are the deciding case.** An enterprise learner builds
  against their own systems, with internal names and data models sitting in the
  requirements. "Your engineers' work lives on our servers" does not survive a
  security review. The company's own GitHub org, under controls they already
  operate, is the only shape that gets through procurement.
- **It is also pedagogically correct.** The student keeps a portfolio that
  outlives the cohort, and the workflow is the one they will use at work.

### The rule that makes the risks survivable

**EVIDENCE MUST NEVER DEPEND ON THE REPO.**

When a story verifies, the commit sha, which criteria passed, the timestamp and
the XP are persisted in **our** database (`evidence_records`,
`student_tasks.verified_at`, `student_tasks.verification_json`). If the student
deletes the repo, revokes access, or rewrites history, **their record and their
points survive**. We lose the ability to verify NEW work and nothing else.

The repo is where verification HAPPENS. It is never where the record LIVES.

An audit of the verification loop against this rule, and the three places it is
currently broken, is in §7.

---

## 2. The problem this step exists to solve

On day one of class students set up a **local folder** with their own
`CLAUDE.md`, carrying conventions Ali baked in. They are already working in it.

The platform, meanwhile, provisioned brand-new empty GitHub repos. Zero of 31
projects have one, so this has never run for a real student — which is the only
reason the collision has not bitten yet. Keep provisioning fresh repos and a
student ends up with **two homes for one project**.

Their folder wins. We are the guest in it.

---

## 3. Two doors, one outcome

The outcome either way: **the project's workspace repo IS the student's own
repo**, and the platform holds a pointer to it.

### Door A — bring your own repo (PRIMARY)

The student pastes a repo address. Accepted shapes, because these are what
people actually paste:

| Shape | Example |
|---|---|
| Browser URL | `https://github.com/you/your-project` |
| …while looking at a branch or file | `https://github.com/you/your-project/tree/main` |
| Clone URL | `https://github.com/you/your-project.git` |
| SSH remote | `git@github.com:you/your-project.git` |
| Short form | `you/your-project` |

Rejected, each with a message naming the specific problem: a bare repo name with
no owner, a non-GitHub host, an owner or repo name GitHub could not issue, a
stray third path segment. **There is no generic 400 in this flow** — every
rejection carries an `error_class` and a sentence that says what to do.

Then three checks, in this order, all before anything is bound:

1. **It exists and we can read it.** GitHub answers 404 both for "no such repo"
   and for "private, and you are not on it", so the message says both and gives
   the fix for each. It never tells a student their real repo is imaginary.
2. **It is not already claimed by another project.** One repo per project
   (FR-037) — two plans sharing one `docs/` folder collide on
   `REQUIREMENTS.md`. Matched case-insensitively, because GitHub is.
3. **They can actually push to it** — see §4.

### Door B — provision and adopt (FALLBACK)

For a student whose folder is not on GitHub yet. The platform creates an
**empty** private repo, adds them as a push collaborator, and hands back the
commands that point their **existing folder** at it:

```
git init                      # skip if this is already a git repo
git remote add origin <url>   # use "set-url" instead if origin exists
git add -A
git commit -m "Initial commit"     # skip if everything is already committed
git branch -M main
git push -u origin main
```

**Empty is load-bearing.** Provisioning used to pass `auto_init: true`, putting a
README commit on the repo. A student pushing an existing folder into that gets a
rejected non-fast-forward, and the fix they reach for is `--force`. An empty
remote makes their first push a plain fast-forward: their files and their whole
history arrive untouched. `git branch -M main` matters for the same class of
reason — a folder initialised before 2020 still defaults to `master`, which the
platform does not read.

A provisioned repo sits in `awaiting_push` until commits appear. In that state it
is **not writable** by the platform (`isWritableConnection` is false), so publish
takes the existing `awaiting_repo` path instead of failing on a missing branch
ref. The first sync that sees commits moves it to `connected`.

---

## 4. Proving push access without student OAuth

There is no student OAuth in this system. Every GitHub call is made with the
platform token, so **every question we can ask GitHub answers "can *we* reach
this repo", never "can *they* push to it"**. Without a further check, a student
could paste any public repo on GitHub — a classmate's, a framework's — and every
server-side validation would pass.

The one act only a person with push access can perform is a push. So:

1. `POST /connect` mints a per-project token and returns the commands.
2. The student writes it to `.colaberry/connect.txt` and pushes.
3. `POST /connect/confirm` reads the file back and binds the repo.

The token was issued to an authenticated portal session, so observing it land in
the repo binds three facts: this session, this project, and somebody who can
write to that repo.

Properties:

- **Idempotent.** Re-starting a connect for the same repo returns the SAME token
  — a student who refreshes must not find the command they already ran void. A
  different repo mints a new one.
- **Expires after 7 days.** A token pasted into a chat months ago is not proof.
- **Nothing is bound until the proof lands.** `repo_owner`/`repo_name` stay empty
  through `awaiting_proof`, so a half-finished connect never looks like a live
  repo to the rest of the platform.
- **The claim is re-checked at bind time**, not only at start, so two students
  connecting the same repo concurrently cannot both bind it.
- **The spent token is deleted** on success rather than kept for replay.
- **Matching is forgiving about everything except the token**: comments, CRLF,
  a missing trailing newline and case all pass; a substring or a near-miss does
  not. The comparison is timing-safe.

It doubles as a dry run of what the student will do all term. If the challenge
fails, their remote was wrong, and finding that out in the first minute is the
point.

---

## 5. What the platform CANNOT do, honestly stated

**Door B creates the repo under the platform org, which is the shape §1
rejects.**

This is a knowing compromise, not an oversight. Creating a repo inside a
student's own account requires a credential belonging to that student:
`POST /user/repos` creates under the token owner's account, and the platform's
token belongs to the platform. With the credentials available today there is no
API call that produces a repo the student owns.

Mitigations that exist now: the repo is private, the student is a push
collaborator, and Door A is presented first, so the org-owned path is taken only
by a student who had no repo at all.

**What actually fixes it: a GitHub App.** Scoped in §8.

---

## 6. Revoked access is a normal state

A student-owned repo can be renamed, deleted, made private, or have the platform
removed from it — at any time, without telling us. That is their right and it is
an expected outcome, not an error.

| What happened | What the platform does |
|---|---|
| Repo unreadable (404) | Records `status_json.access = { ok: false, error_class: 'RepoNotFound' }`, keeps the pointer, and shows "reconnect your repo". |
| Rate limited | Says so, and says the repo is fine. Never reported as a missing repo. |
| Repo is empty (no branch) | `RepoEmpty` — "push your project folder, then sync again". A next step, not a failure. |
| Platform credential rejected | Says plainly that it is our side. |

**Every already-verified story stays verified.** Nothing in this path clears
`verified_at`, deletes an evidence record, or unbinds the repo. Reconnecting is
a repair, not a re-setup.

---

## 7. Audit of the verification loop against the rule (§1)

Checked 2026-08-14 against the loop shipped in PR #1463. The **write** side is
clean. The **read/display** side is not.

Clean:

- `student_tasks.verified_at` / `verified_by` are first-write-wins and are never
  cleared or recomputed (`projectWriteService.ts:209-215`). No code path writes
  `verified_at = null`.
- `evidence_records` rows are `findOrCreate` on a unique idempotency key and are
  never deleted (`evidenceEngine.ts:27-42`).
- Hard repo failures (`RepoNotFound`, `Unauthorized`, `RateLimited`,
  `UpstreamTimeout`, malformed progress file) short-circuit before any write
  (`buildVerificationService.ts:214-232`).

**Three open defects against the rule.** All three share one root cause: the
rendered roll-up reads only `verification_json`, which is overwritten from the
latest repo read on every successful sync, and ignores the immutable
`verified_at` latch underneath it (`projectTreeDto.ts:227,237`).

| # | Defect | Scenario |
|---|---|---|
| 1 | A **successful** read with no progress file overwrites a verified verdict (`buildVerificationService.ts:268`, unconditional per story). | Student deletes `.colaberry/`, commits, syncs. Six verified stories render as `not_started`. `verified_at` survives in the column; the visible record does not. |
| 2 | The 100-commit window silently downgrades old stories (`repoProgressReader.ts:25,32` + `verifyDecision.ts:234`). Fires with no student misbehaviour. | An active build passes 100 commits. STORY-001's evidence commit scrolls out. Criteria still pass, no qualifying commit is visible, `verified` → `submitted`. |
| 3 | `xp_earned` is looked up by a key re-derived from the **current** repo sha (`projectReadService.ts:65-72`), while the award row is keyed on the sha frozen at award time. | Student squashes or force-pushes. The story stays verified under a NEW sha; the lookup misses the awarded row; that story contributes 0 XP forever. This is the rule's own example — "rewrites history, their points survive" — failing. |

Smallest fix, not built here because it belongs to the verification workstream:
(a) treat `verified_at != null` as authoritative in the DTO and the roll-up;
(b) never write a downgrade into `verification_json` for a task that already has
`verified_at` — or split the live check into its own column; (c) key
`verifiedStoryXp` on `story_id` with a `source_ref LIKE '<story>@%'` prefix
match, or store the awarded `source_ref` on the task at award time.

---

## 8. The GitHub App, scoped not built

What it replaces: the single platform Personal Access Token that today can reach
every repo in the workspace org and any public repo, and which is the reason
Door B cannot create a student-owned repo.

What an App gives:

- **Per-repository, revocable installation.** A student or a company installs it
  on exactly the repos in scope. Revoking is one click on their side and needs
  nothing from us.
- **Narrow permissions.** `contents: write` on installed repos, `metadata: read`.
  Nothing org-wide.
- **Short-lived installation tokens** (one hour) minted per call, instead of a
  long-lived PAT sitting in an env var across every service.
- **Acting as the student where it matters.** `POST /user/repos` under a user
  authorization flow creates a repo the STUDENT owns, which is what §1 actually
  asks for and what §5 says we cannot do today.
- **The audit trail an enterprise asks for**: installation events, per-repo
  scope, and a revocation an admin can perform without contacting us.

It also removes the proof-of-push challenge for installed repos, because
installation on a repo is itself proof of control.

Cost: an App registration, a webhook endpoint with signature verification,
installation-token minting and caching, and a migration path for repos already
connected by PAT. That is a workstream, not an evening — which is why the
challenge exists.

---

## 9. The no-git fallback

`GET /api/portal/workspace/docs/bundle?project_id=…` returns the **same** rendered
document set as a zip, for a project with no repo.

- Same `renderDocs` output, byte for byte, asserted by a test. If the download
  and the repo ever drift, a student who downloads today and connects next week
  sees an inexplicable diff on their first sync.
- `repoUrl` is null, so prompts do not cite a clone URL that does not exist.
- Deterministic: same plan and timestamp in, byte-identical archive out.
- The archive leads with `docs/CONNECT-YOUR-REPO.md`, stating that verification
  and points need a connected repo — written as what connecting gives you, not
  as a scolding. The response also carries
  `X-Colaberry-Verification: requires-connected-repo`.
- The zip writer is hand-rolled (`zipArchive.ts`, STORE method, no dependency).
  Adding a dependency for a few dozen kilobytes of markdown is not worth the
  surface; zip-slip paths are refused rather than sanitised.

This is a nudge toward connecting, not a second path maintained forever.

---

## 10. Code map

| File | Role |
|---|---|
| `backend/src/services/sbp/repoConnect/repoReference.ts` | Parse what students paste. Pure. |
| `backend/src/services/sbp/repoConnect/connectErrors.ts` | The classified failure vocabulary and its HTTP statuses. |
| `backend/src/services/sbp/repoConnect/connectChallenge.ts` | Proof-of-push token, matching rules, and the commands. Pure but for the CSPRNG. |
| `backend/src/services/sbp/repoConnect/githubRepoClient.ts` | The GitHub read boundary: timeouts, capped retries, error classes. Read-only. |
| `backend/src/services/sbp/repoConnect/repoConnectService.ts` | The state machine, claim and rebind guards, both doors. |
| `backend/src/services/studentWorkspaceService.ts` | Provisioning (empty repos), sync, access classification. |
| `backend/src/services/sbp/zipArchive.ts` | Dependency-free ZIP writer. |
| `backend/src/services/sbp/docsBundle.ts` | The download, and the notice inside it. |
| `backend/src/routes/workspaceRoutes.ts` | The HTTP surface. Zod at every boundary. |
| `frontend/src/pages/portal/projects/WorkspaceRepoPanel.tsx` | Both doors and the download, in copy written for someone who already has a folder. |

### States

```
not_connected ──paste a repo──▶ awaiting_proof ──push the token──▶ connected
      │                                                                ▲
      └──provision (empty)────▶ awaiting_push ──push your folder───────┘
```

`connected` is the only state in which the platform will write documents into
the repo.
