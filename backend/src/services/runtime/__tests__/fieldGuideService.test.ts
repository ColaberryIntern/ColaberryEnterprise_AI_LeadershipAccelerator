/**
 * fieldGuideService — unit tests for the pure guards (validation + requirement
 * check + points key). The DB-touching paths (uploadFieldGuide / status / gate)
 * are integration-level; here we lock the failure + boundary behavior that must
 * hold before any DB write. Mirrors the Testing rules: happy + failure + boundary.
 */
import { parseFieldGuideUpload, requiresFieldGuideUpload, fieldGuidePointsKey, FIELD_GUIDE_POINTS } from '../fieldGuideService';

const buf = (s: string) => Buffer.from(s, 'utf8');
const file = (s: string, originalname = 'guide.html') => ({ originalname, mimetype: 'text/html', buffer: buf(s), size: buf(s).length });
const VALID = '<!doctype html><html><head><title>My Field Guide</title></head><body><h1>BA Field Guide</h1></body></html>';

/** Run fn, return the thrown error, or fail loudly if it did NOT throw. */
function thrown(fn: () => unknown): any {
  try { fn(); } catch (e) { return e; }
  throw new Error('expected the call to throw, but it did not');
}

describe('parseFieldGuideUpload', () => {
  it('accepts a well-formed HTML document (happy path)', () => {
    const r = parseFieldGuideUpload(file(VALID));
    expect(r.html).toContain('<h1>BA Field Guide</h1>');
    expect(r.filename).toBe('guide.html');
    expect(r.size_bytes).toBe(buf(VALID).length);
  });

  it('accepts <html> without a doctype', () => {
    expect(() => parseFieldGuideUpload(file('<html><body>ok</body></html>'))).not.toThrow();
  });

  it('rejects a missing file with 400', () => {
    expect(thrown(() => parseFieldGuideUpload(null)).status).toBe(400);
    expect(thrown(() => parseFieldGuideUpload(undefined)).status).toBe(400);
  });

  it('rejects an empty file with 400', () => {
    expect(thrown(() => parseFieldGuideUpload(file(''))).status).toBe(400);
  });

  it('rejects whitespace-only content with 400', () => {
    expect(thrown(() => parseFieldGuideUpload(file('   \n  \t '))).status).toBe(400);
  });

  it('rejects non-HTML content with 400 and a helpful message', () => {
    const e = thrown(() => parseFieldGuideUpload(file('just some notes, not html', 'notes.txt')));
    expect(e.status).toBe(400);
    expect(String(e.message)).toMatch(/HTML Field Guide/i);
  });

  it('rejects an oversized file with 413 (boundary: maxBytes + 1)', () => {
    const max = 100;
    const big = { originalname: 'big.html', mimetype: 'text/html', buffer: Buffer.alloc(max + 1, 0x61) };
    expect(thrown(() => parseFieldGuideUpload(big as any, max)).status).toBe(413);
  });

  it('accepts a file exactly at the size limit (boundary: maxBytes)', () => {
    const max = 200;
    const prefix = '<!doctype html><html>';
    const exact = { originalname: 'edge.html', mimetype: 'text/html', buffer: Buffer.concat([buf(prefix), Buffer.alloc(max - prefix.length, 0x20)]) };
    expect(exact.buffer.length).toBe(max);
    expect(() => parseFieldGuideUpload(exact as any, max)).not.toThrow();
  });

  it('truncates an over-long filename to 200 chars', () => {
    const long = 'a'.repeat(300) + '.html';
    expect(parseFieldGuideUpload(file(VALID, long)).filename.length).toBe(200);
  });
});

describe('requiresFieldGuideUpload', () => {
  it('is true only when metadata.requires_field_guide_upload === true', () => {
    expect(requiresFieldGuideUpload({ metadata: { requires_field_guide_upload: true } })).toBe(true);
    expect(requiresFieldGuideUpload({ metadata: { requires_field_guide_upload: false } })).toBe(false);
    expect(requiresFieldGuideUpload({ metadata: {} })).toBe(false);
    expect(requiresFieldGuideUpload({})).toBe(false);
    expect(requiresFieldGuideUpload(null)).toBe(false);
    expect(requiresFieldGuideUpload(undefined)).toBe(false);
  });
});

describe('fieldGuidePointsKey', () => {
  it('is stable + card-scoped (the idempotency key for the 100-point award)', () => {
    expect(fieldGuidePointsKey('abc')).toBe('deep_dive_field_guide:abc');
    expect(fieldGuidePointsKey('abc')).toBe(fieldGuidePointsKey('abc'));
    expect(fieldGuidePointsKey('abc')).not.toBe(fieldGuidePointsKey('def'));
    expect(FIELD_GUIDE_POINTS).toBe(100);
  });
});
