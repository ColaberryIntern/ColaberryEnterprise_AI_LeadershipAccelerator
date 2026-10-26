import fs from 'fs';
import path from 'path';
import { SIGNUP_CONSENT_TEXT, PHONE_CONSENT_TEXT } from '../captureSignupConsent';

/**
 * The wording shown at signup must be the wording recorded as consent.
 *
 * ── WHY A CROSS-STACK TEST, WHICH IS UNUSUAL HERE ───────────────────────────
 *
 * `captureSignupConsent` persists its `consentText` as evidence of what the person
 * was shown. The form renders its own copy of that sentence, because a React page
 * cannot import from `backend/src`. Two copies of one legal-ish string in two
 * stacks is exactly the shape that drifts, and when it drifts the consent record
 * becomes a confident attestation to an agreement that never happened in those
 * words. That is worse than having no record: it would be produced in good faith
 * and be wrong.
 *
 * Nothing else guards it. `tsc` cannot see across the two programs, the frontend
 * tests do not read backend source, and a reviewer comparing two sentences in two
 * diffs is precisely the check that fails quietly. So this test reads the frontend
 * file as TEXT and requires the strings to be identical.
 *
 * It is deliberately brittle. If it fails, one of the two was changed alone, and
 * that is the event worth interrupting.
 */

const FRONTEND_CONSENT = path.join(
  __dirname, '..', '..', '..', '..', '..', 'frontend', 'src', 'config', 'consentText.ts',
);

/**
 * Pull the literal out of the frontend module without executing it.
 *
 * A regex rather than an import, because importing a frontend module into the
 * backend's jest program drags in its module graph and resolution config for a
 * single string. The capture is anchored on the export name so a renamed constant
 * fails loudly here rather than matching some other string in the file.
 */
function readFrontendConsentText(src: string, name = 'SIGNUP_CONSENT_TEXT'): string | null {
  // Built from the export NAME so one extractor serves every constant here, rather than growing a
  // near-identical copy per string - which is the same duplication this file exists to catch.
  const m = new RegExp(`export const ${name}\\s*=\\s*\\r?\\n?\\s*'([^']*)'`).exec(src);
  return m ? m[1] : null;
}

describe('signup consent wording, backend and frontend', () => {
  it('the frontend file exists where this test expects it', () => {
    // A moved file must fail as a missing file, not as a silently skipped suite.
    expect(fs.existsSync(FRONTEND_CONSENT)).toBe(true);
  });

  it('extracts the literal from the frontend module', () => {
    const src = fs.readFileSync(FRONTEND_CONSENT, 'utf8');
    const text = readFrontendConsentText(src);

    // If this is null the regex stopped matching, which would make the parity
    // assertion below vacuous. Fail on the instrument before trusting it.
    expect(text).not.toBeNull();
    expect((text as string).length).toBeGreaterThan(20);
  });

  it('IS IDENTICAL to the string recorded as consent', () => {
    const src = fs.readFileSync(FRONTEND_CONSENT, 'utf8');
    expect(readFrontendConsentText(src)).toBe(SIGNUP_CONSENT_TEXT);
  });

  it('names the sender and the way out, which is what makes it consent', () => {
    expect(SIGNUP_CONSENT_TEXT).toMatch(/Colaberry/);
    expect(SIGNUP_CONSENT_TEXT.toLowerCase()).toMatch(/unsubscribe/);
  });

  it('does not use the advertising word this project may not use', () => {
    // TWC 807.172(d). The outbound-copy ratchet covers backend/src; this string is
    // also rendered on a public page, so it is checked here too.
    expect(SIGNUP_CONSENT_TEXT).not.toMatch(/\bfree\b/i);
  });

  it('is a plain literal, so the evidence is reproducible without running the app', () => {
    const src = fs.readFileSync(FRONTEND_CONSENT, 'utf8');
    // No template interpolation in the rendered sentence: `${` inside the literal
    // would mean the stored evidence and the shown text can differ per request.
    expect(readFrontendConsentText(src)).not.toContain('${');
    expect(SIGNUP_CONSENT_TEXT).not.toContain('${');
  });
});

/**
 * The phone grant, added 2026-10-26 alongside the optional phone field.
 *
 * It needs this guard MORE than the email one, not less: the record it backs attests that
 * somebody agreed to be telephoned, and an AI voice agent may be what places the call. A drifted
 * string here is a good-faith attestation to permission in words nobody was ever shown.
 */
describe('phone consent wording, backend and frontend', () => {
  const frontend = () => readFrontendConsentText(
    fs.readFileSync(FRONTEND_CONSENT, 'utf8'), 'PHONE_CONSENT_TEXT',
  );

  it('extracts the literal from the frontend module', () => {
    // Fail on the instrument before trusting it, exactly as above.
    expect(frontend()).not.toBeNull();
    expect((frontend() as string).length).toBeGreaterThan(20);
  });

  it('IS IDENTICAL to the string recorded as consent', () => {
    expect(frontend()).toBe(PHONE_CONSENT_TEXT);
  });

  it('is NOT the email wording, which is the reason it exists', () => {
    // One sentence covering both would mean a single tick authorising email and telephone.
    expect(PHONE_CONSENT_TEXT).not.toBe(SIGNUP_CONSENT_TEXT);
  });

  it('names calls and texts, so the record says what was agreed to', () => {
    expect(PHONE_CONSENT_TEXT.toLowerCase()).toContain('call');
    expect(PHONE_CONSENT_TEXT.toLowerCase()).toContain('text');
  });
});
