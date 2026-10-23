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

// The CRM push this path was missing. Mocked because the real module reaches
// settingsService and then Sequelize; asserted below because the absence of this
// call IS the defect - 112 production leads with no `ghl_contact_id`.
const syncNewLeadToGhl = jest.fn();
jest.mock('../ghlService', () => ({ syncNewLeadToGhl: (...a: unknown[]) => syncNewLeadToGhl(...a) }));

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

    // THE ASSOCIATION ITSELF, which is strictly stronger than three column types
    // agreeing by coincidence. `models/index.ts` declares
    // `Lead.belongsTo(LeadSource, { foreignKey: 'source_id', as: 'leadSource' })`, so
    // the path is a DECLARED RELATION rather than an inference from matching types.
    //
    // `requireActual` is needed because associations are wired in the barrel, and this
    // suite mocks the barrel for the service under test. Importing `models/Lead`
    // directly gives the real class but never runs the wiring — which is exactly how
    // this assertion failed the first time it was written, and is worth knowing: a
    // model imported in isolation has NO associations at all.
    const realModels = jest.requireActual('../../models') as {
      Lead: { associations: Record<string, { target: unknown; foreignKey?: string }> };
      LeadSource: unknown;
    };
    const assoc = realModels.Lead.associations.leadSource;
    expect(assoc).toBeDefined();
    expect(assoc.target).toBe(realModels.LeadSource);
    expect(assoc.foreignKey).toBe('source_id');

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

  /**
   * THE LIMITATION OF THIS TASK, pinned as a test so it is documented rather than
   * discovered. Found by a verifier, not by me.
   *
   * `findOrCreate` applies `defaults` **only when it creates**. So for an email that
   * ALREADY has a lead row — a prior contact form, a download, an open-house
   * registration — this signup records no acquisition evidence at all. The service
   * docblock cites 88% of guest enrolments matching no lead; the gap is closed for
   * that 88% and untouched for the rest.
   *
   * It is left that way ON PURPOSE rather than fixed here. Overwriting would replace
   * first-touch attribution with latest-touch, which destroys the very thing the
   * requirement calls for — origin preserved, chronological order kept. The place for a
   * second touch is a chronological evidence record, which is T211's evidence package,
   * not a mutation of the first one. Filling only the NULL columns was the tempting
   * middle path and is also wrong: setting `source_id` on an old lead silently rewrites
   * which brand that person appears to have originated from.
   */
  it('writes NO acquisition evidence when the lead already exists, by design', async () => {
    // `created: false` from findOrCreate — the row was found, not made. The instance
    // carries a spy `update` so an attempted backfill would be visible.
    const existingLeadUpdate = jest.fn();
    findOrCreate.mockResolvedValue([{ id: 1, source: 'contact_form', update: existingLeadUpdate }, false]);

    await createFreeAccount({ full_name: 'Maya', email: 'maya@example.com', programme: 'learner', acquisition });

    // The load-bearing half: the service makes NO attempt to write onto the found row.
    // `created === false` alone would only be my own fixture talking, but `update`
    // never being called is a fact about the service — so if someone later adds a
    // backfill here, this test fails and they have to come and change the reasoning
    // above rather than quietly reversing the decision.
    expect(existingLeadUpdate).not.toHaveBeenCalled();
    expect(findOrCreate).toHaveBeenCalledTimes(1);
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

/**
 * The CRM push, which this path did not have.
 *
 * Measured on production 2026-10-23: of 112 leads from the first paid ad campaign,
 * ZERO carried a `ghl_contact_id`. Every other capture path in the codebase syncs -
 * adminLeadController, calendarController, apolloService, csvImportService and
 * enrollmentService - and this one, the path every landing-page CTA points at,
 * silently did not. `enrollmentService` already carries a docblock about the exact
 * same omission costing 490 open-house leads, so this is the second occurrence,
 * which is why it is now asserted rather than left to the next reader to notice.
 */
describe('the new lead reaches the CRM', () => {
  const acquisition = { source: 'free_signup', form_type: 'free_signup' };

  beforeEach(() => {
    jest.clearAllMocks();
    findAll.mockResolvedValue([]);
    create.mockImplementation(async (attrs: any) => ({ id: 'enr-1', ...attrs }));
    findOrCreate.mockResolvedValue([{ id: 'lead-1' }, true]);
  });

  it('hands the lead row to the routing-aware sync', async () => {
    await createFreeAccount({ full_name: 'Maya', email: 'maya@example.com', programme: 'learner', acquisition });

    expect(syncNewLeadToGhl).toHaveBeenCalledTimes(1);
    // The LEAD, not the enrollment and not an email: routing resolves the
    // destination account from the lead's source.
    expect(syncNewLeadToGhl).toHaveBeenCalledWith({ id: 'lead-1' });
  });

  it('still creates the account when the CRM sync rejects', async () => {
    // Fire-and-forget, like every other call site. A CRM outage must never cost
    // somebody their account - that trade is the whole reason this is best-effort.
    syncNewLeadToGhl.mockRejectedValueOnce(new Error('GHL 500'));

    const result = await createFreeAccount({
      full_name: 'Maya', email: 'maya@example.com', programme: 'learner', acquisition,
    });

    expect(result).toBeTruthy();
    expect(syncNewLeadToGhl).toHaveBeenCalled();
  });

  it('syncs a returning guest too, because the first attempt may have been withheld', async () => {
    // findOrCreate reports created=false for someone who signed up before. Their
    // lead may still have no GHL contact - which is exactly the state the 112 are
    // in - so the push is attempted on reuse rather than only on first creation.
    findOrCreate.mockResolvedValue([{ id: 'lead-existing' }, false]);

    await createFreeAccount({ full_name: 'Maya', email: 'maya@example.com', programme: 'learner', acquisition });

    expect(syncNewLeadToGhl).toHaveBeenCalledWith({ id: 'lead-existing' });
  });
});
