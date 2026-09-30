/**
 * mp4Probe — read against REAL files from a real encoder, with ffprobe's answers as the oracle.
 *
 * The fixtures were made with ffmpeg 8.1 (see the generating commands in the session log for
 * CC-20260909-m4kt, 2026-09-15) and ffprobe reports, for each:
 *   portrait-h264-aac.mp4     h264 54x96  + aac, 2.000 s
 *   landscape-hevc-silent.mp4 hevc 96x54, no audio, 1.500 s
 *   phone-rotated-90.mp4      h264 96x54 coded, display_matrix rotation=90, 1.000 s
 *   fragmented.mp4            frag_keyframe+empty_moov: the case this parser must REFUSE
 * A parser that agreed with itself but not with ffprobe would be worse than none.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { probeMp4, looksLikeMp4, Mp4ParseError } from '../mp4Probe';

const fixture = (name: string) => fs.readFile(path.join(__dirname, 'fixtures', name));

describe('what ffprobe says, this says', () => {
  it('portrait H.264 with AAC audio', async () => {
    const f = probeMp4(await fixture('portrait-h264-aac.mp4'));
    expect(f).toMatchObject({ durationMs: 2000, width: 54, height: 96, codec: 'avc1', codecFamily: 'h264', hasAudio: true, rotation: 0 });
  });

  it('landscape HEVC with no audio track', async () => {
    const f = probeMp4(await fixture('landscape-hevc-silent.mp4'));
    expect(f).toMatchObject({ durationMs: 1500, width: 96, height: 54, codec: 'hvc1', codecFamily: 'h265', hasAudio: false });
  });

  it('a phone recording: coded 96x54 with a 90 degree matrix is DISPLAYED 54x96', async () => {
    // The trap: the frames are landscape, the viewer sees portrait, and the aspect rule is
    // about what the viewer sees. ffprobe: width=96 height=54 rotation=90.
    const f = probeMp4(await fixture('phone-rotated-90.mp4'));
    expect(f).toMatchObject({ width: 54, height: 96, rotation: 90, durationMs: 1000 });
  });
});

describe('what it refuses, and why that is right', () => {
  it('a fragmented MP4, whose moov carries no duration, with a re-export message', async () => {
    const err = await fixture('fragmented.mp4').then((b) => { try { probeMp4(b); return null; } catch (e) { return e as Mp4ParseError; } });
    expect(err).toBeInstanceOf(Mp4ParseError);
    expect(err?.reason).toBe('fragmented');
    expect(err?.message).toMatch(/Re-export/);
  });

  it('bytes that are not an MP4 at all', () => {
    expect(looksLikeMp4(Buffer.from('definitely not a video'))).toBe(false);
    expect(() => probeMp4(Buffer.from('definitely not a video, but long enough to have an ftyp'))).toThrow(/not an MP4/);
  });

  it('a file truncated mid-moov: refused as truncated, never a partial answer', async () => {
    const whole = await fixture('portrait-h264-aac.mp4');
    const moovAt = whole.indexOf('moov') - 4;
    const cut = whole.subarray(0, moovAt + 40);
    expect(() => probeMp4(cut)).toThrow(Mp4ParseError);
  });

  it('a box that claims more bytes than the file has', async () => {
    const whole = Buffer.from(await fixture('portrait-h264-aac.mp4'));
    const moovAt = whole.indexOf('moov') - 4;
    whole.writeUInt32BE(0x7fffffff, moovAt); // moov size -> absurd
    expect(() => probeMp4(whole)).toThrow(/claims/);
  });

  it('a tkhd box too short for its matrix, followed by a neighbour: refused, never read from the neighbour', async () => {
    // Found by the task verifier on 2026-09-15: before `need()` was bounded to the box's own
    // end, a short tkhd read the next box's bytes as its matrix and RETURNED an answer. Shrink
    // the real tkhd to 40 bytes and pad the gap with a `free` box so the file stays well-formed.
    const whole = Buffer.from(await fixture('phone-rotated-90.mp4'));
    const tkhdAt = whole.indexOf('tkhd') - 4;
    const tkhdSize = whole.readUInt32BE(tkhdAt);
    const shortSize = 40;                      // header 8 + version/flags 4 + 28 of the 84 v0 fields
    const cut = Buffer.from(whole);
    cut.writeUInt32BE(shortSize, tkhdAt);
    cut.writeUInt32BE(tkhdSize - shortSize, tkhdAt + shortSize);   // the remainder becomes...
    cut.write('free', tkhdAt + shortSize + 4, 'latin1');            // ...a free box: a neighbour with bytes
    let err: Mp4ParseError | null = null;
    try { probeMp4(cut); } catch (e) { err = e as Mp4ParseError; }
    expect(err).toBeInstanceOf(Mp4ParseError);
    expect(err?.reason).toBe('truncated');
    expect(err?.message).toMatch(/tkhd box is too short/);
  });

  it('an MP4 with only an audio track has no readable video track', async () => {
    // Build one: strip the video by re-muxing is not possible here without ffmpeg, so take the
    // real file and relabel its video handler as sound - the parser must then find no video.
    const b = Buffer.from(await fixture('portrait-h264-aac.mp4'));
    const hdlr = b.indexOf('hdlr');
    const handlerAt = hdlr + 4 + 4 + 4; // type(4) + version/flags(4) + pre_defined(4)
    expect(b.toString('latin1', handlerAt, handlerAt + 4)).toBe('vide');
    b.write('soun', handlerAt, 'latin1');
    expect(() => probeMp4(b)).toThrow(/no readable video track/);
  });
});
