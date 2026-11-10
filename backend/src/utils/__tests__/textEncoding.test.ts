import { decodeUploadFilename, repairMojibake } from '../textEncoding';

/** What busboy does to a UTF-8 filename: each byte becomes one Latin-1 character. */
const asLatin1 = (s: string): string => Buffer.from(s, 'utf8').toString('latin1');

describe('textEncoding: undo UTF-8 read as Latin-1 (the "â€”" in artifact names)', () => {
  it('repairs the real prod filename, byte for byte', () => {
    // From prod, 10 Nov 2026: bytes c3 a2 c2 80 c2 94 where an em-dash (e2 80 94) belongs.
    const damaged = Buffer.from('4275696c6420446179204c616220' + 'c3a2c280c294' + '20596f757220466972737420414920576f726b666c6f772e706466', 'hex').toString('utf8');
    expect(repairMojibake(damaged)).toBe('Build Day Lab — Your First AI Workflow.pdf');
  });

  it('repairs text damaged twice (the triple-encoded field guide filename)', () => {
    const twice = asLatin1(asLatin1('Software Engineer Field Guide — Colaberry.html'));
    expect(repairMojibake(twice)).toBe('Software Engineer Field Guide — Colaberry.html');
  });

  it('repairs a title that mixes our clean em-dash with a damaged filename', () => {
    const title = `Build Your First AI Workflow — ${asLatin1('Build Day Lab — Your First AI Workflow.pdf')}`;
    expect(repairMojibake(title)).toBe('Build Your First AI Workflow — Build Day Lab — Your First AI Workflow.pdf');
  });

  it('never touches clean text or genuine Latin-1', () => {
    for (const s of ['plain.pdf', 'café notes.docx', 'Naïve × 2', 'Build — Expo', '日本語.pdf', '']) {
      expect(repairMojibake(s)).toBe(s);
    }
    expect(repairMojibake(null)).toBeNull();
  });

  it('is idempotent: repairing twice equals repairing once', () => {
    const damaged = asLatin1('A — B ’s file.pdf');
    expect(repairMojibake(repairMojibake(damaged))).toBe(repairMojibake(damaged));
  });

  it('decodeUploadFilename recovers what the browser sent', () => {
    expect(decodeUploadFilename(asLatin1('résumé — final.pdf'))).toBe('résumé — final.pdf');
    expect(decodeUploadFilename('report.pdf')).toBe('report.pdf');
    expect(decodeUploadFilename(undefined)).toBeUndefined();
  });
});
