import crypto from 'crypto';
import PDFDocument from 'pdfkit';
import {
  documentTemplate, interpolate,
  type DocumentFacts, type TemplateKey,
} from './internshipDocumentTemplates';

/**
 * Render one offer-letter document to a PDF buffer.
 *
 * ── "LOCKED" MEANS TAMPER-EVIDENT, NOT ENCRYPTED ───────────────────────────
 *
 * The contract asks for "a locked PDF with document ID, template version,
 * generation date, applicant identity, and checksum/hash". We do not password-
 * protect it: the applicant must be able to open, print and sign it, and a
 * password they must be told is not protection.
 *
 * What "locked" buys is the ability to prove a document is the one we issued. The
 * identifiers are printed IN the page (not only in metadata a text editor can
 * strip), and `sha256` over the exact bytes is stored on the row. If a signed
 * upload ever needs checking against what we sent, the original is byte-identical
 * to its recorded hash or it is not our document.
 *
 * ── DETERMINISM, AND THE ONE THING THAT BREAKS IT ──────────────────────────
 *
 * Same facts in, same visual document out. The BYTES are not deterministic —
 * pdfkit writes a CreationDate and a document id into the trailer — which is why
 * `generatePdf` returns the checksum it actually computed over the bytes it
 * actually produced, rather than a hash anyone recomputes later from the facts.
 * A checksum derived from inputs would not detect a corrupted write; one derived
 * from the output does.
 */

export interface GeneratedPdf {
  buffer: Buffer;
  checksum_sha256: string;
  byte_size: number;
}

const PAGE_MARGIN = 64;
const INK = '#111827';
const MUTED = '#6b7280';
const RULE = '#d1d5db';

/** A short, human-quotable document id. Not a secret and not a key. */
export function newDocumentPublicId(): string {
  // Crockford-ish alphabet: no I, L, O, U — so a person reading it off a printed
  // page back to us over the phone cannot turn a 1 into an I.
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const bytes = crypto.randomBytes(10);
  let out = '';
  for (let i = 0; i < 10; i++) out += alphabet[bytes[i] % alphabet.length];
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

export async function generatePdf(params: {
  templateKey: TemplateKey;
  facts: DocumentFacts;
}): Promise<GeneratedPdf> {
  const template = documentTemplate(params.templateKey);
  const { facts } = params;

  const doc = new PDFDocument({
    size: 'LETTER',
    margin: PAGE_MARGIN,
    info: {
      Title: `${template.title} — ${facts.legal_name}`,
      Author: 'Colaberry',
      Subject: `AI Internship · ${template.title}`,
      Creator: 'Colaberry AI Internship',
      Keywords: `internship,${template.key},v${template.version},${facts.document_public_id}`,
    },
  });

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  const finished = new Promise<void>((resolve, reject) => {
    doc.on('end', () => resolve());
    doc.on('error', (err: Error) => reject(err));
  });

  const contentWidth = doc.page.width - PAGE_MARGIN * 2;

  // ── Header ──────────────────────────────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED)
    .text('COLABERRY · AI INTERNSHIP', { width: contentWidth });
  doc.moveDown(0.4);
  doc.font('Helvetica-Bold').fontSize(19).fillColor(INK)
    .text(template.title, { width: contentWidth });
  doc.moveDown(0.5);

  // The identifiers, printed on the page rather than only in metadata.
  doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(
    `Document ID ${facts.document_public_id}   ·   Template version ${template.version}   ·   Generated ${facts.generated_on}   ·   Issued to ${facts.legal_name}`,
    { width: contentWidth },
  );
  doc.moveDown(0.6);

  const rule = () => {
    const y = doc.y;
    doc.strokeColor(RULE).lineWidth(0.75)
      .moveTo(PAGE_MARGIN, y).lineTo(doc.page.width - PAGE_MARGIN, y).stroke();
    doc.moveDown(0.8);
  };
  rule();

  // ── Body ────────────────────────────────────────────────────────────────
  for (const section of template.sections) {
    if (section.heading) {
      doc.moveDown(0.4);
      doc.font('Helvetica-Bold').fontSize(11.5).fillColor(INK)
        .text(section.heading, { width: contentWidth });
      doc.moveDown(0.3);
    }

    for (const paragraph of section.body) {
      const text = interpolate(paragraph, facts);
      doc.font('Helvetica').fontSize(10.5).fillColor(INK)
        .text(text, { width: contentWidth, align: 'left', lineGap: 2.5 });
      doc.moveDown(0.55);
    }

    if (section.bullets?.length) {
      for (const bullet of section.bullets) {
        const text = interpolate(bullet, facts);
        doc.font('Helvetica').fontSize(10.5).fillColor(INK)
          .text(`•  ${text}`, { width: contentWidth - 14, indent: 14, lineGap: 2.5 });
        doc.moveDown(0.35);
      }
      doc.moveDown(0.3);
    }
  }

  // ── Footer ──────────────────────────────────────────────────────────────
  doc.moveDown(0.6);
  rule();
  doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(
    template.requires_signature
      ? 'Print this document, sign and date it by hand, then upload the signed copy to your Colaberry portal. Do not send credentials of any kind.'
      : 'No signature is required on this page. Upload the documents it asks for to your Colaberry portal.',
    { width: contentWidth },
  );

  doc.end();
  await finished;

  const buffer = Buffer.concat(chunks);
  // Hashed over the bytes actually produced, not over the inputs — see the header.
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

  return { buffer, checksum_sha256: checksum, byte_size: buffer.length };
}

/** Verify a buffer against a recorded checksum. Constant-time. */
export function matchesChecksum(buffer: Buffer, expected: string): boolean {
  const actual = crypto.createHash('sha256').update(buffer).digest('hex');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}
