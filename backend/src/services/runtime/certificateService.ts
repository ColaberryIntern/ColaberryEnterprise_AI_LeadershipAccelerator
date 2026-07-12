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
import TimelineCard from '../../models/TimelineCard';
import TimelineCardProgress from '../../models/TimelineCardProgress';
import { getInstrumentedOpenAI } from '../openaiInstrumented';

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

/**
 * Verify an uploaded certificate for a Skills Course card and record it as
 * evidence on the student's progress row. Returns the verdict; the client
 * completes the card on `valid`.
 */
export async function uploadCertificate(enrollmentId: string, cardId: string, file: { path: string; filename: string; mimetype: string }): Promise<CertVerifyResult> {
  const card = await TimelineCard.findByPk(cardId);
  if (!card) throw Object.assign(new Error('Card not found'), { status: 404 });
  const meta = card.metadata && typeof card.metadata === 'object' ? card.metadata : {};
  const className = meta.course && typeof meta.course === 'object' ? (meta.course.name || null) : null;

  const result = await verifyCertificate(file.path, file.mimetype, className);

  // Record on the progress row (best-effort — never fail the verdict on a write).
  try {
    const [prog] = await TimelineCardProgress.findOrCreate({
      where: { card_id: cardId, enrollment_id: enrollmentId },
      defaults: { card_id: cardId, enrollment_id: enrollmentId, status: 'in_progress' } as any,
    });
    const evidence = prog.evidence && typeof prog.evidence === 'object' ? prog.evidence : {};
    await prog.update({ evidence: { ...evidence, certificate: { file: file.filename, verified: result.valid, reason: result.reason, at: new Date().toISOString() } } });
  } catch { /* evidence is a convenience; the verdict already stands */ }

  return result;
}
