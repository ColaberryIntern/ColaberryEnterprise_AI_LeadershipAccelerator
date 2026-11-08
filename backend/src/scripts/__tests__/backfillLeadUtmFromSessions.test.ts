/**
 * The one-time lead UTM repair (C10.4): the loop, not the rule.
 *
 * The attribution decision itself is `utmBackfill.ts` and is tested there, including the control
 * that the window is anchored on the signup rather than the clock. What is tested HERE is
 * everything a loop can get wrong around a correct rule: writing during a dry run, aborting the
 * whole repair on one bad row, asking the database for the wrong population, and claiming to have
 * recovered a field it did not write.
 *
 * `../../models` is the only mock. The rule is the real one, because a mocked rule would make
 * these tests agree with whatever the mock said.
 */
jest.mock('../../models', () => ({
  Lead: { findAll: jest.fn() },
  VisitorSession: { findAll: jest.fn() },
}));

import { Op } from 'sequelize';
import { Lead, VisitorSession } from '../../models';
import { UTM_FIELDS, UTM_SESSION_LOOKBACK } from '../../services/marketing/utmBackfill';
import { run } from '../backfillLeadUtmFromSessions';

const leadFindAll = Lead.findAll as unknown as jest.Mock;
const sessionFindAll = VisitorSession.findAll as unknown as jest.Mock;

const SIGNUP = new Date('2026-07-15T12:00:00.000Z');
const DAY_MS = 86_400_000;

/** A lead row as the script receives it: blank tags, a visitor to join by, and an update spy. */
function lead(over: Record<string, unknown> = {}) {
  return {
    id: 'lead-1',
    email: 'someone@example.com',
    created_at: SIGNUP,
    visitor_id: 'visitor-1',
    utm_source: null,
    utm_campaign: null,
    utm_content: null,
    utm_term: null,
    utm_medium: null,
    update: jest.fn(),
    ...over,
  };
}

/** A tagged session two days before that signup — plainly attributable, and four months stale
 *  if the window were anchored on today, which is the case this repair exists for. */
function taggedSession(over: Record<string, unknown> = {}) {
  return {
    utm_source: 'fb',
    utm_campaign: '52708443249234',
    utm_medium: 'paid',
    utm_content: '52708445138434',
    utm_term: '52708443249434',
    created_at: new Date(SIGNUP.getTime() - 2 * DAY_MS),
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  sessionFindAll.mockResolvedValue([taggedSession()]);
});

describe('the population it asks the database for', () => {
  it('only leads that have a visitor to join by AND at least one blank tag', async () => {
    leadFindAll.mockResolvedValue([]);
    await run(false);

    // Read through the real Op symbols. JSON.stringify drops symbol keys, so a harness that
    // stringifies this where-clause reads "{}" and agrees with any filter at all — the exact
    // trap that made three C10.13 tests fail against correct code.
    const where = leadFindAll.mock.calls[0][0].where;
    const and: any[] = where[Op.and];
    expect(and[0]).toEqual({ visitor_id: { [Op.ne]: null } });
    // One OR arm per field, so a lead missing only utm_medium is still in scope.
    const or: any[] = and[1][Op.or];
    expect(or).toHaveLength(UTM_FIELDS.length);
    expect(or.map((clause) => Object.keys(clause)[0]).sort()).toEqual([...UTM_FIELDS].sort());
  });

  it('bounds the session read the same way identify does', async () => {
    leadFindAll.mockResolvedValue([lead()]);
    await run(false);
    expect(sessionFindAll.mock.calls[0][0]).toMatchObject({
      where: { visitor_id: 'visitor-1' },
      limit: UTM_SESSION_LOOKBACK,
    });
  });

  it('honours --limit by passing it to the query rather than slicing afterwards', async () => {
    leadFindAll.mockResolvedValue([]);
    await run(false, 50);
    expect(leadFindAll.mock.calls[0][0].limit).toBe(50);
    leadFindAll.mockClear();
    await run(false);
    expect(leadFindAll.mock.calls[0][0]).not.toHaveProperty('limit');
  });
});

describe('a dry run writes nothing', () => {
  it('reports every field it would carry and calls update on nobody', async () => {
    const row = lead();
    leadFindAll.mockResolvedValue([row]);

    const rows = await run(false);

    expect(row.update).not.toHaveBeenCalled();
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('would-write');
    expect(rows[0].fields.sort()).toEqual([...UTM_FIELDS].sort());
    expect(rows[0].signedUpOn).toBe('2026-07-15');
  });
});

describe('executing', () => {
  it('writes exactly the fields the rule computed, and nothing else', async () => {
    const row = lead();
    leadFindAll.mockResolvedValue([row]);

    const rows = await run(true);

    expect(row.update).toHaveBeenCalledTimes(1);
    expect(row.update.mock.calls[0][0]).toEqual({
      utm_source: 'fb',
      utm_campaign: '52708443249234',
      utm_content: '52708445138434',
      utm_term: '52708443249434',
      utm_medium: 'paid',
    });
    expect(rows[0].action).toBe('written');
  });

  it('attributes a historical signup to its own old click — the anchor, end to end', async () => {
    // The session is four months before today and two days before the signup. If the window were
    // measured from the clock this would be stale, the bounded pick would fall through, and this
    // assertion is what would catch it from the script's side.
    const row = lead();
    leadFindAll.mockResolvedValue([row]);
    await run(true);
    expect(row.update.mock.calls[0][0].utm_campaign).toBe('52708443249234');
  });

  it('never overwrites a tag the signup itself supplied', async () => {
    const row = lead({ utm_campaign: 'from_the_form' });
    leadFindAll.mockResolvedValue([row]);

    await run(true);

    const written = row.update.mock.calls[0][0];
    expect(written).not.toHaveProperty('utm_campaign');
    expect(written.utm_content).toBe('52708445138434');
  });

  it('is idempotent: a second pass over a lead it already filled writes nothing', async () => {
    const row = lead();
    leadFindAll.mockResolvedValue([row]);
    await run(true);
    const written = row.update.mock.calls[0][0];

    // The row as it now stands in the database.
    const filled = lead({ ...written, update: jest.fn() });
    leadFindAll.mockResolvedValue([filled]);
    const second = await run(true);

    expect(filled.update).not.toHaveBeenCalled();
    expect(second[0].action).toBe('nothing-to-carry');
    expect(second[0].fields).toEqual([]);
  });

  it('a lead whose sessions carry no tags is counted, not written', async () => {
    const row = lead();
    leadFindAll.mockResolvedValue([row]);
    sessionFindAll.mockResolvedValue([{ utm_source: null, utm_campaign: null, created_at: SIGNUP }]);

    const rows = await run(true);

    expect(row.update).not.toHaveBeenCalled();
    expect(rows[0].action).toBe('nothing-to-carry');
  });
});

describe('one bad row does not end the repair', () => {
  it('counts the failure, keeps going, and still writes the rows that are fine', async () => {
    const broken = lead({ id: 'lead-broken', email: 'broken@example.com', visitor_id: 'visitor-broken' });
    const fine = lead({ id: 'lead-fine', email: 'fine@example.com' });
    leadFindAll.mockResolvedValue([broken, fine]);
    sessionFindAll
      .mockRejectedValueOnce(Object.assign(new Error('connection reset'), { name: 'SequelizeConnectionError' }))
      .mockResolvedValue([taggedSession()]);

    const rows = await run(true);

    expect(rows.map((r) => r.action)).toEqual(['failed', 'written']);
    expect(rows[0].error).toContain('SequelizeConnectionError');
    expect(broken.update).not.toHaveBeenCalled();
    expect(fine.update).toHaveBeenCalledTimes(1);
  });

  it('a failed update is reported as failed rather than as written', async () => {
    const row = lead();
    row.update.mockRejectedValue(new Error('read-only transaction'));
    leadFindAll.mockResolvedValue([row]);

    const rows = await run(true);

    expect(rows[0].action).toBe('failed');
    expect(rows[0].error).toContain('read-only transaction');
  });
});
