"""Assemble a short-form spot from generated stills + text overlays.

Reads <project>/shots.json, <project>/images/, <project>/overlays/.
Writes per-shot clips to <project>/clips/ and the master to --out.

Each shot renders to its own intermediate mp4 (Ken Burns move, grade, overlay) and
the shots are then concatenated with hard cuts. Per-shot intermediates keep the
filtergraphs small and make one bad shot cheap to re-render.

INTEGRITY: ffmpeg's concat demuxer skips an unreadable segment and STILL EXITS 0.
So every clip and the delivered file are probe-verified against their expected frame
count. Never trust arithmetic over a measurement.

Usage:  python assemble.py --project . [--out master.mp4]
"""

import argparse
import json
import os
import subprocess
import sys

ZOOM = 0.10  # Ken Burns travel over the shot
DEFAULT_GRADE = "eq=contrast=1.08:saturation=1.06:gamma=0.98,vignette=angle=PI/5"


def probe_frames(path):
    """Actual decoded frame count, or -1 if unreadable/truncated."""
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_frames",
             "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", path],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
        return int(out)
    except (subprocess.CalledProcessError, ValueError):
        return -1


def zoom_expr(motion, n, base=1.0):
    """(z, x, y) zoompan expressions. `base` crops in permanently, pushing weak
    edge detail out of frame."""
    last = max(n - 1, 1)
    cx, cy = "iw/2-(iw/zoom/2)", "ih/2-(ih/zoom/2)"
    if motion == "zoom_in":
        return f"{base}+{ZOOM}*on/{last}", cx, cy
    if motion == "zoom_in_slow":
        return f"{base}+{ZOOM/2:.4f}*on/{last}", cx, cy
    if motion == "zoom_out":
        return f"{base+ZOOM}-{ZOOM}*on/{last}", cx, cy
    if motion == "pan_left":
        return f"{base+ZOOM}", f"(iw-iw/zoom)*(1-on/{last})", cy
    if motion == "pan_right":
        return f"{base+ZOOM}", f"(iw-iw/zoom)*(on/{last})", cy
    raise ValueError(f"unknown motion: {motion}")


def render_shot(shot, project, W, H, fps):
    n = int(round(shot["dur"] * fps))
    # `image` lets several beats share one generated plate; differing zoom_base
    # values turn that into wide/tight coverage rather than a visible repeat.
    still = os.path.join(project, "images", f"{shot.get('image') or shot['id']}.png")
    overlay = os.path.join(project, "overlays", f"{shot['id']}.png")
    out = os.path.join(project, "clips", f"{shot['id']}.mp4")
    for p in (still, overlay):
        if not os.path.exists(p):
            raise FileNotFoundError(p)

    # Reuse only if newer than both inputs AND decoding to the exact frame count.
    # mtime alone is not enough: an interrupted encode leaves a fresh-but-truncated
    # file that concat will silently drop.
    if os.path.exists(out) and os.path.getsize(out) > 0:
        fresh = os.path.getmtime(out) >= max(os.path.getmtime(still), os.path.getmtime(overlay))
        if fresh and probe_frames(out) == n:
            print(f"[skip] {shot['id']} clip up to date", flush=True)
            return out, n

    z, x, y = zoom_expr(shot["motion"], n, shot.get("zoom_base", 1.0))
    grade = shot.get("grade", DEFAULT_GRADE)
    dur = n / fps
    # Work at 2x then let zoompan downscale - halves the integer-truncation jitter
    # zoompan is otherwise prone to on slow moves.
    sw, sh = W * 2, H * 2

    fc = (
        f"[0:v]scale={sw}:{sh}:force_original_aspect_ratio=increase:flags=lanczos,"
        f"crop={sw}:{sh},"
        f"zoompan=z='{z}':x='{x}':y='{y}':d={n}:s={W}x{H}:fps={fps},"
        f"{grade},setsar=1,format=yuv420p[bg];"
        f"[1:v]format=rgba,fade=t=in:st=0:d=0.08:alpha=1[txt];"
        f"[bg][txt]overlay=0:0:format=auto,format=yuv420p[v]"
    )

    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error",
        "-loop", "1", "-t", f"{dur:.4f}", "-i", still,
        "-loop", "1", "-t", f"{dur:.4f}", "-i", overlay,
        "-filter_complex", fc, "-map", "[v]",
        "-frames:v", str(n), "-r", str(fps),
        "-c:v", "libx264", "-preset", "slow", "-crf", "17",
        "-profile:v", "high", "-pix_fmt", "yuv420p", out,
    ], check=True)

    got = probe_frames(out)
    if got != n:
        raise RuntimeError(f"{shot['id']}: encoded {got} frames, expected {n} (truncated?)")
    print(f"[clip] {shot['id']}  {n} frames ({dur:.2f}s) -> {out}", flush=True)
    return out, n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", default=".")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    project = os.path.abspath(args.project)
    with open(os.path.join(project, "shots.json"), encoding="utf-8-sig") as f:
        cfg = json.load(f)

    meta = cfg["meta"]
    W, H, fps = meta["width"], meta["height"], meta["fps"]
    out_path = args.out or os.path.join(project, meta.get("output_name", "master.mp4"))
    os.makedirs(os.path.join(project, "clips"), exist_ok=True)

    missing = sorted({(s.get("image") or s["id"]) for s in cfg["shots"]
                      if not os.path.exists(
                          os.path.join(project, "images", f"{s.get('image') or s['id']}.png"))})
    if missing:
        print(f"[abort] stills not generated yet: {', '.join(missing)}", file=sys.stderr)
        sys.exit(2)

    total = 0
    listing = os.path.join(project, "clips", "concat.txt")
    with open(listing, "w", encoding="utf-8") as lf:
        for shot in cfg["shots"]:
            path, n = render_shot(shot, project, W, H, fps)
            total += n
            lf.write(f"file '{os.path.basename(path)}'\n")

    # Hard cuts, plus a silent stereo track: some platforms mishandle a video-only
    # upload, and the intended finish is trending in-platform audio anyway.
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "concat", "-safe", "0", "-i", listing,
        "-f", "lavfi", "-t", f"{total/fps:.4f}", "-i", "anullsrc=r=48000:cl=stereo",
        "-c:v", "libx264", "-preset", "slow", "-crf", "17",
        "-profile:v", "high", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart", "-shortest", out_path,
    ], check=True)

    got = probe_frames(out_path)
    if got != total:
        print(
            f"[FAIL] {out_path} decoded {got} frames, expected {total} "
            f"({got/fps:.2f}s vs {total/fps:.2f}s) - a segment was dropped",
            file=sys.stderr,
        )
        sys.exit(3)
    print(f"\n[final] {got} frames = {got/fps:.2f}s (measured) -> {out_path}", flush=True)
    print("ASSEMBLE_COMPLETE_OK", flush=True)


if __name__ == "__main__":
    main()
