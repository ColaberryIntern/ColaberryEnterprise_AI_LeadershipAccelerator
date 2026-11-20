import { portalFreeSignupSchema } from '../enrollmentSchema';

/**
 * Phase 2 T204 — `portalFreeSignupSchema` at the unauthenticated boundary.
 *
 * Split out of `services/__tests__/freeSignupAcquisition.test.ts` when that file crossed
 * CLAUDE.md's 500-line hard ceiling: the rule is that the next change to an oversize file
 * splits it before adding more, and the seam was already there. These tests need no mocks
 * and no service — they drive the schema directly, so they belong next to it. What stayed
 * behind is the half that needs the service and the real `Lead` model: what actually lands
 * on the lead row.
 *
 * The schema's own docblock carries the full account of why this schema exists and what it
 * narrowed; this file is the proof of the narrowing list, class by class.
 */

/**
 * The phone every accepting body now carries: REQUIRED since PH1 (Ali, 2026-11-19: every public
 * signup/lead form requires a phone number). Spread into the bodies below so each test still
 * isolates the one field it is about.
 */
const P = { phone: '(214) 555-0100' } as const;

describe('T204 — the schema at the unauthenticated boundary', () => {
  it('PH1: rejects a signup with no phone, a blank one, or one under 10 digits', () => {
    for (const phone of [undefined, '', '   ', '555-0100', '1234567890123456']) {
      const body: Record<string, unknown> = { full_name: 'Maya', email: 'maya@example.com' };
      if (phone !== undefined) body.phone = phone;
      expect(portalFreeSignupSchema.safeParse(body).success).toBe(false);
    }
  });

  it('PH1: a phone with NO consent is accepted - the permission to call stays optional', () => {
    const r = portalFreeSignupSchema.safeParse({ ...P, full_name: 'Maya', email: 'maya@example.com' });
    expect(r.success).toBe(true);
    expect(r.success && r.data.phone_consent).toBeUndefined();
  });

  /**
   * THE DEPLOY GUARD. `frontend/src/services/onboardingApi.ts` declares
   * `freeSignup(body: { ...P, full_name: string; email: string })` and
   * `PortalFreeSignupPage.tsx` is its only caller, passing exactly those two trimmed
   * strings and nothing else. That is the whole live request shape, which is what
   * makes `.strict()` safe to add to an endpoint already in production — and this test
   * is where that stops being an argument and becomes a check.
   */
  it('accepts exactly the body the portal page sends today, and nothing it does not', () => {
    expect(portalFreeSignupSchema.safeParse({ ...P, full_name: 'Maya', email: 'maya@example.com' }).success)
      .toBe(true);
  });

  /**
   * The legacy contract, preserved field by field. The old hand-rolled check was
   * `if (!full_name || !email || typeof email !== 'string')` followed by an email
   * regex, so EVERY one of these returned the same string. The first version of
   * this schema returned Zod's default type errors instead and the commit body
   * claimed "existing clients see no change", which was false for four bodies.
   */
  it.each([
    ['an empty body', {}],
    ['a missing email', { ...P, full_name: 'Maya' }],
    ['a missing name', { email: 'a@b.co' }],
    ['an empty name', { ...P, full_name: '', email: 'a@b.co' }],
    ['a numeric email', { ...P, full_name: 'Maya', email: 123 }],
    ['a null email', { ...P, full_name: 'Maya', email: null }],
    // `!full_name` rejected 0 before, so it must still be rejected rather than
    // becoming the name "0". A union of string|number alone WIDENS the endpoint here,
    // which is the opposite of the claim the first draft made about this change.
    ['a zero name', { ...P, full_name: 0, email: 'a@b.co' }],
    ['a NaN name', { ...P, full_name: NaN, email: 'a@b.co' }],
  ])('returns the legacy required message for %s', (_label, body) => {
    const r = portalFreeSignupSchema.safeParse(body);
    expect(r.success).toBe(false);
    expect(!r.success && r.error.issues[0].message).toBe('full_name and email are required');
  });

  it('still accepts a NUMERIC full_name, which the old String() coercion allowed', () => {
    // A number is not a name, but it was accepted before and this is a live public
    // endpoint: tightening it is a separate decision from adding fields.
    const r = portalFreeSignupSchema.safeParse({ ...P, full_name: 123, email: 'a@b.co' });
    expect(r.success).toBe(true);
    expect(r.success && r.data.full_name).toBe('123');
  });

  it('returns the legacy invalid-email message for a malformed address', () => {
    const r = portalFreeSignupSchema.safeParse({ ...P, full_name: 'Maya', email: 'not-an-email' });
    expect(r.success).toBe(false);
    expect(!r.success && r.error.issues[0].message).toBe('A valid email is required');
  });

  it('rejects an over-long name and an over-long email', () => {
    expect(portalFreeSignupSchema.safeParse({ ...P, full_name: 'x'.repeat(256), email: 'a@b.co' }).success).toBe(false);
    expect(portalFreeSignupSchema.safeParse({ ...P, full_name: 'Maya', email: `${'x'.repeat(320)}@b.co` }).success).toBe(false);
  });

  it('rejects a non-URL in page_url, which would otherwise reach admin surfaces and the CRM', () => {
    const r = portalFreeSignupSchema.safeParse({ ...P, full_name: 'Maya', email: 'a@b.co', page_url: 'not a url' });
    expect(r.success).toBe(false);
    expect(!r.success && r.error.issues[0].message).toBe('page_url must be a URL');
  });

  /**
   * This found a real gap in the first draft. `z.string().url()` **accepts
   * `javascript:alert(1)`** — it is a valid URL. On an unauthenticated endpoint
   * whose values are stored, shown in admin surfaces and pushed to the CRM, that is
   * a stored-XSS vector waiting for somewhere that renders it as a link.
   */
  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
  ])('rejects a dangerous URL scheme in page_url: %s', (page_url) => {
    expect(portalFreeSignupSchema.safeParse({ ...P, full_name: 'Maya', email: 'a@b.co', page_url }).success)
      .toBe(false);
  });

  it('still accepts the schemes a real signup arrives with', () => {
    for (const page_url of ['https://cpn.example.com/ai', 'http://localhost:3000/enroll']) {
      expect(portalFreeSignupSchema.safeParse({ ...P, full_name: 'Maya', email: 'a@b.co', page_url }).success)
        .toBe(true);
    }
  });

  it('rejects an unexpected key — a probe or a client bug, not something to ignore', () => {
    // Notably this blocks a caller trying to CHOOSE its own programme, which is a
    // server-side decision: this path is always 'learner'.
    expect(portalFreeSignupSchema.safeParse({
      ...P, full_name: 'Maya', email: 'a@b.co', programme: 'learner',
    }).success).toBe(false);
  });

  it.each(['__proto__', 'constructor', 'prototype'])('rejects the prototype-pollution key %s', (key) => {
    expect(portalFreeSignupSchema.safeParse({ ...P, full_name: 'Maya', email: 'a@b.co', [key]: 'x' }).success)
      .toBe(false);
  });

  it.each([
    ['an array for a string', { ...P, full_name: 'Maya', email: 'a@b.co', utm_source: ['x'] }],
    ['an object for a string', { ...P, full_name: 'Maya', email: 'a@b.co', utm_source: { x: 1 } }],
    ['an array body', []],
    ['a string body', 'nope'],
  ])('rejects %s', (_label, body) => {
    expect(portalFreeSignupSchema.safeParse(body).success).toBe(false);
  });

  /**
   * THE FOUR NARROWINGS, enumerated as tests so the list cannot quietly grow.
   *
   * The first draft of this task claimed "existing clients see no change", which was
   * false: the old hand-rolled check accepted all four of these. Each tightening is
   * defensible on an unauthenticated endpoint — and saying so beats implying the
   * endpoint is unchanged when it is not.
   */
  it.each([
    ['full_name over 255 — the column is STRING(255)', { ...P, full_name: 'x'.repeat(256), email: 'a@b.co' }],
    ['email over the column width', { ...P, full_name: 'Maya', email: `${'x'.repeat(320)}@b.co` }],
    ['an unexpected key, previously ignored', { ...P, full_name: 'Maya', email: 'a@b.co', nope: 1 }],
    ['full_name as an object — the old code stored "[object Object]"', { ...P, full_name: {}, email: 'a@b.co' }],
    ['full_name as a boolean', { ...P, full_name: true, email: 'a@b.co' }],
    ['full_name as an array', { ...P, full_name: [], email: 'a@b.co' }],
  ])('NARROWER than before, deliberately: rejects %s', (_label, body) => {
    expect(portalFreeSignupSchema.safeParse(body).success).toBe(false);
  });

  /**
   * NARROWING CLASS 5 — the one I omitted, found by a verifier after I had written
   * "NARROWER in four named ways … so the list cannot quietly grow" in the schema.
   *
   * The email rule is now Zod's `.email()`, not the old loose
   * `/^[^@\s]+@[^@\s]+\.[^@\s]+$/`. Every address below passed the old regex and is
   * rejected now. Measured as a differential against the old regex: 7 of 9 probe
   * addresses flipped. They are pinned here so the count in the docblock is a fact
   * rather than a recollection.
   */
  it.each([
    ['an RFC-legal percent in the local part', 'user%x@example.com'],
    ['an RFC-legal equals in the local part', 'user=x@example.com'],
    ['an IP-literal domain', 'a@127.0.0.1'],
    ['a trailing-dot FQDN', 'a@b.co.'],
    ['a leading dot in the local part', '.a@b.co'],
    ['a single-character TLD', 'a@b.c'],
    ['an all-digit TLD', 'a@b.12'],
  ])('NARROWER than the old regex, class 5: rejects %s', (_label, email) => {
    expect(portalFreeSignupSchema.safeParse({ ...P, full_name: 'Maya', email }).success).toBe(false);
  });

  it.each([
    'maya@example.com',
    'user+tag@example.co.uk',
    "o'brien@example.museum",
    'xn--bcher-kva@example.com',
  ])('but still accepts the realistic address %s, which is why class 5 is acceptable', (email) => {
    expect(portalFreeSignupSchema.safeParse({ ...P, full_name: 'Maya', email }).success).toBe(true);
  });

  /**
   * NARROWING CLASS 6. These passed `!full_name` and then threw inside
   * `resolveFreeAccount`, so the old response was a 500. This class is a 500 becoming a
   * 400 — an improvement, but still a changed status code, which is why it is named.
   */
  it.each([
    ['a whitespace-only name', '   '],
    ['a tab-only name', '	'],
    ['Infinity as a name', Infinity],
  ])('NARROWER than before, class 6: rejects %s (previously a 500)', (_label, full_name) => {
    expect(portalFreeSignupSchema.safeParse({ ...P, full_name, email: 'a@b.co' }).success).toBe(false);
  });

  it('trims what it accepts', () => {
    const r = portalFreeSignupSchema.safeParse({
      ...P, full_name: '  Maya  ', email: '  MAYA@Example.COM  ', source: ' cpn_landing ',
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.full_name).toBe('Maya');
    expect(r.data.source).toBe('cpn_landing');
  });

  /**
   * `social_proof_opt_in` (SNACK-2). A DISPLAY permission, which is why it is on this schema at
   * all rather than reaching `captureSignupConsent` like the other two.
   *
   * The case that matters is the third one. This object is `.strict()`, so before the field was
   * added here the key was not ignored - it REJECTED THE WHOLE SIGNUP. That is why the page sends
   * it only when ticked, and why this suite pins the shape rather than trusting the ordering.
   */
  it('accepts the consent as a boolean', () => {
    const r = portalFreeSignupSchema.safeParse({
      ...P, full_name: 'Maya', email: 'maya@example.com', social_proof_opt_in: true,
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.social_proof_opt_in).toBe(true);
  });

  it('leaves it UNDEFINED when absent, rather than inventing a false', () => {
    const r = portalFreeSignupSchema.safeParse({ ...P, full_name: 'Maya', email: 'maya@example.com' });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.social_proof_opt_in).toBeUndefined();
  });

  it.each([
    ['the string "on"', 'on'],
    ['the string "true"', 'true'],
    ['the number 1', 1],
  ])('rejects %s: one place decides what a tick is, and it is not this one', (_l, value) => {
    expect(portalFreeSignupSchema.safeParse({
      ...P, full_name: 'Maya', email: 'maya@example.com', social_proof_opt_in: value,
    }).success).toBe(false);
  });

  it('CONTROL: an unknown key is still rejected, so the acceptance above is the field and not a loosened schema', () => {
    // Without this, adding the field by accidentally dropping `.strict()` would make every
    // assertion above pass while the endpoint silently widened.
    expect(portalFreeSignupSchema.safeParse({
      ...P, full_name: 'Maya', email: 'maya@example.com', social_proof_opt_out: true,
    }).success).toBe(false);
  });
});
