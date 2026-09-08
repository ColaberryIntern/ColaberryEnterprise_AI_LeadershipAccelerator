"""
Generate narration for each deck segment with the built-in Windows male voice.

Ali chose the basic OS voice (male) over installing a neural TTS, and captions stay on
screen as well. The narration text IS the caption text, so what is heard and what is read
are the same sentence - a caption that paraphrases its own voiceover is a second script to
keep in sync, and it drifts.

Text is written to files and read by PowerShell rather than interpolated into the command
line: the captions contain apostrophes and commas, and quoting them through a shell is how
a narration line silently loses half its sentence.
"""
import json
import os
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
AUDIO = os.path.join(HERE, "audio")
VOICE = "Microsoft David Desktop"
RATE = 0

PS = """
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SelectVoice('{voice}')
$s.Rate = {rate}
$s.SetOutputToWaveFile('{wav}')
$s.Speak([System.IO.File]::ReadAllText('{txt}'))
$s.Dispose()
"""


def main():
    os.makedirs(AUDIO, exist_ok=True)
    deck = json.load(open(os.path.join(HERE, "deck.json"), encoding="utf-8"))
    timings = []

    for i, s in enumerate(deck):
        text = s["caption"]
        txt = os.path.join(AUDIO, f"{i:02d}.txt")
        wav = os.path.join(AUDIO, f"{i:02d}.wav")
        with open(txt, "w", encoding="utf-8") as fh:
            fh.write(text)
        script = PS.format(voice=VOICE, rate=RATE,
                           wav=wav.replace("/", "\\"), txt=txt.replace("/", "\\"))
        p = subprocess.run(["powershell.exe", "-NoProfile", "-Command", script],
                           capture_output=True, text=True)
        if p.returncode != 0 or not os.path.exists(wav):
            raise SystemExit(f"narration {i} failed: {p.stderr[-400:]}")

        dur = float(subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "csv=p=0", wav], capture_output=True, text=True).stdout.strip())
        # A slide must outlast its own sentence. 0.5s before the voice starts and 1.0s
        # after it stops, so a segment never cuts the last word or jumps the moment it ends.
        seconds = max(s["seconds"], round(dur + 1.5, 1))
        timings.append({"index": i, "audio_seconds": round(dur, 2), "seconds": seconds})
        print(f"  {i:02d}  voice {dur:5.2f}s  ->  segment {seconds:5.1f}s   {text[:52]}")

    with open(os.path.join(HERE, "timings.json"), "w", encoding="utf-8") as fh:
        json.dump(timings, fh, indent=1)
    print(f"\ntotal: {sum(t['seconds'] for t in timings):.1f}s across {len(timings)} segments")


if __name__ == "__main__":
    main()
