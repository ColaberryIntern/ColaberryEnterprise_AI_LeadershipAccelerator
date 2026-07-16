import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { OfficeParser } from 'officeparser';

const MAX_EXTRACTED_LENGTH = 50_000;

const PLAIN_TEXT_EXTENSIONS = new Set(['.txt', '.md', '.csv']);

/**
 * Extract text content from uploaded files.
 * Plain text files (.txt, .md, .csv) are read directly.
 * Office/PDF files are parsed via officeparser (supports pdf, docx, pptx, xlsx, rtf, odt, odp, ods).
 * Returns plain text truncated to 50K chars.
 */
export async function extractText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

  try {
    let text: string;

    if (PLAIN_TEXT_EXTENSIONS.has(ext)) {
      text = (await fs.readFile(filePath, 'utf-8')).trim();
    } else {
      const ast = await OfficeParser.parseOffice(filePath);
      text = ast.toText().trim();
    }

    if (text.length > MAX_EXTRACTED_LENGTH) {
      return text.substring(0, MAX_EXTRACTED_LENGTH);
    }

    return text;
  } catch (err: any) {
    console.error('[FileExtraction] Failed to extract text:', err.message);
    throw new Error(`Text extraction failed: ${err.message}`);
  }
}

/**
 * Extract text from an in-memory file buffer (e.g. a base64 resume stored in the
 * DB). Writes to a temp file, reuses `extractText`, then cleans up. `fileName`
 * only supplies the extension so the parser picks the right decoder.
 */
export async function extractTextFromBuffer(buffer: Buffer, fileName: string): Promise<string> {
  const ext = path.extname(fileName || '').toLowerCase() || '.bin';
  const tmp = path.join(os.tmpdir(), `resume_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  try {
    await fs.writeFile(tmp, buffer);
    return await extractText(tmp);
  } finally {
    try { await fs.unlink(tmp); } catch { /* ignore */ }
  }
}
