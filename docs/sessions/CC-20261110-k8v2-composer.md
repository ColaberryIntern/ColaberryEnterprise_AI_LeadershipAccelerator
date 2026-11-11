# CC-20261110-k8v2 — The intern message: from template to something a person would send

Branch: `fix/nudge-one-pipeline` · PRs #3827, #3830, #3832, #3835, #3836

## The thread of the day

Ali pressed **Prepare the messages** and read what the generator proposed:

> Formaatting is terrible here ... How you are framing the responses is all wrong. You aren't even
> talking about the correct things in this email. Not sure how you got so far off.

Five rounds followed. Each one found a defect the previous round had not looked for, and the
pattern across all of them is the same single mistake wearing different clothes:

**A field composed for one audience cannot be pasted into a message for another.**

| Round | Surface | What was pasted in |
|---|---|---|
| #3827 | `outstandingLines()` | the dashboard urgency list, so Quincy was told "You owe a reply" when Ali owed him one |
| #3830 | `i.narrative` | the dashboard summary, in the third person: "Quincy, **Quincy is** well underway ... **Their** last build work" |
| #3835 | the whole composer | five blocks stapled together, each for a different reader |
| #3836 | `ask.why`, `ask.nudge` | dashboard copy again, third person again, boilerplate again |

I fixed that mistake four times before I stopped finding new places it lived. The lesson for next
time is in the skill as rule 0: **audit every field the message consumes for who it was written
for, not just the ones currently producing a visible defect.**

## The measurement that mattered

Ali's own diagnosis was the turning point:

> I think the problem is that you are not generating the html or json file that the email is doing
> therefore you don't have all the right data to make the right message.

Measured on production, before the fix:

- **216 conversations in the database. The composer could see 0.**
- **13 of 13 interns written about blind.**

Not because the JSON was missing — `buildBriefFor` built a sidecar. It built a poorer one:
`conversations` was never passed to `buildSidecar`, `narrateAsks` and `summarizeInterns` were
skipped, and no previous snapshot was loaded. So the generator was composing emails about people
from build telemetry alone, unable to read a word any of them had written.

## What changed

- [x] One pipeline for both surfaces (#3832)
  - Date: 2026-11-10 · Session: CC-20261110-k8v2
  - `nudgeBrief/pipeline.ts` runs exactly what `internshipPortfolioReport.ts` runs. The console and
    the nightly email now go through the same code. Two pipelines over one dataset is a guarantee
    they will drift, and they had.
  - Verification: live on production, 0 of 13 interns now blind, down from 13 of 13. Pipeline 6.6s.

- [x] The two artifacts, on demand (#3832)
  - `GET /api/admin/intern-nudges/report`, `?format=json` for the sidecar. 607KB and 342KB live,
    matching what the 10:00 email attached. Returns 401 not 404 on the real hostname.

- [x] The message rebuilt (#3835, #3836)
  - `nudgeBrief/shapes.ts`. One focus per message: LEAD what they did, THE ONE THING that decides
    their week, NEXT ACTION named and located, WAY THROUGH that is not quitting, CLOSE with a date.
  - Focus is chosen hardest truth first, so a near deadline no longer overrides reality. Anamelechi
    with 0 of 16 stories is told that starting is the problem, not given a countdown.
  - `compose.ts` 321 lines to 162.
  - Verification: all thirteen regenerated live. Six defect classes clean, prompts attached down
    from 13 of 13 to 2, median length 551 characters.

- [x] PREP dates read `due_baseline_on` (#3827)
  - 12 of 348 PREP rows disagreed with `due_on`, by up to 58 days, all on Aki's and Omolola's gov
    projects. Omolola's message would have said seven weeks late for work due in two days.

## Corrections I had to make to my own claims

Both worth keeping, because both were me asserting before checking:

1. **I named Quincy's "due 39 days ago" as the back-dated-column bug.** It was not: his PREP-1 reads
   2026-10-02 in both columns. The bug was real but belonged to Aki and Omolola. I should have
   checked which rows were affected before naming one.
2. **I reported the pipeline fix as shipped when it was not.** `b8890504d` missed PR #3830 by seven
   minutes. Caught only because I checked merge state before deploying rather than after. **Check
   merge state at push time, not at deploy time.**

## Still open

- The three rewritten messages in the comms audit remain my reading of Ali's standard, not his. He
  said to rebuild rather than wait for markup, so that is what shipped; his markup would still
  improve it.
- `summarizeInterns` rejects about 5 of 13 model summaries with `restates a count`. Harmless now
  that the composer does not lean on the narrative, but worth understanding.
- No Basecamp ticket for any of today's work: bulk BC writes as Ali are classifier-blocked in this
  session.
