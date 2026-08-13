const offeringFindOne = jest.fn();
const appFindOne = jest.fn();
const appCreate = jest.fn();
const enrollmentFindOne = jest.fn();
const leadFindOne = jest.fn();

jest.mock('../../models', () => ({
  InternshipOffering: { findOne: (...a: unknown[]) => offeringFindOne(...a), findAll: jest.fn() },
  InternshipApplication: {
    findOne: (...a: unknown[]) => appFindOne(...a),
    create: (...a: unknown[]) => appCreate(...a),
  },
  Enrollment: { findOne: (...a: unknown[]) => enrollmentFindOne(...a) },
  Lead: { findOne: (...a: unknown[]) => leadFindOne(...a) },
}));

import { applyToInternship } from '../internshipService';

const NOW = new Date('2026-08-13T12:00:00Z');
const OPEN = {
  id: 'off-1',
  slug: 'ai-internship-fall-2026',
  status: 'open',
  application_deadline: '2026-12-01',
  application_opens_on: null,
};
const INPUT = { offering_slug: 'ai-internship-fall-2026', email: 'Sam@Example.com ' as string };

beforeEach(() => {
  [offeringFindOne, appFindOne, appCreate, enrollmentFindOne, leadFindOne].forEach((m) => m.mockReset());
  offeringFindOne.mockResolvedValue(OPEN);
  appFindOne.mockResolvedValue(null);
  enrollmentFindOne.mockResolvedValue(null);
  leadFindOne.mockResolvedValue(null);
  appCreate.mockImplementation((v: any) => Promise.resolve({ id: 'app-1', ...v }));
});

describe('a first application', () => {
  it('creates it and normalises the email to lowercase', async () => {
    const r = await applyToInternship({ ...INPUT, email: 'Sam@Example.com' } as any, NOW);
    expect(r.outcome).toBe('created');
    // The unique index is on email_normalized; a mixed-case write would defeat it.
    expect(appCreate.mock.calls[0][0].email_normalized).toBe('sam@example.com');
    expect(appCreate.mock.calls[0][0].status).toBe('submitted');
  });

  it('never lets the applicant declare their own status or identity', async () => {
    await applyToInternship(
      { ...INPUT, status: 'accepted', enrollment_id: 'someone-else', lead_id: 99 } as any,
      NOW,
    );
    const written = appCreate.mock.calls[0][0];
    expect(written.status).toBe('submitted');
    expect(written.enrollment_id).toBeNull();
    expect(written.lead_id).toBeNull();
  });

  it('attaches a known enrollment and lead when the email matches', async () => {
    enrollmentFindOne.mockResolvedValue({ id: 'enr-9' });
    leadFindOne.mockResolvedValue({ id: 4242 });
    await applyToInternship(INPUT as any, NOW);
    expect(appCreate.mock.calls[0][0]).toMatchObject({ enrollment_id: 'enr-9', lead_id: 4242 });
  });

  it('still applies when the person is neither a learner nor a lead', async () => {
    // The first applicants to a never-marketed product are exactly the people
    // we have no record of. A miss must not block them.
    const r = await applyToInternship(INPUT as any, NOW);
    expect(r.outcome).toBe('created');
    expect(appCreate.mock.calls[0][0]).toMatchObject({ enrollment_id: null, lead_id: null });
  });

  it('never creates an enrollment or a lead as a side effect', async () => {
    // Applying is not consent to become a marketing contact.
    await applyToInternship(INPUT as any, NOW);
    const models = require('../../models');
    expect(models.Enrollment.create).toBeUndefined();
    expect(models.Lead.create).toBeUndefined();
  });
});

describe('re-submitting is safe — the whole point', () => {
  it('completes a started draft rather than creating a second row', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    appFindOne.mockResolvedValue({ id: 'app-1', status: 'started', update });
    const r = await applyToInternship({ ...INPUT, motivation: 'because' } as any, NOW);
    expect(r.outcome).toBe('updated');
    expect(update.mock.calls[0][0]).toMatchObject({ status: 'submitted' });
    expect(appCreate).not.toHaveBeenCalled();
  });

  it('returns the existing row when already submitted, writing nothing', async () => {
    const update = jest.fn();
    appFindOne.mockResolvedValue({ id: 'app-1', status: 'submitted', update });
    const r = await applyToInternship(INPUT as any, NOW);
    expect(r.outcome).toBe('already_submitted');
    expect(update).not.toHaveBeenCalled();
    expect(appCreate).not.toHaveBeenCalled();
  });

  it.each(['accepted', 'rejected', 'withdrawn'])(
    'NEVER overwrites a %s decision a human made',
    async (status) => {
      // Silently resetting a decided application to `submitted` would erase a
      // real human decision — the kind of data loss nobody notices until it matters.
      const update = jest.fn();
      appFindOne.mockResolvedValue({ id: 'app-1', status, update });
      const r = await applyToInternship(INPUT as any, NOW);
      expect(r.outcome).toBe('already_decided');
      expect(r.status).toBe(status);
      expect(update).not.toHaveBeenCalled();
      expect(appCreate).not.toHaveBeenCalled();
    },
  );

  it('resolves a race to the row that won, instead of throwing', async () => {
    // Two submissions can pass the findOne together; the unique index decides.
    appFindOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'app-winner', status: 'submitted' });
    appCreate.mockRejectedValue({ name: 'SequelizeUniqueConstraintError' });
    const r = await applyToInternship(INPUT as any, NOW);
    expect(r.outcome).toBe('already_submitted');
    expect(r.application_id).toBe('app-winner');
  });
});

describe('a closed offering never accepts an application', () => {
  it.each([
    ['missing', null],
    ['draft', { ...OPEN, status: 'draft' }],
    ['closed', { ...OPEN, status: 'closed' }],
    ['past its deadline', { ...OPEN, application_deadline: '2026-01-01' }],
    ['not yet open', { ...OPEN, application_opens_on: '2026-12-31' }],
  ])('refuses when the offering is %s', async (_label, offering) => {
    offeringFindOne.mockResolvedValue(offering);
    const r = await applyToInternship(INPUT as any, NOW);
    expect(r.outcome).toBe('offering_not_open');
    expect(appCreate).not.toHaveBeenCalled();
  });

  it('gives the same answer for missing and draft, so drafts cannot be enumerated', async () => {
    offeringFindOne.mockResolvedValue(null);
    const missing = await applyToInternship(INPUT as any, NOW);
    offeringFindOne.mockResolvedValue({ ...OPEN, status: 'draft' });
    const draft = await applyToInternship(INPUT as any, NOW);
    expect(draft.message).toBe(missing.message);
    expect(draft.outcome).toBe(missing.outcome);
  });
});
