import fs from 'fs/promises';
import path from 'path';
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
