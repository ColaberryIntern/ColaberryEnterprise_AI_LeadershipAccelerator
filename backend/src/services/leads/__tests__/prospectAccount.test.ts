/**
 * An enquiry becomes someone with a way back in — and only the enquiries that asked.
 *
 * The gap these cover was found by looking at the Accelerator's Participants screen after a
 * real end-to-end submission and not finding the person on it. A Lead had been written; an
 * Enrollment had not, and those are different tables.
 */

const mockCreateFreeAccount = jest.fn();

jest.mock('../../freeSignupService', () => ({
  createFreeAccount: (...a: any[]) => mockCreateFreeAccount(...a),
}));

const mockEnrollmentFindByPk = jest.fn();
const mockCohortFindOne = jest.fn();
const mockCohortFindByPk = jest.fn();

jest.mock('../../../models', () => ({
  Enrollment: { findByPk: (...a: any[]) => mockEnrollmentFindByPk(...a) },
  Cohort: {
    findOne: (...a: any[]) => mockCohortFindOne(...a),
    findByPk: (...a: any[]) => mockCohortFindByPk(...a),
  },
}));

import { ensureProspectAccount, wantsProspectAccount, PROSPECT_ACCOUNT_SOURCES } from '../prospectAccount';

let mockUpdate: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateFreeAccount.mockResolvedValue({ created: true, jwt: 'x', enrollment: { id: 'enr-1' } });
  mockUpdate = jest.fn().mockResolvedValue(undefined);
  mockEnrollmentFindByPk.mockResolvedValue({ id: 'enr-1', cohort_id: null, tier: 'guest', update: mockUpdate });
  mockCohortFindOne.mockResolvedValue({ id: 'cohort-prospects' });
  delete process.env.PROSPECT_COHORT_ID;
});

describe('wantsProspectAccount', () => {
  it('accepts the flotation enquiry form', () => {
    expect(wantsProspectAccount('ai-flotation')).toBe(true);
  });

  it('ignores case and stray whitespace on the slug', () => {
    expect(wantsProspectAccount('  AI-Flotation ')).toBe(true);
  });

  it('refuses a source that never asked for anything', () => {
    // "Every lead gets a portal account" is a much larger decision than this one, and an
    // account nobody asked for is worse than no account.
    expect(wantsProspectAccount('apollo-import')).toBe(false);
    expect(wantsProspectAccount('')).toBe(false);
  });

  it('keeps the list short enough that adding to it is a decision', () => {
    expect(PROSPECT_ACCOUNT_SOURCES.length).toBeLessThanOrEqual(3);
  });
});

describe('ensureProspectAccount', () => {
  it('mints the free account for an eligible enquiry', async () => {
    const result = await ensureProspectAccount({
      sourceSlug: 'ai-flotation',
      email: 'someone@northside.test',
      name: 'Marta',
    });

    expect(result).toEqual({ created: true, cohort_assigned: true });
    expect(mockCreateFreeAccount).toHaveBeenCalledWith({
      full_name: 'Marta',
      email: 'someone@northside.test',
    });
  });

  it('does not touch other sources at all', async () => {
    const result = await ensureProspectAccount({ sourceSlug: 'newsletter', email: 'a@b.test' });

    expect(result).toEqual({ created: false, reason: 'source_not_eligible' });
    expect(mockCreateFreeAccount).not.toHaveBeenCalled();
  });

  it('falls back to the local part when no name was given', async () => {
    // `full_name` is required and the enquiry form does not insist on a name. An empty
    // string would produce an account addressed to nobody.
    await ensureProspectAccount({ sourceSlug: 'ai-flotation', email: 'marta@northside.test' });

    expect(mockCreateFreeAccount).toHaveBeenCalledWith(
      expect.objectContaining({ full_name: 'marta' }),
    );
  });

  it('does nothing without an email, which is the account identity', async () => {
    const result = await ensureProspectAccount({ sourceSlug: 'ai-flotation', email: '  ' });

    expect(result).toEqual({ created: false, reason: 'no_email' });
    expect(mockCreateFreeAccount).not.toHaveBeenCalled();
  });

  it('reports a returning enquirer as not newly created', async () => {
    // createFreeAccount is idempotent by email, so a second submission must not read as a
    // second account.
    mockCreateFreeAccount.mockResolvedValue({ created: false, jwt: 'x', enrollment: {} });

    expect(await ensureProspectAccount({ sourceSlug: 'ai-flotation', email: 'a@b.test' })).toMatchObject({
      created: false,
    });
  });

  it('never throws, because losing the submission would be the worse failure', async () => {
    mockCreateFreeAccount.mockRejectedValue(new Error('database on fire'));

    await expect(
      ensureProspectAccount({ sourceSlug: 'ai-flotation', email: 'a@b.test' }),
    ).resolves.toEqual({ created: false, reason: 'failed' });
  });
});

/**
 * The cohort, and the two people it must never move.
 *
 * `createFreeAccount` is idempotent by email and returns an EXISTING enrolment. Without the
 * guards below, a paying student who later sends an enquiry would be quietly pulled out of
 * the programme they are paying for and filed as a prospect.
 */
describe('the prospects cohort', () => {
  it('puts a new prospect in it, resolved by name', async () => {
    await ensureProspectAccount({ sourceSlug: 'ai-flotation', email: 'a@b.test' });

    expect(mockUpdate).toHaveBeenCalledWith({ cohort_id: 'cohort-prospects' });
    // By name, never by id: the id is a production UUID and hardcoding it would leave every
    // dev box and preview stack silently assigning nobody.
    expect(mockCohortFindOne).toHaveBeenCalled();
    expect(mockCohortFindByPk).not.toHaveBeenCalled();
  });

  it('honours an explicit cohort id when an operator sets one', async () => {
    process.env.PROSPECT_COHORT_ID = 'cohort-chosen';
    mockCohortFindByPk.mockResolvedValue({ id: 'cohort-chosen' });

    await ensureProspectAccount({ sourceSlug: 'ai-flotation', email: 'a@b.test' });

    expect(mockUpdate).toHaveBeenCalledWith({ cohort_id: 'cohort-chosen' });
    expect(mockCohortFindOne).not.toHaveBeenCalled();
  });

  it('NEVER moves someone who is already in a cohort', async () => {
    mockEnrollmentFindByPk.mockResolvedValue({ cohort_id: 'cohort-november', tier: 'member', update: mockUpdate });

    const result = await ensureProspectAccount({ sourceSlug: 'ai-flotation', email: 'student@paying.test' });

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(result.cohort_assigned).toBe(false);
  });

  it('NEVER moves a member, even one sitting in no cohort', async () => {
    mockEnrollmentFindByPk.mockResolvedValue({ cohort_id: null, tier: 'member', update: mockUpdate });

    await ensureProspectAccount({ sourceSlug: 'ai-flotation', email: 'member@paying.test' });

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('keeps the account when the cohort does not exist', async () => {
    // An account in no cohort is worth far more than no account.
    mockCohortFindOne.mockResolvedValue(null);

    const result = await ensureProspectAccount({ sourceSlug: 'ai-flotation', email: 'a@b.test' });

    expect(result).toEqual({ created: true, cohort_assigned: false });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('keeps the account when the assignment itself throws', async () => {
    mockEnrollmentFindByPk.mockRejectedValue(new Error('deadlock'));

    expect(await ensureProspectAccount({ sourceSlug: 'ai-flotation', email: 'a@b.test' })).toEqual({
      created: true,
      cohort_assigned: false,
    });
  });
});
