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
