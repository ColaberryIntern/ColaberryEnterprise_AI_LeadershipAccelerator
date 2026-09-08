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
python make_narration.py     # Windows SAPI male voice -> audio/NN.wav + timings.json
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

The built-in Windows voice (`Microsoft David Desktop`) was Ali's explicit choice over
installing a neural TTS. The `walkthrough-video-production` skill's hierarchy is user
preference → Kokoro → approved cloud → basic OS voices, so this is the bottom tier chosen
deliberately, not by default. Swapping engines means changing `make_narration.py` only;
nothing downstream knows how the wav was made.
