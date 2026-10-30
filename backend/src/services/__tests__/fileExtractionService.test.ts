import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import {
  extractText,
  extractTextDetailed,
  extractTextFromBuffer,
  extractTextFromBufferDetailed,
  MAX_EXTRACTED_LENGTH,
} from '../fileExtractionService';

/**
 * Extraction used to cut at 50,000 characters and say nothing about it.
 *
 * That is survivable for a resume — the interesting part is at the top — and wrong for
 * knowledge ingestion, where the discarded half simply never answers a question and
 * retrieval reads as unhelpful rather than incomplete. So the cut is now reported.
 *
 * The back-compat pins matter as much as the new behaviour: three callers (strategy prep,
 * the resume backfill script, flotation intake) were written against the old signature,
 * and a change in what they receive is a defect in code this change never intended to
 * touch.
 *
 * Only the plain-text path is exercised with real files. The office/PDF path goes through
 * `officeparser`, and a test that drove it would be testing that library rather than this
 * module's decision — which is the part that was wrong.
 */

const tmpFiles: string[] = [];

/** A real .txt file of `n` characters, cleaned up after the suite. */
async function writeTextFile(contents: string, ext = '.txt'): Promise<string> {
  const file = path.join(os.tmpdir(), `fx_test_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  await fs.writeFile(file, contents, 'utf-8');
  tmpFiles.push(file);
  return file;
}

afterAll(async () => {
  for (const file of tmpFiles) {
    try {
      await fs.unlink(file);
    } catch {
      /* already gone */
    }
  }
});

describe('extractTextDetailed — it reports the cut', () => {
  it('reads a short file whole and says it was not truncated', async () => {
    const file = await writeTextFile('The cohort begins on 3 November.');

    const result = await extractTextDetailed(file);

    expect(result.text).toBe('The cohort begins on 3 November.');
    expect(result.truncated).toBe(false);
    expect(result.extractedChars).toBe(32);
  });

  it('cuts to the limit and REPORTS it, with the pre-cut length', async () => {
    const file = await writeTextFile('x'.repeat(500));

    const result = await extractTextDetailed(file, { maxLength: 100 });

    expect(result.text).toHaveLength(100);
    expect(result.truncated).toBe(true);
    // The whole point: the caller can say how much was dropped, which the old bare-string
    // signature made impossible.
    expect(result.extractedChars).toBe(500);
  });

  it('does not report a truncation when the text exactly fills the limit', async () => {
    // Off-by-one: `>` not `>=`, or a document of exactly the limit is reported as cut when
    // nothing was lost, and ingestion would warn about every document of that size.
    const file = await writeTextFile('y'.repeat(100));

    const result = await extractTextDetailed(file, { maxLength: 100 });

    expect(result.truncated).toBe(false);
    expect(result.text).toHaveLength(100);
  });

  it('trims surrounding whitespace before measuring', async () => {
    const file = await writeTextFile('   padded   ');

    const result = await extractTextDetailed(file);

    expect(result.text).toBe('padded');
    expect(result.extractedChars).toBe(6);
  });

  it('reads an empty file as empty rather than failing', async () => {
    // A scanned PDF with no text layer extracts to nothing. That is a real outcome the
    // ingest path has to distinguish from a parse failure, so it must not throw here.
    const file = await writeTextFile('');

    const result = await extractTextDetailed(file);

    expect(result.text).toBe('');
    expect(result.truncated).toBe(false);
    expect(result.extractedChars).toBe(0);
  });

  it('rejects with a wrapped message when the file cannot be read', async () => {
    await expect(
      extractTextDetailed(path.join(os.tmpdir(), 'fx_test_does_not_exist.txt')),
    ).rejects.toThrow(/Text extraction failed/);
  });

  it('treats a non-positive limit as one character rather than returning nothing', async () => {
    const file = await writeTextFile('abcdef');

    const result = await extractTextDetailed(file, { maxLength: 0 });

    expect(result.text).toHaveLength(1);
    expect(result.truncated).toBe(true);
  });
});

describe('the existing callers keep the behaviour they were written against', () => {
  it('extractText still returns a bare string', async () => {
    const file = await writeTextFile('A resume.');

    await expect(extractText(file)).resolves.toBe('A resume.');
  });

  it('extractText still cuts at 50,000 characters by default', async () => {
    const file = await writeTextFile('z'.repeat(MAX_EXTRACTED_LENGTH + 250));

    await expect(extractText(file)).resolves.toHaveLength(MAX_EXTRACTED_LENGTH);
  });

  it('the default limit is still 50,000, which three callers depend on', () => {
    expect(MAX_EXTRACTED_LENGTH).toBe(50_000);
  });

  it('extractTextFromBuffer still returns a bare string', async () => {
    const text = await extractTextFromBuffer(Buffer.from('From a buffer.', 'utf-8'), 'note.txt');

    expect(text).toBe('From a buffer.');
  });
});

describe('extractTextFromBufferDetailed', () => {
  it('honours the limit and reports the cut', async () => {
    const result = await extractTextFromBufferDetailed(
      Buffer.from('w'.repeat(400), 'utf-8'),
      'note.txt',
      { maxLength: 50 },
    );

    expect(result.text).toHaveLength(50);
    expect(result.truncated).toBe(true);
    expect(result.extractedChars).toBe(400);
  });

  it('leaves no temp file behind', async () => {
    const before = (await fs.readdir(os.tmpdir())).filter((f) => f.startsWith('extract_')).length;

    await extractTextFromBufferDetailed(Buffer.from('transient', 'utf-8'), 'note.txt');

    const after = (await fs.readdir(os.tmpdir())).filter((f) => f.startsWith('extract_')).length;
    // An uploaded document left in the system temp directory is a document sitting
    // somewhere nobody is looking after it.
    expect(after).toBe(before);
  });

  it('rejects bytes with no stated type rather than guessing at them', async () => {
    // An empty name falls back to `.bin`, which is not a plain-text extension, so the
    // parser is asked and refuses. Failing is the honest outcome: reading arbitrary bytes
    // as UTF-8 would hand ingestion a document of mojibake that chunks and stores fine.
    await expect(
      extractTextFromBufferDetailed(Buffer.from('no name', 'utf-8'), ''),
    ).rejects.toThrow(/Text extraction failed/);
  }, 20_000);

  it('cleans up the temp file even when extraction throws', async () => {
    // The cleanup is in `finally`. Without it, every rejected upload would leave the
    // document sitting in the system temp directory — the failure path is exactly where
    // a stray copy of someone's file is least likely to be noticed.
    const before = (await fs.readdir(os.tmpdir())).filter((f) => f.startsWith('extract_')).length;

    await expect(
      extractTextFromBufferDetailed(Buffer.from('unparseable', 'utf-8'), ''),
    ).rejects.toThrow();

    const after = (await fs.readdir(os.tmpdir())).filter((f) => f.startsWith('extract_')).length;
    expect(after).toBe(before);
  }, 20_000);
});
