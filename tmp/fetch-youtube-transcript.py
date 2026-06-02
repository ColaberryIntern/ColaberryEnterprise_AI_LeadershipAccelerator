#!/usr/bin/env python3
"""Fetch YouTube transcript via youtube_transcript_api, write JSON + Markdown."""
import json
import sys
import urllib.request
import re
from pathlib import Path
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api.formatters import TextFormatter

VIDEO_ID = sys.argv[1] if len(sys.argv) > 1 else "mV1SAo5BRgo"

def fmt_time(s):
    s = int(s)
    h, r = divmod(s, 3600)
    m, sec = divmod(r, 60)
    return f"{h}:{m:02d}:{sec:02d}" if h else f"{m}:{sec:02d}"

# Title/author via oEmbed (no key needed)
try:
    with urllib.request.urlopen(f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={VIDEO_ID}&format=json", timeout=15) as r:
        meta = json.loads(r.read().decode())
        title = meta.get("title") or f"(video {VIDEO_ID})"
        author = meta.get("author_name") or ""
except Exception:
    title = f"(video {VIDEO_ID})"
    author = ""

# Try API directly — old + new API patterns
segments = []
try:
    # newer API
    api = YouTubeTranscriptApi()
    transcript = api.fetch(VIDEO_ID)
    for snip in transcript:
        segments.append({"t": snip.start, "text": snip.text})
except Exception:
    try:
        # legacy classmethod
        raw = YouTubeTranscriptApi.get_transcript(VIDEO_ID)
        for snip in raw:
            segments.append({"t": float(snip.get("start", 0)), "text": snip.get("text", "")})
    except Exception as e:
        print(f"FAIL: {e}", file=sys.stderr)
        sys.exit(1)

if not segments:
    print("FAIL: no segments returned", file=sys.stderr)
    sys.exit(1)

# Group into paragraphs by sentence end + length
paragraphs = []
buf = []
buf_start = segments[0]["t"]
for i, seg in enumerate(segments):
    text = re.sub(r"\s+", " ", seg["text"]).strip()
    if not text:
        continue
    buf.append(text)
    joined = " ".join(buf)
    ends_sentence = bool(re.search(r"[.!?]\s*$", text))
    if (ends_sentence and len(joined) > 240) or len(joined) > 500:
        paragraphs.append({"t": buf_start, "text": joined})
        buf = []
        next_seg = segments[i+1] if i+1 < len(segments) else None
        buf_start = next_seg["t"] if next_seg else seg["t"]
if buf:
    paragraphs.append({"t": buf_start, "text": " ".join(buf)})

length_seconds = int(segments[-1]["t"] + 10)
out = {
    "videoId": VIDEO_ID,
    "title": title,
    "author": author,
    "lengthSeconds": length_seconds,
    "segmentCount": len(segments),
    "paragraphCount": len(paragraphs),
    "paragraphs": paragraphs,
}

repo = Path(__file__).resolve().parent.parent
out_dir = repo / "tmp"
out_dir.mkdir(exist_ok=True)
(out_dir / "youtube-transcript.json").write_text(json.dumps(out, indent=2), encoding="utf-8")

md_lines = [
    f"# {title}",
    f"Author: {author} | Approx length: {fmt_time(length_seconds)}",
    f"Video URL: https://www.youtube.com/watch?v={VIDEO_ID}",
    "",
    "---",
    "",
]
for p in paragraphs:
    md_lines.append(f"**[{fmt_time(p['t'])}]** {p['text']}")
    md_lines.append("")

(out_dir / "youtube-transcript.md").write_text("\n".join(md_lines), encoding="utf-8")
print(f"OK: {len(segments)} segments → {len(paragraphs)} paragraphs")
print(f"  tmp/youtube-transcript.md ({(out_dir / 'youtube-transcript.md').stat().st_size // 1024} KB)")
