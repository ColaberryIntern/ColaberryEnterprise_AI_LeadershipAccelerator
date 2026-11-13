/**
 * The rendition: argument arrays (no shell), a bounded transcode, duration measured on the OUTPUT,
 * and a refusal the candidate can act on. The last block runs the real ffmpeg when it is installed
 * (the backend image has it; CI's runner may not), on a clip ffmpeg itself generates.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  makeRendition, MAX_SECONDS, posterArgs, probeArgs, transcodeArgs, VideoRejectedError, type Runner,
} from '../hireVideoTranscode';

function runner(seconds: string, fail?: 'transcode') {
  const calls: { cmd: string; args: readonly string[]; timeoutMs: number }[] = [];
  const run: Runner = async (cmd, args, timeoutMs) => {
    calls.push({ cmd, args, timeoutMs });
    if (fail === 'transcode' && cmd === 'ffmpeg' && args.includes('libx264')) throw new Error('Invalid data found');
    return cmd === 'ffprobe' ? `${seconds}\n` : '';
  };
  return { run, calls };
}

describe('makeRendition', () => {
  test('transcodes, probes the output, then takes a poster from the opening seconds', async () => {
    const { run, calls } = runner('92.48');
    await expect(makeRendition('/tmp/in.upload', '/v/abc', run)).resolves.toEqual({ seconds: 92 });
    expect(calls.map((c) => c.cmd)).toEqual(['ffmpeg', 'ffprobe', 'ffmpeg']);
    expect(calls[1].args).toContain(path.join('/v/abc', 'stream.mp4'));
    expect(calls[2].args).toEqual(posterArgs(path.join('/v/abc', 'stream.mp4'), path.join('/v/abc', 'poster.jpg'), 1.5));
    expect(calls.every((c) => c.timeoutMs > 0 && c.timeoutMs <= 180_000)).toBe(true);
  });

  test('the transcode is bounded, web-ready and never handed to a shell', () => {
    const a = transcodeArgs('/tmp/in; rm -rf /', '/v/out.mp4');
    expect(a).toContain('/tmp/in; rm -rf /'); // one argv entry, inert
    expect(a.slice(a.indexOf('-t'), a.indexOf('-t') + 2)).toEqual(['-t', String(MAX_SECONDS + 1)]);
    expect(a).toEqual(expect.arrayContaining(['+faststart', 'libx264', 'yuv420p', 'aac']));
    expect(probeArgs('/v/out.mp4').at(-1)).toBe('/v/out.mp4');
  });

  test('too long, too short, or not a video: a sentence the candidate can act on', async () => {
    await expect(makeRendition('in', 'd', runner(String(MAX_SECONDS + 1)).run)).rejects.toThrow(/over 3 minutes/);
    await expect(makeRendition('in', 'd', runner('1.2').run)).rejects.toThrow(/too short/);
    await expect(makeRendition('in', 'd', runner('N/A').run)).rejects.toThrow(/too short/);
    const bad = makeRendition('in', 'd', runner('60', 'transcode').run);
    await expect(bad).rejects.toBeInstanceOf(VideoRejectedError);
    await expect(bad).rejects.toMatchObject({ status: 400 });
  });
});

const hasFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

(hasFfmpeg ? describe : describe.skip)('with the real ffmpeg', () => {
  test('a 4-second WebM becomes a faststart MP4 and a JPEG poster', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hire-video-'));
    const src = path.join(dir, 'in.webm');
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=440',
      '-t', '4', '-c:v', 'libvpx', '-c:a', 'libopus', '-shortest', src]);
    try {
      await expect(makeRendition(src, dir)).resolves.toEqual({ seconds: 4 });
      const mp4 = fs.readFileSync(path.join(dir, 'stream.mp4'));
      // faststart: the moov atom comes before mdat, so playback can begin before the download ends.
      expect(mp4.indexOf('moov')).toBeLessThan(mp4.indexOf('mdat'));
      expect(fs.readFileSync(path.join(dir, 'poster.jpg')).subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
