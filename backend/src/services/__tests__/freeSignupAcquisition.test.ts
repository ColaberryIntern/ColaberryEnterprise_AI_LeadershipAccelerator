import { portalFreeSignupSchema } from '../../schemas/enrollmentSchema';

const findOrCreate = jest.fn();
const findAll = jest.fn();
const create = jest.fn();

jest.mock('../../models', () => ({
  Enrollment: {
    findAll: (...a: unknown[]) => findAll(...a),
    create: (...a: unknown[]) => create(...a),
  },
  Lead: { findOrCreate: (...a: unknown[]) => findOrCreate(...a) },
}));
jest.mock('../../config/env', () => ({ env: { jwtSecret: 'test-secret' } }));
jest.mock('../participantService', () => ({ signParticipantJwt: () => 'jwt' }));
jest.mock('../reese/reeseWelcomeService', () => ({ maybeSendWelcomes: jest.fn() }), { virtual: true });

import { createFreeAccount } from '../freeSignupService';

/**
 * Phase 2 T204 — acquisition evidence on the portal free-signup path, and a schema
 * at the unauthenticated boundary.
 *
 * TWO PROPERTIES, and they are separate on purpose:
 *
 *  1. **Origin brand is not journey ownership.** Where someone came from and what
 *     they joined are different facts. Someone arriving from a non-learner brand's
 *     page can still become a free AI learner, and the two facts live in different
 *     columns in different tables so neither can overwrite the other. Origin brand
 *     is never stored on the signup: it is DERIVED through
 *     `Lead.source_id → LeadSource.brand_id`, which is why there is no brand field
 *     to assert here and nothing that could disagree with itself.
 *  2. **The boundary validates.** The route is unauthenticated and now takes
 *     caller-supplied URLs, UTM values and a visitor id.
 *
 * Behavioural throughout, per the standing decision taken after T203: these drive
 * the real schema and the real service rather than asserting source text.
 */
const leadDefaults = () => findOrCreate.mock.calls[0][0].defaults as Record<string, unknown>;

describe('T204 — the schema at the unauthenticated boundary', () => {
  it('accepts the minimum the portal page sends today', () => {
    const r = portalFreeSignupSchema.safeParse({ full_name: 'Maya', email: 'maya@example.com' });
    expect(r.success).toBe(true);
  });

  it('preserves the two original error messages, so existing clients see no change', () => {
    const noName = portalFreeSignupSchema.safeParse({ full_name: '', email: 'a@b.co' });
    expect(noName.success).toBe(false);
    expect(!noName.success && noName.error.issues[0].message).toBe('full_name and email are required');

    const badEmail = portalFreeSignupSchema.safeParse({ full_name: 'Maya', email: 'not-an-email' });
    expect(badEmail.success).toBe(false);
    expect(!badEmail.success && badEmail.error.issues[0].message).toBe('A valid email is required');
  });

  it('rejects an over-long name and an over-long email', () => {
    expect(portalFreeSignupSchema.safeParse({ full_name: 'x'.repeat(256), email: 'a@b.co' }).success).toBe(false);
    expect(portalFreeSignupSchema.safeParse({ full_name: 'Maya', email: `${'x'.repeat(320)}@b.co` }).success).toBe(false);
  });

  it('rejects a non-URL in page_url, which would otherwise reach admin surfaces and the CRM', () => {
    const r = portalFreeSignupSchema.safeParse({ full_name: 'Maya', email: 'a@b.co', page_url: 'not a url' });
    expect(r.success).toBe(false);
    expect(!r.success && r.error.issues[0].message).toBe('page_url must be a URL');
  });

  /**
   * This test found a real gap in the first draft of the schema. `z.string().url()`
   * **accepts `javascript:alert(1)`** — it is a valid URL. On an unauthenticated
   * endpoint whose values are stored, shown in admin surfaces and pushed to the
   * CRM, that is a stored-XSS vector waiting for somewhere that renders it as a
   * link. The scheme is now restricted to http/https.
   */
  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
  ])('rejects a dangerous URL scheme in page_url: %s', (page_url) => {
    expect(portalFreeSignupSchema.safeParse({ full_name: 'Maya', email: 'a@b.co', page_url }).success)
      .toBe(false);
  });

  it('still accepts the schemes a real signup actually arrives with', () => {
    for (const page_url of ['https://cpn.example.com/ai', 'http://localhost:3000/enroll']) {
      expect(portalFreeSignupSchema.safeParse({ full_name: 'Maya', email: 'a@b.co', page_url }).success)
        .toBe(true);
    }
  });

  it('rejects a non-URL referrer, and a dangerous scheme in one too', () => {
    expect(portalFreeSignupSchema.safeParse({ full_name: 'Maya', email: 'a@b.co', referrer: 'nope' }).success)
      .toBe(false);
    expect(portalFreeSignupSchema.safeParse({
      full_name: 'Maya', email: 'a@b.co', referrer: 'javascript:void(0)',
    }).success).toBe(false);
  });

  it('rejects an unexpected key — a probe or a client bug, not something to ignore', () => {
    const r = portalFreeSignupSchema.safeParse({
      full_name: 'Maya', email: 'a@b.co', programme: 'learner',
    });
    // Notably this blocks a caller trying to CHOOSE its own programme, which is a
    // server-side decision: the portal path is always 'learner' and an org path is
    // always 'standard'.
    expect(r.success).toBe(false);
  });

  it('rejects an over-long visitor_id rather than storing an unbounded string', () => {
    expect(portalFreeSignupSchema.safeParse({
      full_name: 'Maya', email: 'a@b.co', visitor_id: 'v'.repeat(129),
    }).success).toBe(false);
  });

  it('accepts a full acquisition payload and trims it', () => {
    const r = portalFreeSignupSchema.safeParse({
      full_name: '  Maya  ',
      email: '  MAYA@Example.COM  ',
      source: ' cpn_landing ',
      form_type: ' free_ai ',
      source_id: '42',
      entry_point_id: '7',
      utm_source: ' newsletter ',
      utm_campaign: ' oct ',
      page_url: 'https://cpn.example.com/ai',
      referrer: 'https://google.com/',
      visitor_id: ' vis-1 ',
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.full_name).toBe('Maya');
    expect(r.data.source).toBe('cpn_landing');
    // Numeric ids arrive as strings from a form post and are coerced.
    expect(r.data.source_id).toBe(42);
    expect(r.data.entry_point_id).toBe(7);
  });
});

describe('T204 — acquisition evidence reaches the lead', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findAll.mockResolvedValue([]);
    create.mockImplementation(async (attrs: any) => ({ id: 'enr-1', ...attrs }));
    findOrCreate.mockResolvedValue([{ id: 1 }, true]);
  });

  const acquisition = {
    source: 'cpn_landing',
    form_type: 'free_ai',
    source_id: 42,
    entry_point_id: 7,
    utm_source: 'newsletter',
    utm_campaign: 'oct',
    page_url: 'https://cpn.example.com/ai',
    referrer: 'https://google.com/',
    visitor_id: 'vis-1',
  };

  it.each(Object.entries(acquisition))('lands %s on the lead', async (key, value) => {
    await createFreeAccount({ full_name: 'Maya', email: 'maya@example.com', programme: 'learner', acquisition });
    expect(leadDefaults()[key]).toBe(value);
  });

  /**
   * ORIGIN BRAND IS NOT JOURNEY OWNERSHIP — the requirement in one test.
   *
   * A signup whose source belongs to another brand still becomes an Explorer. The
   * brand is reachable from the lead's `source_id`; the programme is on the
   * enrollment. Nothing about arriving from a non-learner brand's page prevents or
   * alters the learner programme.
   */
  it('a non-learner origin brand still produces a learner account, with the origin preserved', async () => {
    await createFreeAccount({
      full_name: 'Maya',
      email: 'maya@example.com',
      programme: 'learner',
      acquisition: { source: 'ai_flotation_intake', source_id: 99, page_url: 'https://aiflotation.example/x' },
    });

    // The programme is on the enrollment …
    const enrollment = create.mock.calls[0][0];
    expect(enrollment.enrollment_type).toBe('explorer');
    expect(enrollment.tier).toBe('guest');
    // … and the origin is on the lead, untouched by it.
    expect(leadDefaults().source).toBe('ai_flotation_intake');
    expect(leadDefaults().source_id).toBe(99);
    // And no brand is written anywhere on the signup: it is derived from
    // `source_id` → `LeadSource.brand_id`, so there is no second copy to drift.
    expect(Object.keys(leadDefaults())).not.toContain('brand_id');
    expect(Object.keys(enrollment)).not.toContain('brand_id');
  });

  it('an absent payload records nulls, not defaults — absent means not known', async () => {
    await createFreeAccount({ full_name: 'Maya', email: 'maya@example.com', programme: 'learner' });

    const d = leadDefaults();
    for (const key of ['source_id', 'entry_point_id', 'utm_source', 'utm_campaign', 'page_url', 'referrer', 'visitor_id']) {
      expect(d[key]).toBeNull();
    }
  });

  it('falls back to free_signup for source when none is supplied, keeping those rows excludable', async () => {
    await createFreeAccount({ full_name: 'Maya', email: 'maya@example.com', programme: 'learner' });

    expect(leadDefaults().source).toBe('free_signup');
    expect(leadDefaults().form_type).toBe('free_signup');
  });

  it('still signs the person in when lead capture throws — acquisition is best-effort', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    findOrCreate.mockRejectedValue(new Error('crm down'));

    const res = await createFreeAccount({
      full_name: 'Maya', email: 'maya@example.com', programme: 'learner', acquisition,
    });

    expect(res.jwt).toBe('jwt');
    expect(res.enrollment.id).toBe('enr-1');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
