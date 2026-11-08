---
name: handoff
description: Build a portable bundle that recreates this machine's Claude Code working state on another computer - the repo, the live tabs' worktrees and branches, their uncommitted diffs, open PRs, session logs and the memory directory, plus a checklist of the credentials it deliberately refuses to carry. Run it in one tab for just that workstream, or in every tab to collect them all into a single bundle. Invoke on "handoff", "move this to my other computer", "set up the new machine", "bundle this session", "I'm switching laptops", "export my tabs", "what do I need to take with me".
user-invocable: true
---

# handoff - move the working state, not the scrollback

A tab's useful state is its branch, its worktree, its uncommitted diff, the PR it
is waiting on and the session log that says what it was doing. That is a few
kilobytes. The transcripts for a day's tabs on this machine are 5.4 GB. This
skill collects the kilobytes.

## The three commands

| You type | What happens |
|---|---|
| `/handoff` | This tab adds itself to the shared bundle. Run it in each tab you care about. |
| `/handoff finalize` | Captures this tab, then adds the machine tier, derives the manifest, scans for secrets and zips. Do this last. |
| `/handoff status` | Read-only. Which tabs have reported, what the bundle holds, whether it is sendable yet. |

Running in **one tab only**: `/handoff finalize` by itself does both halves, so a
single tab gets a complete, sendable bundle covering that workstream plus the
whole machine.

Running across **every tab**: `/handoff` in each, then `/handoff finalize` in the
last one. Every tab writes a file named after its own session id and nothing
reads-modifies-writes a shared file, so twenty tabs can run in any order, at the
same time, without clobbering each other. `manifest.json` is derived from the
directory listing at finalize time for exactly this reason - the lesson
`PROGRESS.md` already taught this repo.

**One tab can capture all of them.** `captureTab.js` takes the session id as an
argument, so it does not have to run inside the tab it is describing:

```bash
node scripts/handoff/captureTab.js --session <other tab's uuid> \
  --cwd "<the directory that tab STARTED in>" --worktree <where it works now>
```

This is not an edge case, it is the normal path the first time: `/handoff` only
exists in a worktree that has this skill, so on a machine where the branch is
unmerged the other tabs have no such command to run. Each tab's session id is
the filename of its transcript under `~/.claude/projects/<slug>/`, and every
transcript entry carries the `cwd` to pass. **Tabs are frequently reassigned to a
different directory mid-session**, which is why `--cwd` (what names the
transcript folder) and `--worktree` (where the git state lives) are separate.

Append `--with-transcripts` to `finalize` only if the literal conversation
history is wanted. It turns a few-MB bundle into a multi-GB one.

## How Claude runs it

```bash
# this tab, into the shared bundle
node scripts/handoff/captureTab.js \
  --session <this session's uuid> \
  --log CC-20261108-ab12 \
  --note "CRA dev server on :4411; PR #3753 awaiting Ali's merge click"

# the machine half, plus the manifest, the secret scan and the zip
node scripts/handoff/captureMachine.js --finalize
```

Three arguments Claude must supply, because no child process can discover them:

- **`--session`** is this session's uuid. It is the last path segment of this
  session's scratchpad directory. **Never guess it and never let the script pick
  "the newest transcript"** - about twenty tabs run here at once, so the newest
  transcript belongs to whichever tab typed last, not to this one.
- **`--log`** is the `CC-<YYYYMMDD>-<id>` session id this tab logs under in
  `docs/sessions/`, per CLAUDE.md's session protocol. The log travels with the
  bundle and is what the new machine reads to learn where the work stood.
- **`--note`** is free text for everything the filesystem cannot show: running
  background shells, a PR waiting on a merge click, an approval in flight, a
  half-finished migration. Write it for someone reopening this tab cold.

If `captureTab.js` fails with "no transcript folder", pass `--cwd` pointing at the
directory **this session started in**. A tab's working directory can be
reassigned mid-session, but its transcript folder is still named after the
original, and the script refuses to guess rather than capturing an empty tab.

## What the bundle carries

- Every reporting tab: branch, HEAD, upstream, unpushed commits, the tracked
  diff as an appliable patch, open PR URLs, and the session log.
- **One patch per worktree, not per tab.** Measured on the first multi-tab run:
  18 tabs, and 15 of them were sitting in the same checkout. Keyed on the session
  id, that checkout's 74-file diff and its 873 untracked files were written once
  per tab; keyed on the worktree, the first tab stores them and the rest point at
  the same files. Tabs still never contend, because no tab rewrites a file
  another tab owns.
- `RESUME_PROMPT.md`, generated from what actually shipped: the real worktrees,
  tab count and `origin/main` sha. Paste it into a fresh Claude Code tab on the
  new machine and it drives the restore. It is generated rather than written by
  hand so it cannot promise something the bundle does not contain.
- **This tooling itself**, under `scripts/handoff/`, so the bundle restores
  itself. Telling the operator to run `bootstrapMachine.ps1` from the repo is
  circular - cloning the repo is what bootstrap does.
- **New files that were never committed.** `git diff HEAD` cannot see an
  untracked file, and a workstream whose value is six new files would otherwise
  hand over a patch of nothing. Small text files are copied into `extras/`;
  generated output and anything large is skipped by name and reported.
- The machine: tool versions, the git remote, `origin/main`, the memory
  directory, `~/.claude/settings.json`, the project permission allowlist, MCP
  server names, and the worktree inventory.
- `bootstrapMachine.ps1`, which rebuilds all of it on the far end.

## What it refuses to carry, and why

**No environment variable values, ever.** The bundle records that
`MANDRILL_API_KEY` is set and that it comes from the production container. It
never records what it is. A bundle is built to be emailed or carried on a USB
stick, so a secret inside it is a leak with a delivery mechanism attached.
`bootstrapMachine.ps1` writes `ENV_CHECKLIST.md` instead, naming every variable
and where to fetch each one.

**MCP server names only**, not their configs, which can hold OAuth tokens.

**Not `tmp/`, ever.** The first multi-tab run copied a checkout's 873 untracked
files and the gate refused the bundle naming real material: JWT session cookies,
a GitHub PAT, a Slack webhook URL, a GCP key. All of it came out of `tmp/`, which
this repo's `CLAUDE.md` defines as scratch that is "always safe to delete, never
committed" - probe output and saved responses pile up there precisely because
nothing is meant to keep them. Scratch is reproducible by definition, so it has
no handoff value and carrying it into a folder built to be emailed is a leak with
a delivery mechanism attached. `tmp`, `.cache`, `.next`, `.venv`, `__pycache__`
and files whose names announce credentials are refused entry.

**Anything else the scanner flags inside `extras/` is withheld, not refused.**
`extras/` is a copy of untracked files nobody curates, so refusing the whole
bundle over one stray probe script means the tool never runs. The file is left
behind instead, the original untouched on the old machine, and it is named on
stdout, written to `WITHHELD.md` and recorded in `manifest.json`. **A hit there is
usually a real credential sitting in a working tree, so the list is worth
reading** - the first run surfaced a teammate's portal password hardcoded in an
untracked Playwright script. A finding in `tabs/`, `memory/` or `machine/` still
refuses the bundle: those are files this tool assembled, so a credential in one
is a defect in the capture, not stray material.

**Not the scratchpad, unless asked.** Pass `--with-scratchpad` to carry a
session's ad-hoc probe scripts. They are off by default because the first real
bundle built here tripped the secret gate four times and three were scratchpad
files holding service URLs and account identifiers. They are the highest-risk
and lowest-value thing in a bundle, and they can be reconstructed from the
transcript.

**Not all 418 worktrees.** Only the ones a reporting tab is actually working in
are recreated. The rest are recorded as a path and branch list, recreatable on
demand. Rebuilding all of them would take hours and produce a machine nobody
wants.

## The secret gate is not advisory

`finalize` scans the whole bundle with the repo's pinned gitleaks and
`.gitleaks.toml`, and **before trusting a clean result it plants known
credentials in a directory and confirms they are found**. A scan's output is an
absence: a broken scanner and a clean bundle look identical. If the control
fails, or if anything is found, **no zip is produced** and `finalize` exits
non-zero.

A refusal does not delete the bundle folder, because other tabs captured into
it. It writes `SCAN_FINDINGS.md` listing every finding and what to do about it.

Two ways past a refusal. **Preferred: remove or redact the file**, and if it was
a live credential, rotate it, since it has been sitting in a folder built for
copying. **Or, having reviewed it and judged it not a secret**, list it with a
reason and pass the list:

```bash
node scripts/handoff/captureMachine.js --finalize --accept-findings reviewed.txt
```

```
memory/<slug>/reference_advisor_can_mint_bc_token.md  # public OAuth client id, secret stays in container env
```

Acceptance is never silent: it is echoed at finalize time and recorded in
`manifest.json` under `scan.acceptedFindings`, so the receiving machine can see
what was waved through and on what reasoning. This is an operator file rather
than a list baked into the scanner, because a path allowlist inside a secret
scanner rots immediately and would go on suppressing that file after someone
drops a real credential into it.

## On the new machine

Unzip the bundle, then run this **from inside the unzipped folder**. The bundle
carries the script, so nothing needs cloning first:

```
powershell -ExecutionPolicy Bypass -File scripts\handoff\bootstrapMachine.ps1 -Bundle .
```

Or paste `RESUME_PROMPT.md` into a fresh Claude Code tab and let it drive.

Useful switches: `-RepoRoot` to clone somewhere other than the old path,
`-Verify` to prove the checkout works, `-SkipPatches` to leave uncommitted work
alone, `-WithTranscripts` to restore conversation history, `-Force` to proceed
past an incomplete bundle.

It is idempotent. Every step checks before acting, so running it twice is safe
and running it once tells you exactly what is still missing.

**Keeping the repo at the same absolute path is what lets transcripts resume**,
because Claude Code names a session's transcript folder after the directory it
started in. If the path differs, bootstrap remaps the folder names and
everything except literal `--resume` still works.

## Verifying this tooling itself

```bash
node scripts/handoff/handoffSelfTest.js
```

Fifteen checks, including a planted credential the gate must refuse. CI runs it.
If it fails, do not send a bundle built by that code.

Three of those checks exist because a real run broke: the worktree key must not
fork on a separator or case difference (or the shared patch duplicates again),
`tmp/` and credential-shaped names must be refused entry to `extras/` while real
work still travels, and a legitimate bundle carrying a real worktree id must pass
the gate - that field, when it was called `worktreeKey`, tripped the
`generic-api-key` rule in all 18 tab files at once and refused the bundle over 62
findings of its own making.

## Scope note

This is machine state, not project state. It does not update `PROGRESS.md`,
`docs/sessions/`, Basecamp or any PR, and it writes nothing into the repo except
`ENV_CHECKLIST.md` on the receiving machine.
