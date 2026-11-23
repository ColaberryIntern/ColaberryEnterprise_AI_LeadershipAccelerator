import { openHousePublicSignupSchema } from '../openHouseSchema';

/**
 * SNACK-2: the Open House door now asks for the snack-bar naming permission too.
 *
 * WHY THIS FILE EXISTS AT ALL. The route's schema is `.strict()`, which means the failure mode
 * for a missing declaration is not "the field is ignored" - it is a 400 for the WHOLE signup.
 * A form that starts sending `social_proof_opt_in` against a schema that does not declare it
 * loses the registration, the seat and the account, and the person sees a validation error about
 * a box they ticked out of politeness. So the declaration is pinned here rather than trusted.
 */

const BASE = {
  name: 'Dana Okoro',
  email: 'dana@example.com',
  phone: '(512) 555-0142',
};

describe('the naming permission is accepted by the public Open House schema', () => {
  it('accepts it as a boolean', () => {
    const r = openHousePublicSignupSchema.safeParse({ ...BASE, social_proof_opt_in: true });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.social_proof_opt_in).toBe(true);
  });

  // An HTML checkbox does not always arrive as a boolean. Both spellings have to survive the
  // schema, or the normalisation in the controller never gets the chance to run.
  it.each(['true', 'on'])('accepts it as the string %p, which is how a form may send it', (v) => {
    expect(openHousePublicSignupSchema.safeParse({ ...BASE, social_proof_opt_in: v }).success).toBe(true);
  });

  it('accepts a signup that omits it entirely, because it is optional', () => {
    const r = openHousePublicSignupSchema.safeParse(BASE);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.social_proof_opt_in).toBeUndefined();
  });

  /**
   * THE CONTROL, and the point of the whole file. If `.strict()` had been dropped to make the
   * new key fit, every assertion above would still pass while the route quietly began accepting
   * forged provenance - `ip_address` and `user_agent` from the body, which is the exact thing
   * the schema's own comment says must never be possible. So: a key that must STILL be refused.
   */
  it('still refuses an undeclared key, so strictness was not traded away for this', () => {
    const r = openHousePublicSignupSchema.safeParse({ ...BASE, ip_address: '203.0.113.9' });
    expect(r.success).toBe(false);
  });

  it('still refuses a body claiming its own consent wording', () => {
    const r = openHousePublicSignupSchema.safeParse({ ...BASE, marketing_consent_text: 'whatever I like' });
    expect(r.success).toBe(false);
  });
});
