/**
 * AL1: a campaign with min_send_gap_minutes never sends two emails closer than that, even when a
 * backlog makes many due at once. Campaigns without it are untouched (no query at all).
 */
const query = jest.fn();
jest.mock('../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => query(...a) } }));

import { sendGapMinutes, sentTooRecently, GAP_SLACK_MINUTES } from '../campaignSendGap';

beforeEach(() => { query.mockReset(); jest.spyOn(console, 'error').mockImplementation(() => undefined); });

describe('campaign send gap', () => {
  it('reads the setting; anything else means no gap', () => {
    expect(sendGapMinutes({ min_send_gap_minutes: 5 })).toBe(5);
    expect(sendGapMinutes({ min_send_gap_minutes: '5' })).toBe(5);
    expect(sendGapMinutes({})).toBe(0);
    expect(sendGapMinutes(null)).toBe(0);
    expect(sendGapMinutes({ min_send_gap_minutes: -1 })).toBe(0);
    expect(sendGapMinutes({ min_send_gap_minutes: 'x' })).toBe(0);
  });
  it('no gap set: never holds, never queries', async () => {
    expect(await sentTooRecently('c1', {})).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });
  it('holds when the campaign sent inside the gap (less one minute of tick slack)', async () => {
    query.mockResolvedValueOnce([{ x: 1 }]);
    expect(await sentTooRecently('c1', { min_send_gap_minutes: 5 })).toBe(true);
    const [sql, opts] = query.mock.calls[0];
    expect(sql).toMatch(/campaign_id = :c AND status = 'sent'/);
    expect(opts.replacements).toEqual({ c: 'c1', secs: (5 - GAP_SLACK_MINUTES) * 60 });
  });
  it('sends when nothing went out recently', async () => {
    query.mockResolvedValueOnce([]);
    expect(await sentTooRecently('c1', { min_send_gap_minutes: 5 })).toBe(false);
  });
  it('fails closed: a failed lookup holds the send (retried next tick) and logs its class', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('db down'), { name: 'ConnectionError' }));
    expect(await sentTooRecently('c1', { min_send_gap_minutes: 5 })).toBe(true);
    expect(String((console.error as jest.Mock).mock.calls[0][0])).toMatch(/"error_class":"ConnectionError"/);
  });
});
