# CC-20261103-m9x4 — Swati Raman's case study: the hosted assets

- [x] Host the walkthrough video, hero image and five capture artifacts for the
      Stress Test Review App case study
  - Date: 2026-11-03
  - Session: CC-20261103-m9x4
  - What changed: eight files added to `frontend/public/site-v2/` — the builder's own
    2:53 demo recording, a poster frame, a hero thumbnail, and five stills of the
    running application pulled from that recording.
  - Verification: every file hashed and sized after extraction; the `?v=` cache key is
    the first eight characters of each file's MD5, confirmed against three existing
    pairs in the same directory before any name was chosen.
  - Notes: see below.

## Why these assets and not others

The record was measured against the two published records Ali named and came out a
third of their size. Three of the remaining gaps — `walkthroughVideo`, `heroImageUrl`
and real `artifacts` — could not be closed by a database write, because the other
records serve those from `/site-v2/`, which is baked into the nginx image from this
directory. So they are a repository change and a deploy, which is what this is.

## The frame check, which is not a formality

`scripts/walkthrough-video/README.md` carries the rule: *"Frames are checked for
people... Re-check this for every new subject."* This subject is a review tool whose
screens show student submissions and the feedback written about them, so the risk was
real rather than theoretical.

Twelve frames were extracted across the 172.6 seconds and looked at. **The builder had
already solved it:** every student on screen is captioned `Student A (fictional)` or
`Student C (fictional)`, the feedback bodies are prefixed `(demo)`, the health banner
is labelled `Demo page: the health answer below is made up`, and the prepared-feedback
screen is signed by `demo-admin@example.com`. No real student name, submission or
email appears in the recording. The five stills were chosen from those frames.

## Two things the video does that the record has to answer for

1. **No captions.** Every other walkthrough in this directory ships a `.vtt` sidecar.
   Those are synthetic narrations built by `scripts/walkthrough-video/`, so their text
   was known before the audio existed. This one is the builder's own voice, and there
   is no speech-to-text model on this machine, so there is nothing honest to write into
   a caption file. It ships without one and `narrationSource` is `human`, not
   `synthetic`. Writing captions is a real remaining task, not an oversight.

2. **Two slides carry comparisons the record deliberately does not restate.** At about
   1:45 and 2:00 the video shows reviewer-time reductions expressed as percentages.
   Those rest on a reviewer's estimate of how long the work used to take, not on a
   measurement, and the record's measurement narrative says so and points at the video
   by name rather than letting the two disagree silently. Only the ST2 figure was
   measured, over four reviews.

## The naming convention, verified rather than assumed

`?v=` is the first eight characters of the file's **MD5**, not its SHA-256. Checked
against `cora-staff-call-quality-walkthrough.mp4` (`e251e6be`), its poster
(`d1eed08e`) and `thumb-the-call-was-already-over-a.jpg` (`983a68d1`) — all three
matched MD5 and none matched SHA-256.

| File | Bytes | `?v=` |
|---|---|---|
| `swati-stress-test-review-walkthrough.mp4` | 6,828,815 | `bb77c8f6` |
| `poster-swati-stress-test-review-walkthrough.jpg` | 96,914 | `2c6a3fc6` |
| `thumb-stress-test-review-app.jpg` | 122,255 | `99a1cd81` |
| `shot-str-review-queue.png` | 413,720 | `e8839d76` |
| `shot-str-previous-round.png` | 434,310 | `5e9b994c` |
| `shot-str-reviewer-decision.png` | 264,338 | `2ad87ba0` |
| `shot-str-feedback-prepared.png` | 309,160 | `88752e9f` |
| `shot-str-circuit-breaker.png` | 151,825 | `bc9c50a3` |

## Deploying this

The nginx image is pulled from the registry in production
(`ghcr.io/colaberryintern/accelerator-nginx:main`), so CI builds it and the box does
not. That matters: `nginx/Dockerfile` runs a full React build, and running it on the
production host has twice pushed the shared Postgres into crash recovery. Deploy by
pulling the published image once CI has produced one for main's tip, never by building
nginx on the box.

---

## Follow-up: the hero thumbnail was never reachable, and why

`identity.heroImageUrl` does **not** name the cover. `resolveHeroImage` in
`caseStudyPublicSections.ts` honours it *only when the URL matches an artifact that
already passed `projectArtifacts`* — approved, open, publicly viewable — and otherwise
walks `HERO_IMAGE_PRIORITY` (`screenshot`, `architecture`, `photo`) and takes the first
approved artifact of that kind. The module says why in terms: trusting the field on its
own "would let a cover bypass artifact approval and publish a picture the gate never
saw, which is the one thing it must not become."

So `thumb-stress-test-review-app.jpg` was ignored, the cover fell through to the first
approved screenshot, and the page looked right **by luck rather than by choice**.

Caught by reading the live projection rather than the write: every override reported
success, the publish gate reported zero blockers, and the field was still being
discarded downstream. The same read caught the measurement narrative opening with
"Seventeen figures" over a list of sixteen — the counts are now derived from the array
rather than retyped.

### And the conclusion drawn from it was half right

The first reading of that failure was "a cover must be one of the record's own approved
artifacts, so shipping a separate thumbnail file is wasted work." The first half is the
rule. **The second half is wrong**, and following it would have left this record the only
one in the library whose cover is a screenshot of a user interface.

`scripts/case-study-thumbnails/` is the pipeline that makes a thumbnail reachable: three
generated concepts per record, a person reads every word in the picture, the pick is
cropped to 16:9, committed, deployed, and then `apply-cover.js` writes it as an
`artifact_type: 'photo'` row — approved, public, and stamped `atmosphere` by the
projection so it can never be read as evidence of the work. *That* row is what makes
`identity.heroImageUrl` honour the URL. The thumbnail was never the wasted part; the
missing artifact row was.

---

## The cover, run through the pipeline that exists for it

- [x] Generate and ship a made cover for the Stress Test Review App record
  - Date: 2026-11-04
  - Session: CC-20261103-m9x4
  - What changed: three cover concepts generated with `gpt-image-2.5-flare` inside
    `accelerator-backend`, then the picked one re-run three more times to put a woman's
    hand on the stamp; all three concepts cropped to 1536x864 and committed to
    `frontend/public/site-v2/`. The screenshot crop that nothing could reference was
    removed in PR #3647.
  - Verification: every image looked at at full size before the crop was chosen — no
    invented words, no numbers, no interface in any of the six; the shipped hand checked
    at full resolution for anatomy and stray text; crop point chosen by measuring the
    headline's pixel rows rather than by eye.
  - Notes: see below.

The record's cover was `shot-str-review-queue.png`, a screenshot of the application's
queue. Both reference records carry a made cover instead — a cinematic photograph with a
four-word hook, 1536x864 — and the pipeline for producing one has been in the repository
since 2026-09-18. It had simply not been run for this record.

| | Hook in the picture | Crop | Bytes | `?v=` |
|---|---|---|---|---|
| a — the student still waiting | `STILL WAITING.` | `--top 160` | 151,698 | `1391d5c9` |
| b — the draft held at the slot | none | `--top 80` | 224,074 | `0a3fe385` |
| **c — the stack, and the one she signed** | `A PERSON DECIDES.` | `--top 160` | 180,758 | `01975bd2` |

**Ali picked c, with one change: a woman's hand on the stamp, not a man's.** The first
draw of c had rendered a man's. The concept was re-run three times with the hand described
(slender fingers, short unpainted nails, a light rolled-up shirtsleeve) and the third take
shipped: the largest and most confident of the three, the stamp poised directly over the
page, the hottest colour in the frame landing exactly on the gesture the record is about.
Inspected at full resolution before the crop — five fingers, correctly formed, no stray
text on the desk or the ink pot.

For the record, c was not the recommendation. a was, on the argument that both reference
covers lead with a face. The argument was sound and the call was still Ali's: c is the
only one of the three that shows the decision the record is *about*, which beats matching
a layout.

The model added a full stop to both hooks that the prompt did not ask for. It is a mark,
not an invented word, so `edit.js` was not run — the rule that matters is that the model
invents *slogans* on cards and screens, and none of the six images drawn for this record
carries a word the prompt did not supply.

The crop point was measured, not judged. The shipped c's headline occupies rows 777-935 of
the 1024-row source, so any `--top` below 72 clips it; `--top 160` keeps the text whole
with 88 pixels beneath it. The same method rejected `--top 110` on a earlier in the day,
after putting the two candidates side by side: the text sat too low and crowded the edge.

**All three are committed**, as the reference records' a/b/c variants are, so changing the
pick later is one `apply-cover.js` run and no deploy.

---

## 2026-11-04 — the circuit-breaker screenshot was a picture of nothing

`shot-str-circuit-breaker.png`, captioned "What the reviewer sees when Basecamp stops
answering", carried the warning banner correctly and then roughly six hundred pixels of
empty grey panel beneath it. The capture had been taken without Basecamp access, so the
queue it was meant to show had no rows to draw. The failure path was the subject of the
shot and the only thing visible was the failure of the capture.

The builder re-took it on her own machine with the breaker open and the queue populated:
banner, the seven step tiles, the "Newest in Basecamp / Basecamp not available" strip, and
seven student rows. Nine reviews, all labelled fictional.

Her capture was 2880x2000 at 2.4 MB, a 2x full-page shot. The other four screenshots in
this record are uniformly 1280x760 at 264 to 434 KB, so it was resized to 1280 wide with
lanczos3 and written as a palette PNG: **1280x889, 233,813 bytes**, inside the family's
weight budget. The aspect is taller than its siblings because the source is; cropping to
1.684 would have sliced a student row in half to buy nothing.

**The repo commit is only half the job.** `?v=` is the first eight characters of the
file's MD5 and is a separate Cloudflare cache key, so a new PNG shipped under the old
`?v=` reaches no reader: the edge keeps serving the cached old image and the deploy looks
successful while the page is unchanged. The artifact row's URL has to move with the file.

- old file `bc9c50a3`, 151,825 bytes — and the live artifact URL said `?v=bc9c50a3`,
  which is the control that proves the MD5 rule rather than assuming it
- new file `01dbcc3a`, 233,813 bytes — the artifact URL is updated to match
