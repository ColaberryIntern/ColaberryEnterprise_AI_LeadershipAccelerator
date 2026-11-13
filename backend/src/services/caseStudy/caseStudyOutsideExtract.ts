/**
 * caseStudyOutsideExtract - text out of an outside case-study document (PDF, DOCX, PPTX).
 *
 * PDF goes through pdf-parse@2's class API (the repo's PDF reader; see renderProposalPdf.ts). DOCX and PPTX go through
 * the EXISTING officeparser extractor in `fileExtractionService.ts` - the package spec allows Office formats only
 * because that extractor already exists. Anything else is refused by type before any parser runs.
 *
 * NEVER THROWS. A parse failure is an ordinary outcome for this pipeline (scanned PDFs, encrypted decks), and the
 * intake's contract is fail-soft: the draft is still created with the file attached and the reason recorded. So
 * every path returns an `ExtractOutcome` with a stable `errorClass`.
 *
 * Bounded: a 60 s timeout per document and a 60,000-character cap (truncation is reported, not silent).
 */
import { extractTextFromBufferDetailed } from '../fileExtractionService';

export const OUTSIDE_MIME_TO_EXT: Readonly<Record<string, '.pdf' | '.docx' | '.pptx'>> = Object.freeze({
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
});
export const OUTSIDE_EXTENSIONS: ReadonlyArray<string> = ['.pdf', '.docx', '.pptx'];
export const MAX_EXTRACT_CHARS = 60_000;
export const EXTRACT_TIMEOUT_MS = 60_000;

export type ExtractErrorClass = 'UnsupportedType' | 'ParseFailed' | 'ParseTimeout' | 'NoText';

export interface ExtractOutcome {
  ok: boolean;
  text: string;
  truncated: boolean;
  errorClass: ExtractErrorClass | null;
  /** Plain sentence for the admin when !ok. */
  error: string | null;
}

/** '.pdf' | '.docx' | '.pptx' from the file name first, then the MIME type; null when neither is supported. */
export function outsideExtension(fileName: string, mimeType?: string | null): '.pdf' | '.docx' | '.pptx' | null {
  const m = /\.[a-z0-9]+$/i.exec(fileName || '');
  const ext = m ? m[0].toLowerCase() : '';
  if (ext === '.pdf' || ext === '.docx' || ext === '.pptx') return ext;
  return (mimeType && OUTSIDE_MIME_TO_EXT[mimeType]) || null;
}

/** Seams for tests: the real parsers by default. */
export interface ExtractDeps {
  pdf: (bytes: Buffer) => Promise<string>;
  office: (bytes: Buffer, fileName: string) => Promise<string>;
  timeoutMs: number;
}

async function realPdfText(bytes: Buffer): Promise<string> {
  // pdf-parse@2 exports only the PDFParse class. A copy goes in because the parser may take ownership of the bytes.
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  try {
    const result = await parser.getText();
    return result?.text || '';
  } finally {
    await parser.destroy().catch((err: unknown) => {
      console.warn(JSON.stringify({ level: 'warn', service: 'backend', event: 'case_study_outside_pdf_destroy_failed',
        outcome: 'partial', error_class: 'ParserCleanupFailed', context: { message: String((err as Error)?.message ?? err).slice(0, 200) } }));
    });
  }
}

async function realOfficeText(bytes: Buffer, fileName: string): Promise<string> {
  return (await extractTextFromBufferDetailed(bytes, fileName, { maxLength: MAX_EXTRACT_CHARS + 1 })).text;
}

const DEFAULT_DEPS: ExtractDeps = { pdf: realPdfText, office: realOfficeText, timeoutMs: EXTRACT_TIMEOUT_MS };

class ExtractTimeout extends Error { constructor() { super('extraction timed out'); this.name = 'ExtractTimeout'; } }

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const t = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new ExtractTimeout()), ms); });
  return Promise.race([p, t]).finally(() => { if (timer) clearTimeout(timer); });
}

function fail(errorClass: ExtractErrorClass, error: string): ExtractOutcome {
  return { ok: false, text: '', truncated: false, errorClass, error };
}

/** Extract text from one document. Never throws. */
export async function extractOutsideText(
  bytes: Buffer, fileName: string, mimeType?: string | null, deps: Partial<ExtractDeps> = {},
): Promise<ExtractOutcome> {
  const d: ExtractDeps = { ...DEFAULT_DEPS, ...deps };
  const ext = outsideExtension(fileName, mimeType);
  if (!ext) return fail('UnsupportedType', 'Only PDF, DOCX and PPTX files can be imported as outside case studies.');
  let raw: string;
  try {
    raw = await withTimeout(ext === '.pdf' ? d.pdf(bytes) : d.office(bytes, `document${ext}`), d.timeoutMs);
  } catch (err) {
    const timedOut = err instanceof ExtractTimeout;
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'error', service: 'backend', event: 'case_study_outside_extract_failed',
      outcome: 'failure', error_class: timedOut ? 'ParseTimeout' : 'ParseFailed',
      context: { ext, message: String((err as Error)?.message ?? err).slice(0, 300) },
    }));
    return timedOut
      ? fail('ParseTimeout', `Reading the document took longer than ${Math.round(d.timeoutMs / 1000)} seconds.`)
      : fail('ParseFailed', 'The document could not be read (it may be corrupt or password-protected).');
  }
  const text = (raw || '').replace(/\r\n/g, '\n').trim();
  if (!text) {
    return fail('NoText', ext === '.pdf'
      ? 'No extractable text - this looks like a scanned or image-only PDF. Fill the details by hand.'
      : 'No extractable text in this document. Fill the details by hand.');
  }
  if (text.length > MAX_EXTRACT_CHARS) {
    return { ok: true, text: text.slice(0, MAX_EXTRACT_CHARS), truncated: true, errorClass: null, error: null };
  }
  return { ok: true, text, truncated: false, errorClass: null, error: null };
}
