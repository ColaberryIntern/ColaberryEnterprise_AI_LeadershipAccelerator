/**
 * R22 — the medium has to survive the whole way to the column, and nothing used to notice when
 * it did not.
 *
 * `createLead` does not spread its input. It writes an EXPLICIT field list to `Lead.create`, and
 * its input type is `z.infer<typeof leadSchema>`. So a UTM field needs three separate things to
 * land: a key on `leadSchema`, a line in that field list, and an attribute on the model. Miss any
 * one and Sequelize drops the value in silence — no throw, no warning, a 200 to the caller, and a
 * NULL column.
 *
 * That is not hypothetical. `utm_medium` was missing from the first two for as long as the column
 * existed: C10.4 added `leads.utm_medium` specifically so "NEW rows can carry a medium as a value
 * rather than as half of a string", and every writer kept dropping it, so the signup form went on
 * packing it into `utm_source` as `fb|paid`. Measured on production 2026-11-18: 25,036 of 25,596
 * leads had a NULL medium, and 135 carried a packed source instead, splitting one Facebook channel
 * into two report lines (385 leads as 315 + 70).
 *
 * The last test is the one that matters most. It does not name `utm_medium`: it derives the UTM
 * fields from `leadSchema` and fails for ANY of them that the schema accepts, the model can store,
 * and `createLead` still fails to write. A fourth UTM field added to the schema alone would be
 * caught by it without anybody remembering to extend this file.
 */

const mockFindOne = jest.fn();
const mockFindAll = jest.fn();
const mockCreate = jest.fn();

jest.mock('../../models/Lead', () => ({
  __esModule: true,
  default: {
    findOne: (...args: any[]) => mockFindOne(...args),
    findAll: (...args: any[]) => mockFindAll(...args),
    create: (...args: any[]) => mockCreate(...args),
  },
}));

jest.mock('../../models', () => ({
  AdminUser: {},
  AutomationLog: { create: jest.fn() },
  Campaign: { findOne: jest.fn().mockResolvedValue(null) },
  FollowUpSequence: { findOne: jest.fn().mockResolvedValue(null) },
}));

jest.mock('../sequenceService', () => ({ enrollLeadInSequence: jest.fn() }));

// `databaseUrl` because the REAL Lead model is loaded below for the attribute checks, and its
// module graph builds a Sequelize instance. Constructing one parses the URL and opens no
// connection, so this suite still touches no database.
jest.mock('../../config/env', () => ({
  env: { jwtSecret: 'test-secret', databaseUrl: 'postgres://u:p@localhost:5432/test' },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLead, leadSchema } = require('../leadService');

/**
 * The GENUINE model, not the mock above. `jest.mock` replaced the module, so the real class has to
 * be required past it — the same reason `freeSignupAcquisition.test.ts` imports the model file
 * directly. A field asserted against the mock would pass however wrong it was.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const RealLead = jest.requireActual('../../models/Lead').default;

const SUBMISSION = {
  name: 'Jane Doe',
  email: 'jane@example.com',
  phone: '',
  utm_source: 'fb',
  utm_medium: 'paid',
  utm_campaign: 'nov_launch',
  page_url: 'https://colaberry.ai/enroll',
};

const written = (): Record<string, unknown> => mockCreate.mock.calls[0][0];

beforeEach(() => {
  jest.clearAllMocks();
  mockFindAll.mockResolvedValue([]);
  // No recent duplicate, no existing email, no phone match: the insert path.
  mockFindOne.mockResolvedValue(null);
  mockCreate.mockImplementation(async (values: any) => ({ id: 999, ...values, update: jest.fn() }));
});

describe('createLead carries utm_medium to the column', () => {
  it('writes the medium it was given', async () => {
    await createLead(leadSchema.parse(SUBMISSION));
    expect(written().utm_medium).toBe('paid');
  });

  it('writes it alongside the source rather than inside it', async () => {
    await createLead(leadSchema.parse(SUBMISSION));
    expect(written()).toMatchObject({ utm_source: 'fb', utm_medium: 'paid' });
    // The defect this replaces: one column holding both values, joined by a pipe.
    expect(String(written().utm_source)).not.toContain('|');
  });

  it('writes an empty medium when none was supplied, never a value nobody sent', async () => {
    await createLead(leadSchema.parse({ name: 'Jane', email: 'jane@example.com' }));
    expect(written().utm_medium).toBe('');
  });

  it('every key it writes is a real Lead attribute, so none is silently dropped', async () => {
    await createLead(leadSchema.parse(SUBMISSION));
    const attributes = Object.keys(RealLead.getAttributes());
    expect(Object.keys(written()).filter((k) => !attributes.includes(k))).toEqual([]);
  });

  it('the real model retains the medium: it is stored, not coerced away', async () => {
    await createLead(leadSchema.parse(SUBMISSION));
    expect(RealLead.build(written() as any).dataValues.utm_medium).toBe('paid');
  });
});

describe('leadSchema agrees with the column it writes', () => {
  const width = (field: string): number => {
    const attrs = RealLead.getAttributes() as Record<string, { type?: { options?: { length?: number } } }>;
    const len = attrs[field]?.type?.options?.length;
    if (typeof len !== 'number') throw new Error(`${field} is not a sized STRING column`);
    return len;
  };

  // Derived from the model rather than hand-copied, so the test fails if either side moves.
  it('caps utm_medium at exactly the width the column declares', () => {
    const n = width('utm_medium');
    expect(leadSchema.safeParse({ ...SUBMISSION, utm_medium: 'x'.repeat(n) }).success).toBe(true);
    expect(leadSchema.safeParse({ ...SUBMISSION, utm_medium: 'x'.repeat(n + 1) }).success).toBe(false);
  });

  /**
   * THE GUARD, and the only test here that would catch the NEXT field instead of this one.
   *
   * It names no UTM field. It asks the schema which ones it accepts, keeps those the model can
   * actually store, and fails for any that `createLead` does not write — which is precisely the
   * state `utm_medium` was in: accepted at the boundary, storable by the model, dropped in between.
   */
  it('every storable UTM field the schema accepts is one createLead actually writes', async () => {
    const attributes = Object.keys(RealLead.getAttributes());
    const utmFields = Object.keys(leadSchema.shape)
      .filter((k) => k.startsWith('utm_'))
      .filter((k) => attributes.includes(k));

    // A guard over an empty list proves nothing, so assert the list is real first.
    expect(utmFields).toEqual(expect.arrayContaining(['utm_source', 'utm_medium', 'utm_campaign']));

    const probe = Object.fromEntries(utmFields.map((k) => [k, `value-${k}`]));
    await createLead(leadSchema.parse({ ...SUBMISSION, ...probe }));

    const row = written();
    expect(utmFields.filter((k) => row[k] !== `value-${k}`)).toEqual([]);
  });
});
