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
jest.mock('../../config/env', () => ({
  // `databaseUrl` is here because the real `Lead` model is imported below and its
  // module graph builds a Sequelize instance. Constructing one parses the URL but
  // opens no connection, so this suite still touches no database.
  env: { jwtSecret: 'test-secret', databaseUrl: 'postgres://u:p@localhost:5432/test' },
}));
jest.mock('../participantService', () => ({ signParticipantJwt: () => 'jwt' }));
jest.mock('../reese/reeseWelcomeService', () => ({ maybeSendWelcomes: jest.fn() }), { virtual: true });

import { createFreeAccount } from '../freeSignupService';
// The REAL model, not the mock above. `jest.mock('../../models')` replaces the
// barrel; importing the model file directly gives the genuine Sequelize class, and
// that is the point of the shape tests below.
import LeadModel from '../../models/Lead';
import LeadSourceModel from '../../models/LeadSource';

/**
 * Phase 2 T204 — acquisition evidence on the portal free-signup path, and a schema
 * at the unauthenticated boundary.
 *
 * WHY THIS SUITE WAS REWRITTEN, because the first version shipped a real defect
 * while passing 25 of 25.
 *
 * Its nine headline assertions read `findOrCreate.mock.calls[0][0].defaults` — the
 * argument object the service had just built. That cannot distinguish "written to
 * the Lead" from "handed to a mock", and one of the nine asserted a field that
 * **provably could not land**: `Lead` has no `referrer` column, so Sequelize
 * silently dropped the key. Behavioural in form, satisfiable by its own fixture in
 * substance — the fourth appearance of that class in this phase, and the first
 * inside a test I had called behavioural.
 *
 * Worse, the schema disagreed with the model on **six of nine fields**. `source_id`
 * and `entry_point_id` are `DataTypes.UUID`; the schema coerced them to positive
 * integers, so the endpoint accepted exactly the values that can never join to a
 * `LeadSource` row and rejected the only ones that could. Since
 * `captureGuestAsLead` swallows its errors, a caller supplying `source_id` would
 * have **lost the entire lead row** on a live public path where a lead was
 * previously always created.
 *
 * So the shape assertions now go through the real `Lead` model. A field the model
 * does not have fails, rather than passing because a mock accepted it.
 */
const leadDefaults = () => findOrCreate.mock.calls[0][0].defaults as Record<string, unknown>;

/** A real LeadSource/EntryPoint/Visitor id is a UUID, so fixtures use UUIDs. */
const SOURCE_ID = '11111111-1111-4111-8111-111111111111';
const ENTRY_POINT_ID = '22222222-2222-4222-8222-222222222222';
const VISITOR_ID = '33333333-3333-4333-8333-333333333333';

const acquisition = {
  source: 'cpn_landing',
  form_type: 'free_ai',
  source_id: SOURCE_ID,
  entry_point_id: ENTRY_POINT_ID,
  utm_source: 'newsletter',
  utm_campaign: 'oct',
  page_url: 'https://cpn.example.com/ai',
  visitor_id: VISITOR_ID,
};

describe('T204 — the schema agrees with the Lead model it writes', () => {
  /**
   * The test the first version needed and did not have. Every field the service
   * writes must be an attribute the real model actually has — otherwise Sequelize
   * drops it and nothing anywhere notices.
   */
  it('every field the service writes is a real Lead attribute', async () => {
    jest.clearAllMocks();
    findAll.mockResolvedValue([]);
    create.mockImplementation(async (attrs: any) => ({ id: 'enr-1', ...attrs }));
    findOrCreate.mockResolvedValue([{ id: 1 }, true]);

    await createFreeAccount({ full_name: 'Maya', email: 'maya@example.com', programme: 'learner', acquisition });

    const written = Object.keys(leadDefaults());
    const modelAttributes = Object.keys(LeadModel.getAttributes());
    const notOnTheModel = written.filter((k) => !modelAttributes.includes(k));
    expect(notOnTheModel).toEqual([]);
  });

  /**
   * The companion to the attribute check above, and a different claim. That one proves
   * no written key is missing from the model; this one proves the model ACCEPTS AND
   * RETAINS each value — a UUID string stays the UUID string, rather than being
   * coerced or dropped by a setter on the way in.
   */
  it('the real Lead model retains every value the service writes', async () => {
    jest.clearAllMocks();
    findAll.mockResolvedValue([]);
    create.mockImplementation(async (attrs: any) => ({ id: 'enr-1', ...attrs }));
    findOrCreate.mockResolvedValue([{ id: 1 }, true]);

    await createFreeAccount({ full_name: 'Maya', email: 'maya@example.com', programme: 'learner', acquisition });

    const built = LeadModel.build(leadDefaults() as any);
    for (const [key, value] of Object.entries(acquisition)) {
      expect(built.dataValues[key as keyof typeof built.dataValues]).toBe(value);
    }
    expect(built.dataValues.source_id).toBe(SOURCE_ID);
  });

  it('and the model really does lack a referrer column, which is why none is written', () => {
    // Stated as a test so the omission reads as deliberate rather than forgotten.
    // The repo's convention for this fact is `referrer_url` on Visitor/VisitorSession.
    expect(Object.keys(LeadModel.getAttributes())).not.toContain('referrer');
  });

  it.each([
    ['source_id', SOURCE_ID],
    ['entry_point_id', ENTRY_POINT_ID],
    ['visitor_id', VISITOR_ID],
  ])('%s accepts a UUID, because the column is a UUID', (field, value) => {
    const r = portalFreeSignupSchema.safeParse({ full_name: 'Maya', email: 'a@b.co', [field]: value });
    expect(r.success).toBe(true);
  });

  it.each(['source_id', 'entry_point_id', 'visitor_id'])(
    '%s rejects an integer — the value the first draft accepted and the column cannot store',
    (field) => {
      expect(portalFreeSignupSchema.safeParse({ full_name: 'Maya', email: 'a@b.co', [field]: 42 }).success)
        .toBe(false);
    },
  );

  /**
   * THE WIDTHS ARE DERIVED FROM THE MODEL, not hand-copied from it.
   *
   * A comment saying "STRING(50)" next to `max(50)` is two numbers that agree today
   * and have no mechanism to keep agreeing. Reading the width off the real column
   * means the test fails if either side moves: widen the schema and the over-limit
   * case passes validation; narrow the column and the at-limit case stops. That is
   * the lesson of this task expressed as a check rather than as prose.
   */
  /**
   * One typed accessor for both helpers below. `getAttributes()` returns a type keyed
   * by the model's literal column names, so indexing it with a plain `string` is a
   * TS7053 error — which is how it was written at first, and which NOTHING in this
   * repo would have caught: `tsconfig.json` excludes every `__tests__` directory and
   * `.test.ts` file, and `jest.config.ts` sets ts-jest `isolatedModules: true`, so
   * test files are transpiled WITHOUT being type-checked. Found only by typechecking
   * these two files against a temporary config on purpose.
   *
   * (The first version of this very comment wrote that exclude as a glob, whose `**`
   * followed by a slash closes a block comment early and turned the next word into
   * code. Same lesson twice in one helper: run the check, do not reason about it.)
   */
  const columnType = (field: string): { key?: string; options?: { length?: number } } | undefined => {
    const attrs = LeadModel.getAttributes() as Record<string, { type?: unknown } | undefined>;
    return attrs[field]?.type as { key?: string; options?: { length?: number } } | undefined;
  };

  const stringWidth = (field: string): number => {
    // Sequelize exposes a STRING's length on the type's options.
    const len = columnType(field)?.options?.length;
    if (typeof len !== 'number') throw new Error(`${field} is not a sized STRING column`);
    return len;
  };

  it.each(['source', 'form_type', 'utm_source', 'utm_campaign'])(
    '%s caps at exactly the width the column declares',
    (field) => {
      const width = stringWidth(field);
      expect(portalFreeSignupSchema.safeParse({
        full_name: 'Maya', email: 'a@b.co', [field]: 'x'.repeat(width),
      }).success).toBe(true);
      expect(portalFreeSignupSchema.safeParse({
        full_name: 'Maya', email: 'a@b.co', [field]: 'x'.repeat(width + 1),
      }).success).toBe(false);
    },
  );

  it('page_url caps at the column width too, not at 2048 as the first draft allowed', () => {
    const width = stringWidth('page_url');
    const url = (n: number) => `https://x.io/${'a'.repeat(n - 13)}`;
    expect(portalFreeSignupSchema.safeParse({ full_name: 'Maya', email: 'a@b.co', page_url: url(width) }).success)
      .toBe(true);
    expect(portalFreeSignupSchema.safeParse({ full_name: 'Maya', email: 'a@b.co', page_url: url(width + 1) }).success)
      .toBe(false);
  });

  /**
   * The IDENTITY fields get the same treatment, and they are the reason this check is
   * worth having rather than being a flourish. I fixed the eight acquisition fields
   * against the model and then still had `email` capped at the RFC's 320 while
   * `Lead.email` and `Enrollment.email` are both `STRING(255)` — the very same
   * wider-than-the-column defect, surviving in a field I had not thought to re-check
   * because it was not new. Derivation catches what attention does not.
   */
  it('email caps at its column width, not at the RFC maximum', () => {
    const width = stringWidth('email');
    const local = (n: number) => `${'a'.repeat(n - 6)}@b.com`;
    expect(portalFreeSignupSchema.safeParse({ full_name: 'Maya', email: local(width) }).success).toBe(true);
    expect(portalFreeSignupSchema.safeParse({ full_name: 'Maya', email: local(width + 1) }).success).toBe(false);
  });

  it('full_name caps at the width of the column it is written to', () => {
    // `Lead.name` and `Enrollment.full_name` are both STRING(255); `Lead.name` is the
    // one this service writes, so it is the one the test reads.
    const width = stringWidth('name');
    expect(portalFreeSignupSchema.safeParse({ full_name: 'x'.repeat(width), email: 'a@b.co' }).success).toBe(true);
    expect(portalFreeSignupSchema.safeParse({ full_name: 'x'.repeat(width + 1), email: 'a@b.co' }).success).toBe(false);
  });


  it.each(['source_id', 'entry_point_id', 'visitor_id'])(
    '%s is a UUID column, which is why the schema demands a UUID',
    (field) => {
      // The positive control for the three "rejects an integer" cases above: those
      // would also pass if the column were something else entirely and the schema
      // were simply strict for no reason.
      expect(columnType(field)?.key).toBe('UUID');
    },
  );
});

describe('T204 — the schema at the unauthenticated boundary', () => {
  /**
   * THE DEPLOY GUARD. `frontend/src/services/onboardingApi.ts` declares
   * `freeSignup(body: { full_name: string; email: string })` and
   * `PortalFreeSignupPage.tsx` is its only caller, passing exactly those two trimmed
   * strings and nothing else. That is the whole live request shape, which is what
   * makes `.strict()` safe to add to an endpoint already in production — and this test
   * is where that stops being an argument and becomes a check.
   */
  it('accepts exactly the body the portal page sends today, and nothing it does not', () => {
    expect(portalFreeSignupSchema.safeParse({ full_name: 'Maya', email: 'maya@example.com' }).success)
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
    ['a missing email', { full_name: 'Maya' }],
    ['a missing name', { email: 'a@b.co' }],
    ['an empty name', { full_name: '', email: 'a@b.co' }],
    ['a numeric email', { full_name: 'Maya', email: 123 }],
    ['a null email', { full_name: 'Maya', email: null }],
    // `!full_name` rejected 0 before, so it must still be rejected rather than
    // becoming the name "0". A union of string|number alone WIDENS the endpoint here,
    // which is the opposite of the claim the first draft made about this change.
    ['a zero name', { full_name: 0, email: 'a@b.co' }],
    ['a NaN name', { full_name: NaN, email: 'a@b.co' }],
  ])('returns the legacy required message for %s', (_label, body) => {
    const r = portalFreeSignupSchema.safeParse(body);
    expect(r.success).toBe(false);
    expect(!r.success && r.error.issues[0].message).toBe('full_name and email are required');
  });

  it('still accepts a NUMERIC full_name, which the old String() coercion allowed', () => {
    // A number is not a name, but it was accepted before and this is a live public
    // endpoint: tightening it is a separate decision from adding fields.
    const r = portalFreeSignupSchema.safeParse({ full_name: 123, email: 'a@b.co' });
    expect(r.success).toBe(true);
    expect(r.success && r.data.full_name).toBe('123');
  });

  it('returns the legacy invalid-email message for a malformed address', () => {
    const r = portalFreeSignupSchema.safeParse({ full_name: 'Maya', email: 'not-an-email' });
    expect(r.success).toBe(false);
    expect(!r.success && r.error.issues[0].message).toBe('A valid email is required');
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
    expect(portalFreeSignupSchema.safeParse({ full_name: 'Maya', email: 'a@b.co', page_url }).success)
      .toBe(false);
  });

  it('still accepts the schemes a real signup arrives with', () => {
    for (const page_url of ['https://cpn.example.com/ai', 'http://localhost:3000/enroll']) {
      expect(portalFreeSignupSchema.safeParse({ full_name: 'Maya', email: 'a@b.co', page_url }).success)
        .toBe(true);
    }
  });

  it('rejects an unexpected key — a probe or a client bug, not something to ignore', () => {
    // Notably this blocks a caller trying to CHOOSE its own programme, which is a
    // server-side decision: this path is always 'learner'.
    expect(portalFreeSignupSchema.safeParse({
      full_name: 'Maya', email: 'a@b.co', programme: 'learner',
    }).success).toBe(false);
  });

  it.each(['__proto__', 'constructor', 'prototype'])('rejects the prototype-pollution key %s', (key) => {
    expect(portalFreeSignupSchema.safeParse({ full_name: 'Maya', email: 'a@b.co', [key]: 'x' }).success)
      .toBe(false);
  });

  it.each([
    ['an array for a string', { full_name: 'Maya', email: 'a@b.co', utm_source: ['x'] }],
    ['an object for a string', { full_name: 'Maya', email: 'a@b.co', utm_source: { x: 1 } }],
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
    ['full_name over 255 — the column is STRING(255)', { full_name: 'x'.repeat(256), email: 'a@b.co' }],
    ['email over 320', { full_name: 'Maya', email: `${'x'.repeat(320)}@b.co` }],
    ['an unexpected key, previously ignored', { full_name: 'Maya', email: 'a@b.co', nope: 1 }],
    ['full_name as an object — the old code stored "[object Object]"', { full_name: {}, email: 'a@b.co' }],
    ['full_name as a boolean', { full_name: true, email: 'a@b.co' }],
    ['full_name as an array', { full_name: [], email: 'a@b.co' }],
  ])('NARROWER than before, deliberately: rejects %s', (_label, body) => {
    expect(portalFreeSignupSchema.safeParse(body).success).toBe(false);
  });

  it('trims what it accepts', () => {
    const r = portalFreeSignupSchema.safeParse({
      full_name: '  Maya  ', email: '  MAYA@Example.COM  ', source: ' cpn_landing ',
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.full_name).toBe('Maya');
    expect(r.data.source).toBe('cpn_landing');
  });
});

describe('T204 — acquisition evidence reaches the lead', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findAll.mockResolvedValue([]);
    create.mockImplementation(async (attrs: any) => ({ id: 'enr-1', ...attrs }));
    findOrCreate.mockResolvedValue([{ id: 1 }, true]);
  });

  it.each(Object.entries(acquisition))('lands %s on the lead', async (key, value) => {
    await createFreeAccount({ full_name: 'Maya', email: 'maya@example.com', programme: 'learner', acquisition });
    expect(leadDefaults()[key]).toBe(value);
  });

  /**
   * ORIGIN BRAND IS NOT JOURNEY OWNERSHIP — the requirement in one test.
   *
   * A signup whose source belongs to another brand still becomes an Explorer. The
   * brand is reachable from the lead's `source_id`; the programme is on the
   * enrollment. The `source_id` here is a UUID, because that is what `LeadSource.id`
   * is — the first version used `99`, a value no `LeadSource` will ever carry, which
   * made the derivation this criterion rests on impossible.
   */
  it('a non-learner origin brand still produces a learner account, with the origin preserved', async () => {
    await createFreeAccount({
      full_name: 'Maya',
      email: 'maya@example.com',
      programme: 'learner',
      acquisition: {
        source: 'ai_flotation',
        source_id: SOURCE_ID,
        page_url: 'https://aiflotation.example/x',
      },
    });

    const enrollment = create.mock.calls[0][0];
    expect(enrollment.enrollment_type).toBe('explorer');
    expect(enrollment.tier).toBe('guest');

    expect(leadDefaults().source).toBe('ai_flotation');
    expect(leadDefaults().source_id).toBe(SOURCE_ID);
    // No brand anywhere: it is derived via `source_id` → `LeadSource.brand_id`, so
    // there is no second copy to drift.
    expect(Object.keys(leadDefaults())).not.toContain('brand_id');
    expect(Object.keys(enrollment)).not.toContain('brand_id');
  });

  /**
   * AC2's derivation, checked against the real models instead of asserted in a comment.
   *
   * "Origin brand is derived, never stored twice" is only true if the path exists and
   * the duplicate does not. Both halves are read off the models here: `LeadSource`
   * carries a `brand_id` UUID for `Lead.source_id` to reach, and `Lead` carries no
   * brand column of its own. Attempt 1 wrote `source_id: 99` into an integer field,
   * which made this path untraversable while the prose claimed it as the mechanism.
   */
  it('the brand really is reachable from source_id, and is not duplicated onto the Lead', () => {
    const sourceAttrs = LeadSourceModel.getAttributes();
    const brand = sourceAttrs.brand_id;
    expect(brand).toBeDefined();
    expect((brand?.type as unknown as { key?: string })?.key).toBe('UUID');
    // The id `Lead.source_id` points at, same type, so the join is actually possible.
    expect((sourceAttrs.id?.type as unknown as { key?: string })?.key).toBe('UUID');
    expect((LeadModel.getAttributes().source_id?.type as unknown as { key?: string })?.key).toBe('UUID');

    // And no second copy anywhere on the Lead to drift out of agreement.
    const leadKeys = Object.keys(LeadModel.getAttributes());
    expect(leadKeys.filter((k) => k.includes('brand'))).toEqual([]);
  });

  it('an absent payload records nulls, not defaults — absent means not known', async () => {
    await createFreeAccount({ full_name: 'Maya', email: 'maya@example.com', programme: 'learner' });

    const d = leadDefaults();
    for (const key of ['source_id', 'entry_point_id', 'utm_source', 'utm_campaign', 'page_url', 'visitor_id']) {
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
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
