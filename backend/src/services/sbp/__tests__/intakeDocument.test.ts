import { readIntakeDocument, isIntakeDocument, UNSUPPORTED_MESSAGE } from '../intakeDocument';
import { INTAKE_IDEA_MAX } from '../intakeLimits';

// The parsers are injected so these run without real PDF/Office files; the
// case-study extractor's own suite covers the real parsers.
const deps = (text: string) => ({ pdf: async () => text, office: async () => text, timeoutMs: 1_000 });

describe('readIntakeDocument', () => {
  it('reads plain text and Markdown directly, stripping a BOM and CRLF', async () => {
    const out = await readIntakeDocument(Buffer.from('﻿# Scope\r\nTriage the inbox.\r\n'), 'scope.md', 'text/markdown');
    expect(out).toEqual({ ok: true, fileName: 'scope.md', text: '# Scope\nTriage the inbox.', truncated: false, chars: 25 });
  });

  it('reads PDF, DOCX and PPTX through the extractor', async () => {
    for (const name of ['a.pdf', 'a.docx', 'a.pptx']) {
      const out = await readIntakeDocument(Buffer.from('x'), name, null, deps('Requirements: three releases.'));
      expect(out.ok && out.text).toBe('Requirements: three releases.');
    }
  });

  it('refuses other types with a sentence the student can act on', async () => {
    expect(isIntakeDocument('photo.png', 'image/png')).toBe(false);
    const out = await readIntakeDocument(Buffer.from('x'), 'photo.png', 'image/png');
    expect(out).toEqual({ ok: false, reason: 'unsupported', message: UNSUPPORTED_MESSAGE });
  });

  it('explains an image-only PDF rather than returning nothing', async () => {
    const out = await readIntakeDocument(Buffer.from('x'), 'scan.pdf', 'application/pdf', deps('   '));
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe('empty');
      expect(out.message).toMatch(/scan or a picture/);
    }
  });

  it('says a damaged file could not be opened', async () => {
    const out = await readIntakeDocument(Buffer.from('x'), 'a.docx', null,
      { pdf: async () => '', office: async () => { throw new Error('bad zip'); }, timeoutMs: 1_000 });
    expect(out.ok === false && out.reason).toBe('unreadable');
  });

  it('caps at the intake idea limit and says so', async () => {
    const out = await readIntakeDocument(Buffer.from('a'.repeat(INTAKE_IDEA_MAX + 50)), 'long.txt', 'text/plain');
    expect(out.ok && out.chars).toBe(INTAKE_IDEA_MAX);
    expect(out.ok && out.truncated).toBe(true);
  });
});
