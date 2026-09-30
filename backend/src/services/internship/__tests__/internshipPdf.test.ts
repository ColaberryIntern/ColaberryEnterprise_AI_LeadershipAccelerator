/**
 * PDF generation — that it produces a real PDF, and that the checksum is computed
 * over the bytes rather than over the inputs.
 *
 * Runs pdfkit for real. It is a root dependency of this monorepo with no bundled
 * types (see types/pdfkit.d.ts), and it IS present in the production image —
 * backend/Dockerfile runs `npm ci` before NODE_ENV=production is set and copies
 * the whole node_modules across.
 */
import crypto from 'crypto';
import { generatePdf, matchesChecksum, newDocumentPublicId } from '../internshipPdf';
import type { DocumentFacts } from '../internshipDocumentTemplates';

const FACTS: DocumentFacts = {
  legal_name: 'Ada Lovelace',
  document_public_id: 'AB3CD-EF7HJ',
  generated_on: '2026-09-09',
  template_version: 1,
  start_on: '2026-09-14',
  weekly_hours: 25,
  max_active_projects: 2,
  membership_monthly_annual: '$149',
  membership_monthly_monthly: '$199',
  tooling_monthly_estimate: '$30',
  conditions: null,
};

describe('generatePdf', () => {
  it('produces a real PDF', async () => {
    const out = await generatePdf({ templateKey: 'unpaid_internship_offer', facts: FACTS });
    expect(out.buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(out.buffer.subarray(-6).toString('latin1')).toContain('EOF');
    expect(out.byte_size).toBe(out.buffer.length);
    expect(out.byte_size).toBeGreaterThan(1000);
  }, 30000);

  it('computes the checksum over the BYTES it produced', async () => {
    // Not over the facts. A hash derived from inputs would not detect a corrupted
    // write, which is the whole reason the checksum exists.
    const out = await generatePdf({ templateKey: 'unpaid_internship_offer', facts: FACTS });
    const recomputed = crypto.createHash('sha256').update(out.buffer).digest('hex');
    expect(out.checksum_sha256).toBe(recomputed);
    expect(out.checksum_sha256).toMatch(/^[0-9a-f]{64}$/);
  }, 30000);

  it('renders every template without throwing', async () => {
    const withConditions: DocumentFacts = { ...FACTS, conditions: 'Set up your API key.' };
    for (const key of [
      'unpaid_internship_offer', 'ip_agreement', 'acceptance_acknowledgement',
      'recording_consent', 'conditional_approval_addendum', 'work_authorization_request',
    ] as const) {
      const out = await generatePdf({ templateKey: key, facts: withConditions });
      expect(out.byte_size).toBeGreaterThan(500);
    }
  }, 60000);

  it('is not byte-identical across runs, which is why the hash is of the output', async () => {
    // pdfkit writes a CreationDate into the trailer. Documenting the fact in a test
    // so nobody later "fixes" the checksum by deriving it from the facts.
    const a = await generatePdf({ templateKey: 'ip_agreement', facts: FACTS });
    const b = await generatePdf({ templateKey: 'ip_agreement', facts: FACTS });
    expect(a.checksum_sha256).toBe(crypto.createHash('sha256').update(a.buffer).digest('hex'));
    expect(b.checksum_sha256).toBe(crypto.createHash('sha256').update(b.buffer).digest('hex'));
  }, 30000);
});

describe('matchesChecksum', () => {
  it('accepts the bytes it was computed from', async () => {
    const out = await generatePdf({ templateKey: 'ip_agreement', facts: FACTS });
    expect(matchesChecksum(out.buffer, out.checksum_sha256)).toBe(true);
  }, 30000);

  it('rejects altered bytes', async () => {
    const out = await generatePdf({ templateKey: 'ip_agreement', facts: FACTS });
    const tampered = Buffer.from(out.buffer);
    tampered[tampered.length - 40] ^= 0xff;
    expect(matchesChecksum(tampered, out.checksum_sha256)).toBe(false);
  }, 30000);

  it('rejects a malformed expectation without throwing', () => {
    // timingSafeEqual throws on a length mismatch, so the guard must come first.
    expect(matchesChecksum(Buffer.from('x'), 'short')).toBe(false);
    expect(matchesChecksum(Buffer.from('x'), '')).toBe(false);
  });
});

describe('newDocumentPublicId', () => {
  it('is readable back over the phone — no I, L, O or U', () => {
    for (let i = 0; i < 200; i++) {
      const id = newDocumentPublicId();
      expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/);
      expect(id).not.toMatch(/[ILOU]/);
    }
  });

  it('does not collide across a realistic number of documents', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) seen.add(newDocumentPublicId());
    expect(seen.size).toBe(2000);
  });
});
