---
name: short-form-video
description: Produce a short vertical social video (TikTok/Reels/Shorts/LinkedIn) end to end on local hardware - generate the imagery with ComfyUI, rasterise kinetic type with Pillow, and cut it in ffmpeg. Invoke for any request like "make a viral video", "a 15 second spot for X", "a promo clip for the free class", or when a marketing video is needed without stock footage, licensing exposure, or per-render API cost.
user-invocable: true
---

# Short-Form Video — Local Generation Protocol

Produces a finished vertical MP4 from a one-line brief. No stock footage, no
per-render cost, no external video API. Everything runs on the local machine.

**Proven by:** the free-class 15s spot (`docs/marketing/FREE_CLASS_VIRAL_15S.md`),
built end to end on a GPU-less laptop in ~2h05 of unattended generation.

---

## Step 0 — Hardware triage (DO THIS FIRST, it decides everything)

```powershell
nvidia-smi                       # discrete NVIDIA GPU?
python --version; ffmpeg -version | Select-Object -First 1
```

| Hardware | Approach |
|---|---|
| Discrete NVIDIA, ≥12GB VRAM | A real video model (WAN 2.2, LTX-Video) is viable. Generate motion directly. |
| Discrete NVIDIA, 6-12GB | LTX-Video 2B distilled, short clips, or fall back to the stills path below. |
| **No discrete GPU (CPU only)** | **Stills + ffmpeg motion. This is the documented path below.** |

**Never attempt a text-to-video model on CPU.** Measured on an i7-1255U (15W):
SDXL fp32 at 768x1344 ran **172-240 seconds per sampling step**. A single 5s video
clip would take many hours. The stills path produced a finished 15s spot in the time
one video clip would have failed to render.

This is not a compromise. At 1.5-2.6s per cut with a Ken Burns move, generated stills
are indistinguishable from a shot edit on a phone screen — and hard cuts with kinetic
type is the format that actually performs on vertical feeds.

---

## Architecture

Four files, one data source. `shots.json` is the single source of truth — prompts,
durations, copy, motion, seeds, per-shot overrides.

| File | Role |
|---|---|
| `shots.json` | Every creative decision, in one editable place |
| `generate_shots.py` | Submits each shot to the ComfyUI HTTP API, polls `/history`, collects PNGs |
| `render_text.py` | Rasterises text overlays (Pillow) at full output resolution, RGBA |
| `assemble.py` | Ken Burns + grade + overlay per shot, concat, **probe-verify** |

Cost asymmetry that shapes the workflow: **changing copy is free** (re-run
`render_text.py` + `assemble.py`, seconds). **Changing a prompt or seed is expensive**
(a full re-generation, ~15 min/shot on CPU). Lock the imagery, then iterate the words.

---

## Hard rules

### 1. Install ComfyUI OUTSIDE OneDrive
Multi-GB checkpoints inside a synced folder cause a sync storm and can corrupt the
tree. Use `C:\Users\<user>\Downloads\ComfyUI` or similar. Same for the working dir.
Only the finished MP4 and the brief go into the repo.

### 2. At cfg 1.0 the negative prompt is INERT
SDXL-Turbo (and every distilled few-step model) runs at cfg 1.0, which disables
classifier-free guidance. `"text, watermark, letters"` in the negative field does
**nothing**. The only defences against garbled fake lettering are:
- **Do not prompt anything that implies writing.** No whiteboards, signage, posters,
  documents, sticky notes, book pages, or screens described as showing text.
- Scrim and crop over whatever slips through.

A whiteboard reshoot on the reference project came back wall-to-wall gibberish
handwriting and had to be discarded. Learn it from this line instead.

### 3. Type is rasterised with Pillow, never ffmpeg `drawtext`
`drawtext` escaping on Windows is miserable (colons, backslashes in font paths) and
gives no auto-fit. Pillow gives real per-line size fitting, accent colouring, letter
tracking, and a legibility scrim. `render_text.py` handles it.

### 4. Every text block sits on a scrim
A soft dark vertical gradient behind the type. It does two jobs: guarantees contrast
over any generated background, and hides the pseudo-text SDXL paints onto monitors.
Non-negotiable — generated backgrounds are unpredictable.

### 5. Lock the text anchor
Keep the text block at a constant vertical anchor (~45%) across every statement beat.
Varying it reads as jitter across fast cuts. Only the CTA card should move.

### 6. Measure the output, never trust the arithmetic
**This is the rule that matters most.** ffmpeg's concat demuxer will skip an
unreadable segment and **still exit 0**. On the reference project an interrupted
encode left a 48-byte clip; the build reported a healthy "450 frames = 15.00s" — a
number computed from the shot list — while actually shipping 339 frames / 11.30s,
missing the last two beats including the CTA.

`assemble.py` now:
- reuses a cached clip only if it decodes to the **exact** expected frame count
- probe-verifies every clip after encoding
- probe-verifies the delivered file against the expected total, exiting non-zero on mismatch

Never report a duration you have not read back with `ffprobe`.

### 7. Fix weak shots in post before re-rolling
A re-generation costs ~15 min on CPU. A grade or crop costs zero. `shots.json`
supports per-shot `zoom_base` (permanent crop-in, pushes weak edge detail out of
frame) and `grade` (overrides the global grade). Used on the reference project to
darken a too-bright keyboard shot and to hue-rotate a cyan shot to amber so it stopped
reading as a duplicate of another.

### 8. Discarded takes are recoverable
Every generation is kept in `ComfyUI/output/<prefix>/<id>_0000N_.png`. Before
re-rendering a shot you rejected, check there — the reference project recovered an
original take this way instead of spending another 15 minutes.

---

## Copy discipline

**Every on-screen claim must trace to a verifiable source.** Fetch the live landing
page and quote it. Put a claim-verification table in the brief.

**Never invent specifics.** If the source does not state a duration, price, seat
count, date, or outcome statistic, the video does not claim one. On the reference
project the site stated no class length and no session date, so the spot claimed
neither — and the brief records that omission as deliberate, with a note on where to
add it if the fact ever becomes official.

**Verify the CTA URL resolves before it goes in the video.**
```powershell
curl.exe -s -o NUL -w "%{http_code} -> %{redirect_url}" --max-time 20 https://yourdomain.com
```
Prefer a short vanity domain that 301s with its own UTM — the video then
self-attributes with no extra tagging.

---

## Structure that works for 15s

Text carries the whole message; short-form autoplays muted. Build it to be legible
with the sound off.

| Beat | Function |
|---|---|
| 1-2 | Callout hook. Name a behaviour the viewer recognises in themselves. |
| 3-5 | Reframe. There is a better way, and it is learnable. |
| 6 | The offer, stated plainly. |
| 7 | The transformation, ideally in the brand's own words. |
| 8 | One short memorable URL, held long enough to type. |

Give the hook the longest hold (~2.6s) — it carries the most reading load and has to
survive the scroll. Run the middle beats short to build pace. Hold the CTA ~1.8s.
Do not sell in the first two seconds.

Alternate the Ken Burns direction (push / pull / lateral) so no two consecutive beats
move the same way. Hard cuts only, no dissolves. One unified grade across all shots so
separate generations read as one film.

---

## Audio

**Ship silent, with a silent AAC track present** (some platforms mishandle a
video-only upload).

Short-form reach depends substantially on trending audio, which must be attached
inside the platform's own editor to count toward the sound's discovery page. A track
baked into the file does not. Time the beats at 1.5-2.6s intervals so they sit under
a typical 120-130bpm track.

**Flag this to the operator:** business/brand accounts on TikTok and Instagram are
restricted to the Commercial Music Library, not the full trending catalogue. Which
account posts is a decision that should be made before publishing.

To bake a track in anyway (video is stream-copied, so no quality loss):
```powershell
ffmpeg -y -i in.mp4 -i track.mp3 -filter_complex "[1:a]atrim=0:15,afade=t=in:st=0:d=0.2,afade=t=out:st=14.3:d=0.7,aresample=48000[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart out.mp4
```

---

## Run procedure

```powershell
# 1. Install ComfyUI (once), OUTSIDE OneDrive
git clone https://github.com/comfyanonymous/ComfyUI.git C:\Users\<user>\Downloads\ComfyUI
cd C:\Users\<user>\Downloads\ComfyUI
python -m venv venv
.\venv\Scripts\python.exe -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
.\venv\Scripts\python.exe -m pip install -r requirements.txt

# 2. Checkpoint -> models/checkpoints/  (SDXL-Turbo, ~6.5GB, no auth needed)
curl.exe -L -o models\checkpoints\sd_xl_turbo_1.0_fp16.safetensors `
  https://huggingface.co/stabilityai/sdxl-turbo/resolve/main/sd_xl_turbo_1.0_fp16.safetensors

# 3. Serve headless (leave running)
.\venv\Scripts\python.exe main.py --cpu --port 8188 --disable-auto-launch

# 4. Author shots.json in a fresh working dir, then:
$py = "C:\Users\<user>\Downloads\ComfyUI\venv\Scripts\python.exe"
& $py <skill>\scripts\generate_shots.py --project . --steps 3
& $py <skill>\scripts\render_text.py   --project .
& $py <skill>\scripts\assemble.py      --project .
```

Drop `--cpu` and raise `--steps` to 4-6 on a real GPU.

**Sampling settings for SDXL-Turbo:** cfg 1.0, 3-4 steps, `euler_ancestral` +
`sgm_uniform`, generate at ~1MP (768x1344 for 9:16). Below ~0.6MP SDXL starts
duplicating limbs and cropping subjects; stay near native.

**Do not run ffmpeg while the sampler is working.** On a CPU-bound machine it steals
cores and stretched the reference project's per-step time from 172s to 240s.

---

## Verification gate

A spot is not done until all of these pass:

1. `ffprobe` confirms **measured** frame count and duration match the shot list
2. Codec/container checked: H.264 High, yuv420p, `moov` near offset 0 (faststart)
3. Contact sheet reviewed across all beats — check for **near-duplicate shots**, which
   read as a repeated clip and are the most common continuity defect
4. Full-res check of the busiest frame for text legibility
5. Every claim traced in the brief's verification table
6. CTA URL confirmed live

Build the contact sheet without glob (many Windows ffmpeg builds lack it):
```powershell
# explicit -i per file, then scale + hstack/vstack in filter_complex
```

---

## Deliverables

- `docs/marketing/<name>.mp4` — the master
- `docs/marketing/<NAME>.md` — brief: strategy, script table with timings, claim
  verification table, design decisions, pipeline, regeneration steps
- `PROGRESS.md` entry with the **measured** verification evidence

Keep the working directory (shots.json, images, clips) outside the repo. It is
reproducible from `shots.json` and the stills are large.
