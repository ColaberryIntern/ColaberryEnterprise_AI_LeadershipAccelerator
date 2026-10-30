import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { OfficeParser } from 'officeparser';

/**
 * The historical cap, kept as the default so every existing caller behaves exactly as it
 * did. Resume parsing wants a bounded blob; knowledge ingestion wants the whole document
 * and passes its own limit.
 */
export const MAX_EXTRACTED_LENGTH = 50_000;

const PLAIN_TEXT_EXTENSIONS = new Set(['.txt', '.md', '.csv']);

export interface ExtractOptions {
  /** Characters to keep. Defaults to {@link MAX_EXTRACTED_LENGTH}. */
  maxLength?: number;
}

export interface ExtractResult {
  /** The extracted text, trimmed, and cut to `maxLength` when it ran over. */
  text: string;
  /**
   * True when the document was longer than `maxLength` and the rest was discarded.
   *
   * SURFACED RATHER THAN SWALLOWED. The cut used to be silent, which is survivable for a
   * resume — the interesting part is at the top — and wrong for a knowledge base, where
   * the discarded half simply never answers a question and retrieval looks merely
   * unhelpful rather than incomplete.
   */
  truncated: boolean;
  /** Length before any cut, so a caller can say how much was dropped. */
  extractedChars: number;
}

/**
 * Extract text content from a file on disk, reporting whether it had to be cut.
 *
 * Plain text files (.txt, .md, .csv) are read directly. Office/PDF files are parsed via
 * officeparser (pdf, docx, pptx, xlsx, rtf, odt, odp, ods).
 */
export async function extractTextDetailed(
  filePath: string,
  options: ExtractOptions = {},
): Promise<ExtractResult> {
  const maxLength = Math.max(1, options.maxLength ?? MAX_EXTRACTED_LENGTH);
  const ext = path.extname(filePath).toLowerCase();

  try {
    let text: string;

    if (PLAIN_TEXT_EXTENSIONS.has(ext)) {
      text = (await fs.readFile(filePath, 'utf-8')).trim();
    } else {
      const ast = await OfficeParser.parseOffice(filePath);
      text = ast.toText().trim();
    }

    const extractedChars = text.length;
    if (extractedChars > maxLength) {
      return { text: text.substring(0, maxLength), truncated: true, extractedChars };
    }

    return { text, truncated: false, extractedChars };
  } catch (err: any) {
    console.error('[FileExtraction] Failed to extract text:', err.message);
    throw new Error(`Text extraction failed: ${err.message}`);
  }
}

/**
 * Extract text content from uploaded files, truncated to 50K chars.
 *
 * The original signature, unchanged, so resume and intake callers keep the behaviour they
 * were written against. New callers that care whether the document was cut should use
 * {@link extractTextDetailed}.
 */
export async function extractText(filePath: string): Promise<string> {
  return (await extractTextDetailed(filePath)).text;
}

/**
 * Extract text from an in-memory file buffer (e.g. a base64 resume stored in the
 * DB). Writes to a temp file, reuses `extractText`, then cleans up. `fileName`
 * only supplies the extension so the parser picks the right decoder.
 */
export async function extractTextFromBuffer(buffer: Buffer, fileName: string): Promise<string> {
  return (await extractTextFromBufferDetailed(buffer, fileName)).text;
}

/**
 * {@link extractTextFromBuffer}, reporting whether the document had to be cut.
 *
 * The temp file is removed in `finally` whether or not the parse threw, so a failed
 * extraction cannot leave an uploaded document sitting in the system temp directory.
 */
export async function extractTextFromBufferDetailed(
  buffer: Buffer,
  fileName: string,
  options: ExtractOptions = {},
): Promise<ExtractResult> {
  const ext = path.extname(fileName || '').toLowerCase() || '.bin';
  const tmp = path.join(os.tmpdir(), `extract_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  try {
    await fs.writeFile(tmp, buffer);
    return await extractTextDetailed(tmp, options);
  } finally {
    try { await fs.unlink(tmp); } catch { /* ignore */ }
  }
}
