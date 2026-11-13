/**
 * Text extraction routing and its fail-soft contract. The parsers are injected; the REAL pdf-parse is exercised
 * against the AgTech fixture in caseStudyOutsideExtract.realPdf.test.ts (child process - jest's VM cannot load it).
 */
import { extractOutsideText, outsideExtension, MAX_EXTRACT_CHARS } from '../caseStudyOutsideExtract';

const bytes = Buffer.from('%PDF-1.4 fake');
let errSpy: jest.SpyInstance;
beforeEach(() => { errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => errSpy.mockRestore());

describe('outsideExtension', () => {
  it('accepts pdf/docx/pptx by name (any case), falling back to the MIME type', () => {
    expect(outsideExtension('Deck.PPTX')).toBe('.pptx');
    expect(outsideExtension('report.docx')).toBe('.docx');
    expect(outsideExtension('noext', 'application/pdf')).toBe('.pdf');
  });
  it('refuses everything else, including legacy .doc/.ppt and images', () => {
    expect(outsideExtension('old.doc')).toBeNull();
    expect(outsideExtension('old.ppt', 'application/vnd.ms-powerpoint')).toBeNull();
    expect(outsideExtension('pic.png', 'image/png')).toBeNull();
    expect(outsideExtension('')).toBeNull();
  });
});

describe('extractOutsideText', () => {
  it('routes PDFs to the PDF parser and Office files to the Office parser', async () => {
    const pdf = jest.fn().mockResolvedValue('  pdf text  ');
    const office = jest.fn().mockResolvedValue('office text');
    expect(await extractOutsideText(bytes, 'a.pdf', null, { pdf, office })).toMatchObject({ ok: true, text: 'pdf text' });
    expect(await extractOutsideText(bytes, 'a.pptx', null, { pdf, office })).toMatchObject({ ok: true, text: 'office text' });
    expect(office).toHaveBeenCalledWith(bytes, 'document.pptx');
    expect(pdf).toHaveBeenCalledTimes(1);
  });

  it('refuses an unsupported type before any parser runs', async () => {
    const pdf = jest.fn();
    const out = await extractOutsideText(bytes, 'a.xlsx', null, { pdf, office: pdf });
    expect(out).toMatchObject({ ok: false, errorClass: 'UnsupportedType' });
    expect(pdf).not.toHaveBeenCalled();
  });

  it('reports a scanned PDF (no text) as NoText rather than success', async () => {
    const out = await extractOutsideText(bytes, 'scan.pdf', null, { pdf: jest.fn().mockResolvedValue('   \n ') });
    expect(out).toMatchObject({ ok: false, errorClass: 'NoText' });
    expect(out.error).toMatch(/scanned/);
  });

  it('never throws when a parser throws; logs ParseFailed', async () => {
    const out = await extractOutsideText(bytes, 'bad.pdf', null, { pdf: jest.fn().mockRejectedValue(new Error('Invalid PDF structure')) });
    expect(out).toMatchObject({ ok: false, errorClass: 'ParseFailed' });
    expect(JSON.parse(String(errSpy.mock.calls[0][0]))).toMatchObject({ event: 'case_study_outside_extract_failed', error_class: 'ParseFailed' });
  });

  it('times out a parser that hangs', async () => {
    const out = await extractOutsideText(bytes, 'slow.pdf', null, { pdf: () => new Promise(() => undefined), timeoutMs: 20 });
    expect(out).toMatchObject({ ok: false, errorClass: 'ParseTimeout' });
  });

  it('truncates at the cap and says so', async () => {
    const out = await extractOutsideText(bytes, 'big.pdf', null, { pdf: jest.fn().mockResolvedValue('w'.repeat(MAX_EXTRACT_CHARS + 10)) });
    expect(out).toMatchObject({ ok: true, truncated: true });
    expect(out.text).toHaveLength(MAX_EXTRACT_CHARS);
  });
});
