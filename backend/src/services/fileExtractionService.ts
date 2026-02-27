import { OfficeParser } from 'officeparser';

const MAX_EXTRACTED_LENGTH = 50_000;

/**
 * Extract text content from PDF or PowerPoint files using officeparser.
 * Returns plain text truncated to 50K chars.
 */
export async function extractText(filePath: string): Promise<string> {
  try {
    const ast = await OfficeParser.parseOffice(filePath);
    const text = ast.toText().trim();

    if (text.length > MAX_EXTRACTED_LENGTH) {
      return text.substring(0, MAX_EXTRACTED_LENGTH);
    }

    return text;
  } catch (err: any) {
    console.error('[FileExtraction] Failed to extract text:', err.message);
    throw new Error(`Text extraction failed: ${err.message}`);
  }
}
