"""
Build a NotebookLM-style walkthrough video for the Repo2Reputation case study.

STYLE is taken from the reference clip Ali supplied: a soft green-to-cream gradient with a
faint dot grid, white rounded cards, one rust accent card, and a dark translucent caption
box carrying the sentence. Nothing is generated or imagined - every footage segment is the
project's own demo recording (docs/images/demoPortfolio.gif, committed to the repository)
and every figure on a slide is one this case study already verified at commit 966e5d69.

Slides are rendered once with Pillow and looped by ffmpeg; footage segments are composited
over the same background so the two never look like different videos.
"""
import argparse
import json
import os
import subprocess
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1920, 1080
FPS = 30
OUT = os.path.dirname(os.path.abspath(__file__))
SEG = os.path.join(OUT, "segments")
# Set from the deck. A record with a demo recording declares one; a record without any
# moving footage - which is most of them - uses `screenshot` slides of its real captures
# instead, and never touches the GIF path at all.
GIF = None
GIF_CROP = None

FONT_DIR = "C:/Windows/Fonts/"
F_BOLD = FONT_DIR + "arialbd.ttf"
F_REG = FONT_DIR + "arial.ttf"

INK = (34, 38, 42)
MUTED = (104, 112, 120)
ACCENT = (193, 104, 46)
CARD = (255, 255, 255)
CAPTION_BG = (72, 76, 78, 235)


def font(path, size):
    return ImageFont.truetype(path, size)


def background():
    """Pale green to cream, corner to corner, with a faint dot grid over it."""
    bg = Image.new("RGB", (W, H), (255, 255, 255))
    px = bg.load()
    for y in range(H):
        for x in range(0, W, 4):
            t = (x / W * 0.6) + (y / H * 0.4)
            r = int(226 + t * 26)
            g = int(236 + t * 6)
            b = int(226 - t * 12)
            for dx in range(4):
                if x + dx < W:
                    px[x + dx, y] = (r, g, b)
    d = ImageDraw.Draw(bg)
    for y in range(0, H, 34):
        for x in range(0, W, 34):
            d.ellipse([x, y, x + 2, y + 2], fill=(210, 218, 208))
    return bg


def wrap(draw, text, fnt, max_w):
    words, lines, cur = text.split(), [], ""
    for word in words:
        trial = (cur + " " + word).strip()
        if draw.textlength(trial, font=fnt) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def rounded_card(img, box, radius=22, fill=CARD, shadow=True):
    x0, y0, x1, y1 = box
    if shadow:
        sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(sh).rounded_rectangle([x0, y0 + 6, x1, y1 + 8], radius, fill=(120, 130, 120, 60))
        img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(10)))
    ImageDraw.Draw(img).rounded_rectangle(box, radius, fill=fill + (255,) if len(fill) == 3 else fill)


# Whether the sentence is painted INTO the picture.
#
# It is off. The reference clip Ali supplied had burned-in captions, so the first cut did
# too - and then the record also ships a WebVTT track, so the player drew its own captions
# over the baked ones and every video showed the same sentence twice, offset by a few
# pixels. Ali: "We have double captions - there should only be one."
#
# The track wins, not the burn. Burned-in text cannot be turned off, resized, translated or
# read by a screen reader; the track can be all four, and it is the one an accessible player
# expects. Set this True only for a video that will ship with NO track.
BURN_CAPTIONS = False


def caption(img, text, fnt_size=42):
    """The dark translucent sentence box, bottom-centred, exactly as in the reference."""
    if not text or not BURN_CAPTIONS:
        return
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    fnt = font(F_BOLD, fnt_size)
    lines = wrap(d, text, fnt, 1180)
    lh = fnt_size + 16
    box_h = len(lines) * lh + 44
    box_w = max(d.textlength(l, font=fnt) for l in lines) + 88
    x0 = (W - box_w) / 2
    y0 = H - box_h - 78
    d.rounded_rectangle([x0, y0, x0 + box_w, y0 + box_h], 8, fill=CAPTION_BG)
    for i, line in enumerate(lines):
        tw = d.textlength(line, font=fnt)
        d.text(((W - tw) / 2, y0 + 22 + i * lh), line, font=fnt, fill=(255, 255, 255))
    img.alpha_composite(layer)


def slide_title(title, subtitle, cap):
    img = background().convert("RGBA")
    d = ImageDraw.Draw(img)
    fnt = font(F_BOLD, 82)
    sf = font(F_REG, 40)
    lines = wrap(d, title, fnt, 1420)
    # CENTRE THE BLOCK, do not start it at a fixed y. With the caption box gone the lower
    # third is empty, and a one-line title and a three-line title cannot share a start
    # position without one of them looking dropped. Measure, then centre what was measured.
    block_h = len(lines) * 100 + (64 if subtitle else 0)
    y = (H - block_h) / 2 if not BURN_CAPTIONS else 300
    for line in lines:
        tw = d.textlength(line, font=fnt)
        d.text(((W - tw) / 2, y), line, font=fnt, fill=INK)
        y += 100
    if subtitle:
        tw = d.textlength(subtitle, font=sf)
        d.text(((W - tw) / 2, y + 24), subtitle, font=sf, fill=MUTED)
    caption(img, cap)
    return img


def slide_cards(rows, cap, accent_index=None):
    """A row of white cards, optionally one in the rust accent, as in the reference."""
    img = background().convert("RGBA")
    d = ImageDraw.Draw(img)
    n = len(rows)
    cw, gap = 420, 46
    total = n * cw + (n - 1) * gap
    x = (W - total) / 2
    for i, (big, small) in enumerate(rows):
        is_accent = i == accent_index
        top_c = 330 if BURN_CAPTIONS else 410
        box = [x, top_c, x + cw, top_c + 260]
        rounded_card(img, box, 22, ACCENT if is_accent else CARD)
        d = ImageDraw.Draw(img)
        bf = font(F_BOLD, 74)
        sf = font(F_REG, 30)
        col = (255, 255, 255) if is_accent else INK
        sub = (255, 235, 220) if is_accent else MUTED
        tw = d.textlength(big, font=bf)
        d.text((x + (cw - tw) / 2, top_c + 50), big, font=bf, fill=col)
        for j, line in enumerate(wrap(d, small, sf, cw - 60)):
            tw = d.textlength(line, font=sf)
            d.text((x + (cw - tw) / 2, top_c + 156 + j * 38), line, font=sf, fill=sub)
        x += cw + gap
    caption(img, cap)
    return img


def slide_image(path, cap, max_h=620):
    img = background().convert("RGBA")
    art = Image.open(path).convert("RGBA")
    scale = min(1.0, max_h / art.height)
    art = art.resize((int(art.width * scale), int(art.height * scale)), Image.LANCZOS)
    pad = 26
    box = [(W - art.width) / 2 - pad, 120 - pad, (W + art.width) / 2 + pad, 120 + art.height + pad]
    rounded_card(img, box, 20)
    img.alpha_composite(art, (int((W - art.width) / 2), 120))
    caption(img, cap)
    return img


def slide_screenshot(path, cap):
    """
    A real capture of the running system, filling the frame above the caption.

    Separate from `slide_image` because the constraint is different. `slide_image` caps
    HEIGHT, which is right for a portrait chart; a screenshot is usually landscape and
    wants the width, and a record with no demo recording carries these instead of footage.
    Bounded on both axes so a tall capture cannot slide under the caption box, which is
    the mistake the diagram slide made first.
    """
    img = background().convert("RGBA")
    art = Image.open(path).convert("RGBA")
    max_w, max_h = (1560, 700) if BURN_CAPTIONS else (1720, 950)
    scale = min(max_w / art.width, max_h / art.height)
    art = art.resize((int(art.width * scale), int(art.height * scale)), Image.LANCZOS)
    pad = 20
    x = (W - art.width) // 2
    # Vertically centred in whatever height is left, so a wide capture and a tall one both
    # sit in the middle rather than hugging the top.
    top = max(40, (H - art.height) // 2)
    rounded_card(img, [x - pad, top - pad, x + art.width + pad, top + art.height + pad], 20)
    img.alpha_composite(art, (x, top))
    caption(img, cap)
    return img


def slide_diagram(path, phases, cap):
    """
    The pipeline chart, large enough to read, beside the phase names.

    A 776x1434 flowchart dropped whole into a 1920x1080 frame renders about 40% of the
    frame height and unreadably small, with a screen of empty gradient either side - the
    same wrong-aspect-ratio failure the case-study skill warns about. So the chart takes
    the height it needs on the left and the six phase names fill the width on the right.
    """
    img = background().convert("RGBA")
    art = Image.open(path).convert("RGBA")
    # The card has to finish ABOVE the caption box, which starts at y=842 for two lines.
    # At 880px tall it ran to 960 and the caption sat on top of the last three nodes.
    art_h = 760 if BURN_CAPTIONS else 960
    top = 30 if BURN_CAPTIONS else 55
    scale = art_h / art.height
    art = art.resize((int(art.width * scale), art_h), Image.LANCZOS)
    pad = 20
    ax = 210
    rounded_card(img, [ax - pad, top - pad, ax + art.width + pad, top + art_h + pad], 20)
    img.alpha_composite(art, (ax, top))

    d = ImageDraw.Draw(img)
    nf = font(F_BOLD, 34)
    lf = font(F_REG, 30)
    x = ax + art.width + 140
    y = 150 if BURN_CAPTIONS else 255
    for i, name in enumerate(phases):
        d.rounded_rectangle([x, y, x + 62, y + 62], 14, fill=ACCENT)
        num = str(i + 1)
        tw = d.textlength(num, font=nf)
        d.text((x + (62 - tw) / 2, y + 12), num, font=nf, fill=(255, 255, 255))
        d.text((x + 88, y + 14), name, font=lf, fill=INK)
        y += 92
    caption(img, cap)
    return img


def footage_frames(gif_start, seconds, cap):
    """
    Composite real frames from the demo recording onto the same background.

    ffmpeg's `-ss` into an animated GIF is unreliable - a seek to 30s produced a segment
    with no picture at all while seeks to 1s and 11.5s worked - so frames are pulled by
    index with Pillow instead, which is deterministic. The recording is a ~1.28fps
    timelapse, so the frames are held at that real rate rather than being interpolated
    into motion the source never had.
    """
    if not GIF:
        raise SystemExit("a footage segment needs a `gif` in the deck")
    gif = Image.open(GIF)
    rate = gif.n_frames / 234.61
    start = int(round(gif_start * rate))
    count = max(1, int(round(seconds * rate)))
    cap_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    caption(cap_layer, cap)

    out = []
    for i in range(count):
        idx = min(start + i, gif.n_frames - 1)
        gif.seek(idx)
        shot = gif.convert("RGB").crop(GIF_CROP)
        shot = shot.resize((1660, int(shot.height * 1660 / shot.width)), Image.LANCZOS)
        frame = background().convert("RGBA")
        pad = 16
        rounded_card(frame, [130 - pad, 150 - pad, 130 + 1660 + pad, 150 + shot.height + pad], 18)
        frame.alpha_composite(shot.convert("RGBA"), (130, 150))
        frame.alpha_composite(cap_layer)
        out.append(frame.convert("RGB"))
    return out


def run(cmd):
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        print("FFMPEG FAILED:", " ".join(cmd[:8]), file=sys.stderr)
        print(p.stderr[-1500:], file=sys.stderr)
        raise SystemExit(1)


def main():
    global GIF, GIF_CROP, SEG
    ap = argparse.ArgumentParser()
    ap.add_argument("--deck", default=os.path.join(OUT, "deck.json"))
    args = ap.parse_args()

    deck_path = os.path.abspath(args.deck)
    deck_dir = os.path.dirname(deck_path)
    raw = json.load(open(deck_path, encoding="utf-8"))
    # A bare list is still a valid deck - it is what the first record used. An object adds
    # the output name and the optional footage source without breaking that.
    cfg = raw if isinstance(raw, dict) else {"slides": raw}
    slides = cfg["slides"]
    GIF = cfg.get("gif")
    GIF_CROP = tuple(cfg.get("gifCrop", (0, 0, 0, 0))) if cfg.get("gifCrop") else None
    out_name = cfg.get("output", "walkthrough.mp4")

    stem = os.path.splitext(os.path.basename(deck_path))[0]
# Per-deck, not per-directory. All the decks live in decks/, so a single timings.json
# beside them is SHARED - and the last narration run silently wins. Repo2Reputation was
# built once with the training system's segment durations that way: same slide count, so
# nothing errored, every segment just held for the wrong length.
    SEG = os.path.join(deck_dir, "segments", stem)
    os.makedirs(SEG, exist_ok=True)
    bg_path = os.path.join(deck_dir, stem + "-bg.png")
    background().save(bg_path)

    deck = slides

    # Durations come from the narration, not from the deck's guesses: a slide that ends
    # before its own sentence does cuts the last word off.
    timings_path = os.path.join(deck_dir, stem + ".timings.json")
    timings = {}
    if os.path.exists(timings_path):
        timings = {t["index"]: t for t in json.load(open(timings_path, encoding="utf-8"))}

    segments = []

    for i, s in enumerate(deck):
        seg = os.path.join(SEG, f"{i:02d}.mp4")
        dur = timings[i]["seconds"] if i in timings else s["seconds"]
        voice = os.path.join(deck_dir, "audio", stem, f"{i:02d}.mp3")
        has_voice = os.path.exists(voice)
        # 0.5s of silence before the voice starts, then pad to the full segment length.
        afilter = ["-af", "adelay=500:all=1,apad"]
        acodec = ["-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2"]

        if s["kind"] == "footage":
            frames = footage_frames(s["gif_start"], dur, s["caption"])
            fdir = os.path.join(SEG, f"{i:02d}_frames")
            os.makedirs(fdir, exist_ok=True)
            for k, fr in enumerate(frames):
                fr.save(os.path.join(fdir, f"{k:03d}.png"))
            run([
                "ffmpeg", "-v", "error", "-y",
                "-framerate", f"{len(frames)}/{dur}",
                "-i", os.path.join(fdir, "%03d.png"),
            ] + (["-i", voice] if has_voice else []) + (afilter if has_voice else []) + [
                "-t", str(dur), "-r", str(FPS),
                "-c:v", "libx264", "-preset", "medium", "-crf", "20",
                "-pix_fmt", "yuv420p",
            ] + (acodec if has_voice else []) + [seg])
        else:
            png = os.path.join(SEG, f"{i:02d}.png")
            if s["kind"] == "title":
                slide_title(s["title"], s["subtitle"], s["caption"]).convert("RGB").save(png)
            elif s["kind"] == "cards":
                slide_cards([tuple(r) for r in s["rows"]], s["caption"],
                            s.get("accent_index")).convert("RGB").save(png)
            elif s["kind"] == "image":
                slide_image(s["path"], s["caption"]).convert("RGB").save(png)
            elif s["kind"] == "screenshot":
                slide_screenshot(s["path"], s["caption"]).convert("RGB").save(png)
            elif s["kind"] == "diagram":
                slide_diagram(s["path"], s["phases"], s["caption"]).convert("RGB").save(png)
            run([
                "ffmpeg", "-v", "error", "-y", "-loop", "1", "-framerate", str(FPS),
                "-i", png,
            ] + (["-i", voice] if has_voice else []) + (afilter if has_voice else []) + [
                "-t", str(dur), "-r", str(FPS),
                "-c:v", "libx264", "-preset", "medium", "-crf", "20",
                "-pix_fmt", "yuv420p",
            ] + (acodec if has_voice else []) + [seg])

        # A segment that failed to encode must not be silently concatenated away.
        if not os.path.exists(seg) or os.path.getsize(seg) < 2000:
            raise SystemExit(f"segment {i} did not encode: {seg}")
        segments.append(seg)
        print(f"  segment {i:02d} {s['kind']:8s} {dur:>4}s  ok")

    listfile = os.path.join(deck_dir, stem + "-concat.txt")
    with open(listfile, "w", encoding="utf-8") as fh:
        for s in segments:
            fh.write(f"file '{s.replace(os.sep, '/')}'\n")

    final = os.path.join(deck_dir, out_name)
    run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", listfile,
         "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2",
         "-movflags", "+faststart", "-r", str(FPS), final])

    # MEASURED, never computed - ffmpeg's concat demuxer drops unreadable segments and
    # still exits 0, so the only trustworthy duration is the one ffprobe reads back.
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration,size",
         "-show_entries", "stream=width,height,nb_frames", "-of", "json", final],
        capture_output=True, text=True)
    info = json.loads(probe.stdout)
    intended = sum(timings[i]["seconds"] if i in timings else s["seconds"]
                   for i, s in enumerate(deck))
    measured = float(info["format"]["duration"])
    print(json.dumps({
        "file": final,
        "intended_seconds": intended,
        "measured_seconds": round(measured, 2),
        "drift_seconds": round(measured - intended, 2),
        "size_mb": round(int(info["format"]["size"]) / 1e6, 2),
        "width": info["streams"][0]["width"],
        "height": info["streams"][0]["height"],
        "segments": len(segments),
    }, indent=1))
    # Direction matters and the two causes are different. SHORTER means the concat demuxer
    # silently dropped a segment it could not read - the failure this check exists for, and
    # one ffmpeg reports with exit code 0. LONGER means a segment overran its own limit,
    # which is what the GIF's slow final frame did before the output-side `-t` was added.
    if measured < intended - 0.75:
        raise SystemExit("SHORT: the concat demuxer dropped a segment - ffmpeg exits 0 when it does")
    if measured > intended + 0.75:
        raise SystemExit("LONG: a segment overran its duration - check the footage trims")


if __name__ == "__main__":
    main()
