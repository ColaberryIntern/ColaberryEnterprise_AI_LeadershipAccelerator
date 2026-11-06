/**
 * The two hire settings and their schema. Availability is the LEARNER's own words and
 * spotlight is an ADMIN's endorsement; both are idempotent single-row writes, and the
 * schema that adds their columns must stay additive and re-runnable.
 */
jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import { sequelize } from '../../../config/database';
import { availabilitySchema, readHireListingSettings, setHireAvailability, setHireSpotlight } from '../hireListingSettings';
import { HIRE_LISTING_STATEMENTS } from '../../../db/ensureCareerPublicationSchema';

const mockQuery = sequelize.query as unknown as jest.Mock;
const E1 = '11111111-1111-4111-8111-111111111111';

beforeEach(() => mockQuery.mockReset());

describe('availabilitySchema - self-reported, never inferred', () => {
  it('accepts a known status with a label, and an explicit null to clear it', () => {
    expect(availabilitySchema.safeParse({ status: 'open', label: 'Open to FDE roles' }).success).toBe(true);
    expect(availabilitySchema.safeParse(null).success).toBe(true);
  });

  it('refuses an unknown status, an empty or 81-char label, extra fields, and an empty object', () => {
    for (const bad of [
      { status: 'busy', label: 'x' }, { status: 'open', label: '' }, { status: 'open', label: 'x'.repeat(81) },
      { status: 'open', label: 'x', hoursPerWeek: 20 }, {}, undefined,
    ]) expect(availabilitySchema.safeParse(bad).success).toBe(false);
  });
});

describe('the writes', () => {
  it('sets availability on the caller\'s own row, by bind, and reads it back', async () => {
    mockQuery.mockResolvedValueOnce([[{ availability_status: 'open', availability_label: 'Open', hire_spotlight: false }]]);
    expect(await setHireAvailability(E1, { status: 'open', label: 'Open' }))
      .toEqual({ availability: { status: 'open', label: 'Open' }, spotlight: false });
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/UPDATE career_portfolio_pages[\s\S]*WHERE enrollment_id = \$1/);
    expect(opts).toEqual({ bind: [E1, 'open', 'Open'] });
  });

  it('clears availability with nulls', async () => {
    mockQuery.mockResolvedValueOnce([[{ availability_status: null, availability_label: null, hire_spotlight: true }]]);
    expect(await setHireAvailability(E1, null)).toEqual({ availability: null, spotlight: true });
    expect(mockQuery.mock.calls[0][1]).toEqual({ bind: [E1, null, null] });
  });

  it('sets the spotlight flag and nothing else', async () => {
    mockQuery.mockResolvedValueOnce([[{ availability_status: null, availability_label: null, hire_spotlight: true }]]);
    await setHireSpotlight(E1, true);
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/SET hire_spotlight = \$2, updated_at = NOW\(\)/);
    expect(sql).not.toMatch(/availability_(status|label)\s*=/); // an admin never edits the learner's words
    expect(opts).toEqual({ bind: [E1, true] });
  });

  it('answers 404 when the learner has no portfolio page yet', async () => {
    mockQuery.mockResolvedValue([[]]);
    await expect(setHireAvailability(E1, null)).rejects.toMatchObject({ status: 404 });
    await expect(setHireSpotlight(E1, true)).rejects.toMatchObject({ status: 404 });
    await expect(readHireListingSettings(E1)).rejects.toMatchObject({ status: 404 });
  });

  it('never reports half an availability (a status without a label is none)', async () => {
    mockQuery.mockResolvedValueOnce([[{ availability_status: 'open', availability_label: null, hire_spotlight: false }]]);
    expect((await readHireListingSettings(E1)).availability).toBeNull();
  });
});

describe('the schema is additive and re-runnable', () => {
  it('only ever adds: IF NOT EXISTS on every statement, no DROP, no ALTER ... TYPE', () => {
    expect(HIRE_LISTING_STATEMENTS.length).toBe(4);
    for (const sql of HIRE_LISTING_STATEMENTS) {
      expect(sql).toMatch(/IF NOT EXISTS/);
      expect(sql).not.toMatch(/\bDROP\b|\bTYPE\b|\bRENAME\b/i);
    }
  });

  it('adds nullable availability columns and a default-false spotlight', () => {
    const all = HIRE_LISTING_STATEMENTS.join('\n');
    expect(all).toMatch(/ADD COLUMN IF NOT EXISTS availability_status VARCHAR\(20\)`?$/m);
    expect(all).toMatch(/ADD COLUMN IF NOT EXISTS availability_label VARCHAR\(80\)/);
    expect(all).toMatch(/ADD COLUMN IF NOT EXISTS hire_spotlight BOOLEAN NOT NULL DEFAULT false/);
  });

  it('keys the intro dedupe table on the hash alone, storing no email or name', () => {
    const table = HIRE_LISTING_STATEMENTS.find((s) => /hire_intro_requests/.test(s)) || '';
    expect(table).toMatch(/idempotency_key CHAR\(64\) PRIMARY KEY/);
    expect(table).not.toMatch(/email|name\b/i);
  });
});
