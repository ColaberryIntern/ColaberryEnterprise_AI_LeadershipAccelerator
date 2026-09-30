/**
 * mp4Probe — the four facts a network's video rules ask for, read from the file's own boxes.
 *
 * WHY A PARSER AND NOT FFPROBE. Every network rule in providerCapabilities is about duration,
 * dimensions (aspect), codec and size. All four are in the MP4 container's `moov` box in
 * fixed, documented positions (ISO 14496-12). Reading them is ~150 lines with no dependency;
 * `ffprobe` is a 70 MB binary in the backend image, a CI dependency, and a child process per
 * upload. The parser is chosen for the same reason the media store was: smallest thing that
 * is deterministic and testable everywhere. What it gives up is breadth - a fragmented or
 * streaming MP4 (`moov` with no duration, `mvex`) is REFUSED with a message that says to
 * re-export, rather than half-read. Fail closed; the operator can re-export in seconds, and a
 * wrong duration would let a 12-minute clip through LinkedIn's 10-minute rule.
 *
 * Rotation matters: a phone records portrait as landscape frames plus a 90 degree matrix in
 * `tkhd`. The coded size says 1920x1080; the viewer sees 1080x1920; the aspect rule cares
 * about the second. The matrix is applied here so callers never see the trap.
 */

export class Mp4ParseError extends Error {
  constructor(message: string, public readonly reason: string) {
    super(message);
    this.name = 'Mp4ParseError';
  }
}

export interface Mp4Facts {
  durationMs: number;
  /** Display dimensions, rotation applied. */
  width: number;
  height: number;
  /** Sample entry type: avc1/avc3 (H.264), hvc1/hev1 (H.265), av01, vp09, mp4v ... */
  codec: string;
  /** Normalised family for capability checks: h264, h265, av1, vp9, or the raw type. */
  codecFamily: string;
  hasAudio: boolean;
  /** Degrees the container asks the viewer to rotate by: 0, 90, 180 or 270. */
  rotation: number;
  majorBrand: string;
}

const CODEC_FAMILY: Record<string, string> = {
  avc1: 'h264', avc3: 'h264', hvc1: 'h265', hev1: 'h265', av01: 'av1', vp09: 'vp9', mp4v: 'mpeg4',
};

/** True when the bytes begin with an MP4 file-type box; the cheap sniff before any parsing. */
export function looksLikeMp4(bytes: Buffer): boolean {
  return bytes.length >= 12 && bytes.toString('latin1', 4, 8) === 'ftyp';
}

interface Box { type: string; start: number; end: number; /** first byte of the payload */ body: number }

/** Walk the boxes in [from, to). Throws on a size that does not fit, which is how corruption shows up. */
function* boxes(buf: Buffer, from: number, to: number): Generator<Box> {
  let pos = from;
  while (pos + 8 <= to) {
    let size = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    let body = pos + 8;
    if (size === 1) {
      if (pos + 16 > to) throw new Mp4ParseError('A box header runs past the end of the file.', 'truncated');
      const large = buf.readBigUInt64BE(pos + 8);
      if (large > BigInt(Number.MAX_SAFE_INTEGER)) throw new Mp4ParseError('A box claims an impossible size.', 'corrupt');
      size = Number(large);
      body = pos + 16;
    } else if (size === 0) {
      size = to - pos; // "to end of file"
    }
    if (size < 8 || pos + size > to) throw new Mp4ParseError(`The ${type} box claims ${size} bytes but the file has ${to - pos} left.`, 'truncated');
    yield { type, start: pos, end: pos + size, body };
    pos += size;
  }
}

function find(buf: Buffer, from: number, to: number, type: string): Box | null {
  for (const b of boxes(buf, from, to)) if (b.type === type) return b;
  return null;
}

/** Full boxes carry a version byte and three flag bytes before their fields. */
function fullBox(buf: Buffer, b: Box): { version: number; fields: number } {
  if (b.body + 4 > b.end) throw new Mp4ParseError(`The ${b.type} box is too short.`, 'truncated');
  return { version: buf.readUInt8(b.body), fields: b.body + 4 };
}

/** The read must fit inside the box that claims it, not just inside the file. */
function need(buf: Buffer, at: number, n: number, what: string, limit: number = buf.length): void {
  if (at + n > limit) throw new Mp4ParseError(`The ${what} box is too short.`, 'truncated');
}

function readMvhd(buf: Buffer, mvhd: Box): number {
  const { version, fields } = fullBox(buf, mvhd);
  if (version === 1) {
    need(buf, fields, 28, 'mvhd', mvhd.end);
    const timescale = buf.readUInt32BE(fields + 16);
    const duration = Number(buf.readBigUInt64BE(fields + 20));
    return timescale > 0 ? (duration / timescale) * 1000 : 0;
  }
  need(buf, fields, 16, 'mvhd', mvhd.end);
  const timescale = buf.readUInt32BE(fields + 8);
  const duration = buf.readUInt32BE(fields + 12);
  return timescale > 0 ? (duration / timescale) * 1000 : 0;
}

/** The 3x3 matrix is nine 16.16 fixed-point values; a, b, c, d are the rotation part. */
function readRotation(buf: Buffer, tkhd: Box): number {
  const { version, fields } = fullBox(buf, tkhd);
  // v0: ctime4 mtime4 id4 res4 dur4 res8 layer2 alt2 vol2 res2 = 36; v1: 8 8 4 4 8 8 2 2 2 2 = 48
  const matrixAt = fields + (version === 1 ? 48 : 36);
  need(buf, matrixAt, 36, 'tkhd', tkhd.end);
  const fx = (o: number) => buf.readInt32BE(matrixAt + o) / 65536;
  const a = fx(0); const b = fx(4); const c = fx(12); const d = fx(16);
  // Labels follow ffprobe's `display_matrix:rotation` for the same matrix, so a value here can
  // be compared with what an operator sees in a probe. Only the 90/270 swap is load-bearing.
  if (a === 1 && d === 1) return 0;
  if (a === -1 && d === -1) return 180;
  if (a === 0 && d === 0 && b === -1 && c === 1) return 90;
  if (a === 0 && d === 0 && b === 1 && c === -1) return 270;
  return 0; // scale/skew we do not model; treat as unrotated
}

function readTkhdSize(buf: Buffer, tkhd: Box): { width: number; height: number } {
  const { version, fields } = fullBox(buf, tkhd);
  const at = fields + (version === 1 ? 48 : 36) + 36;
  need(buf, at, 8, 'tkhd', tkhd.end);
  return { width: buf.readUInt32BE(at) >>> 16, height: buf.readUInt32BE(at + 4) >>> 16 };
}

function readHandler(buf: Buffer, mdia: Box): string | null {
  const hdlr = find(buf, mdia.body, mdia.end, 'hdlr');
  if (!hdlr) return null;
  const { fields } = fullBox(buf, hdlr);
  need(buf, fields, 8, 'hdlr', hdlr.end);
  return buf.toString('latin1', fields + 4, fields + 8);
}

/** First sample entry of the track's sample description: its type is the codec, and a visual entry carries the coded size. */
function readSampleEntry(buf: Buffer, mdia: Box): { type: string; width: number; height: number } | null {
  const minf = find(buf, mdia.body, mdia.end, 'minf');
  const stbl = minf && find(buf, minf.body, minf.end, 'stbl');
  const stsd = stbl && find(buf, stbl.body, stbl.end, 'stsd');
  if (!stsd) return null;
  const { fields } = fullBox(buf, stsd);
  need(buf, fields, 4, 'stsd', stsd.end);
  if (buf.readUInt32BE(fields) === 0) return null;
  const entry = boxes(buf, fields + 4, stsd.end).next().value as Box | undefined;
  if (!entry) return null;
  // VisualSampleEntry: reserved6 dref2 pre_defined2 reserved2 pre_defined12 width2 height2
  let width = 0; let height = 0;
  if (entry.body + 28 <= entry.end) { width = buf.readUInt16BE(entry.body + 24); height = buf.readUInt16BE(entry.body + 26); }
  return { type: entry.type, width, height };
}

export function probeMp4(bytes: Buffer): Mp4Facts {
  if (!looksLikeMp4(bytes)) throw new Mp4ParseError('This is not an MP4 file (no ftyp box).', 'not_mp4');
  const majorBrand = bytes.toString('latin1', 8, 12);

  let moov: Box | null = null;
  for (const b of boxes(bytes, 0, bytes.length)) { if (b.type === 'moov') { moov = b; break; } }
  if (!moov) throw new Mp4ParseError('The video has no moov box, so its length and size cannot be read. Re-export it as a standard MP4.', 'no_moov');

  const mvhd = find(bytes, moov.body, moov.end, 'mvhd');
  if (!mvhd) throw new Mp4ParseError('The video has no movie header. Re-export it as a standard MP4.', 'no_mvhd');
  const durationMs = Math.round(readMvhd(bytes, mvhd));
  if (durationMs <= 0 || find(bytes, moov.body, moov.end, 'mvex')) {
    throw new Mp4ParseError('This is a fragmented or streaming MP4 and its length cannot be read. Re-export it as a standard (non-fragmented) MP4.', 'fragmented');
  }

  let video: { codec: string; width: number; height: number; rotation: number } | null = null;
  let hasAudio = false;
  for (const trak of boxes(bytes, moov.body, moov.end)) {
    if (trak.type !== 'trak') continue;
    const mdia = find(bytes, trak.body, trak.end, 'mdia');
    if (!mdia) continue;
    const handler = readHandler(bytes, mdia);
    if (handler === 'soun') { hasAudio = true; continue; }
    if (handler !== 'vide' || video) continue;
    const tkhd = find(bytes, trak.body, trak.end, 'tkhd');
    const entry = readSampleEntry(bytes, mdia);
    if (!entry) continue;
    const coded = entry.width > 0 && entry.height > 0 ? entry : (tkhd ? readTkhdSize(bytes, tkhd) : { width: 0, height: 0 });
    const rotation = tkhd ? readRotation(bytes, tkhd) : 0;
    const swap = rotation === 90 || rotation === 270;
    video = { codec: entry.type, width: swap ? coded.height : coded.width, height: swap ? coded.width : coded.height, rotation };
  }
  if (!video || video.width === 0 || video.height === 0) {
    throw new Mp4ParseError('The file has no readable video track. Re-export it as MP4 (H.264).', 'no_video_track');
  }

  return {
    durationMs, width: video.width, height: video.height, codec: video.codec,
    codecFamily: CODEC_FAMILY[video.codec] ?? video.codec, hasAudio, rotation: video.rotation, majorBrand,
  };
}
