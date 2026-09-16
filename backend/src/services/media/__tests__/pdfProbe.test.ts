/**
 * pdfProbe — real (if tiny) PDFs built from the spec (pdfFixtures.ts), so the test does not
 * depend on a binary fixture and every byte is explained. The verifier also ran probePdf against
 * seven real-world PDFs (a 401-page guide, 67 MB transcripts, one-pagers) with pypdf as the
 * oracle: all matched. Those files are not checked in; the properties they exposed are.
 */

import { looksLikePdf, probePdf } from '../pdfProbe';
import { minimalPdf, incrementallySavedPdf } from './pdfFixtures';

describe('looksLikePdf', () => {
  it('needs the %PDF- header near the start', () => {
    expect(looksLikePdf(minimalPdf(1))).toBe(true);
    expect(looksLikePdf(Buffer.from('\xEF\xBB\xBF%PDF-1.7\n', 'latin1'))).toBe(true); // a BOM before it
    expect(looksLikePdf(Buffer.from('%PNG.... definitely not'))).toBe(false);
    expect(looksLikePdf(Buffer.alloc(2000, 0x20))).toBe(false);
  });
});

describe('probePdf', () => {
  it('reads the version and the page count from the root Pages object', () => {
    expect(probePdf(minimalPdf(3))).toEqual({ version: '1.4', pages: 3 });
    expect(probePdf(minimalPdf(12, { version: '1.7' }))).toEqual({ version: '1.7', pages: 12 });
  });

  it('does not take a /Count from a Pages node that has a /Parent (a subtree, not the root)', () => {
    // Only the parent-less node is the root; a nested node's Count is a partial total.
    const withNestedOnly = minimalPdf(4, { parentOnRoot: true });
    expect(probePdf(withNestedOnly).pages).toBeNull();
  });

  it('returns null pages when the count is not stated in plain text (object streams), never a guess', () => {
    const compressed = Buffer.from('%PDF-1.5\n1 0 obj\n<< /Type /ObjStm /N 3 /First 20 /Filter /FlateDecode >>\nstream\nxxxxxx\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF', 'latin1');
    expect(probePdf(compressed)).toEqual({ version: '1.5', pages: null });
  });

  it('refuses bytes with no PDF header', () => {
    expect(() => probePdf(Buffer.from('hello'))).toThrow(/not a PDF/);
  });
});

describe('what the verifier found on 2026-09-15', () => {
  it('an incrementally saved file: the NEWEST root Pages object wins, not the first', () => {
    // "Save" appends a new generation after the old one. First-wins reported 8 for a file cut to 3.
    expect(probePdf(incrementallySavedPdf(8, 3)).pages).toBe(3);
    expect(probePdf(incrementallySavedPdf(3, 5)).pages).toBe(5);
  });

  it('a crafted 5 MB file of obj headers with no endobj finishes in well under a second', () => {
    // The first version's regex was quadratic here: 400 KB took 5.6 s, 5 MB did not finish in
    // 90 s - inside the upload handler, on the event loop.
    const crafted = Buffer.from('%PDF-1.4\n' + '1 0 obj\n'.repeat(700_000), 'latin1');
    expect(crafted.length).toBeGreaterThan(5 * 1024 * 1024);
    const t0 = Date.now();
    expect(probePdf(crafted)).toEqual({ version: '1.4', pages: null });
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it('a crafted file of /Type /Pages with no endobj is also bounded', () => {
    const crafted = Buffer.from('%PDF-1.4\n' + '9 0 obj << /Type /Pages /Count 2 '.repeat(150_000), 'latin1');
    const t0 = Date.now();
    probePdf(crafted);
    expect(Date.now() - t0).toBeLessThan(500);
  });
});

describe('a flat page tree (every page in one /Kids array, /Count after it)', () => {
  it('reads the count of a 1,500-page flat tree, where a 4 KB window lost it', () => {
    const kids = Array.from({ length: 1500 }, (_, i) => `${3 + i} 0 R`).join(' ');
    const flat = Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count 1500 >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`, 'latin1');
    expect(flat.indexOf('/Count') - flat.indexOf('/Pages')).toBeGreaterThan(4096); // the case that was null
    expect(probePdf(flat).pages).toBe(1500);
  });
});
