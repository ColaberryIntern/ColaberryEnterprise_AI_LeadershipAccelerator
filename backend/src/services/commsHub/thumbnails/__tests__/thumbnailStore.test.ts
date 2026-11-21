/** CH4.3 the AI attempt reservation: under the event lock, counted from Central midnight, refused at the ceiling. */
type Row = Record<string, any>;
const calls: string[] = [];
let used = 0;
const mockCount = jest.fn(async (o: Row) => { calls.push('count'); void o; return used; });
const mockCreate = jest.fn(async (r: Row) => { calls.push('create'); return { id: 'r1', ...r }; });

jest.mock('../../../../config/database', () => ({ sequelize: { transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb({ LOCK: { UPDATE: 'UPDATE' } })) } }));
jest.mock('../../../../models/CommsHubEvent', () => ({ __esModule: true, default: { findByPk: jest.fn(async (_id: string, o: Row) => { calls.push(`lock:${o.lock}`); return { id: 'e1' }; }) } }));
jest.mock('../../../../models/CommsHubThumbnail', () => ({ __esModule: true, default: { count: (...a: unknown[]) => mockCount(...(a as [Row])), create: (...a: unknown[]) => mockCreate(...(a as [Row])) } }));
jest.mock('../../../media/mediaAssetService', () => ({}));
jest.mock('../../eventPhotos', () => ({ hubBrand: jest.fn() }));

import { Op } from 'sequelize';
import { centralMidnight, reserveAiAttempt, estimateCostUsd } from '../thumbnailStore';

const JACKIE = { id: 'jackie-1', label: 'j' };
beforeEach(() => { calls.length = 0; used = 0; jest.clearAllMocks(); });

describe('CH4.3 reserveAiAttempt', () => {
  it('locks the event, counts, then writes the attempt, all in one transaction', async () => {
    const row = await reserveAiAttempt('e1', 'A_dark_tech', 'prompt', 'gpt-image-1-mini', 12, JACKIE, new Date('2026-12-02T03:00:00Z'));
    expect(row).toMatchObject({ id: 'r1', event_id: 'e1', source: 'ai', inputs: { status: 'pending' }, model: 'gpt-image-1-mini' });
    expect(calls).toEqual(['lock:UPDATE', 'count', 'create']);
  });

  it('at the ceiling it returns null and writes nothing; one below, it reserves', async () => {
    used = 12;
    expect(await reserveAiAttempt('e1', 'A', 'p', 'm', 12, JACKIE)).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
    used = 11;
    expect(await reserveAiAttempt('e1', 'A', 'p', 'm', 12, JACKIE)).not.toBeNull();
  });

  it('counts AI rows of this event since Central midnight', async () => {
    await reserveAiAttempt('e1', 'A', 'p', 'm', 12, JACKIE, new Date('2026-12-02T03:00:00Z'));
    const where = mockCount.mock.calls[0][0].where;
    expect(where).toMatchObject({ event_id: 'e1', source: 'ai' });
    expect(where.created_at[Op.gte].toISOString()).toBe('2026-12-01T06:00:00.000Z'); // 9 PM CST Dec 1 belongs to Dec 1
  });
});

describe('CH4.3 centralMidnight across DST', () => {
  it.each([
    ['2026-07-15T12:00:00Z', '2026-07-15T05:00:00.000Z'],
    ['2026-11-01T12:00:00Z', '2026-11-01T05:00:00.000Z'], // the change day: midnight was still CDT
    ['2026-11-02T12:00:00Z', '2026-11-02T06:00:00.000Z'],
    ['2027-03-14T12:00:00Z', '2027-03-14T06:00:00.000Z'], // the change day: midnight was still CST
    ['2027-03-15T12:00:00Z', '2027-03-15T05:00:00.000Z'],
  ])('%s -> %s', (now, midnight) => {
    expect(centralMidnight(new Date(now)).toISOString()).toBe(midnight);
  });
});

it('the cost estimate is per quality and canvas, and null when unknown', () => {
  expect(estimateCostUsd('medium', '1536x1024')).toBe(0.063);
  expect(estimateCostUsd('ultra', '1536x1024')).toBeNull();
});
