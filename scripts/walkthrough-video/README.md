# Walkthrough video builder

Builds the narrated walkthrough that renders at the top of a Case Study record, in the
style Ali specified: a soft gradient with a faint dot grid, white cards with one rust
accent, and a dark caption box carrying the sentence being spoken.

It is deliberately **not** a general video tool. It does one thing: turn a deck of slides
plus real footage into an mp4 whose every on-screen figure is one the record already
verified.

## Honesty rules this encodes

- **Footage is the project's own recording.** Nothing is generated, staged or restaged. For
  the first record built with it, that is `docs/images/demoPortfolio.gif` committed to the
  subject repository.
- **Figures come from the record.** A number on a card must already be a published metric
  with a methodology and a denominator. Do not put a figure on a slide that is not on the
  page underneath it.
- **The narration is labelled.** `narrationSource: 'synthetic'` makes the page print a line
  saying so. An unlabelled synthetic voice is a small deception.
- **Frames are checked for people.** The demo recording of a learner's own portfolio
  contains their name, photograph and personal email. The deck's footage windows were
  chosen to land only on placeholder-state frames, and the highest frame index used was
  opened and looked at before shipping. **Re-check this for every new subject.**

## Running it

```bash
python make_narration.py     # neural voice -> audio/NN.mp3 + timings.json
python build_video.py        # slides + footage + audio -> repo2reputation-walkthrough.mp4
python make_vtt.py           # the accessible caption sidecar
```

`make_narration.py` must run first: segment durations come from how long each sentence
actually takes to speak, not from the deck's guesses, or a slide ends mid-word.

## Two failures worth not repeating

- **`ffmpeg -ss` into an animated GIF is unreliable.** Seeks to 1s and 11.5s worked; a seek
  to 30s produced a segment with no picture at all and exit code 0. Frames are now pulled
  by index with Pillow instead.
- **The concat demuxer drops unreadable segments and still exits 0.** The build measures
  the finished file with `ffprobe` and refuses a result that drifts from the intended
  length. Short means a segment was dropped; long means one overran its own trim. They are
  different faults and the check says which.

## Narration voice

`en-US-AndrewNeural`, a Microsoft neural voice, through `edge-tts`.

**Check what is already installed before offering the user a choice.** The first cut used
the built-in Windows SAPI voice because that was the only engine anybody had checked for,
and Ali's verdict was blunt: *"voice is horrible."* `edge-tts` was already installed on the
machine the whole time — so the neural voice needed no install, and the skill's
provisioning gate never applied. `Microsoft David` is a pre-neural concatenative voice and
no rate or pitch setting fixes that; the engine has to change.

Swapping narrator means changing `VOICE` in `make_narration.py` and nothing else. The nine
en-US male voices carry Microsoft's own personality tags — `AndrewNeural` is warm /
confident / authentic / honest, `ChristopherNeural` reliable / authority, `BrianNeural`
approachable / casual / sincere. Audition two or three before committing; it takes a
minute and it is the difference between a record people watch and one they mute.

**What leaves the machine:** the narration text, to Microsoft's Edge TTS endpoint. Here
that text is the case study's own captions, already published on three public sites. It is
still a third-party call and worth stating.

**The endpoint is flaky under a burst.** It returns `NoAudioReceived` intermittently —
eleven segments back to back is exactly that — and it killed the first run on segment 0
having produced the same sentence successfully seconds earlier. `speak()` has a bounded
exponential retry. Do not remove it and conclude the input was bad.

## Shipping the file

**`docker cp` into the nginx container is not a deploy.** The video is baked into the
nginx image from `frontend/public/site-v2/`, so a copied-in file survives only until the
container is next recreated — and on a box where other sessions deploy, that can be
minutes. It happened twice here: once losing the screenshots, once silently reverting a
re-recorded narration to the previous voice while the page still returned 200 and the
correct byte count *at the moment it was checked*.

Commit the file, merge, then rebuild nginx. When verifying, compare the **byte count or
md5 against the local file**, not just the status code: the old and new videos both return
200 and differ only in content.
