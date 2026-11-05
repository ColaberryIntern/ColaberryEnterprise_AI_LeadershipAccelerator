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
