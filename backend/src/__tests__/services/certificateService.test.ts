/**
 * certificateService PDF-path tests.
 *
 * Two PDF regressions covered here:
 *
 * 1. pdf-parse v1-vs-v2 API mismatch (the original bug): the code called
 *    pdf-parse with its v1 function API (`pdf(buffer)`), but the installed
 *    pdf-parse@2 only exports a class (`PDFParse`). The mismatched call
 *    threw, was swallowed, and produced an empty-text "Could not read that
 *    PDF" verdict for every PDF regardless of content. Fixed by calling the
 *    real v2 API (`new PDFParse({ data }).getText()`).
 *
 * 2. Text-extraction-only PDFs can never see a visual certificate (the
 *    deeper bug found live in prod, 2026-08-04): real Anthropic/SkillsJar
 *    certificates render their body as an image template — pdf-parse on a
 *    genuine cert extracts only the recipient's name (e.g.
 *    "Jane Doe\n\n-- 1 of 1 --"), never the course name or "Certificate of
 *    Completion" wording the classifier needs. Confirmed 0 of 5 real student
 *    PDF uploads ever passed. Fixed by rasterizing page 1 via poppler's
 *    `pdftoppm` and verifying it through the same vision path already used
 *    for images, keeping text extraction only as a fallback for when
 *    rasterization itself is unavailable/fails.
 */
const mockChatCreate = jest.fn();
const mockGetText = jest.fn();
const mockDestroy = jest.fn().mockResolvedValue(undefined);
const mockPDFParseCtor = jest.fn();
const mockSpawn = jest.fn();

jest.mock('child_process', () => ({ spawn: (...args: any[]) => mockSpawn(...args) }));

jest.mock('../../config/database', () => ({
  sequelize: { authenticate: jest.fn(), close: jest.fn(), query: jest.fn(), define: jest.fn() },
  connectDatabase: jest.fn(),
}));

jest.mock('../../models/TimelineCard', () => ({ __esModule: true, default: { findByPk: jest.fn() } }));
jest.mock('../../models/TimelineCardProgress', () => ({ __esModule: true, default: { findOrCreate: jest.fn() } }));
jest.mock('../../config/upload', () => ({ CERT_DIR: '/tmp/certs' }));
jest.mock('../../assets/colaberryLogo', () => ({ COLABERRY_LOGO_PNG_BASE64: '' }));

jest.mock('../../services/openaiInstrumented', () => ({
  getInstrumentedOpenAI: jest.fn(() => ({
    chat: { completions: { create: mockChatCreate } },
  })),
}));

// pdf-parse@2 ships ONLY a `PDFParse` class (no v1 `pdf(buffer)` function, no
// default export) — mocking it this way means a regression back to the old
// `mod.pdf || mod.default || mod` call style fails immediately, the same way
// it silently failed in prod.
jest.mock('pdf-parse', () => ({
  PDFParse: jest.fn().mockImplementation((opts: any) => {
    mockPDFParseCtor(opts);
    return { getText: mockGetText, destroy: mockDestroy };
  }),
}));

import { EventEmitter } from 'events';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { verifyCertificate } from '../../services/runtime/certificateService';

function fakeProc(): any {
  const proc = new EventEmitter() as any;
  proc.stderr = new EventEmitter();
  return proc;
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default: simulate pdftoppm missing (ENOENT), so every test not
  // explicitly exercising rasterization falls straight through to the
  // already-covered text-extraction path, matching pre-rasterization
  // behavior exactly.
  mockSpawn.mockImplementation(() => {
    const proc = fakeProc();
    process.nextTick(() => proc.emit('error', Object.assign(new Error('spawn pdftoppm ENOENT'), { code: 'ENOENT' })));
    return proc;
  });
});

async function writeTempPdf(): Promise<string> {
  const p = path.join(os.tmpdir(), `cert-test-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
  await fs.writeFile(p, Buffer.from('%PDF-1.1\n%%EOF\n')); // bytes are irrelevant — pdf-parse itself is mocked
  return p;
}

describe('verifyCertificate — image path', () => {
  // Regression: prod ai_events showed OpenAI vision rejecting some uploaded
  // bytes outright ("You uploaded an unsupported image") even though the
  // browser labeled them image/png — a raw non-standard encoding. Verify the
  // image is re-encoded through sharp into a real PNG data URL before it
  // ever reaches the classifier, and a BMP mislabeled as PNG still classifies.
  it('normalizes a non-standard image encoding into a valid PNG data URL before classifying', async () => {
    mockChatCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ is_certificate: true, matches_course: true, reason: 'Looks legit.' }) } }],
    });

    // A tiny TIFF (a format the OpenAI vision endpoint does NOT accept) saved
    // with a .png extension/mimetype — mirrors what prod actually received.
    const tiffBuf = await sharp({ create: { width: 20, height: 20, channels: 3, background: { r: 10, g: 20, b: 30 } } }).tiff().toBuffer();
    const imgPath = path.join(os.tmpdir(), `cert-test-tiff-${Date.now()}.png`);
    await fs.writeFile(imgPath, tiffBuf);

    try {
      const result = await verifyCertificate(imgPath, 'image/png', 'Claude with the Anthropic API');

      expect(result.valid).toBe(true);
      expect(mockChatCreate).toHaveBeenCalledTimes(1);
      const content = mockChatCreate.mock.calls[0][0].messages[1].content;
      const imagePart = content.find((c: any) => c.type === 'image_url');
      expect(imagePart.image_url.url).toMatch(/^data:image\/png;base64,/);
    } finally {
      await fs.unlink(imgPath).catch(() => {});
    }
  });
});

describe('verifyCertificate — PDF path', () => {
  it('calls the pdf-parse v2 class API (new PDFParse({ data }).getText()) and reaches the AI classifier (happy path)', async () => {
    mockGetText.mockResolvedValue({ text: 'Certificate of Completion', pages: 1, total: 1 });
    mockChatCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ is_certificate: true, matches_course: true, reason: 'Looks legit.' }) } }],
    });

    const pdfPath = await writeTempPdf();
    try {
      const result = await verifyCertificate(pdfPath, 'application/pdf', 'Claude with the Anthropic API');

      // Proves the fix: PDFParse was constructed with { data: <buffer> } (the
      // real v2 API), not called as a v1 function.
      expect(mockPDFParseCtor).toHaveBeenCalledWith(expect.objectContaining({ data: expect.any(Buffer) }));
      expect(mockGetText).toHaveBeenCalledTimes(1);
      expect(mockDestroy).toHaveBeenCalledTimes(1); // no leaked PDFParse instances

      expect(result.valid).toBe(true);
      expect(result.is_certificate).toBe(true);
      expect(mockChatCreate).toHaveBeenCalledTimes(1);
      const userMsg = mockChatCreate.mock.calls[0][0].messages[1].content as string;
      expect(userMsg).toContain('Certificate of Completion');
    } finally {
      await fs.unlink(pdfPath).catch(() => {});
    }
  });

  it('declines with a legible reason when extraction yields no text, without ever calling the classifier', async () => {
    mockGetText.mockResolvedValue({ text: '', pages: 1, total: 1 });
    const pdfPath = await writeTempPdf();
    try {
      const result = await verifyCertificate(pdfPath, 'application/pdf', 'Claude with the Anthropic API');

      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/could not read that pdf/i);
      expect(mockChatCreate).not.toHaveBeenCalled();
    } finally {
      await fs.unlink(pdfPath).catch(() => {});
    }
  });

  it('declines gracefully (does not throw) when pdf-parse itself throws', async () => {
    mockGetText.mockRejectedValue(new Error('corrupt PDF'));
    const pdfPath = await writeTempPdf();
    try {
      const result = await verifyCertificate(pdfPath, 'application/pdf', 'Claude with the Anthropic API');

      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/could not read that pdf/i);
      expect(mockChatCreate).not.toHaveBeenCalled();
    } finally {
      await fs.unlink(pdfPath).catch(() => {});
    }
  });
});

describe('verifyCertificate — PDF rasterization path (the real-world bug: visual, not text, certificates)', () => {
  it('rasterizes page 1 via pdftoppm and verifies through vision, never touching pdf-parse', async () => {
    mockChatCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ is_certificate: true, matches_course: true, reason: 'Looks legit.' }) } }],
    });
    // Simulate a successful pdftoppm run: write a real PNG to the exact
    // output path the implementation will read back, so the rest of the
    // pipeline (fs.readFile + sharp normalize) runs for real, unmocked.
    mockSpawn.mockImplementation((_cmd: string, args: string[]) => {
      const proc = fakeProc();
      const outPrefix = args[args.length - 1];
      (async () => {
        const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 1, g: 2, b: 3 } } }).png().toBuffer();
        await fs.writeFile(`${outPrefix}.png`, png);
        proc.emit('close', 0);
      })();
      return proc;
    });

    const pdfPath = await writeTempPdf();
    try {
      const result = await verifyCertificate(pdfPath, 'application/pdf', 'Claude with the Anthropic API');

      expect(mockSpawn).toHaveBeenCalledWith('pdftoppm', expect.arrayContaining(['-png', '-singlefile']));
      expect(mockPDFParseCtor).not.toHaveBeenCalled(); // rasterization succeeded — text fallback never runs
      expect(result.valid).toBe(true);
      expect(mockChatCreate).toHaveBeenCalledTimes(1);
      const content = mockChatCreate.mock.calls[0][0].messages[1].content;
      const imagePart = content.find((c: any) => c.type === 'image_url');
      expect(imagePart.image_url.url).toMatch(/^data:image\/png;base64,/);
    } finally {
      await fs.unlink(pdfPath).catch(() => {});
    }
  });

  it('falls back to text extraction when pdftoppm exits non-zero (e.g. an unreadable PDF)', async () => {
    mockSpawn.mockImplementation(() => {
      const proc = fakeProc();
      process.nextTick(() => { proc.stderr.emit('data', 'Syntax Error'); proc.emit('close', 1); });
      return proc;
    });
    mockGetText.mockResolvedValue({ text: 'Certificate of Completion', pages: 1, total: 1 });
    mockChatCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ is_certificate: true, matches_course: true, reason: 'Looks legit.' }) } }],
    });

    const pdfPath = await writeTempPdf();
    try {
      const result = await verifyCertificate(pdfPath, 'application/pdf', 'Claude with the Anthropic API');

      expect(mockPDFParseCtor).toHaveBeenCalled(); // fell back to the text path
      expect(result.valid).toBe(true);
    } finally {
      await fs.unlink(pdfPath).catch(() => {});
    }
  });
});
