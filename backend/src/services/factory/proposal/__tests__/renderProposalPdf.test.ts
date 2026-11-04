/**
 * renderProposalPdf — Playwright + pdf-parse mocked. Proves: the happy path returns the bytes and the page count
 * MEASURED from pdf-parse (never computed); the browser is always closed; a hung render hits the strict timeout; a
 * launch failure and a bad page count are typed PdfRenderErrors (fail-soft, never an unhandled throw).
 */
const launchMock = jest.fn();
const newPageMock = jest.fn();
const setContentMock = jest.fn();
const pdfMock = jest.fn();
const closeMock = jest.fn();
const pdfParseMock = jest.fn();

jest.mock('playwright', () => ({ chromium: { launch: (...a: any[]) => launchMock(...a) } }));
jest.mock('pdf-parse', () => ({ __esModule: true, default: (...a: any[]) => pdfParseMock(...a) }));

import { renderProposalPdf, wrapPrintableHtml, PdfRenderError } from '../renderProposalPdf';

beforeEach(() => {
  jest.clearAllMocks();
  closeMock.mockResolvedValue(undefined);
  pdfMock.mockResolvedValue(Buffer.from('%PDF-1.7 ...'));
  setContentMock.mockResolvedValue(undefined);
  newPageMock.mockResolvedValue({ setContent: setContentMock, pdf: pdfMock });
  launchMock.mockResolvedValue({ newPage: newPageMock, close: closeMock });
  pdfParseMock.mockResolvedValue({ numpages: 3 });
});

describe('renderProposalPdf', () => {
  it('renders with header/footer page numbers and returns the real page count from the bytes', async () => {
    const res = await renderProposalPdf('<h1>Technical</h1>', { pageSize: 'Letter', minFontPt: 12, headerText: 'Technical Proposal', footerText: 'Saratoga Springs' });
    expect(res.pageCount).toBe(3);
    expect(Buffer.isBuffer(res.buffer)).toBe(true);
    const pdfArgs = pdfMock.mock.calls[0][0];
    expect(pdfArgs.format).toBe('Letter');
    expect(pdfArgs.displayHeaderFooter).toBe(true);
    expect(pdfArgs.footerTemplate).toContain('pageNumber');
    expect(closeMock).toHaveBeenCalled(); // always closed
  });

  it('enforces the minimum font in the printable wrapper', () => {
    expect(wrapPrintableHtml('<p>x</p>', 12)).toContain('font-size:12pt');
    expect(wrapPrintableHtml('<p>x</p>', 0)).toContain('font-size:11pt'); // floor fallback
  });

  it('throws a typed timeout error when the render hangs', async () => {
    pdfMock.mockReturnValue(new Promise(() => { /* never resolves */ }));
    await expect(renderProposalPdf('<p>x</p>', { timeoutMs: 50 })).rejects.toMatchObject({ name: 'PdfRenderError', reason: 'timeout' });
  });

  it('fails soft (render_failed) when the browser cannot launch', async () => {
    launchMock.mockRejectedValue(new Error('no chromium'));
    await expect(renderProposalPdf('<p>x</p>')).rejects.toBeInstanceOf(PdfRenderError);
    await expect(renderProposalPdf('<p>x</p>')).rejects.toMatchObject({ reason: 'render_failed' });
  });

  it('throws count_failed when the rendered PDF has no readable page count', async () => {
    pdfParseMock.mockResolvedValue({ numpages: 0 });
    await expect(renderProposalPdf('<p>x</p>')).rejects.toMatchObject({ reason: 'count_failed' });
    expect(closeMock).toHaveBeenCalled(); // still cleaned up
  });
});
