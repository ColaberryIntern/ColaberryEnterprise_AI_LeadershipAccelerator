/**
 * certificateService — verify an uploaded Anthropic Skills Course completion
 * certificate is REAL (not a random screenshot) before it counts as completion.
 *
 * Images are checked with OpenAI vision; PDFs have their text extracted
 * (pdf-parse) and checked. The check is lenient on the exact course match (so a
 * genuine cert isn't rejected on a wording mismatch) but strict on "is this
 * actually a completion certificate at all."
 */
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import TimelineCard from '../../models/TimelineCard';
import TimelineCardProgress from '../../models/TimelineCardProgress';
import { getInstrumentedOpenAI } from '../openaiInstrumented';
import { CERT_DIR } from '../../config/upload';
import { COLABERRY_LOGO_PNG_BASE64 } from '../../assets/colaberryLogo';

const VERIFY_MODEL = 'gpt-4o-mini'; // supports vision + cheap
const IMAGE_MIME_BY_EXT: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

export interface CertVerifyResult { valid: boolean; is_certificate: boolean; matches: boolean; reason: string }

const SYSTEM = 'You verify whether an uploaded file is a genuine course/exam COMPLETION or ACHIEVEMENT certificate issued to a person. Be strict about it actually being a certificate; do not accept random screenshots, photos, invoices, or unrelated documents. Return STRICT json.';

function userText(className?: string | null): string {
  return `Is this a real completion/achievement CERTIFICATE (issued to a person for finishing a course or exam)?` +
    `${className ? ` The expected course is "${className}" (an Anthropic / SkillsJar course).` : ''}\n` +
    `Return json { "is_certificate": boolean, "matches_course": boolean (does it plausibly reference the expected course or Anthropic/SkillsJar — if no course was specified, set true), "recipient": string (name on it, or ""), "reason": string (one short sentence for the student explaining the decision) }.`;
}

async function classify(messages: any[]): Promise<CertVerifyResult> {
  const client = getInstrumentedOpenAI({ workflow_id: 'skillsjar_cert_verify' });
  const res = await client.chat.completions.create({
    model: VERIFY_MODEL, temperature: 0, max_tokens: 400, response_format: { type: 'json_object' }, messages,
  });
  let p: any = {};
  try { p = JSON.parse(res.choices?.[0]?.message?.content || '{}'); } catch { p = {}; }
  const is_certificate = p.is_certificate === true;
  const matches = p.matches_course !== false; // default lenient
  const reason = typeof p.reason === 'string' && p.reason.trim()
    ? p.reason.trim()
    : (is_certificate ? 'Certificate verified.' : 'This does not look like a completion certificate.');
  return { valid: is_certificate && matches, is_certificate, matches, reason };
}

/** Verify a certificate file (image via vision, PDF via extracted text). */
export async function verifyCertificate(filePath: string, mime: string, className?: string | null): Promise<CertVerifyResult> {
  const ext = path.extname(filePath).toLowerCase();
  const isImage = mime.startsWith('image/') || ext in IMAGE_MIME_BY_EXT;
  try {
    if (isImage) {
      const buf = await fs.readFile(filePath);
      const imgMime = mime.startsWith('image/') ? mime : (IMAGE_MIME_BY_EXT[ext] || 'image/png');
      const dataUrl = `data:${imgMime};base64,${buf.toString('base64')}`;
      return await classify([
        { role: 'system', content: SYSTEM },
        { role: 'user', content: [{ type: 'text', text: userText(className) }, { type: 'image_url', image_url: { url: dataUrl } }] },
      ]);
    }
    // PDF → extract text (pdf-parse v1/v2 tolerant), then verify by text.
    const buf = await fs.readFile(filePath);
    let text = '';
    try {
      const mod: any = await import('pdf-parse');
      const pdf = mod.pdf || mod.default || mod;
      const parsed = await pdf(buf);
      text = (parsed?.text || '').slice(0, 6000);
    } catch { text = ''; }
    if (!text.trim()) {
      return { valid: false, is_certificate: false, matches: false, reason: 'Could not read that PDF — please upload a clear image (PNG/JPG) of your certificate.' };
    }
    return await classify([
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `${userText(className)}\n\n--- Extracted certificate text ---\n${text}` },
    ]);
  } catch {
    return { valid: false, is_certificate: false, matches: false, reason: 'Could not verify the file — please try another export of your certificate.' };
  }
}

/* ------------------------------------------------------------------ */
/*  Progress-screenshot verification (for a course split across weeks)  */
/*  When a card's completion mode is 'progress' (e.g. the first part of  */
/*  a multi-week course, before the whole-course certificate exists) the */
/*  student uploads a Skilljar PROGRESS screenshot instead. Lighter check.*/
/* ------------------------------------------------------------------ */

const PROGRESS_SYSTEM = 'You verify whether an uploaded image is a genuine screenshot of an online-course PROGRESS or COMPLETION view — e.g. a course page showing "X of N lessons completed", a curriculum list with completed/checkmarked lessons, or a progress bar. Be reasonably lenient for a real course-progress screenshot; reject unrelated photos, invoices, memes, or blank images. Return STRICT json.';

function progressUserText(className?: string | null): string {
  return `Is this a screenshot showing progress or completion in an online course${className ? ` (expected: "${className}" on Anthropic / SkillsJar)` : ''}? ` +
    `Return json { "is_progress": boolean, "reason": string (one short sentence for the student explaining the decision) }.`;
}

async function classifyProgress(messages: any[]): Promise<{ valid: boolean; reason: string }> {
  const client = getInstrumentedOpenAI({ workflow_id: 'skillsjar_progress_verify' });
  const res = await client.chat.completions.create({
    model: VERIFY_MODEL, temperature: 0, max_tokens: 300, response_format: { type: 'json_object' }, messages,
  });
  let p: any = {};
  try { p = JSON.parse(res.choices?.[0]?.message?.content || '{}'); } catch { p = {}; }
  const valid = p.is_progress === true;
  const reason = typeof p.reason === 'string' && p.reason.trim()
    ? p.reason.trim()
    : (valid ? 'Progress verified.' : 'That does not look like a course-progress screenshot.');
  return { valid, reason };
}

/** Verify a course-progress screenshot (image via vision, PDF via extracted text). */
export async function verifyProgress(filePath: string, mime: string, className?: string | null): Promise<{ valid: boolean; reason: string }> {
  const ext = path.extname(filePath).toLowerCase();
  const isImage = mime.startsWith('image/') || ext in IMAGE_MIME_BY_EXT;
  try {
    if (isImage) {
      const buf = await fs.readFile(filePath);
      const imgMime = mime.startsWith('image/') ? mime : (IMAGE_MIME_BY_EXT[ext] || 'image/png');
      const dataUrl = `data:${imgMime};base64,${buf.toString('base64')}`;
      return await classifyProgress([
        { role: 'system', content: PROGRESS_SYSTEM },
        { role: 'user', content: [{ type: 'text', text: progressUserText(className) }, { type: 'image_url', image_url: { url: dataUrl } }] },
      ]);
    }
    const buf = await fs.readFile(filePath);
    let text = '';
    try {
      const mod: any = await import('pdf-parse');
      const pdf = mod.pdf || mod.default || mod;
      const parsed = await pdf(buf);
      text = (parsed?.text || '').slice(0, 6000);
    } catch { text = ''; }
    if (!text.trim()) {
      return { valid: false, reason: 'Could not read that file — please upload a clear screenshot (PNG/JPG) of your course progress.' };
    }
    return await classifyProgress([
      { role: 'system', content: PROGRESS_SYSTEM },
      { role: 'user', content: `${progressUserText(className)}\n\n--- Extracted text ---\n${text}` },
    ]);
  } catch {
    return { valid: false, reason: 'Could not verify the file — please try another screenshot of your progress.' };
  }
}

/**
 * Verify an uploaded certificate for a Skills Course card and record it as
 * evidence on the student's progress row. Returns the verdict; the client
 * completes the card on `valid`.
 *
 * When the card's course.completion mode is 'progress' (a split course's interim
 * part), verifies a PROGRESS screenshot instead of a whole-course certificate
 * (no co-branding — a progress screenshot is not a shareable certificate).
 */
export async function uploadCertificate(enrollmentId: string, cardId: string, file: { path: string; filename: string; mimetype: string }): Promise<CertVerifyResult & { branded: boolean }> {
  const card = await TimelineCard.findByPk(cardId);
  if (!card) throw Object.assign(new Error('Card not found'), { status: 404 });
  const meta = card.metadata && typeof card.metadata === 'object' ? card.metadata : {};
  const course = meta.course && typeof meta.course === 'object' ? meta.course : null;
  const className = course ? (course.name || null) : null;

  // Progress mode: verify an interim progress screenshot, record it, no cert branding.
  if (course && course.completion === 'progress') {
    const pr = await verifyProgress(file.path, file.mimetype, className);
    try {
      const [prog] = await TimelineCardProgress.findOrCreate({
        where: { card_id: cardId, enrollment_id: enrollmentId },
        defaults: { card_id: cardId, enrollment_id: enrollmentId, status: 'in_progress' } as any,
      });
      const evidence = prog.evidence && typeof prog.evidence === 'object' ? prog.evidence : {};
      await prog.update({ evidence: { ...evidence, progress: { file: file.filename, mime: file.mimetype, verified: pr.valid, reason: pr.reason, at: new Date().toISOString() } } });
    } catch { /* evidence is a convenience; the verdict already stands */ }
    return { valid: pr.valid, is_certificate: false, matches: pr.valid, reason: pr.reason, branded: false };
  }

  const result = await verifyCertificate(file.path, file.mimetype, className);

  // On a valid cert, co-brand it with the Colaberry logo (images only).
  let brandedFile: string | null = null;
  if (result.valid) brandedFile = await brandCertificate(file.path, file.mimetype);

  // Record on the progress row (best-effort — never fail the verdict on a write).
  try {
    const [prog] = await TimelineCardProgress.findOrCreate({
      where: { card_id: cardId, enrollment_id: enrollmentId },
      defaults: { card_id: cardId, enrollment_id: enrollmentId, status: 'in_progress' } as any,
    });
    const evidence = prog.evidence && typeof prog.evidence === 'object' ? prog.evidence : {};
    await prog.update({ evidence: { ...evidence, certificate: { file: file.filename, branded: brandedFile, mime: file.mimetype, verified: result.valid, reason: result.reason, at: new Date().toISOString() } } });
  } catch { /* evidence is a convenience; the verdict already stands */ }

  return { ...result, branded: !!brandedFile };
}

/**
 * Composite the Colaberry logo onto a verified certificate image (a co-branded
 * copy the student can download + share). Images only; returns the co-branded
 * filename (in CERT_DIR) or null if it can't be produced (e.g. a PDF).
 */
export async function brandCertificate(certPath: string, mime: string): Promise<string | null> {
  if (!mime.startsWith('image/')) return null;
  try {
    const base = sharp(certPath).rotate(); // honour EXIF orientation
    const m = await base.metadata();
    const W = m.width || 1200, H = m.height || 850;
    const logoW = Math.round(Math.min(W * 0.24, 340));
    const logo = await sharp(Buffer.from(COLABERRY_LOGO_PNG_BASE64, 'base64')).resize({ width: logoW }).png().toBuffer();
    const logoH = (await sharp(logo).metadata()).height || Math.round(logoW * 0.28);
    const pad = Math.round(logoW * 0.14);
    const pillW = logoW + pad * 2, pillH = logoH + pad * 2;
    const margin = Math.round(Math.min(W, H) * 0.035);
    const x = Math.max(0, W - pillW - margin), y = Math.max(0, H - pillH - margin);
    const pill = Buffer.from(`<svg width="${pillW}" height="${pillH}"><rect width="${pillW}" height="${pillH}" rx="${Math.round(pillH * 0.28)}" fill="#ffffff" opacity="0.94"/></svg>`);
    const out = await base
      .composite([{ input: pill, left: x, top: y }, { input: logo, left: x + pad, top: y + pad }])
      .png()
      .toBuffer();
    const branded = `${path.basename(certPath, path.extname(certPath))}-branded.png`;
    await fs.writeFile(path.join(CERT_DIR, branded), out);
    return branded;
  } catch {
    return null; // branding is a bonus — never block completion on it
  }
}

/** The co-branded (or original) certificate file for a student's card, or null. */
export async function getCertificateFile(enrollmentId: string, cardId: string): Promise<{ path: string; mime: string; download: string } | null> {
  const prog = await TimelineCardProgress.findOne({ where: { card_id: cardId, enrollment_id: enrollmentId } });
  const cert = prog?.evidence && typeof prog.evidence === 'object' ? (prog.evidence as any).certificate : null;
  if (!cert || (!cert.branded && !cert.file)) return null;
  const name = cert.branded || cert.file;
  const p = path.join(CERT_DIR, path.basename(name)); // basename guards against traversal
  try { await fs.access(p); } catch { return null; }
  const mime = cert.branded ? 'image/png' : (cert.mime || 'application/octet-stream');
  return { path: p, mime, download: `colaberry-certificate${path.extname(name) || '.png'}` };
}
