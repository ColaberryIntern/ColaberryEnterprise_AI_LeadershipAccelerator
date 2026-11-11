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

## Setting up a machine (Windows)

Every slot below has one value. Check first; install only what the check says is missing.

| Slot | Value | Check (prints a version, or it is missing) |
|---|---|---|
| Python | 3.12, per-user | `"$LOCALAPPDATA/Programs/Python/Python312/python.exe" --version` |
| Narration | `edge-tts` (pip) | `python -c "import edge_tts"` |
| Imaging | `Pillow` (pip) | `python -c "import PIL; print(PIL.__version__)"` |
| Video | ffmpeg + ffprobe, gyan.dev full build | `ffprobe -version` |
| Fonts | `C:/Windows/Fonts/arial.ttf`, `arialbd.ttf` | present on every Windows install |
| Voice | `en-US-AndrewNeural` | set in `make_narration.py` (`VOICE`) |

Install, when a check fails (about 5 minutes, no cost, user scope where offered):

```powershell
winget install --id Python.Python.3.12 -e --scope user --silent --accept-package-agreements --accept-source-agreements
winget install --id Gyan.FFmpeg -e --silent --accept-package-agreements --accept-source-agreements
& "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe" -m pip install --user edge-tts Pillow
```

**PATH, the one that bites.** winget's `Links` shim folder is not enough: Python's
`subprocess` cannot start `ffprobe` through it (`FileNotFoundError: [WinError 2]`, measured
2026-11-11). Put ffmpeg's real `bin` folder first on PATH in the shell that runs the build:

```powershell
$bin = Split-Path (Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter ffprobe.exe | Select-Object -First 1 -ExpandProperty FullName)
$env:PATH = "$bin;$env:PATH"
```

First installed on AliSuperStation on 2026-11-11 (Python 3.12.10, ffmpeg 9.0.2, Pillow 13.0.0)
for the ToolSmithAI record; nothing was installed into the repository.

## Running it

One deck per record, under `decks/`. Everything is written beside the deck file, so two
records never overwrite each other's narration.

```bash
D=decks/coreops.json
python make_narration.py --deck $D   # neural voice -> audio/NN.mp3 + timings.json
python build_video.py    --deck $D   # slides + footage + audio -> the mp4 it names
python make_vtt.py       --deck $D   # the accessible caption sidecar
```

A deck declares `output`, its `slides`, and optionally a `gif` plus `gifCrop` when the
subject committed a demo recording. A record without one — most of them — uses
`screenshot` slides of its real captures instead. Slide kinds: `title`, `cards`,
`screenshot`, `diagram`, `image`, `footage`.

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
