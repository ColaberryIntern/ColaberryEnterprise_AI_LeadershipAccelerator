# Reel 4 — The Performance Review Wake-Up Call (45s)

Local adaptation of Sohail Syed's Reel 4 script. Generated with ComfyUI (SDXL-Turbo)
and cut in ffmpeg on a GPU-less laptop. No stock footage, no actors, no licensing
exposure, no per-render cost.

- **Deliverable:** `docs/marketing/colaberry_reel4_performance_review_45s.mp4`
- **Format:** 1080x1920 (9:16), 30fps, **1350 frames = 45.000000s** (ffprobe-measured),
  H.264 High / yuv420p, faststart, silent AAC stereo, 18.8 MB
- **CTA:** `myfreeaiclass.com` → 301 → `training.colaberry.com/?utm_source=myfreeaiclass&utm_medium=domain`

**Source:** Basecamp todo `10187503746`, comment `10187511757` (2026-08-10). Reel 4 is
the only two-character script of the four Sohail posted, which is what his 08-12 comment
("here is the 2 character ad scripts") points at.

---

## This is an adaptation, not a literal render — read this first

Reel 4 as written is a five-scene two-hander: Mark and Lisa, both on screen, speaking.
**That is not renderable on the machine this was built on.** No discrete GPU
(i7-1255U / Iris Xe), so no video model and no lip-sync at any runtime; and SDXL stills
cannot hold a face across seventeen shots without IP-Adapter/InstantID, which is not
installed and would be prohibitively slow on CPU.

What was built instead: **the dialogue verbatim as speaker-attributed on-screen text**
over cinematic office imagery, with every person framed from behind, over-shoulder or
in silhouette. That framing is the whole trick — it turns the character-consistency
problem into a non-issue rather than papering over it.

**Aleem owns the literal-fidelity track.** His comment `10191008282` (2026-08-11) has
Reel 1 broken into 12 MiniMax (Hailuo) shots with a character-reference plan, and he
intends the same treatment for Reels 2–4. That approach *can* show Mark and Lisa
talking; this one cannot. These are two different artifacts, not competing cuts —
if you want the script performed by characters, that is Aleem's pipeline, not this one.

---

## Script — 17 beats, 45.0s

Sohail's dialogue verbatim, trimmed only for on-screen reading load. **The hook is
resequenced:** he opens on Lisa's reassurance; this opens on Mark's shock and moves the
reassurance to beat 3. Same words, stronger scroll-stop.

| # | In | Dur | Speaker | On-screen | Plate |
|---|---|---|---|---|---|
| 1 | 0.0 | 2.8 | MARK | AI is part of / **performance now?** | office |
| 2 | 2.8 | 3.0 | LISA | We're looking at adaptability, productivity, / **and how you use AI.** | office |
| 3 | 5.8 | 2.6 | LISA | Your experience / **is valuable.** | office |
| 4 | 8.4 | 3.0 | LISA | Others research faster. Report faster. / **Document better.** | team |
| 5 | 11.4 | 2.6 | MARK | I've tried AI. / **Only for small prompts.** | alone |
| 6 | 14.0 | 2.8 | MARK | I don't know how to use it / **for real work.** | alone |
| 7 | 16.8 | 2.4 | LISA | That's exactly / **the gap.** | gap |
| 8 | 19.2 | 3.2 | LISA | If your workflow stays fully manual, everything / **takes longer.** | gap |
| 9 | 22.4 | 2.8 | MARK | I'm working hard. But others are / **moving faster.** | corridor |
| 10 | 25.2 | 2.4 | MARK | I don't want / **to fall behind.** | corridor |
| 11 | 27.6 | 3.0 | LISA | Then start now. You don't need to / **become a developer.** | window |
| 12 | 30.6 | 3.0 | LISA | Just learn to use AI / **practically at work.** | window |
| 13 | 33.6 | 2.2 | MARK | **Free?** | laptop |
| 14 | 35.8 | 3.0 | LISA | **Yes.** / Hands-on lessons. / No card needed. | laptop |
| 15 | 38.8 | 1.6 | MARK | I should have / **started earlier.** | start |
| 16 | 40.4 | 1.6 | LISA | Starting today / **is what matters.** | start |
| 17 | 42.0 | 3.0 | — | COLABERRY / **myfreeaiclass.com** / Start learning AI for free | cta |

---

## Claim verification

| On screen | Source | Status |
|---|---|---|
| "Hands-on lessons." | training.colaberry.com — "Free, **hands-on lessons** in learning AI with Claude" | verbatim |
| "No card needed." | "Free · **no card needed**" | verbatim |
| "Start learning AI for free" | site CTA "Start learning for free" | verbatim |
| `myfreeaiclass.com` | 301 → training.colaberry.com, target 200 | verified live 2026-08-12 |
| All Mark/Lisa dialogue | Sohail's script, verbatim | author's own copy |

**One claim was rejected and rewritten.** Sohail's beat-14 line was "guided AI lessons,
quick checks, and practical content". **None of those three phrases appear anywhere on
training.colaberry.com.** They were replaced with the site's own wording. If the
platform genuinely does offer quick checks, put it back — but put it on the site first.

**Paid tier disclosed:** the site also states "Membership starts at **$149/month** ·
cancel anytime". The spot claims only *free to start / no card needed*, which is how
Colaberry frames it — but the reel should not be described as saying the platform is
free outright.

---

## Design

Brand tokens from `frontend/src/styles/tokens.css`; the two accents lifted for video
legibility. **Mark is always blue `#63A9EA`, Lisa always green `#4FD68C`** — that
consistency is what makes a two-hander followable with no faces and no sound. Type is
Segoe UI Black, auto-fitted, on a soft navy scrim.

**17 beats over 9 generated plates.** Reusing one plate at two `zoom_base` values reads
as wide/tight coverage, which is exactly right for a conversation — and it cut render
time from 4h+ to ~1h15. One deliberate visual rhyme: `alone` (beats 5–6) and `start`
(beats 15–16) share a framing — a figure from behind at a desk — but cold-isolated
versus warm-beginning. That is the arc of the script, rendered.

**One plate was reshot.** `gap` first rendered as a dark industrial corridor — a
near-duplicate of the `corridor` plate two beats later. Reprompted as an abstract macro
fissure with every architectural word stripped.

---

## Audio

Shipped **silent** with a silent AAC track. Reach depends on trending audio attached in
the platform's own editor; a baked-in track does not count toward the sound's discovery
page. Beats run 1.6–3.2s, comfortable under a 120–130bpm track.

Business/brand accounts on TikTok and Instagram are limited to the Commercial Music
Library. Which account posts should be decided before publishing.

---

## How to review it (no technical knowledge needed)

1. Play it **muted**, start to finish. The text is the script — it must work silent.
2. Every beat should show **MARK in blue** or **LISA in green**. If the colours ever
   swap or a tag is missing, that beat is wrong.
3. Read the CTA card aloud. If you can't finish before it cuts, it is too short.
4. Check no line is unreadable against its background.
5. Ask whether it still tracks as a **conversation** — that is the thing most likely to
   have been lost in adaptation, and the thing most worth your judgement.

---

## Regenerate

Working dir (outside OneDrive): `C:\Users\ali_m\Downloads\colaberry-reel4\`. Pipeline is
the `short-form-video` skill.

```powershell
cd C:\Users\ali_m\Downloads\ComfyUI
.\venv\Scripts\python.exe main.py --cpu --port 8188 --disable-auto-launch   # leave running

$py = "C:\Users\ali_m\Downloads\ComfyUI\venv\Scripts\python.exe"
$sk = ".claude\skills\short-form-video\scripts"
& $py $sk\generate_shots.py --project C:\Users\ali_m\Downloads\colaberry-reel4 --steps 3
& $py $sk\render_text.py    --project C:\Users\ali_m\Downloads\colaberry-reel4
& $py $sk\assemble.py       --project C:\Users\ali_m\Downloads\colaberry-reel4
```

Copy changes are free — edit `shots.json`, re-run `render_text.py` + `assemble.py`.
Only a changed prompt or seed needs the slow generation step. Every take is retained in
`ComfyUI/output/reel4/`, so a rejected plate can be recovered without re-rendering.
