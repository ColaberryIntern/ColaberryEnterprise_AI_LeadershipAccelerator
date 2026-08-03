/**
 * certificateService PDF-path tests.
 *
 * Regression coverage for a bug where every PDF certificate upload was
 * silently declined: the code called pdf-parse with its v1 function API
 * (`pdf(buffer)`), but the installed pdf-parse@2 only exports a class
 * (`PDFParse`). The mismatched call threw, was swallowed, and produced an
 * empty-text "Could not read that PDF" verdict for every PDF, regardless of
 * content — the AI classifier was never reached. Fixed by calling the real
 * v2 API (`new PDFParse({ data }).getText()`).
 */
const mockChatCreate = jest.fn();
const mockGetText = jest.fn();
const mockDestroy = jest.fn().mockResolvedValue(undefined);
const mockPDFParseCtor = jest.fn();

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

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { verifyCertificate } from '../../services/runtime/certificateService';

beforeEach(() => jest.clearAllMocks());

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
