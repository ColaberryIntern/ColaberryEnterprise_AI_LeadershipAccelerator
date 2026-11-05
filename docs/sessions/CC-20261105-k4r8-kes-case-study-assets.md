# CC-20261105-k4r8 — AI Inbox Manager case study: hosted assets

Session: `CC-20261105-k4r8`
Date: 2026-11-05
Subject: Kesetebirhan Delele's **AI Inbox Manager** (`kes@colaberry.com`)

Builds the asset half of a new Case Study OS record, the same way the Stress Test Review
App record was built on 2026-11-03 (`CC-20261103-m9x4`). The record itself — the
measurement chain and the publish — is a database change and is not in this commit.

---

## What landed

| File | What it is |
|---|---|
| `frontend/public/site-v2/kes-ai-inbox-manager-walkthrough.mp4` | the builder's own 3:05 walkthrough |
| `frontend/public/site-v2/poster-kes-ai-inbox-manager-walkthrough.jpg` | poster frame |
| `frontend/public/site-v2/thumb-ai-inbox-manager-{a,b,c}.jpg` | three cover concepts, 1536x864 |
| `frontend/public/site-v2/shot-aim-*.png` | six stills of the running application |
| `scripts/case-study-thumbnails/prompts.example.json` | this run's prompts and pick, for provenance |

## The cover

Three concepts on `gpt-image-2.6-flare` inside `accelerator-backend`, so the OpenAI key
never left the box. All three are committed, as the reference records' a/b/c variants
are, so changing the pick later costs an `apply-cover.js` run and no deploy.

```
a  ONE OF THEM MATTERS.  one lit envelope in a wall of pigeonholes   --top 160
b  TOO MUCH TO READ.     a person buried in unopened mail            --top 160
c  THE REST CAN WAIT.    one envelope sharp, the backlog blurred     --top 160
```

**Ali picked c.** It is the only one of the three that shows the system's actual promise —
one thing in front of you, everything else deferred — rather than the size of the problem.

**The crop point was measured, not judged.** The hook glyphs were located by scanning each
source row for the hook's own colour, confined to the lower 40% of the frame so a lit
subject higher up could not be mistaken for a glyph:

| | hook colour | glyph rows (of 1024) | valid `--top` |
|---|---|---|---|
| a | white | 703–864 | 1–160 |
| b | yellow | 689–875 | 12–160 |
| c | yellow | 715–885 | 22–160 |

`--top 160` is inside the valid window for all three and is the only offset that also
removes the full 160 rows of dead ceiling. On the shipped `c` it leaves 139 px beneath the
hook.

Every image was looked at at full size. None carries a word the prompt did not supply, a
number, a date, a client name or an interface. The model added a full stop to each hook; a
mark is not an invented slogan, so `edit.js` was not run.

## The frame check — the part worth reading

`scripts/walkthrough-video/README.md` requires every new subject's footage to be checked
for people. **This subject is an inbox**, so the whole recording is other people's mail and
this is the highest-risk footage the pipeline has handled.

Checking was not done by sampling and hoping. Every *distinct screen* was inspected: 93
frames at 2 s intervals were reduced to a 32x18 fingerprint and de-duplicated, leaving 25
distinct screens, and those were opened. Coverage: Dashboard, the approval cards, Review →
Student notifications, Review → Verify students, Review → Classification review, Reports →
Interviews with a full email body open, Reports → Pipeline, Reports → System, and Settings.

**The builder had already solved it, thoroughly.** The demo data uses reserved identifiers
end to end, so nothing on screen can resolve to a real person:

- Every recipient address is on `example.com` — RFC 2606, reserved, unroutable.
- Every sender domain ends `.example` — same reservation (`northwindanalytics.example`,
  `bluepeaksystems.example`, `jobsmailer.example`).
- Every phone number is `312-555-01XX` — the NANP block reserved for fiction.
- Settings' role addresses are `ops-lead@`, `support-desk@`, `program-manager@example.com`.
- Company names are invented (Northwind Analytics, Harborlight Health, Cedar & Pine Retail).

No real student, address, phone number, credential or internal hostname appears anywhere in
the recording.

## Transcode

The source is 1920x1080, 185.11 s, 22.3 MB. Shipped at the same resolution and duration,
re-encoded at CRF 28 to 11.3 MB — half the bytes, and the repository's largest video is
otherwise 6.8 MB. Resolution was deliberately **not** reduced: the subject is small UI text,
so resolution is the thing not to spend. Legibility was confirmed by cropping the same
instant from both files at full resolution and reading the 11 px grey sender address in
each; it is crisp in the re-encode. Duration measured with `ffprobe`, not computed:
185.131 s against the source's 185.110 s, inside one frame at 30 fps.

## Stills

Six, and all six are **caption-free**. The walkthrough carries burned-in narration, which
is noise in a published artifact, so the caption band was scored across the whole recording
at 4 fps and cross-checked against a motion score, since an empty caption band is also what
a mid-transition frame looks like. Only eight moments are both caption-free and steady; six
of them are distinct screens and those are the six shipped.

**The figures visible in these stills are demonstration data, not production.** The
Pipeline still reads 1,840 emails and the System still reads 84 runs; the builder's
production figures for the same system are an order of magnitude larger. Each artifact
caption has to say so, or the page and the picture will disagree in silence.

## Open, and not resolved in this commit

The record's **measurement chain is not built**, because the evidence base changed late:

Figures collected earlier in this session from `accelerator_prod.inbox_emails` /
`inbox_classifications` (23,386 emails, 82.6% automated, 127 human corrections) are **not
this system**. That is Ali's own inbox-zero system: its states are
`AUTOMATION / INBOX / SILENT_HOLD / ASK_USER`, it has no interview categories, and its top
sender domains are `colaberry.com`, `app.basecamp.com`, `github.com`. The AI Inbox Manager
is a separate application — students, companies, interviews, callbacks — and it does not
run on the production host at all: no container, no database, nothing on disk. An earlier
note in this session concluded the two were the same system because a count of 127 appeared
in both. That was a coincidence between "127 harder cases staff reviewed" in Kes's system
and "127 human overrides" in Ali's, and the conclusion was wrong.

The usable evidence is therefore Kes's own figures (email of 2026-11-04, covering
2026-09-17 to 2026-11-05), which he already split into measured and assumed himself:
20,773 emails across 30 students, 572 runs with 571 succeeding, $327 of AI usage, 127
harder cases reviewed by staff with 106 accepted. He states explicitly that the time and
rate figures are his assumptions and asks that time saved be quoted as a range, and that
the system not be claimed as more accurate than a person.

Those figures come from a database nobody else can reach, so under
`caseStudyPublishRules.ts` they are `method: 'self'`, which the gate does not count as
verified. The independently checkable evidence is the public repository,
`github.com/KesetebirhanDelele/AI-inbox-Manager` (`method: 'repo'`), confirmed public and
last pushed 2026-10-28.

**This needs Ali's decision before the record is published**, so it is carried into the
next step rather than guessed at here.

## Verification

- Six images inspected at full size; crop offsets derived from measured pixel rows.
- Video duration measured with `ffprobe` on the shipped file.
- Re-encode legibility checked by reading the smallest on-screen text in both files.
- Every distinct screen of the recording inspected for personally identifying data.
- `prompts.example.json` re-parsed after the append: 8 records, 8 picks, 24 items.
- No code paths touched, so no test applies. The live check is a 200 on each `?v=` URL
  after the nginx deploy, then `apply-cover.js` and a read of the public projection.

Session: CC-20261105-k4r8

---

# Part two: the record

Created, approved and published after the assets PR (#3677) merged and nginx deployed.

| | |
|---|---|
| Record | `fe1a02f7-b2e1-440f-9578-8d6a381f1358` |
| Slug | `the-interview-was-in-the-inbox-the-student-still-had-to-be-told` |
| Shape | `source_type: repo_collection`, `built_by_type: colaberry_team` |
| Repository | `KesetebirhanDelele/AI-inbox-Manager` (public, primary) |
| Snapshot | version 2, approved and signed |
| Published | `enterprise` and `training` |

## Assets verified live before the record cited them

All eleven files answered 200 at the `?v=` URL the record names, and each was re-hashed
from the edge against the blob committed to `main`. A file already live before this deploy
was fetched as a control, so a query aimed at the wrong place could not read as a pass.

## What the gate refused, and what was changed

The first publish attempt was refused on both surfaces. Nothing was worked around; each
blocker was fixed at its cause.

1. **`snapshot_not_approved`** — the snapshot was written with `status: 'approved'` but
   `persistCaseStudySnapshot` does not stamp an approver, and "an approval nobody signed is
   not an approval". Fixed by persisting as `draft` and then calling `approveSnapshot`.
2. **`unverified_claim` x6** — percentages in artifact descriptions and metric limitations
   ("58%", "69%", "83%", "94%", "91%", "90%") that no *verified* metric carries. Every
   figure on this record is the builder's own, so none of them can back a claim. The
   percentages were restated in words rather than dropped or relabelled as verified.
3. **`visual_story_missing`** — every published record has carried a visual story since
   2026-09-16. An `architecture.diagram` of 8 components and 8 connections was authored,
   and the story generated from it rather than hand-drawn, so it cannot drift from the
   architecture it illustrates.

## The record is published but NOT on the default index, by design

Every metric carries `verification: { class: 'illustrative', method: 'self' }`, which the
surface renders as "Self-reported". That is the designed landing place for a builder's own
figures: `caseStudyPublishGate.ts` refuses `class: 'verified'` on `method: 'self'` outright
as a mislabel rather than discounting it, and names `illustrative` as the publishable,
labelled alternative.

The consequence is stated in `caseStudySurfaceProfiles.ts`, spec §14: the production list
hides `illustrative` by default, and such a record "stays reachable by an explicit
`?verification=illustrative`, and never appears on the default index". Measured, with a
control:

```
/api/public/case-studies                            12 records, this one absent
/api/public/case-studies?verification=illustrative   1 record,  this one present
```

So the record is live, complete and reachable by its slug; it is not in the library index.
The lever is verification, not publishing: if the figures are recounted by someone other
than the builder, they become `verified` and the record joins the index. That is the first
item on its roadmap.

## Two judgement calls carried forward

- **The builder is credited by role, not named.** `builderIdentityMode: 'role_only'`,
  `builderNamingConsent: false`, matching his existing record on this platform
  (`testing-ai-actions-before-they-reach-customers`), which credits "An AI Systems
  Architect at Colaberry". Naming him is a one-field change if he consents.
- **No currency figure for staff time saved.** The builder's estimate rests on assumed
  hourly rates he explicitly asked to have replaced with real ones. His measured model
  spend ($327) is published; the derived savings are not, because an assumed rate is not a
  measurement.
- **`narrationSource` is omitted** on the walkthrough rather than guessed. It is optional,
  and asserting "human" or "synthetic" without knowing which would be the kind of small
  deception the field exists to prevent.

Session: CC-20261105-k4r8

---

# Part three: the review

Ali: *"the case study needs a review. It doesn't have all the pieces. Do a comparison with
at least 5 and figure out what all is missing and add it."* Plus: name the builder, link
his account, add the dollar figures, and the narration is synthetic.

## What was missing, counted rather than guessed

Every **published** record's approved snapshot was compared section by section, 15 of them,
not 5. The new record was missing exactly five sections:

| Missing | Records carrying it |
|---|---|
| `buildTimeline` | 14 of 15 |
| `repositories` | 14 of 15 |
| `surfaceVariants` | 14 of 15 |
| `contributors` | 13 of 15 |
| `builder` | 9 of 15 |

All five were added. The same query after the change returns **no rows**: the record now
carries every section any published record carries. `heroMetrics` is still absent, which
matches the library — only 2 of 15 have it.

## Reading the repository changed the record

The repo sync was run first. It produced real repository facts and a verified build
timeline seed, but it **rebuilt the snapshot from repo facts alone and dropped the authored
content** — the draft it wrote had no artifacts, metrics, decisions, closing or video. The
live pages were pinned to the approved snapshot throughout, so nothing broke, which is why
the sync was run as a draft and inspected before anything was published. The repo-derived
sections were merged into the authored content by hand instead.

Reading the repository then turned up four things the builder's report did not say.

**There is a second builder.** 267 commits by two people: a colleague wrote 76 from March
to September 2026, and the named builder wrote 187 from 17 September to 28 October — the
handover landing exactly where the reported measurement window starts. Crediting one person
would have been wrong. The record now carries both: the consented builder by name, the
earlier one by role, because no naming consent is recorded for them.

**Delivery to students is gated, and defaults to off.** A commit of 20 October adds a
live-delivery switch needing two independent keys, the server being armed and a separate
Settings switch. An earlier commit changes the approval card to say plainly that nothing is
delivered while the system is in shadow. So a notice being drafted and approved does not
establish that a student received it. The metric was reworded from "none sent without
approval" to "none released without a person approving", and a limitation now says
delivery is a separate thing.

**The cost figure rests on a rate that was once wrong.** A commit of 21 October fixes
logged model spend that had been recorded at a more expensive model's rates, roughly
seventeen times too high. Whether earlier rows were recomputed is not established, and the
record now says so.

**Most commits name an AI coding assistant as co-author** — 234 of 267. Stated rather than
hidden, following the precedent of the record already on this platform that does the same.

## The record is now on the default index

Two metrics were added that are **independently checkable**: commits in the reported period,
and commits carrying an AI co-author trailer. Both were counted directly from the public
repository at a pinned commit, without the builder, so both carry
`class: verified, method: repo` and cite a `case_study_evidence` row holding that repository
at that commit. Anyone can recount them.

That changed the record's standing. It was previously excluded from the production list
because every figure was `illustrative`. Measured after the change: the default index
returns it **first** of 12, `total` 15 — nothing was displaced, the index is paginated.

The operational figures remain `illustrative / self` and render as "Self-reported", which
is correct: that database is still not reachable from this platform.

## The dollar figures, with the rates named

Published as a **range**, as the builder recommended, not a single number: about $1,700 to
$10,000 of staff cost avoided at his assumed rates of twenty, thirty and forty dollars an
hour, against a running cost of about $350. Its limitations say in the first line that the
rates are placeholders he asked to have replaced, that the hours are an estimate rather
than a measurement, that staff approval time is not subtracted, and that this is the least
solid figure on the record.

## Two more gate refusals, both fixed at cause

- **`ai_generated_quote`** — a skill line quoted an on-screen label with nothing recording
  who wrote it. The label is now described rather than quoted.
- The earlier `unverified_claim` rule bit again during authoring and shaped the writing:
  figures stay out of `limitations` prose unless a verified metric carries them.

## Final state

Snapshot version 5, signed, published to `enterprise` and `training`. Builder named with
consent recorded 2026-11-05 and linked to `github.com/KesetebirhanDelele`. Narration
labelled `synthetic`. 9 metrics (2 verified, 7 self-reported), 11 timeline entries all
repo-verified, 2 contributors, 7 artifacts, 1 repository.

Session: CC-20261105-k4r8

---

# Part four: the render audit

Ali: *"I still think it needs another audit. It's lacking pizzazz."* Plus: name Jude too,
and the platform is live and running deployed.

## The pizzazz had a cause, and it was mine

Part three compared **stored** sections against the library and found five missing. It did
not check whether the stored sections **render**. Auditing the live projection instead of
the snapshot found four sections coming back empty on the page while sitting perfectly
well in the database:

| Section | Stored as | The contract wanted | Rendered |
|---|---|---|---|
| `situation` | `context`, `problem`, `constraints` | `narrative[]` + `verification` | nothing |
| `decisions` | `decision`, `rationale`, `tradeoff` | `key`, `title`, `problem`, `decision`, `evidence`, `consequence` | **0 of 4 cards** |
| `roadmap` | `item`, `status` | `label`, `status`, `verification` | **0 of 6** |
| `architecture` | `summary`, `components` | `narrative[]` | prose dropped |

They were authored against invented shapes rather than the contracts in
`types/caseStudy.ts`, and the projection drops what it cannot read **silently**. Four of
the record's most visible sections were blank. That is what "lacking pizzazz" looked like
from the outside, and no amount of adding would have fixed it.

**The lesson worth keeping: comparing snapshots proves a section was written, not that a
reader can see it. The projection is the only audit that counts.** Three of my probes in
this session read snapshot field names that do not exist on the wire — `builder.displayName`
is `name`, `repositories[].repoUrl` is `url`, `situation.narrative` is `body` — and each
time the first reading looked like a fault that was not there. Read the projector, not the
payload you expected.

## What that fixed, measured on the live page

```
                  before   after
heroMetrics            0       1     the thesis as one tile
decisions              0       5     cards with a stage and a closing figure
situation            none      4 paragraphs + 4 constraints + 3 goals
roadmap                0       7
architecture        prose dropped    9 lines + a Mermaid chart
visualStory      0 cards/0 charts    2 cards, 1 chart, workflow
```

Every one of the fourteen sections on the wire is now non-empty, and the record sits
**first of 12** on the default index with a **verified** card badge.

## Jude Ojobo, named

Consent given 5 November 2026, so the second builder is now named rather than credited by
role: 76 commits from March to September 2026 building the original pipeline, handed on in
September. The first timeline entry names them, and the second now names Kesetebirhan
Delele with his commit count.

## The platform is live

Confirmed by the platform owner on 5 November 2026. Recorded as its own
`case_study_evidence` row with `source_type: manual`, and `identity.productionStatus` now
carries `class: verified, method: manual` citing it — **not** `self`, because the person who
confirmed it is not the builder, and **not** `repo`, because a repository cannot evidence a
deployment.

It is deliberately kept separate from the measured period. The operational figures cover
fifty days during which delivery sat behind a two-key switch that defaults to off, so the
record says the confirmation is about the system today rather than about those fifty days.
Claiming otherwise would have been the easiest sentence to write and the wrong one.

## Final state

Snapshot version 6, signed, published to `enterprise` and `training`. Record badge
`verified / repo`. 9 metrics (2 verified by repository, 7 self-reported), 11 repo-verified
timeline entries, 5 decision cards, 2 named contributors, 7 artifacts, 1 hero tile, a
Mermaid architecture chart, and a visual story with two outcome cards and a chart.

Session: CC-20261105-k4r8

---

# Part five: looking at the page

Ali asked for the rendered page to be looked at by eye rather than measured through the
API. Two things came out of it, one of them a fault in my own tooling.

## A capture that invented a bug

The first full-page screenshot showed six application screenshots as empty grey bands with
real captions underneath. It looked exactly like the silent-drop fault from part four, and
it was not one.

`StoryFigure.tsx` renders every figure with `loading="lazy"`. A Playwright `fullPage`
screenshot does not scroll, so images below the fold never load and photograph as nothing.
The data was correct the whole time: all twelve images on the page fetch successfully, the
six screenshots at 1920px each.

`scripts/captureCaseStudyRender.js` now walks the page to the bottom in viewport steps,
waits for every `<img>` to report `complete && naturalWidth > 0`, and **names any image
that did not load** rather than quietly photographing a blank. Without that it would have
cost a wrong bug report, and nearly did.

## A fault the eye did find

Comparing the rendered measurement band against another published record's:

```
                    height   text
this record          242px    64 chars   heading + a collapsed disclosure
reference record     456px   866 chars   heading + narrative + disclosure
```

`measurement.narrative` is `readonly string[]`. It had been authored as one long string,
so `lines()` returned nothing and the entire narrative — the careful paragraphs separating
what was measured from what was assumed — rendered as blank. Same class of fault as
part four, found the same way: by comparing against a record that works.

Rewritten as six paragraphs. The band is now **795px and 2,147 characters**, ahead of the
reference.

A sweep then checked every section that the contracts type as a list, confirming all
thirteen are lists and none is a lone string.

## What the page looks like now

15,501px tall. Hero with the video, poster and a VERIFIED badge; an interactive eight-step
workflow walker drawn from the architecture diagram; two large outcome cards; the situation
with its goals and constraints; five decision cards; an eleven-point build timeline naming
both builders; the measurement narrative and nine metrics; a builder card with a six-skill
grid and an approved-profile link; "Who built it" crediting Kesetebirhan Delele and Jude
Ojobo; six application screenshots and the cover illustration.

## The tool that was missing

`scripts/captureCaseStudyRender.js` ships with this. It routes through `captureHelpers.js`
for the width ceiling, slices a tall page into readable segments, asserts every image
loaded, and reports headings with nothing beneath them. **The projection audit of part four
proved a reader could reach the content; only this proves they can see it.**

Final state: snapshot version 7, signed, published to `enterprise` and `training`.

Session: CC-20261105-k4r8
