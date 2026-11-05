/**
 * renderProposalPdf — the SHARED Playwright PDF renderer for the Proposal Studio. It ships in P3 (the `format` check
 * needs a REAL page count) and P6 reuses it for the export package. It renders a document's HTML to a PDF at the
 * blueprint's page size and minimum font, with a running header + footer carrying page numbers, and returns the
 * buffer plus the page count MEASURED from the rendered bytes (never computed — the same ffprobe-not-arithmetic
 * discipline the video build uses).
 *
 * Hardened: a STRICT timeout on launch + render (no infinite hang), NO credentials, the browser always closed in a
 * finally. Fail-soft: any failure throws a typed `PdfRenderError`, never an unhandled rejection — the check runner
 * turns that into a failed `format` check, and the route turns it into a clean 5xx. Playwright and pdf-parse are
 * imported lazily so this module (and its callers' type-checking) never pays for them until a render actually runs.
 */

export type ProposalPageSize = 'Letter' | 'A4';

export interface RenderPdfOptions {
  pageSize?: ProposalPageSize;
  /** Minimum body font in points, enforced as a floor on the rendered document. */
  minFontPt?: number;
  /** A short running header (left) — e.g. the document title. Plain text; it is HTML-escaped. */
  headerText?: string;
  /** A short running footer (left) — e.g. the project/agency. Plain text; it is HTML-escaped. Page numbers are
   *  always added on the right. */
  footerText?: string;
  /** Hard cap on the whole render. Default 20s. */
  timeoutMs?: number;
}

export interface RenderPdfResult {
  buffer: Buffer;
  /** Real page count, read from the rendered PDF bytes. */
  pageCount: number;
}

export class PdfRenderError extends Error {
  constructor(message: string, readonly reason: 'timeout' | 'render_failed' | 'count_failed') { super(message); this.name = 'PdfRenderError'; }
}

const DEFAULT_TIMEOUT_MS = 20_000;

function escapeHtml(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Wrap the document body in a minimal HTML shell that enforces the minimum font and a clean print base. */
export function wrapPrintableHtml(bodyHtml: string, minFontPt: number): string {
  const floor = Number.isFinite(minFontPt) && minFontPt > 0 ? minFontPt : 11;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0}
    body{font-family:'Times New Roman',Georgia,serif;font-size:${floor}pt;line-height:1.4;color:#111}
    *{font-size:inherit}
    h1,h2,h3{font-weight:700;margin:0.6em 0 0.3em}
    table{border-collapse:collapse;width:100%} td,th{border:1px solid #999;padding:4px 6px}
    img{max-width:100%}
  </style></head><body>${bodyHtml ?? ''}</body></html>`;
}

/** A promise that rejects with a PdfRenderError('timeout') after `ms`. */
function timeoutAfter(ms: number): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new PdfRenderError(`PDF render exceeded ${ms}ms.`, 'timeout')), ms));
}

/** Count the pages in a PDF buffer by reading the rendered bytes (pdf-parse), never by arithmetic. */
async function countPdfPages(buffer: Buffer): Promise<number> {
  try {
    const pdfParse = (await import('pdf-parse')).default as unknown as (b: Buffer) => Promise<{ numpages: number }>;
    const parsed = await pdfParse(buffer);
    const n = Number(parsed?.numpages);
    if (!Number.isFinite(n) || n < 1) throw new Error('no page count');
    return n;
  } catch (err: any) {
    throw new PdfRenderError(`Could not read the rendered PDF page count: ${err?.message ?? err}`, 'count_failed');
  }
}

async function doRender(bodyHtml: string, opts: RenderPdfOptions): Promise<RenderPdfResult> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage();
    await page.setContent(wrapPrintableHtml(bodyHtml, opts.minFontPt ?? 11), { waitUntil: 'load' });
    const header = `<div style="font-size:8px;width:100%;padding:0 12mm;color:#666">${escapeHtml(opts.headerText ?? '')}</div>`;
    const footer = `<div style="font-size:8px;width:100%;padding:0 12mm;color:#666;display:flex;justify-content:space-between">`
      + `<span>${escapeHtml(opts.footerText ?? '')}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;
    const buffer = await page.pdf({
      format: opts.pageSize ?? 'Letter',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: header,
      footerTemplate: footer,
      margin: { top: '20mm', bottom: '20mm', left: '18mm', right: '18mm' },
    });
    const pageCount = await countPdfPages(buffer as Buffer);
    return { buffer: buffer as Buffer, pageCount };
  } finally {
    await browser.close().catch(() => { /* best-effort cleanup */ });
  }
}

/**
 * Render document HTML to a PDF, returning the bytes and the real page count. Throws PdfRenderError on timeout or
 * failure; callers (the format check, the export packager) catch it and degrade rather than crash.
 */
export async function renderProposalPdf(bodyHtml: string, opts: RenderPdfOptions = {}): Promise<RenderPdfResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  try {
    return await Promise.race([doRender(bodyHtml, opts), timeoutAfter(timeoutMs)]);
  } catch (err: any) {
    if (err instanceof PdfRenderError) throw err;
    throw new PdfRenderError(`PDF render failed: ${err?.message ?? err}`, 'render_failed');
  }
}
