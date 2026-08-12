# Free Class — 15s Vertical Spot

Short-form social spot driving signups to the free AI class. Generated locally with
ComfyUI (SDXL-Turbo) for the imagery and ffmpeg for the cut. No stock footage, no
licensing exposure, no per-render cost.

- **Deliverable:** `docs/marketing/colaberry_free_ai_class_15s.mp4`
- **Format:** 1080x1920 (9:16), 30fps, 15.00s, H.264 + silent AAC track
- **CTA:** `myfreeaiclass.com` (301 → `training.colaberry.com` with `utm_source=myfreeaiclass&utm_medium=domain`)

---

## Strategy

The spot does not open by selling the class. It opens by naming a behaviour the
viewer recognises in themselves — using AI as a fancy search box — and then
reframes what "good at AI" actually means. The offer only appears at second 9,
once the viewer has a reason to want it.

| Beat | Function |
|---|---|
| 1-2 | Callout hook. Name the mediocre habit; make it feel small. |
| 3-5 | Reframe. There is a different way to work, and it is a learnable skill. |
| 6 | The offer, stated plainly: free, no card. |
| 7 | The transformation, in the brand's own words. |
| 8 | One short memorable URL, held long enough to type. |

Text carries the whole message because short-form autoplays muted. The spot is
built to be legible with the sound off.

---

## Script and timing

Total 15.00s = 450 frames @ 30fps.

| # | In | Dur | On-screen text | Accent |
|---|---|---|---|---|
| 1 | 0.00 | 2.6s | Most people use AI / **like a search engine.** | blue |
| 2 | 2.60 | 1.5s | Ask. Copy. Paste. / **Repeat.** | blue |
| 3 | 4.10 | 1.6s | Architects work / **differently.** | green |
| 4 | 5.70 | 2.4s | They make it a / **work partner.**<br><sub>research · analysis · planning</sub> | green |
| 5 | 8.10 | 1.6s | That's a skill. / **And it's teachable.** | green |
| 6 | 9.70 | 1.6s | **A free class.** / No card needed. | green |
| 7 | 11.30 | 1.9s | From AI curious / **to AI architect.** | green |
| 8 | 13.20 | 1.8s | COLABERRY / **myfreeaiclass.com** / Start learning for free | green |

The hook gets the longest hold (2.6s) because it carries the most reading load and
has to survive the scroll. Beats 2-6 run short to build pace. The CTA holds 1.8s.

---

## Claim verification

Every factual claim in the spot traces to live site copy — nothing was invented.

| Claim on screen | Source | Status |
|---|---|---|
| "work partner … research · analysis · planning" | `training.colaberry.com` — "how to use Claude as a work partner for research, analysis, planning, and problem-solving" | verbatim |
| "A free class. No card needed." | site copy "Free · no card needed" | verbatim |
| "From AI curious to AI architect." | site tagline | verbatim |
| "Start learning for free" | site CTA wording | verbatim |
| `myfreeaiclass.com` | returns 301 → training.colaberry.com | verified live |

**Deliberately omitted:** any class duration or session date. The site does not
state either, so the spot does not claim one. If a fixed duration ("90 minutes")
or a next-session date becomes official, beat 5 or 6 is the place to add it — that
is the single highest-value edit available to this cut.

---

## Design

Brand tokens from `frontend/src/styles/tokens.css`: navy `#1a365d`, blue
`#2b6cb0`, green `#38a169`.

The two accents are lifted for video legibility against dark footage —
blue `#63A9EA`, green `#4FD68C` — same hues, enough contrast to pass on a phone in
daylight. Type is Segoe UI Black, auto-fitted per line to a 904px measure. Every
text block sits behind a soft navy scrim, which both guarantees contrast and hides
the garbled pseudo-text SDXL sometimes paints onto monitors.

Text is locked to a constant 45% vertical anchor across all seven statement beats
so the eye does not have to re-find it on each cut. Only the CTA card shifts.

Motion: a 10% Ken Burns move per shot, alternating push / pull / lateral so no two
consecutive beats move the same way. Hard cuts throughout — no dissolves. One
unified grade (contrast 1.08, saturation 1.06, vignette) across all eight shots so
eight separate generations read as one film.

Two shots carry a per-shot override (`zoom_base` and `grade` in `shots.json`),
both fixing a generation weakness in post rather than by re-rolling the model:

- **Shot 2** was reshot rather than rescued. The original prompt ("fingertips striking
  a mechanical keyboard") lost the fingers entirely and covered every keycap in
  garbled pseudo-lettering; a crop-and-darken grade hid it but left the weakest frame
  in the film. Reprompted to express repetition through identical repeating *objects* —
  a receding bank of blank monitors — which removes both the anatomy risk and the
  lettering risk at source. It keeps a mild cool grade (gamma 0.90, blue push) to sit
  alongside shot 1. **The lesson: when the subject itself is the problem, reprompt;
  grade only fixes tone.**
- **Shot 5** originally read as a near-duplicate of shot 7 — both wide cyan node
  networks, and back-to-back-ish they looked like a repeated shot. It gets a 45%
  crop-in so it reads as a macro detail, and a −145° hue rotation that takes it
  from cyan to warm amber. The two shots are now unmistakably different.

**The trap to know about:** SDXL-Turbo runs at cfg 1.0, which means classifier-free
guidance is off and **the negative prompt does nothing**. "text, watermark, letters"
in the negative is inert. The only defences against garbled fake lettering are (a)
not prompting anything that implies writing, and (b) the scrim and crop. A reshoot
of shot 5 as a whiteboard covered in "hand-drawn diagram and sticky notes" was
abandoned for exactly this reason — it came back wall-to-wall gibberish handwriting.

---

## Audio

Shipped with a **silent** stereo track, deliberately.

Reach on TikTok / Reels / Shorts is driven substantially by trending audio, which
has to be attached inside the platform's own editor to count. Add a trending track
at upload. The cut is timed so beats land on 1.5-2.6s intervals, which sits
comfortably under most 120-130bpm tracks. The silent AAC stream is present because
some platforms mishandle a video-only upload.

---

## Pipeline

**The canonical, reusable version of this pipeline is the `short-form-video` skill**
(`.claude/skills/short-form-video/`). Invoke `/short-form-video` for the next spot
rather than copying this one — the skill's scripts are project-agnostic (`--project
<dir>`) and its `templates/shots.example.json` is this spot, kept as a working
reference. What follows describes this specific instance.

Working directory (outside OneDrive, to keep multi-GB model files out of sync):
`C:\Users\ali_m\Downloads\colaberry-viral-15s\`

| File | Role |
|---|---|
| `shots.json` | Single source of truth: prompts, durations, copy, motion, seeds |
| `generate_shots.py` | Submits each shot to the ComfyUI HTTP API, polls `/history`, collects PNGs |
| `render_text.py` | Rasterises the text overlays (Pillow) at 1080x1920 RGBA |
| `assemble.py` | Ken Burns + grade + overlay per shot, then concat |

ComfyUI lives at `C:\Users\ali_m\Downloads\ComfyUI` (CPU mode — this machine has
no discrete GPU; torch 2.13.0+cpu, Intel Iris Xe only).

Regenerate:

```powershell
cd C:\Users\ali_m\Downloads\ComfyUI
.\venv\Scripts\python.exe main.py --cpu --port 8188 --disable-auto-launch   # leave running

cd C:\Users\ali_m\Downloads\colaberry-viral-15s
& C:\Users\ali_m\Downloads\ComfyUI\venv\Scripts\python.exe generate_shots.py --steps 4
& C:\Users\ali_m\Downloads\ComfyUI\venv\Scripts\python.exe render_text.py
& C:\Users\ali_m\Downloads\ComfyUI\venv\Scripts\python.exe assemble.py
```

`generate_shots.py` is idempotent — it skips any shot whose PNG already exists, so
an interrupted batch resumes rather than restarting. To force a reshoot, delete
that shot's PNG from `images/`, or change its `seed` in `shots.json` to get a
different take of the same prompt. Every take is also kept in
`ComfyUI/output/colaberry/` as `<id>_0000N_.png`, so a discarded take can be
recovered without re-rendering (which is how shot 5's original was restored).

`assemble.py` re-encodes a clip only when the clip is older than its inputs **or**
does not decode to the exact expected frame count, and it verifies the delivered
file by measuring it with ffprobe. That check is not decorative: during development
an interrupted encode left a 48-byte `07_hero.mp4`, ffmpeg's concat demuxer silently
skipped the segment and still exited 0, and the build reported a healthy
"450 frames = 15.00s" while actually shipping 339 frames / 11.30s. The frame-count
assertion is what turns that class of failure into a loud one.

Editing copy costs nothing: change `lines` / `sub` in `shots.json`, re-run
`render_text.py` and `assemble.py`. Only a changed **prompt or seed** requires
re-running the slow generation step.

---

## Distribution notes

- Add a trending audio track in-platform at upload.
- Burn platform captions on — the text beats are the script, so auto-captions add
  little, but captions still lift retention on most feeds.
- Because `myfreeaiclass.com` carries its own UTM, signups from this spot are
  attributable in analytics without any extra tagging.
- The vertical master crops safely to 1:1 and 4:5 — text sits between 38% and 58%
  of frame height, clear of both the top and bottom platform UI bands.
