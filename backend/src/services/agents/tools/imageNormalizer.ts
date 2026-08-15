/**
 * imageNormalizer — turn arbitrary uploaded bytes into something a vision model
 * will actually accept.
 *
 * Both functions here were proven in production by certificateService (which
 * now imports them from this module rather than owning them) and are lifted out
 * unchanged, because the failure they fix is not theoretical:
 *
 *  - OpenAI vision rejects some uploaded bytes outright — "You uploaded an
 *    unsupported image" — even when the browser labelled them image/png,
 *    because screenshot tools and phone cameras write non-standard encodings.
 *    Re-encoding through sharp produces a guaranteed-valid PNG. The re-encode
 *    also honours EXIF rotation and drops EXIF metadata (including GPS) on the
 *    way out, which is exactly what we want before shipping a student's
 *    screenshot to a third-party model.
 *
 *  - A PDF's content is usually a visual template with almost no text layer, so
 *    text extraction sees nothing. Rasterizing page 1 and treating it as an
 *    image is what made PDF handling work at all.
 */
import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import sharp from 'sharp';

/** Longest edge handed to a vision model. Caps payload and token cost. */
export const MAX_VISION_EDGE = 1600;

/**
 * Re-encode arbitrary image bytes into a valid, size-capped PNG data URL.
 * Throws if the bytes are not a decodable image — callers treat that as
 * "unreadable" and tell the student, rather than failing the whole turn.
 */
export async function normalizeImageForVision(
  buf: Buffer,
  maxEdge: number = MAX_VISION_EDGE,
): Promise<{ mime: string; dataUrl: string }> {
  const out = await sharp(buf)
    .rotate()
    .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();
  return { mime: 'image/png', dataUrl: `data:image/png;base64,${out.toString('base64')}` };
}

/**
 * Rasterize page 1 of a PDF to PNG bytes via poppler's `pdftoppm` (installed in
 * the backend Docker image). Returns null when pdftoppm is missing or the PDF
 * cannot be rendered — the caller decides what to do with that, so a missing
 * binary degrades rather than throws.
 */
export async function rasterizePdfFirstPage(buf: Buffer): Promise<Buffer | null> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-attach-'));
  const inPath = path.join(tmpDir, 'in.pdf');
  const outPrefix = path.join(tmpDir, 'page');
  try {
    await fs.writeFile(inPath, buf);
    await new Promise<void>((resolve, reject) => {
      const proc = spawn('pdftoppm', ['-png', '-r', '150', '-f', '1', '-l', '1', '-singlefile', inPath, outPrefix]);
      let stderr = '';
      proc.stderr.on('data', (d) => { stderr += d; });
      proc.on('error', reject);
      proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`pdftoppm exited ${code}: ${stderr}`))));
    });
    return await fs.readFile(`${outPrefix}.png`);
  } catch {
    return null;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
