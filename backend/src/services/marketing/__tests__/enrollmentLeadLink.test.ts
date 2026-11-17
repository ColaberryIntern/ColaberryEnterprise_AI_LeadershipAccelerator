/**
 * R18: which lead a revenue enrollment came from, and the hook that stamps it.
 *
 * The decision is pure, so it is tested without a database. The hook is tested against the two
 * callers it is written for — a Sequelize instance with `set`, and a plain object — because both
 * are real and the hook is the single point all seven enrollment-creation paths pass through.
 */
import { pickLeadForEnrollment, normalizeEmailForLink } from '../enrollmentLeadLink';

describe('pickLeadForEnrollment (R18)', () => {
  it('returns null when there is no lead to link', () => {
    // NULL means "not linked", which is the permanent state of the 100 of production's 1,436
    // enrollment emails that have no leads row at all. It does not mean organic.
    expect(pickLeadForEnrollment([])).toBeNull();
    expect(pickLeadForEnrollment(null)).toBeNull();
    expect(pickLeadForEnrollment(undefined)).toBeNull();
  });

  it('returns the only candidate, which is the live book in every measured case', () => {
    // Measured on production 2026-11-17: 1,336 of 1,436 enrollment emails match exactly one
    // lead row and ZERO match more than one.
    expect(pickLeadForEnrollment([{ id: 42, created_at: '2026-07-01T00:00:00Z' }])).toBe(42);
  });

  it('picks the OLDEST row when an email somehow has several', () => {
    const rows = [
      { id: 900, created_at: '2026-11-01T00:00:00Z' },
      { id: 100, created_at: '2026-03-01T00:00:00Z' },
      { id: 500, created_at: '2026-08-01T00:00:00Z' },
    ];
    expect(pickLeadForEnrollment(rows)).toBe(100);
  });

  it('does NOT copy utmBackfill\'s newest-wins rule, and that is the point', () => {
    // pickAttributionSession picks the NEWEST session carrying a campaign, because it chooses
    // among repeated visits by one known person. This function chooses among duplicate
    // IDENTITIES, where the oldest row is the acquisition event the enrollment descends from.
    // Newest-wins here would re-attribute a paying member to whichever list imported their
    // address most recently.
    const rows = [
      { id: 1, created_at: '2026-03-01T00:00:00Z' },
      { id: 2, created_at: '2026-11-16T00:00:00Z' },
    ];
    expect(pickLeadForEnrollment(rows)).toBe(1);
    expect(pickLeadForEnrollment(rows)).not.toBe(2);
  });

  it('is stable: the same rows in any order give the same answer, and new rows cannot move it', () => {
    // A link that moves is worse than a link that is missing, because a revenue figure built on
    // it would change without anything happening.
    const a = { id: 7, created_at: '2026-05-01T00:00:00Z' };
    const b = { id: 8, created_at: '2026-09-01T00:00:00Z' };
    expect(pickLeadForEnrollment([a, b])).toBe(7);
    expect(pickLeadForEnrollment([b, a])).toBe(7);
    expect(pickLeadForEnrollment([b, a, { id: 9, created_at: '2026-11-17T00:00:00Z' }])).toBe(7);
  });

  it('breaks a created_at tie on the lower id, so the rule is total', () => {
    const rows = [
      { id: 31, created_at: '2026-06-01T00:00:00Z' },
      { id: 12, created_at: '2026-06-01T00:00:00Z' },
    ];
    expect(pickLeadForEnrollment(rows)).toBe(12);
  });

  it('sorts an unreadable created_at last rather than dropping the row', () => {
    // Dropping it would let a single unreadable timestamp cost the link entirely when it is the
    // only candidate. Same treatment utmBackfill gives an unreadable session stamp.
    expect(pickLeadForEnrollment([{ id: 55, created_at: null }])).toBe(55);
    expect(pickLeadForEnrollment([{ id: 55 }])).toBe(55);
    expect(pickLeadForEnrollment([{ id: 55, created_at: 'not a date' }])).toBe(55);
    expect(pickLeadForEnrollment([
      { id: 55, created_at: null },
      { id: 66, created_at: '2026-10-01T00:00:00Z' },
    ])).toBe(66);
  });

  it('ignores a candidate with no usable integer id', () => {
    expect(pickLeadForEnrollment([{ id: undefined as any }, { id: 4, created_at: '2026-01-01T00:00:00Z' }])).toBe(4);
    expect(pickLeadForEnrollment([{ id: 'abc' as any }])).toBeNull();
  });
});

describe('normalizeEmailForLink (R18)', () => {
  it('lowercases and trims, because neither column is stored consistently', () => {
    // createPendingEnrollment stores what the form sent; createManualEnrollment lowercases and
    // trims. `leads` has the same mix. Neither side can be compared raw.
    expect(normalizeEmailForLink('  Sonya28TX@Gmail.com ')).toBe('sonya28tx@gmail.com');
  });

  it('returns null for anything that is not a usable address', () => {
    // Without this, a blank email would match every lead row whose email is also blank.
    expect(normalizeEmailForLink('')).toBeNull();
    expect(normalizeEmailForLink('   ')).toBeNull();
    expect(normalizeEmailForLink(null)).toBeNull();
    expect(normalizeEmailForLink(undefined)).toBeNull();
    expect(normalizeEmailForLink(42)).toBeNull();
  });
});

describe('enrollmentLeadLinkHook (R18)', () => {
  const loadHook = async (findAll: jest.Mock) => {
    jest.resetModules();
    jest.doMock('../../../models', () => ({ Lead: { findAll } }));
    return (await import('../enrollmentLeadResolver')).enrollmentLeadLinkHook;
  };

  afterEach(() => {
    jest.dontMock('../../../models');
    jest.resetModules();
  });

  it('stamps lead_id via set() on a Sequelize instance', async () => {
    const findAll = jest.fn().mockResolvedValue([{ id: 77, created_at: '2026-07-01T00:00:00Z' }]);
    const hook = await loadHook(findAll);
    const set = jest.fn();
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    await hook({ id: 'enr-1', email: 'Member@Example.com', lead_id: null, set });

    expect(set).toHaveBeenCalledWith('lead_id', 77);
    expect(JSON.parse(log.mock.calls.at(-1)![0])).toMatchObject({
      event: 'enrollment_lead_linked',
      outcome: 'success',
      context: { enrollment_id: 'enr-1', lead_id: 77 },
    });
    log.mockRestore();
  });

  it('assigns directly when a plain object was passed instead of an instance', async () => {
    const findAll = jest.fn().mockResolvedValue([{ id: 5, created_at: '2026-04-01T00:00:00Z' }]);
    const hook = await loadHook(findAll);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const row: any = { id: 'enr-2', email: 'x@y.com' };

    await hook(row);

    expect(row.lead_id).toBe(5);
    (console.log as jest.Mock).mockRestore();
  });

  it('never overrides a lead_id the caller supplied, and does not even look one up', async () => {
    // An explicit link is a decision; resolution is only the fallback for paths that have none.
    const findAll = jest.fn();
    const hook = await loadHook(findAll);
    const set = jest.fn();

    await hook({ id: 'enr-3', email: 'x@y.com', lead_id: 999, set });

    expect(set).not.toHaveBeenCalled();
    expect(findAll).not.toHaveBeenCalled();
  });

  it('leaves lead_id NULL and lets the insert proceed when there is no matching lead', async () => {
    const findAll = jest.fn().mockResolvedValue([]);
    const hook = await loadHook(findAll);
    const set = jest.fn();

    await expect(hook({ id: 'enr-4', email: 'nobody@example.com', lead_id: null, set })).resolves.toBeUndefined();

    expect(set).not.toHaveBeenCalled();
  });

  it('never throws when the lookup fails, because the enrollment must be created either way', async () => {
    // Attribution rides on top of an enrollment that exists regardless. Losing the link must
    // not cost the signup. Same contract utmBackfill's caller keeps on the lead side.
    const findAll = jest.fn().mockRejectedValue(new Error('connection terminated'));
    const hook = await loadHook(findAll);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const set = jest.fn();

    await expect(hook({ id: 'enr-5', email: 'x@y.com', lead_id: null, set })).resolves.toBeUndefined();

    expect(set).not.toHaveBeenCalled();
    expect(JSON.parse(warn.mock.calls[0][0])).toMatchObject({
      event: 'enrollment_lead_link_lookup_failed',
      outcome: 'partial',
    });
    warn.mockRestore();
  });

  it('does not query at all for an enrollment with no usable email', async () => {
    const findAll = jest.fn();
    const hook = await loadHook(findAll);

    await hook({ id: 'enr-6', email: '   ', lead_id: null, set: jest.fn() });
    await hook({ id: 'enr-7', email: null, lead_id: null, set: jest.fn() });

    expect(findAll).not.toHaveBeenCalled();
  });

  it('compares lower(btrim(email)) on both sides and reads only the two columns it needs', async () => {
    // Non-sargable on purpose (see resolveLeadIdForEmail): this runs a few dozen times a month.
    // `leads` has 67 columns and the decision reads two.
    const findAll = jest.fn().mockResolvedValue([]);
    const hook = await loadHook(findAll);

    await hook({ id: 'enr-8', email: '  MiXeD@Case.COM  ', lead_id: null, set: jest.fn() });

    const arg = findAll.mock.calls[0][0];
    expect(arg.attributes).toEqual(['id', 'created_at']);
    expect(JSON.stringify(arg.where)).toContain('mixed@case.com');
    expect(JSON.stringify(arg.where)).toContain('btrim');
  });
});
