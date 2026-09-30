const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: any[]) => mockQuery(...a) } }));

import { firstPublishedAt } from '../planStore';

/**
 * A build's delivery window is floored on when its plan first existed, so a plan
 * published after its cohort started is not born overdue. `publishBuild` was
 * passing the CURRENT version's publish time, so every revision re-floored the
 * window on today and collapsed a staggered plan onto one date. Two students hit
 * it on 2026-09-29, both after asking for a single story to be added.
 */
describe('firstPublishedAt', () => {
  beforeEach(() => mockQuery.mockReset());

  it('is the EARLIEST publish across every version, not the latest', async () => {
    mockQuery.mockResolvedValue([[{ first_published_at: '2026-08-14T03:15:45.560Z' }]]);
    await expect(firstPublishedAt('p1')).resolves.toEqual(new Date('2026-08-14T03:15:45.560Z'));
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(String(sql)).toMatch(/min\(published_at\)/i);
    expect(String(sql)).toMatch(/published_at IS NOT NULL/i);
    expect(opts.replacements).toEqual({ projectId: 'p1' });
  });

  it('is null when nothing has published yet, so the caller falls back to this publish', async () => {
    mockQuery.mockResolvedValue([[{ first_published_at: null }]]);
    await expect(firstPublishedAt('p2')).resolves.toBeNull();
  });

  it('is null when the query returns no rows at all', async () => {
    mockQuery.mockResolvedValue([[]]);
    await expect(firstPublishedAt('p3')).resolves.toBeNull();
  });
});
