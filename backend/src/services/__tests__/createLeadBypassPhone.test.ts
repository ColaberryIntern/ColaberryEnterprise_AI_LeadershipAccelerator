/**
 * The test-bypass phone must never be able to violate the email unique index.
 *
 * `TEST_BYPASS_PHONES` exists so one tester can re-run the full lead flow instead of being
 * deduped away on the second submission. It used to skip every duplicate check, including
 * the existing-email lookup — and that lookup is not a policy, it guards the database
 * invariant `leads_email_unique` (a unique index on lower(email)).
 *
 * The result was a bypass that worked exactly once per email. Every run after the first
 * reached `Lead.create` with an email the table already owned, threw
 * SequelizeUniqueConstraintError — whose default message is the uninformative string
 * "Validation error" — and surfaced to the website as a 500. The live "Call me now" button
 * failed this way, and only for the one phone number on the list.
 *
 * These tests pin both halves: the bypass still skips the POLICY checks, and can no longer
 * skip the INVARIANT one.
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

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLead } = require('../leadService');

const BYPASS_PHONE = '6825975784';

beforeEach(() => {
  jest.clearAllMocks();
  mockFindAll.mockResolvedValue([]);
  mockCreate.mockImplementation(async (values: any) => ({ id: 999, ...values, update: jest.fn() }));
});

describe('createLead — bypass phone vs the email unique index', () => {
  it('returns the existing lead instead of inserting a duplicate email', async () => {
    const existing = { id: 2736, email: 'ali@colaberry.com', phone: BYPASS_PHONE };
    // Recency check is skipped for a bypass phone; the invariant check is the one that runs.
    mockFindOne.mockResolvedValue(existing);

    const result = await createLead({
      name: 'Ali Muwwakkil',
      email: 'ali@colaberry.com',
      phone: `+1${BYPASS_PHONE}`,
    } as any);

    expect(mockCreate).not.toHaveBeenCalled();
    expect(result.lead).toBe(existing);
    expect(result.isDuplicate).toBe(true);
  });

  it('still inserts when the bypass phone arrives with an email nobody owns', async () => {
    mockFindOne.mockResolvedValue(null);

    const result = await createLead({
      name: 'Ali Muwwakkil',
      email: 'brand-new@example.com',
      phone: `+1${BYPASS_PHONE}`,
    } as any);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(result.isDuplicate).toBe(false);
  });

  it('still skips the phone dedup for a bypass phone (the reason it exists)', async () => {
    mockFindOne.mockResolvedValue(null);
    // A different lead already holds this phone. A normal caller would be deduped onto it.
    mockFindAll.mockResolvedValue([{ id: 24115, phone: BYPASS_PHONE, email: 'ali+11@colaberry.com' }]);

    const result = await createLead({
      name: 'Ali Muwwakkil',
      email: 'fresh@example.com',
      phone: BYPASS_PHONE,
    } as any);

    expect(result.isDuplicate).toBe(false);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('a non-bypass phone is still deduped onto the phone match', async () => {
    mockFindOne.mockResolvedValue(null);
    const phoneOwner = { id: 555, phone: '2145551234', email: 'someone@example.com' };
    mockFindAll.mockResolvedValue([phoneOwner]);

    const result = await createLead({
      name: 'Someone Else',
      email: 'different@example.com',
      phone: '+12145551234',
    } as any);

    expect(mockCreate).not.toHaveBeenCalled();
    expect(result.lead).toBe(phoneOwner);
    expect(result.isDuplicate).toBe(true);
  });
});
