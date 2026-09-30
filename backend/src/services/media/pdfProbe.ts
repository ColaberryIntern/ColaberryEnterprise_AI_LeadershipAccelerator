/**
 * pdfProbe — is it a PDF, and how many pages.
 *
 * LinkedIn's document post takes a PDF of up to 300 pages and 100 MB. The size is known from
 * the bytes; the page count has to be read. A PDF's root `/Pages` object carries `/Count N`,
 * the total, in plain text in most files - and inside a compressed object stream in some
 * (PDF 1.5+ with object streams), where it is not readable without inflating and parsing
 * the cross-reference machinery. So this is BEST EFFORT and says so: a count when the file
 * states one plainly, null when it does not. The validator treats null as "unknown, not
 * over", because the alternative - refusing every object-stream PDF - would reject files
 * from the most common PDF exporters for a limit a marketing carousel never approaches.
 * That is a different stance from mp4Probe, on purpose: a wrong duration lets a real rule
 * be broken; a missing page count on a 12-page carousel does not. Null is also the answer past
 * MAX_PAGES_CANDIDATES (a crafted file) and when the root dictionary outgrows the scan window.
 *
 * Two things the first version got wrong, found by the task verifier on 2026-09-15:
 *   - Incremental saves ("Save", not "Save As") APPEND a new generation of changed objects.
 *     The newest root `/Pages` is therefore the LAST parent-less one in the file, not the
 *     first. Taking the first reported 8 pages for a file trimmed to 3.
 *   - A regex over the whole file with a lazy `[\s\S]*?` between `obj` and `endobj` is
 *     quadratic on a crafted file of `obj` headers with no `endobj`; 5 MB of them stalled the
 *     event loop for minutes inside the upload handler. The scan below does bounded work per
 *     `/Pages` occurrence, so cost is linear in the file.
 */

export class PdfParseError extends Error {
  constructor(message: string, public readonly reason: string) {
    super(message);
    this.name = 'PdfParseError';
  }
}

export interface PdfFacts {
  /** From the PDF header, e.g. "1.7". */
  version: string;
  /**
   * Total pages when the file states it plainly. Null means UNKNOWN, never "over": the count is
   * inside a compressed object stream, or the file had more page-tree candidates than any real
   * document (a crafted upload), or the root dictionary was larger than the scan window.
   */
  pages: number | null;
}

/** `%PDF-` in the first 1 KB (a few writers put a byte-order mark or junk before it). */
export function looksLikePdf(bytes: Buffer): boolean {
  return bytes.length >= 8 && bytes.subarray(0, 1024).indexOf('%PDF-') !== -1;
}

/**
 * How far around `/Pages` we look for its object's bounds. Backwards, a dictionary's `/Type`
 * is near its start. Forwards is the concern: a FLAT page tree (LibreOffice-style, one root
 * with every page in `/Kids`) puts `/Count` after a `/Kids` array of ~9 bytes per page, so a
 * 4 KB window lost the count past ~450 pages. 64 KB covers ~7,000 pages, far past LinkedIn's
 * 300, and stops at the first `endobj` anyway.
 */
const DICT_WINDOW_BACK = 4096;
const DICT_WINDOW_FORWARD = 65_536;
/**
 * A real file has one root Pages node and, for very long documents, a few hundred subtree
 * nodes (a 2,000-page manual with a balanced tree has ~200). Past this many candidates the
 * file is not a document anyone made; stop and report
 * "unknown" rather than spend a minute of event loop on a crafted upload.
 */
const MAX_PAGES_CANDIDATES = 600;

export function probePdf(bytes: Buffer): PdfFacts {
  const headAt = bytes.subarray(0, 1024).indexOf('%PDF-');
  if (headAt === -1) throw new PdfParseError('This is not a PDF file.', 'not_pdf');
  const version = bytes.toString('latin1', headAt + 5, headAt + 8).replace(/[^0-9.]/g, '') || 'unknown';

  // PDF syntax outside streams is ASCII; latin1 keeps byte offsets equal to string offsets.
  const text = bytes.toString('latin1');
  let pages: number | null = null;
  let at = 0;
  let candidates = 0;
  while ((at = text.indexOf('/Pages', at)) !== -1) {
    const hit = at;
    at += 6;
    // `/Type /Pages` (any whitespace), not `/Pages 2 0 R` inside a catalog or a `/Parent` ref.
    if (!/\/Type\s*$/.test(text.slice(Math.max(0, hit - 16), hit))) continue;
    if (++candidates > MAX_PAGES_CANDIDATES) return { version, pages: null };
    // The enclosing object's body, bounded: back to the nearest ` obj` header, forward to the
    // nearest `endobj`, never more than DICT_WINDOW either way.
    // Both searches run INSIDE the window. An unbounded indexOf('endobj') on a file with no
    // endobj at all scans to the end for every occurrence - quadratic again, just elsewhere.
    const lo = Math.max(0, hit - DICT_WINDOW_BACK);
    const hi = Math.min(text.length, hit + DICT_WINDOW_FORWARD);
    const before = text.slice(lo, hit);
    const after = text.slice(hit, hi);
    const headerAt = before.lastIndexOf(' obj');
    const endAt = after.indexOf('endobj');
    const body = (headerAt === -1 ? before : before.slice(headerAt)) + (endAt === -1 ? after : after.slice(0, endAt));
    if (/\/Parent\b/.test(body)) continue;          // a subtree node, not the root
    const count = /\/Count\s+(\d+)/.exec(body);
    if (count) pages = Number(count[1]);            // last one wins: the newest generation
  }
  if (pages !== null && pages <= 0) pages = null;
  return { version, pages };
}
