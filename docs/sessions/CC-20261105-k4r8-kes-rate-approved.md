# The $30 rate becomes a decision instead of a placeholder

Session: CC-20261105-k4r8 · 2026-11-05

Ali: *"We can use the numbers you set - add them at $30 - and close this out."*

That closes a question the record was still describing as open. In five places the published
record told a reader the money figure was priced at a rate that "stands in until Colaberry's
real cost replaces it", and the roadmap carried a live item promising the substitution. No
substitution is coming, so **"a replacement is pending" is now the inaccurate statement** —
the correction is to the record's account of its own future, not to any figure.

## What did not change

The rate is still **assumed rather than measured**. The figure is still published as a
range, its verification stays `illustrative` / `self`, and the metric label still says
"an assumed average rate". Approval settles *which* rate to use; it does not turn the rate
into a measurement, and the hours it prices were never measured either. Every edit keeps
that distinction intact.

## The six edits

| Where | Was | Now |
|---|---|---|
| `measurement.narrative` ¶3 | "it stands in until Colaberry's real cost replaces it" | accepted by the platform owner on 5 Nov 2026, "so it is the rate this record publishes rather than one waiting to be swapped" |
| `manual_cost_avoided.plain.from` | "chosen because Colaberry's real cost has not been substituted yet" | "accepted by the platform owner on 5 November 2026 as the rate to publish" |
| `manual_cost_avoided.plain.cannotShow` | "on rates that are placeholders" | "on a rate that is assumed rather than measured" |
| `manual_cost_avoided` limitation 1 | "standing in until Colaberry's real cost replaces it" | accepted as the rate to publish; "accepting it settles which rate to use and does not make it a measurement" |
| `roadmap[0]` | `in_progress` — "Replace the assumed hourly rates with Colaberry's real cost" | **`not_pursued`** — "no substitution is pending. The figure stays an estimate, because the hours it prices were never measured." |
| `model_spend` limitation 1 | "No corresponding figure is published for staff time saved" | "The staff-time figure published beside this one is an estimate priced at an assumed rate rather than a measurement, and is labelled that way." |

### Why `not_pursued` and not `shipped`

Nothing was replaced; a decision was taken not to replace it. `not_pursued` is first-class
in `CaseStudyRoadmapStatus` for exactly this, and the type's own comment says showing
stalled work "is allowed and is often more credible" than deleting the line. A reader sees
the question was asked and answered, rather than seeing it vanish.

### The sixth edit is a contradiction, not a wording change

`model_spend` carried the limitation *"No corresponding figure is published for staff time
saved, because the builder's estimate of it rests on assumed hourly rates rather than
measured ones."* True when written; false from the moment `manual_cost_avoided` was added.
The record has been publishing that figure **and** a limitation beside it denying the figure
exists. Found by grepping every mention of the rate rather than only the lines I meant to
edit — the same habit that found the four sections rendering empty in part four.

## Verification

Snapshot **version 10**, signed, published to `enterprise` and `training`.

Checked against the live public API, not the page: `enterprise.colaberry.ai` server-renders
only the shell, so a grep of the HTML returns zero for *everything* and reads like a wipe.

```
GET /api/public/case-studies/<slug>?surface=enterprise   http=200  50,243 bytes
  "thirty dollars an hour"                              4   <- control, known present
  "accepted by the platform owner on 5 November 2026"    2
  "no substitution is pending"                           1
  "not_pursued"                                          1
  "stands in until"                                      0
  "has not been substituted"                             0
  "No corresponding figure is published"                 0
```

The three zeroes are only worth reading because the control is non-zero in the same
response — an absence proved on a surface that renders nothing proves nothing.

## The savings deliverable

`docs/marketing/AI_INBOX_MANAGER_SAVINGS.html` carried the same "standing in until" clause
in its caveat box; it now names the approval and repeats that approving a rate does not
make it a measurement. Re-rendered to
`C:\Users\ali_m\Downloads\AI Inbox Manager - what it saved.pdf`: **2 pages, 91,312 bytes**,
the page count read out of the PDF's own bytes by `renderArtifactPdf.js` rather than
computed from the design, with `maxPages: 2` set so a longer paragraph pushing it to three
would have thrown and written nothing.

The chart itself is unchanged: the estimate is still a hatched range bar spanning
86–251 hours with the mid marked, the recorded $350 still a solid bar, so the measured and
the calculated stay distinguishable from the picture alone.

Production scratch (`/root/kes`) removed; absence confirmed.
