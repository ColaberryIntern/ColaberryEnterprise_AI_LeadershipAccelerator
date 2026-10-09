/**
 * zipSafety must catch the common zip-bomb vectors from the CENTRAL DIRECTORY ONLY (no decompression) and be
 * TOTAL — a non-zip buffer is reported ok (not a bomb; raw size is bounded upstream), garbage never throws. Each
 * guard (entry count / per-entry size / total size / ratio) is proven in isolation with tight custom limits.
 */
const AdmZip = require('adm-zip');
import { inspectZipSafety, GOV_ZIP_LIMITS, type ZipLimits } from '../zipSafety';

/** Build a zip from name -> content (string or Buffer). */
function zipOf(files: Record<string, string | Buffer>): Buffer {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(files)) {
    zip.addFile(name, typeof content === 'string' ? Buffer.from(content, 'utf8') : content);
  }
  return zip.toBuffer();
}

const LOOSE: ZipLimits = { maxEntries: 1e6, maxTotalBytes: 1e12, maxEntryBytes: 1e12, maxRatio: 1e9 };

describe('inspectZipSafety', () => {
  it('passes a normal small archive and reports the real entry/byte counts', () => {
    const v = inspectZipSafety(zipOf({ 'a.txt': 'hello world', 'b.txt': 'second file' }));
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.entryCount).toBe(2);
      expect(v.totalBytes).toBe('hello world'.length + 'second file'.length);
    }
  });

  it('rejects TOO MANY entries (central-directory entry-count bomb)', () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 12; i++) files[`f${i}.txt`] = 'x';
    const v = inspectZipSafety(zipOf(files), { ...LOOSE, maxEntries: 10 });
    expect(v).toMatchObject({ ok: false, reason: 'too_many_entries' });
  });

  it('rejects a single entry whose DECLARED uncompressed size is over the per-entry limit', () => {
    const v = inspectZipSafety(zipOf({ 'big.txt': 'y'.repeat(2000) }), { ...LOOSE, maxEntryBytes: 1000 });
    expect(v).toMatchObject({ ok: false, reason: 'entry_too_large' });
  });

  it('rejects when the DECLARED uncompressed TOTAL exceeds the total limit', () => {
    const v = inspectZipSafety(zipOf({ 'a.txt': 'y'.repeat(600), 'b.txt': 'z'.repeat(600) }), { ...LOOSE, maxTotalBytes: 1000 });
    expect(v).toMatchObject({ ok: false, reason: 'uncompressed_too_large' });
  });

  it('rejects a high COMPRESSION RATIO (the classic bomb: tiny compressed, huge expanded)', () => {
    // 200 KB of zeros compresses to a few hundred bytes -> ratio far above 10x, but well under the size limits.
    const v = inspectZipSafety(zipOf({ 'zeros.bin': Buffer.alloc(200 * 1024, 0) }), { ...LOOSE, maxRatio: 10 });
    expect(v).toMatchObject({ ok: false, reason: 'ratio_too_high' });
  });

  it('a ratio bomb trips under the DEFAULT gov limits too (not just a contrived small limit)', () => {
    const v = inspectZipSafety(zipOf({ 'zeros.bin': Buffer.alloc(2 * 1024 * 1024, 0) }), GOV_ZIP_LIMITS);
    expect(v).toMatchObject({ ok: false, reason: 'ratio_too_high' });
  });

  it('is total — a non-zip buffer is reported ok (not a bomb), never a throw', () => {
    expect(inspectZipSafety(Buffer.from('not a zip at all'))).toMatchObject({ ok: true, entryCount: 0 });
    expect(inspectZipSafety(Buffer.alloc(0))).toMatchObject({ ok: true, entryCount: 0 });
  });

  it('ignores directory entries when counting', () => {
    const zip = new AdmZip();
    zip.addFile('dir/', Buffer.alloc(0)); // directory entry
    zip.addFile('dir/a.txt', Buffer.from('hi'));
    const v = inspectZipSafety(zip.toBuffer(), { ...LOOSE, maxEntries: 1 });
    expect(v.ok).toBe(true); // only the one real file counts, not the directory
    if (v.ok) expect(v.entryCount).toBe(1);
  });
});
