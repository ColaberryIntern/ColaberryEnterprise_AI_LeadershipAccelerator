"""Rasterise the kinetic-text overlays (RGBA, full output resolution) for a spot.

Reads <project>/shots.json, writes <project>/overlays/<id>.png.

Type is drawn with Pillow rather than ffmpeg drawtext: real auto-fit, per-line accent
colouring, letter tracking, and a legibility scrim that also masks the garbled
pseudo-text diffusion models paint onto monitors and signage.

Cheap to re-run - copy changes cost seconds, unlike a re-generation.

Usage:  python render_text.py --project .
"""

import argparse
import json
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont


def pick_font(candidates):
    for path in candidates:
        if os.path.exists(path):
            return path
    raise FileNotFoundError(f"none of these fonts exist: {candidates}")


FONT_BLACK = pick_font([
    r"C:\Windows\Fonts\seguibl.ttf",   # Segoe UI Black
    r"C:\Windows\Fonts\ariblk.ttf",    # Arial Black
    r"C:\Windows\Fonts\impact.ttf",
])
FONT_BOLD = pick_font([
    r"C:\Windows\Fonts\segoeuib.ttf",
    r"C:\Windows\Fonts\arialbd.ttf",
])

WHITE = (255, 255, 255, 255)
SUB = (226, 234, 244, 235)
SCRIM = (10, 21, 36)


def hex_rgba(h):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)


def fit_font(path, lines, max_size, usable, min_size=44):
    """Largest size at which every line fits the usable width."""
    size = max_size
    while size > min_size:
        f = ImageFont.truetype(path, size)
        if all(f.getbbox(ln)[2] - f.getbbox(ln)[0] <= usable for ln in lines):
            return f
        size -= 2
    return ImageFont.truetype(path, min_size)


def tracked_width(font, text, tracking):
    return sum(font.getlength(c) for c in text) + tracking * max(len(text) - 1, 0)


def draw_tracked(draw, xy, text, font, fill, tracking):
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        x += font.getlength(ch) + tracking


def add_scrim(img, top, bottom):
    """Soft vertical dark gradient behind the text block - no visible hard edge."""
    w, h = img.size
    top, bottom = max(int(top), 0), min(int(bottom), h)
    band = bottom - top
    if band <= 0:
        return
    grad = Image.new("L", (1, band), 0)
    gp = grad.load()
    for i in range(band):
        t = i / max(band - 1, 1)
        gp[0, i] = int(206 * (1 - abs(2 * t - 1)) ** 0.85)
    mask = grad.resize((w, band), Image.BILINEAR).filter(ImageFilter.GaussianBlur(14))
    layer = Image.new("RGBA", (w, band), SCRIM + (255,))
    layer.putalpha(mask)
    img.alpha_composite(layer, (0, top))


def shadowed(base, render_fn):
    """Render via render_fn, then composite a blurred drop shadow beneath it."""
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    render_fn(ImageDraw.Draw(layer))
    shadow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    shadow.paste((0, 0, 0, 190), (0, 0) + base.size, layer.split()[3])
    base.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(9)), (0, 5))
    base.alpha_composite(layer)


def render_statement(shot, W, H, margin, accents):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    usable = W - margin * 2
    lines = shot["lines"]
    font = fit_font(FONT_BLACK, lines, int(W * 0.087), usable)
    leading = int(font.size * 1.14)
    sub_text = shot.get("sub")
    sub_font = ImageFont.truetype(FONT_BOLD, int(W * 0.037)) if sub_text else None

    rule_h, rule_gap = 9, 34
    block_h = leading * len(lines) + (78 if sub_text else 0)
    total_h = rule_h + rule_gap + block_h
    top = int(H * shot["anchor"] - total_h / 2)
    add_scrim(img, top - 150, top + total_h + 150)

    accent = hex_rgba(accents.get(shot.get("emphasis_color", "primary"), "#4FD68C"))
    emphasis = shot.get("emphasis")

    def paint(d):
        d.rectangle([margin, top, margin + 104, top + rule_h], fill=accent)
        y = top + rule_h + rule_gap
        for ln in lines:
            d.text((margin, y), ln, font=font, fill=accent if ln == emphasis else WHITE)
            y += leading
        if sub_text:
            draw_tracked(d, (margin, y + 20), sub_text.upper(), sub_font, SUB, 3.0)

    shadowed(img, paint)
    return img


def render_cta(shot, W, H, margin, accents):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    usable = W - margin * 2
    url, kicker, sub_text = shot["lines"][0], shot.get("kicker", ""), shot.get("sub", "")
    accent = hex_rgba(accents.get(shot.get("emphasis_color", "primary"), "#4FD68C"))

    kick_font = ImageFont.truetype(FONT_BOLD, int(W * 0.033))
    url_font = fit_font(FONT_BLACK, [url], int(W * 0.085), usable)
    sub_font = ImageFont.truetype(FONT_BOLD, int(W * 0.039))

    kick_h = 52 if kicker else 0
    url_h = int(url_font.size * 1.16)
    total_h = kick_h + url_h + 26 + 12 + 30 + 54
    top = int(H * shot["anchor"] - total_h / 2)
    add_scrim(img, top - 190, top + total_h + 190)

    url_w = url_font.getlength(url)
    bar_w = min(int(url_w), usable)

    def paint(d):
        y = top
        if kicker:
            kw = tracked_width(kick_font, kicker, 9.0)
            draw_tracked(d, ((W - kw) / 2, y), kicker, kick_font, accent, 9.0)
            y += kick_h
        d.text(((W - url_w) / 2, y), url, font=url_font, fill=WHITE)
        y += url_h + 18
        d.rectangle([(W - bar_w) / 2, y, (W + bar_w) / 2, y + 11], fill=accent)
        y += 45
        sw = tracked_width(sub_font, sub_text.upper(), 3.5)
        draw_tracked(d, ((W - sw) / 2, y), sub_text.upper(), sub_font, SUB, 3.5)

    shadowed(img, paint)
    return img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", default=".")
    args = ap.parse_args()

    project = os.path.abspath(args.project)
    with open(os.path.join(project, "shots.json"), encoding="utf-8-sig") as f:
        cfg = json.load(f)

    meta = cfg["meta"]
    W, H = meta["width"], meta["height"]
    margin = meta.get("margin", int(W * 0.081))
    # Accents are lifted from brand values for legibility against dark footage.
    accents = meta.get("accents", {"primary": "#4FD68C", "secondary": "#63A9EA"})

    out_dir = os.path.join(project, "overlays")
    os.makedirs(out_dir, exist_ok=True)

    for shot in cfg["shots"]:
        img = render_cta(shot, W, H, margin, accents) if shot.get("cta") else \
              render_statement(shot, W, H, margin, accents)
        path = os.path.join(out_dir, f"{shot['id']}.png")
        img.save(path)
        print(f"[overlay] {shot['id']} -> {path}", flush=True)
    print("OVERLAYS_COMPLETE_OK", flush=True)


if __name__ == "__main__":
    main()
