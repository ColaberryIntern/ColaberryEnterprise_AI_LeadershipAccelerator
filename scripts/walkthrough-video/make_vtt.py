"""
WebVTT sidecar for the walkthrough.

The captions are already burned into the picture, which is what Ali asked for and what the
reference clip does. This file is the accessible copy of the same sentences: a burned-in
caption cannot be read by a screen reader, resized, translated, or turned off, and it is
not what a `track` element needs. Same text, same cue boundaries as the narration.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
LEAD_IN = 0.5  # matches the adelay applied to every narration segment


def ts(seconds):
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    return f"{int(h):02d}:{int(m):02d}:{s:06.3f}"


def main():
    deck = json.load(open(os.path.join(HERE, "deck.json"), encoding="utf-8"))
    timings = {t["index"]: t for t in json.load(open(os.path.join(HERE, "timings.json"), encoding="utf-8"))}

    lines = ["WEBVTT", ""]
    clock = 0.0
    for i, s in enumerate(deck):
        seg = timings[i]["seconds"]
        start = clock + LEAD_IN
        # End when the voice ends, not when the slide does, so a cue does not hang on
        # screen through the pause before the next segment.
        end = min(clock + seg, start + timings[i]["audio_seconds"] + 0.4)
        lines += [f"{i + 1}", f"{ts(start)} --> {ts(end)}", s["caption"], ""]
        clock += seg

    out = os.path.join(HERE, "repo2reputation-walkthrough.vtt")
    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(lines))
    print(f"wrote {out}: {len(deck)} cues over {clock:.1f}s")


if __name__ == "__main__":
    main()
