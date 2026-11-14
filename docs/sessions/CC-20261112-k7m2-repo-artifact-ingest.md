# Session CC-20261112-k7m2 — repo artifact ingest

- [x] Take deliverables out of a student's repository and record them as artifacts
  - Date: 2026-11-14
  - Session: CC-20261112-k7m2
  - What changed: a new scan that decides which repository files are a student's own
    deliverables, an ingest that records them with `repo_path` and `commit_sha` so the
    report counts them as the intern's own work, and a dry-by-default operational script.
  - Verification: 170 tests green across the four `services/artifacts` suites, 36 of them
    new. Backend `tsc --noEmit` clean in `src/` for every file touched, run first against
    a planted control error. Dry-run against **all 23 connected production repositories**.
  - Notes: not deployed, and nothing has been written in production. The script requires
    `--go` and has only ever been run dry.

## The defect

`artifactRepoSync` has only ever run one way: a student uploads on the platform, and we
mirror the file into their repo. **Nothing has ever read a repository and noticed that
work was already in it.**

Measured on 14 Nov 2026, that cost Omolola her entire document set. Her Saratoga Springs
repo held two infographics (4.3MB and 3.8MB), a 49KB project overview and seven
engineering documents, all committed, all synced that morning, and the internship report
showed `artifacts_real_count: 0`. She was being asked to produce artifacts she had
already produced, because the only path into the platform was an upload form nobody had
pointed her at.

## Why the rule is not "allowed extension"

That was the first thing tried and it is badly wrong. Her repository has **35 files** with
a document or image extension and only **six** are hers to show:

```
 8  app/*.html               the application's own screens, which are source code
 1  index.html               the Command Center shell
14  docs/stories/STORY-*.md  the plan, which WE generated into her repo
 4  docs/{REQUIREMENTS,STORIES,TRACEABILITY,DATA_CONTRACT}.md   also ours
 1  CLAUDE.md                configuration
 1  .colaberry/connect.txt   our plumbing
---
 6  hers
```

So the rule is about **place as well as type**. A binary document or image counts
wherever it sits, because nobody commits a PDF or a 4MB infographic as part of a build. A
text-shaped file counts only inside a documents directory, because at the repo root that
is where README and LICENSE live and under `app/` it is the program itself. That makes
the rule teachable: *put deliverables in docs/* is a sentence a student can act on.

## What the first real run taught, which no unit test would have

Dry-running across all 23 connected repos wanted to record **1,254 artifacts**, and
**946 of them belonged to one intern**: per-screen walkthrough screenshots under
`.alveara/gates/B/evidence/walkthroughs-desktop/`, emitted by his own test gates. Every
one passed the type, place and size rules honestly.

Three guards came out of that run, and one more from it:

| Guard | Found by |
|---|---|
| Any **dot-directory** is tooling, at any depth | `.alveara/` producing 946 rows |
| **Machine-output directories** (`evidence/`, `screenshots/`, `gates/`, `test-results/`, …) | the same 946 |
| **Platform-generated docs** are ours, not theirs | the same four filenames came back for five different interns; `services/sbp/docsBundle.ts` confirms we write them |
| **Furniture images** by name, not just size | a 25KB `colaberry-logo.png` cleared the size floor |

Result: **1,254 → 137**.

A per-repo cap of 60 refuses rather than truncates. Silently keeping the first 60 of 946
would record an arbitrary slice of someone's test output as their portfolio and nobody
would ever find out which 60.

## Final dry run, all 23 production repositories

```
written       20 interns, 137 artifacts, 123 of them flagged wrong format
nothing_found  6   Aki Wam, Liza Ayele, Chukwuemeka Eneh, Tanmayi Katamaraja,
                   Farhat Beig, ammar albazzaz
too_many       3   Firas Baidhani (193), Obi (99), Quincy (68)
```

Aki landing in `nothing_found` is correct and worth stating: all four of his documents
are the SBP-generated set, so he genuinely has no deliverable of his own in the repo yet.

Markdown and plain text are ingested and **flagged**, not hidden, which is Ali's rule from
10 Nov ("show them but course correct") and feeds the existing `format_correction` ask.
123 of the 137 are in that state, which is its own finding.

## Still open

- **Not wired to anything.** No cron, no route, no call from the report. Deliberate: the
  first run should be a human running the script with `--go` and reading what it did.
- **Test fixtures still slip through.** Shabana's `docs/Assignment_1/inbox-triage/inbox/msg01.txt`
  and eleven siblings are sample data, not deliverables. A directory called `inbox/` full
  of `msg*.txt` is the next pattern to exclude.
- **Freshness is the repo sync's.** This reads `github_connections.file_tree_json`, so a
  file committed minutes ago is not visible until the next sync. That is the right trade
  against a recursive tree fetch per intern per run.
- The three `too_many` repos need a person to look at them.
