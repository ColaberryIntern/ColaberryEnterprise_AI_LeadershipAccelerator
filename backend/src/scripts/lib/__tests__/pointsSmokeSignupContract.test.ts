/**
 * The points monitor's signup body must satisfy the signup schema the server
 * actually enforces.
 *
 * WHY THIS EXISTS. PH1 (Ali, 2026-11-19) made `phone` required on every public
 * signup and lead form. `pointsEarnSmoke.js` went on posting `{ full_name,
 * email }`, so from 2026-11-21 the endpoint answered 400 with zod's backstop
 * wording - "expected string, received undefined" - and an email went to Ali
 * every morning saying production had failed. Production was fine: every lead
 * recorded in those five days carries a phone.
 *
 * The real cost was not the noise. Check 2 returns early, so checks 3 to 6 - the
 * badge-to-HUD points parity the whole script exists to defend - did not run
 * once in five days. The monitor was green on its own terms while proving
 * nothing, which is precisely the failure its own header describes happening to
 * its predecessor for a month. Twice is a pattern, and a pattern needs a test
 * rather than a fix.
 *
 * This parses the monitor's own body with the server's own schema, so the next
 * required field fails here, in CI, in seconds.
 */
import { portalFreeSignupSchema } from '../../../schemas/enrollmentSchema';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { signupBody } = require('../pointsSmokeChecks');

const EMAIL = 'e2e-points-1795629233993@colaberry-test.local';

describe('the points smoke test can actually sign up', () => {
  it('posts a body the live signup schema accepts', () => {
    const parsed = portalFreeSignupSchema.safeParse(signupBody(EMAIL));
    // Named explicitly: a bare `.success` assertion tells whoever broke this
    // nothing about WHICH field they added.
    const problem = parsed.success ? null : parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
    expect(problem).toBeNull();
  });

  it('carries the email it was handed, so the monitor talks to its own guest', () => {
    expect(signupBody(EMAIL).email).toBe(EMAIL);
  });

  it('sends a phone, which is the field whose absence caused the outage of the monitor', () => {
    // Pinned by NAME rather than only through the schema above: if `phone` ever
    // became optional again, the schema test would still pass and this would
    // record that the monitor deliberately keeps sending one.
    expect(typeof signupBody(EMAIL).phone).toBe('string');
    expect(signupBody(EMAIL).phone.replace(/\D/g, '').length).toBeGreaterThanOrEqual(10);
  });

  it('uses a number reserved for fiction, never one that could reach a person', () => {
    // 555-01xx is the reserved range. This matters because the body is posted to
    // a real production endpoint every morning and lands in a real Lead row.
    expect(signupBody(EMAIL).phone).toMatch(/555-01\d{2}$/);
  });

  it('would have caught the real break: the old body is refused', () => {
    // The control. Without it, this suite would pass just as happily against a
    // schema that required nothing at all, which is the state it is meant to
    // detect changing.
    const old = { full_name: 'Points Smoke', email: EMAIL };
    const parsed = portalFreeSignupSchema.safeParse(old);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path.includes('phone'))).toBe(true);
    }
  });
});
