const queryMock = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => queryMock(...a) } }));

import {
  recordContactActivity,
  FUTURE_SKEW_TOLERANCE_MS,
  UNMATCHED_SAMPLE_LIMIT,
} from '../explorerContactActivityService';
import type { ContactActivityRowInput } from '../../../schemas/explorerContactActivitySchema';

/**
 * The contact-activity loader, at the unit level.
 *
 * WHAT THIS SUITE CAN AND CANNOT PROVE. The value of this service is in four SQL statements, and
 * a mocked `sequelize.query` cannot tell you whether they are correct Postgres. That is what
 * `explorerContactActivityService.integration.test.ts` is for, against a real database. This
 * file owns the parts that live in TypeScript: the future-timestamp rule, the arithmetic between
 * the two units, the short-circuit, and the shape of what is sent to the database.
 *
 * Asserting on SQL text is used ONLY for the two properties that are load-bearing and cheap to
 * state - the forward-only predicate and the target table - and both are also proved
 * behaviourally in the integration suite. A substring assertion alone is the weak test this repo
 * has been bitten by before; here it is a second line, not the only one.
 */

const NOW = new Date('2026-11-17T21:00:00.000Z');
const row = (id: string, ts: string): ContactActivityRowInput => ({ ghl_contact_id: id, last_connected_call_at: ts });

/** Queue the four results in the order the service asks for them: matched, unmatched, reached, written. */
function respond(opts: {
  matched?: string[];
  unmatched?: string[];
  reached?: string[];
  written?: string[];
}): void {
  const { matched = [], unmatched = [], reached = [], written = [] } = opts;
  queryMock
    .mockResolvedValueOnce(matched.map((ghl_contact_id) => ({ ghl_contact_id })))
    .mockResolvedValueOnce(unmatched.map((ghl_contact_id) => ({ ghl_contact_id })))
    .mockResolvedValueOnce(reached.map((enrollment_id) => ({ enrollment_id })))
    .mockResolvedValueOnce(written.map((enrollment_id) => ({ enrollment_id })));
}

const sqlOf = (call: number): string => String(queryMock.mock.calls[call][0]);
const payloadOf = (call: number): Array<{ ghl_contact_id: string; ts: string }> =>
  JSON.parse((queryMock.mock.calls[call][1] as { replacements: { payload: string } }).replacements.payload);

beforeEach(() => queryMock.mockReset());

describe('a timestamp in the future is never written', () => {
  // A far-future value would suppress that person PERMANENTLY: `last_contacted_at < NOW() - 7
  // days` can never become true again. This is the one input that causes irreversible harm.
  it('refuses a row dated next year and never asks the database about it', async () => {
    const result = await recordContactActivity([row('C1', '2027-05-01T00:00:00Z')], NOW);
    expect(result.rejected_future).toBe(1);
    expect(result.received).toBe(1);
    expect(result.written).toBe(0);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('CONTROL: the same row dated in the PAST does reach the database', async () => {
    respond({ matched: ['C1'], reached: ['e1'], written: ['e1'] });
    const result = await recordContactActivity([row('C1', '2026-11-17T20:00:00Z')], NOW);
    expect(result.rejected_future).toBe(0);
    expect(result.written).toBe(1);
    expect(queryMock).toHaveBeenCalled();
  });

  it('tolerates ordinary clock skew rather than refusing it', async () => {
    const justInside = new Date(NOW.getTime() + FUTURE_SKEW_TOLERANCE_MS - 1000).toISOString();
    respond({ matched: ['C1'], reached: ['e1'], written: ['e1'] });
    expect((await recordContactActivity([row('C1', justInside)], NOW)).rejected_future).toBe(0);
  });

  it('refuses a timestamp just beyond the skew window', async () => {
    const justOutside = new Date(NOW.getTime() + FUTURE_SKEW_TOLERANCE_MS + 1000).toISOString();
    expect((await recordContactActivity([row('C1', justOutside)], NOW)).rejected_future).toBe(1);
  });

  it('keeps the good rows of a mixed batch and reports the refusals', async () => {
    respond({ matched: ['C1'], reached: ['e1'], written: ['e1'] });
    const result = await recordContactActivity(
      [row('C1', '2026-11-17T20:00:00Z'), row('C2', '2099-01-01T00:00:00Z')],
      NOW,
    );
    expect(result).toMatchObject({ received: 2, rejected_future: 1, written: 1 });
    // Only the usable row crosses to the database.
    expect(payloadOf(0)).toEqual([{ ghl_contact_id: 'C1', ts: '2026-11-17T20:00:00Z' }]);
  });

  it('short-circuits with an honest zero when EVERY row is future dated', async () => {
    const result = await recordContactActivity(
      [row('C1', '2099-01-01T00:00:00Z'), row('C2', '2099-01-02T00:00:00Z')],
      NOW,
    );
    expect(result).toEqual({
      received: 2, matched: 0, unmatched: 0, written: 0, unchanged: 0,
      rejected_future: 2, unmatched_ghl_contact_ids: [],
    });
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe('the two units never mix', () => {
  // The bug this exists to prevent: computing `unchanged` as matched (CONTACT IDS) minus written
  // (PROFILES) goes negative on production's one contact id that is attached to two leads, and a
  // clamp to zero would have made it look plausible.
  it('one contact id that reaches TWO profiles reports 1 matched and 2 written', async () => {
    respond({ matched: ['Cshared'], reached: ['e1', 'e2'], written: ['e1', 'e2'] });
    const result = await recordContactActivity([row('Cshared', '2026-11-17T20:00:00Z')], NOW);
    expect(result.matched).toBe(1);
    expect(result.written).toBe(2);
    expect(result.unchanged).toBe(0);
  });

  it('written + unchanged always equals the profiles reached', async () => {
    respond({ matched: ['C1', 'C2', 'C3'], reached: ['e1', 'e2', 'e3'], written: ['e2'] });
    const result = await recordContactActivity(
      [row('C1', '2026-11-10T00:00:00Z'), row('C2', '2026-11-11T00:00:00Z'), row('C3', '2026-11-12T00:00:00Z')],
      NOW,
    );
    expect(result.written + result.unchanged).toBe(3);
    expect(result.unchanged).toBe(2);
  });

  it('a full replay reads as everything matched and nothing moved', async () => {
    // This is the signature of a duplicate push, and it must be distinguishable from a quiet
    // day. A quiet day never gets here: an empty `rows` is a 400 at the schema.
    respond({ matched: ['C1', 'C2'], reached: ['e1', 'e2'], written: [] });
    const result = await recordContactActivity(
      [row('C1', '2026-11-10T00:00:00Z'), row('C2', '2026-11-11T00:00:00Z')],
      NOW,
    );
    expect(result).toMatchObject({ received: 2, matched: 2, written: 0, unchanged: 2, unmatched: 0 });
  });
});

describe('unmatched ids come back to the caller', () => {
  it('reports the ids that reached nothing, which is the caller actioning its own misses', async () => {
    respond({ matched: ['C1'], unmatched: ['C2', 'C3'], reached: ['e1'], written: ['e1'] });
    const result = await recordContactActivity(
      [row('C1', '2026-11-10T00:00:00Z'), row('C2', '2026-11-10T00:00:00Z'), row('C3', '2026-11-10T00:00:00Z')],
      NOW,
    );
    expect(result.unmatched).toBe(2);
    expect(result.unmatched_ghl_contact_ids).toEqual(['C2', 'C3']);
  });

  it(`caps the returned list at ${UNMATCHED_SAMPLE_LIMIT} while the COUNT stays true`, async () => {
    const many = Array.from({ length: UNMATCHED_SAMPLE_LIMIT + 50 }, (_, i) => `C${i}`);
    respond({ unmatched: many });
    const result = await recordContactActivity(many.map((id) => row(id, '2026-11-10T00:00:00Z')), NOW);
    expect(result.unmatched).toBe(UNMATCHED_SAMPLE_LIMIT + 50);
    expect(result.unmatched_ghl_contact_ids).toHaveLength(UNMATCHED_SAMPLE_LIMIT);
  });
});

describe('what is actually sent to the database', () => {
  it('passes ONE json string parameter, not a bound array', async () => {
    // Sequelize's array replacement expands to a Postgres array literal, which combined with
    // `= ANY(:x)` has already crash-looped production in this repo. Every statement here takes a
    // single `payload` string instead.
    respond({ matched: ['C1'], reached: ['e1'], written: ['e1'] });
    await recordContactActivity([row('C1', '2026-11-10T00:00:00Z')], NOW);
    for (let call = 0; call < 4; call += 1) {
      const replacements = (queryMock.mock.calls[call][1] as { replacements: Record<string, unknown> }).replacements;
      expect(Object.keys(replacements)).toEqual(['payload']);
      expect(typeof replacements.payload).toBe('string');
      expect(sqlOf(call)).toContain('jsonb_to_recordset');
    }
  });

  it('the UPDATE is forward-only and targets the LEARNER-side column', async () => {
    // Two separate claims, both load-bearing:
    //  - the guard that makes a replay a no-op and stops a stale file dragging a timestamp back;
    //  - the table, because `leads.last_contacted_at` is a real column the suppression ignores,
    //    so writing there would succeed and change nothing.
    respond({ matched: ['C1'], reached: ['e1'], written: ['e1'] });
    await recordContactActivity([row('C1', '2026-11-10T00:00:00Z')], NOW);
    const update = sqlOf(3);
    expect(update).toContain('UPDATE explorer_journey_profiles');
    expect(update).toContain('p.last_contacted_at IS NULL OR p.last_contacted_at < t.ts');
    expect(update).not.toMatch(/UPDATE\s+leads/);
  });

  it('sends every usable row, preserving the caller\'s timestamps verbatim', async () => {
    respond({ matched: ['C1', 'C2'], reached: ['e1', 'e2'], written: ['e1'] });
    await recordContactActivity(
      [row('C1', '2026-11-10T08:30:00Z'), row('C2', '2026-11-11T15:04:00-06:00')],
      NOW,
    );
    expect(payloadOf(0)).toEqual([
      { ghl_contact_id: 'C1', ts: '2026-11-10T08:30:00Z' },
      { ghl_contact_id: 'C2', ts: '2026-11-11T15:04:00-06:00' },
    ]);
  });
});
