/**
 * zipSafety — a cheap, DETERMINISTIC zip-bomb guard for the government upload boundary.
 *
 * The gov qualification routes accept a 100 MB solicitation ZIP (multer memoryStorage) and then open it with
 * adm-zip to hash/parse it. The 100 MB cap bounds the COMPRESSED bytes, but says nothing about what the archive
 * expands to: a few-KB upload can declare millions of entries or a single multi-GB file, and calling
 * `entry.getData()` on that would exhaust memory. This guard inspects the central directory ONLY — declared
 * uncompressed sizes, entry count, and compression ratio — WITHOUT decompressing anything, and rejects a
 * hostile archive before any `getData()` is ever called.
 *
 * It is TOTAL: a buffer that is not a readable zip is NOT a decompression bomb (its raw size is already bounded
 * by the upstream multer cap), so it returns `ok` and lets the downstream parser decide what to do with it.
 * The declared sizes in the central directory can be forged smaller than reality, but adm-zip verifies CRC/size
 * on actual extraction; this guard's job is to catch the common entry-count / declared-size / ratio bombs cheaply.
 */
// adm-zip is an undeclared/untyped dep (resolves via hoisted node_modules); require() keeps strict tsc happy (TS7016).
const AdmZip = require('adm-zip');

export interface ZipLimits {
  /** Maximum number of (non-directory) entries in the archive. */
  maxEntries: number;
  /** Maximum sum of declared UNCOMPRESSED sizes across all entries. */
  maxTotalBytes: number;
  /** Maximum declared UNCOMPRESSED size of any single entry. */
  maxEntryBytes: number;
  /** Maximum total-uncompressed / total-compressed ratio (a classic zip-bomb signal). */
  maxRatio: number;
}

/** Defaults sized for a real government solicitation (a few dozen documents, not a bomb). */
export const GOV_ZIP_LIMITS: ZipLimits = {
  maxEntries: 5000,
  maxTotalBytes: 1024 * 1024 * 1024, // 1 GB expanded
  maxEntryBytes: 300 * 1024 * 1024, // 300 MB single file
  maxRatio: 150,
};

export type ZipUnsafeReason = 'too_many_entries' | 'uncompressed_too_large' | 'entry_too_large' | 'ratio_too_high';

export type ZipSafetyVerdict =
  | { ok: true; entryCount: number; totalBytes: number; compressedBytes: number }
  | { ok: false; reason: ZipUnsafeReason; detail: string };

/**
 * Inspect a ZIP buffer's central directory and verdict whether it is safe to decompress. Never throws; never
 * decompresses. A non-zip buffer is reported `ok` (not a bomb — raw size is bounded upstream).
 */
export function inspectZipSafety(buffer: Buffer, limits: ZipLimits = GOV_ZIP_LIMITS): ZipSafetyVerdict {
  let entries: any[];
  try {
    // getEntries() reads the central-directory headers only — it does NOT call inflate on the entry data.
    entries = new AdmZip(buffer).getEntries().filter((e: any) => !e.isDirectory);
  } catch {
    return { ok: true, entryCount: 0, totalBytes: 0, compressedBytes: 0 };
  }

  if (entries.length > limits.maxEntries) {
    return { ok: false, reason: 'too_many_entries', detail: `${entries.length} entries exceeds the ${limits.maxEntries}-entry limit.` };
  }

  let totalBytes = 0;
  let compressedBytes = 0;
  for (const e of entries) {
    const size = Number(e.header?.size ?? 0); // declared uncompressed size
    const csize = Number(e.header?.compressedSize ?? 0);
    if (size > limits.maxEntryBytes) {
      return { ok: false, reason: 'entry_too_large', detail: `An entry declares ${size} uncompressed bytes, over the ${limits.maxEntryBytes}-byte per-entry limit.` };
    }
    totalBytes += size;
    compressedBytes += csize;
    if (totalBytes > limits.maxTotalBytes) {
      return { ok: false, reason: 'uncompressed_too_large', detail: `Declared uncompressed total exceeds the ${limits.maxTotalBytes}-byte limit.` };
    }
  }

  if (compressedBytes > 0 && totalBytes / compressedBytes > limits.maxRatio) {
    return { ok: false, reason: 'ratio_too_high', detail: `Compression ratio ${(totalBytes / compressedBytes).toFixed(1)}x exceeds the ${limits.maxRatio}x limit.` };
  }

  return { ok: true, entryCount: entries.length, totalBytes, compressedBytes };
}
