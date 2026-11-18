import { normalizeWithFieldMap, validateNormalized } from '../../utils/normalizeFields';

describe('normalizeWithFieldMap', () => {
  it('maps explicit field_map entries onto canonical fields', () => {
    const body = { full_name: 'Jane Doe', email: 'JANE@EX.COM', extra_note: 'hello' };
    const out = normalizeWithFieldMap(body, {
      full_name: 'name',
      email: 'email',
      extra_note: 'metadata.message',
    });
    expect(out.name).toBe('Jane Doe');
    expect(out.email).toBe('jane@ex.com');
    expect(out.metadata.message).toBe('hello');
  });

  it('normalizes phone numbers to digits', () => {
    const out = normalizeWithFieldMap({ phone: '(512) 555-1212' }, { phone: 'phone' });
    expect(out.phone).toBe('5125551212');
  });

  it('strips US country code from 11-digit numbers starting with 1', () => {
    const out = normalizeWithFieldMap({ phone: '1-512-555-1212' }, { phone: 'phone' });
    expect(out.phone).toBe('5125551212');
  });

  it('falls back to alias keys when field_map does not mention them', () => {
    const out = normalizeWithFieldMap(
      { full_name: 'Jane', work_email: 'jane@ex.com', company_name: 'Acme' },
      { /* no mappings */ }
    );
    expect(out.name).toBe('Jane');
    expect(out.email).toBe('jane@ex.com');
    expect(out.company).toBe('Acme');
  });

  it('routes unmapped keys into metadata', () => {
    const out = normalizeWithFieldMap({ email: 'x@y.com', random_utm: 'foo' }, { email: 'email' });
    expect(out.metadata.random_utm).toBe('foo');
  });

  /**
   * R22: `utm_medium` is a lead COLUMN, so it must not land in the metadata bag.
   *
   * Before R22 it was absent from `KNOWN_LEAD_FIELDS`, and the two tests above show what that
   * meant in practice: an unknown destination is routed into `metadata`, and the direct-name pass
   * only copies listed keys. So an inbound medium ended up either in a JSON bag nothing reports
   * on, or nowhere — while `leads.utm_medium` sat empty and the signup form packed the value into
   * `utm_source` as `fb|paid` to get it through at all. The first assertion is the fix; the second
   * is the one that fails if the field is ever quietly demoted back to metadata.
   */
  it('carries utm_medium onto the lead as a column, not into the metadata bag', () => {
    const out = normalizeWithFieldMap(
      { email: 'x@y.com', utm_source: 'fb', utm_medium: 'paid', utm_campaign: 'nov' },
      { /* direct-name pass only: these keys are named exactly as the lead fields are */ },
    );
    expect(out).toMatchObject({ utm_source: 'fb', utm_medium: 'paid', utm_campaign: 'nov' });
    expect(out.metadata).not.toHaveProperty('utm_medium');
  });

  it('accepts the camelCase alias, like the other two utm fields', () => {
    const out = normalizeWithFieldMap({ email: 'x@y.com', utmMedium: 'organic' }, {});
    expect(out.utm_medium).toBe('organic');
  });

  it('defaults utm_medium to empty rather than undefined, matching utm_source beside it', () => {
    const out = normalizeWithFieldMap({ email: 'x@y.com' }, {});
    expect(out.utm_medium).toBe('');
  });

  it('coerces boolean-like values', () => {
    const out = normalizeWithFieldMap(
      { consent: 'true', evaluating: 1, sponsor: 'yes' },
      { consent: 'consent_contact', evaluating: 'evaluating_90_days', sponsor: 'corporate_sponsorship_interest' }
    );
    expect(out.consent_contact).toBe(true);
    expect(out.evaluating_90_days).toBe(true);
    expect(out.corporate_sponsorship_interest).toBe(true);
  });

  it('uses email or phone as name when name is absent', () => {
    const out = normalizeWithFieldMap({ email: 'x@y.com' }, { email: 'email' });
    expect(out.name).toBe('x@y.com');
  });

  it('supports metadata.<path> destinations', () => {
    const out = normalizeWithFieldMap({ msg: 'hi' }, { msg: 'metadata.note.body' });
    expect(out.metadata.note.body).toBe('hi');
  });
});

describe('validateNormalized', () => {
  it('accepts when required email is present', () => {
    const n = normalizeWithFieldMap({ email: 'x@y.com' }, {});
    expect(validateNormalized(n, ['email']).ok).toBe(true);
  });

  it('accepts phone-only when email is the only required field (fallback semantics)', () => {
    const n = normalizeWithFieldMap({ phone: '5125551212' }, { phone: 'phone' });
    expect(validateNormalized(n, ['email']).ok).toBe(true);
  });

  it('rejects when neither email nor phone is present', () => {
    const n = normalizeWithFieldMap({ name: 'X' }, {});
    const result = validateNormalized(n, ['email']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toContain('email');
  });

  it('rejects missing explicitly-required non-email fields', () => {
    const n = normalizeWithFieldMap({ email: 'x@y.com' }, {});
    const result = validateNormalized(n, ['email', 'company']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toContain('company');
  });
});
