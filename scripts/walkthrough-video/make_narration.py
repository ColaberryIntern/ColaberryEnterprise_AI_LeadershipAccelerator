"""
Generate narration for each deck segment.

VOICE: a Microsoft neural voice through `edge-tts`, which was already installed on this
machine - so nothing is provisioned and the skill's provisioning gate does not apply. It
replaced the built-in SAPI voice (`Microsoft David Desktop`) after Ali heard it: "voice is
horrible. Can we have a more human sounding voice". SAPI's David is a pre-neural
concatenative voice and there is no setting that fixes that; the engine had to change.

`en-US-AndrewNeural` is Microsoft's own personality tagging for it - warm, confident,
authentic, honest - which is the register this particular record is arguing for. Swapping
narrator means changing VOICE below and nothing else.

WHAT LEAVES THE MACHINE: the narration text, to Microsoft's Edge TTS endpoint. That text is
the case study's own captions, already published on three public websites, so there is
nothing here that is not already public. It is still a third-party call and worth knowing.

The narration text IS the caption text, so what is heard and what is read are the same
sentence - a caption that paraphrases its own voiceover is a second script to keep in sync,
and it drifts.
"""
import argparse
import asyncio
import json
import os
import subprocess

import edge_tts

HERE = os.path.dirname(os.path.abspath(__file__))
VOICE = "en-US-AndrewNeural"
# Slightly under pace. The default read is brisk for narration that has to land a figure
# and its denominator in one breath.
RATE = "-4%"


async def speak(text, path, attempts=4):
    """
    One narration line, with a capped retry.

    The endpoint returns `NoAudioReceived` intermittently under a burst - eleven segments
    generated back to back is exactly that - and the first run died on segment 0 having
    just produced the same sentence successfully in an audition seconds earlier. So this is
    a transient upstream, not bad input, and it gets a bounded exponential backoff rather
    than a bare call. Failing after four tries is a real failure and stops the run: a deck
    with a silent segment is worse than no deck.
    """
    last = None
    for attempt in range(attempts):
        try:
            await edge_tts.Communicate(text, VOICE, rate=RATE).save(path)
            if os.path.exists(path) and os.path.getsize(path) > 1000:
                return
            last = RuntimeError("wrote an empty file")
        except Exception as err:  # noqa: BLE001 - the library raises several unrelated types
            last = err
        if attempt < attempts - 1:
            wait = 2 ** attempt
            print(f"    retry {attempt + 1}/{attempts - 1} in {wait}s ({type(last).__name__})")
            await asyncio.sleep(wait)
    raise SystemExit(f"narration failed after {attempts} attempts: {last}")


def duration(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
        capture_output=True, text=True).stdout.strip()
    return float(out)


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--deck", default=os.path.join(HERE, "deck.json"))
    args = ap.parse_args()

    # Audio and timings live BESIDE the deck, so several records can be built from the
    # one toolchain without overwriting each other's narration.
    deck_path = os.path.abspath(args.deck)
    deck_dir = os.path.dirname(deck_path)
    stem = os.path.splitext(os.path.basename(deck_path))[0]
# Per-deck, not per-directory. All the decks live in decks/, so a single timings.json
# beside them is SHARED - and the last narration run silently wins. Repo2Reputation was
# built once with the training system's segment durations that way: same slide count, so
# nothing errored, every segment just held for the wrong length.
    audio_dir = os.path.join(deck_dir, "audio", stem)
    os.makedirs(audio_dir, exist_ok=True)
    deck_raw = json.load(open(deck_path, encoding="utf-8"))
    deck = deck_raw["slides"] if isinstance(deck_raw, dict) else deck_raw
    timings = []

    for i, s in enumerate(deck):
        text = s["caption"]
        # mp3, not wav: edge-tts emits mp3 and ffmpeg reads it as an input either way, so
        # converting first would only lose a generation of quality for nothing.
        path = os.path.join(audio_dir, f"{i:02d}.mp3")
        await speak(text, path)
        if not os.path.exists(path) or os.path.getsize(path) < 1000:
            raise SystemExit(f"narration {i} produced nothing: {path}")

        d = duration(path)
        # A slide must outlast its own sentence. 0.5s before the voice starts and 1.0s
        # after it stops, so a segment never cuts the last word or jumps the moment it ends.
        seconds = max(s["seconds"], round(d + 1.5, 1))
        timings.append({"index": i, "audio_seconds": round(d, 2), "seconds": seconds})
        print(f"  {i:02d}  voice {d:5.2f}s  ->  segment {seconds:5.1f}s   {text[:50]}")

    with open(os.path.join(deck_dir, stem + ".timings.json"), "w", encoding="utf-8") as fh:
        json.dump(timings, fh, indent=1)
    print(f"\nvoice: {VOICE} at {RATE}")
    print(f"total: {sum(t['seconds'] for t in timings):.1f}s across {len(timings)} segments")


if __name__ == "__main__":
    asyncio.run(main())
