/**
 * zipArchive — a minimal, dependency-free ZIP writer.
 *
 * Written rather than installed on purpose. The one job is "hand a student the
 * same documents they would have got in their repo", the payload is a few dozen
 * kilobytes of markdown, and adding a dependency to this repo requires a
 * deliberate add (CLAUDE.md, Security Enforcement Layer). A hundred lines of
 * well-understood format beats a transitive dependency tree for that.
 *
 * STORE only — no compression. Markdown compresses well, but DEFLATE would mean
 * carrying a compressor, and the whole bundle is small enough that the saving is
 * not worth the surface. Every unzip tool on every platform reads stored entries.
 *
 * DETERMINISTIC. Same files in, byte-identical archive out: the modification
 * timestamp is a fixed constant unless a caller passes one. That is what makes
 * the output testable, and it means a student who downloads twice gets the same
 * file rather than a diff of nothing.
 *
 * Spec: PKWARE APPNOTE 6.3.3, sections 4.3.7 (local header), 4.3.12 (central
 * directory) and 4.3.16 (end of central directory).
 */

export interface ZipEntry {
  /** Repo-relative path with forward slashes. */
  path: string;
  content: string;
}

/** 1980-01-01T00:00:00Z — the earliest timestamp the ZIP format can express. */
const DOS_EPOCH = new Date(Date.UTC(1980, 0, 1, 0, 0, 0));

const LOCAL_HEADER_SIG = 0x04034b50;
const CENTRAL_HEADER_SIG = 0x02014b50;
const END_OF_CENTRAL_SIG = 0x06054b50;
/** Bit 11: filenames are UTF-8. Without it, non-ASCII paths decode as mojibake. */
const FLAG_UTF8 = 0x0800;
const METHOD_STORE = 0;
const VERSION_NEEDED = 20;

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

export function crc32(buf: Buffer): number {
  let c = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
  return (c ^ -1) >>> 0;
}

/** DOS time/date halves. Sub-2-second precision does not exist in this format. */
function dosStamp(date: Date): { time: number; date: number } {
  const d = date < DOS_EPOCH ? DOS_EPOCH : date;
  const time = (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (Math.floor(d.getUTCSeconds() / 2));
  const dateBits = ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate();
  return { time, date: dateBits };
}

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipError';
  }
}

/**
 * Build the archive.
 *
 * @throws ZipError on a path a ZIP cannot safely carry. Throwing rather than
 *         sanitising is deliberate: an absolute or `..`-bearing path in an
 *         archive is the zip-slip class of bug, and silently rewriting it hides
 *         the fact that something upstream produced it.
 */
export function createZip(entries: ZipEntry[], opts: { modifiedAt?: Date } = {}): Buffer {
  if (!entries.length) throw new ZipError('refusing to build an empty archive');

  const stamp = dosStamp(opts.modifiedAt ?? DOS_EPOCH);
  const seen = new Set<string>();
  const localChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const path = entry.path;
    if (!path || path.startsWith('/') || path.includes('\\') || /^[a-zA-Z]:/.test(path)) {
      throw new ZipError(`refusing to archive "${path}" — entry paths must be relative with forward slashes`);
    }
    if (path.split('/').includes('..')) {
      throw new ZipError(`refusing to archive "${path}" — it escapes the archive root`);
    }
    if (seen.has(path)) throw new ZipError(`duplicate entry "${path}" in archive`);
    seen.add(path);

    const nameBuf = Buffer.from(path, 'utf8');
    const dataBuf = Buffer.from(entry.content, 'utf8');
    const crc = crc32(dataBuf);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_HEADER_SIG, 0);
    local.writeUInt16LE(VERSION_NEEDED, 4);
    local.writeUInt16LE(FLAG_UTF8, 6);
    local.writeUInt16LE(METHOD_STORE, 8);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(dataBuf.length, 18);
    local.writeUInt32LE(dataBuf.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    localChunks.push(local, nameBuf, dataBuf);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_HEADER_SIG, 0);
    central.writeUInt16LE(VERSION_NEEDED, 4);       // version made by
    central.writeUInt16LE(VERSION_NEEDED, 6);       // version needed
    central.writeUInt16LE(FLAG_UTF8, 8);
    central.writeUInt16LE(METHOD_STORE, 10);
    central.writeUInt16LE(stamp.time, 12);
    central.writeUInt16LE(stamp.date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(dataBuf.length, 20);
    central.writeUInt32LE(dataBuf.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);                   // extra
    central.writeUInt16LE(0, 32);                   // comment
    central.writeUInt16LE(0, 34);                   // disk number
    central.writeUInt16LE(0, 36);                   // internal attrs
    // Unix mode in the high 16 bits: regular file, 0644. `>>> 0` because JS
    // shifts are signed 32-bit and `0o100644 << 16` lands negative without it.
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centralChunks.push(central, nameBuf);

    offset += local.length + nameBuf.length + dataBuf.length;
  }

  const centralDirectory = Buffer.concat(centralChunks);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_OF_CENTRAL_SIG, 0);
  end.writeUInt16LE(0, 4);                          // this disk
  end.writeUInt16LE(0, 6);                          // disk with central dir
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);                         // comment length

  return Buffer.concat([...localChunks, centralDirectory, end]);
}
