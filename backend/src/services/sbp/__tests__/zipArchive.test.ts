/**
 * zipArchive — a hand-written ZIP writer, so the format itself is what needs
 * proving. These tests parse the bytes back out rather than trusting the
 * builder: a "valid-looking" archive that no unzip tool can open would fail
 * only in a student's hands.
 */
import { createZip, crc32, ZipError } from '../zipArchive';

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const END_SIG = 0x06054b50;

/** Read a STORE-method archive back out. Mirrors what an unzip tool does. */
function readZip(buf: Buffer): Record<string, string> {
  // Locate the end-of-central-directory record.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === END_SIG) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('no end-of-central-directory record');

  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  const out: Record<string, string> = {};

  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(offset) !== CENTRAL_SIG) throw new Error(`bad central header at ${offset}`);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.subarray(offset + 46, offset + 46 + nameLen).toString('utf8');

    if (buf.readUInt32LE(localOffset) !== LOCAL_SIG) throw new Error(`bad local header for ${name}`);
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const size = buf.readUInt32LE(localOffset + 22);
    const declaredCrc = buf.readUInt32LE(localOffset + 14);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const data = buf.subarray(dataStart, dataStart + size);

    // The checksum is the whole reason a reader can trust the payload.
    expect(crc32(data)).toBe(declaredCrc);
    out[name] = data.toString('utf8');
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

describe('createZip', () => {
  const entries = [
    { path: 'docs/REQUIREMENTS.md', content: '# Requirements\n\nFUNC-001 — dispatch a driver.\n' },
    { path: 'CLAUDE.md', content: '# CLAUDE.md\n' },
    { path: '.colaberry/progress.json', content: '{"schema_version":1}\n' },
  ];

  it('round-trips every entry, path and content intact', () => {
    const read = readZip(createZip(entries));
    expect(Object.keys(read).sort()).toEqual(entries.map((e) => e.path).sort());
    for (const e of entries) expect(read[e.path]).toBe(e.content);
  });

  it('is deterministic — the same input produces byte-identical output', () => {
    expect(createZip(entries).equals(createZip(entries))).toBe(true);
  });

  it('carries UTF-8 content and sets the UTF-8 filename flag', () => {
    const content = 'Über — naïve — 日本語 — emoji 🚀\n';
    const buf = createZip([{ path: 'docs/unicode.md', content }]);
    expect(readZip(buf)['docs/unicode.md']).toBe(content);
    expect(buf.readUInt16LE(6) & 0x0800).toBe(0x0800);   // local header general-purpose bit 11
  });

  it('handles an empty file without corrupting the archive', () => {
    const read = readZip(createZip([{ path: 'docs/empty.md', content: '' }, ...entries]));
    expect(read['docs/empty.md']).toBe('');
    expect(Object.keys(read)).toHaveLength(4);
  });

  it('handles a file large enough to cross a buffer boundary', () => {
    const content = 'x'.repeat(200_000);
    expect(readZip(createZip([{ path: 'docs/big.md', content }]))['docs/big.md']).toBe(content);
  });

  it('records the entry count in the end-of-central-directory record', () => {
    const buf = createZip(entries);
    const eocd = buf.length - 22;
    expect(buf.readUInt16LE(eocd + 8)).toBe(entries.length);
    expect(buf.readUInt16LE(eocd + 10)).toBe(entries.length);
  });
});

describe('createZip — refusals', () => {
  it.each([
    ['an absolute path', '/etc/passwd'],
    ['a Windows absolute path', 'C:/Windows/system32'],
    ['a backslash path', 'docs\\thing.md'],
    ['a traversal', '../../../etc/passwd'],
    ['an embedded traversal', 'docs/../../escape.md'],
  ])('refuses %s', (_name, path) => {
    // Sanitising silently would hide whatever upstream produced it. This is the
    // zip-slip class of bug and it fails loudly.
    expect(() => createZip([{ path, content: 'x' }])).toThrow(ZipError);
  });

  it('refuses duplicate entries rather than shipping an ambiguous archive', () => {
    expect(() => createZip([{ path: 'a.md', content: '1' }, { path: 'a.md', content: '2' }])).toThrow(/duplicate/);
  });

  it('refuses an empty archive', () => {
    expect(() => createZip([])).toThrow(ZipError);
  });
});

describe('crc32', () => {
  it('matches the known value for the standard check string', () => {
    // "123456789" → 0xCBF43926 is the CRC-32 conformance vector.
    expect(crc32(Buffer.from('123456789', 'utf8'))).toBe(0xcbf43926);
  });
  it('is zero for empty input', () => {
    expect(crc32(Buffer.alloc(0))).toBe(0);
  });
});
