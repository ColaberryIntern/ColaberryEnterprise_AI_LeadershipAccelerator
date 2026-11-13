const mockQuery = jest.fn();
const T = { id: 'tx' };
jest.mock('../../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => mockQuery(...a), transaction: (cb: (t: unknown) => unknown) => cb(T) },
}));
jest.mock('../../../db/ensureColaberryTvSchema', () => ({ ensureColaberryTvSchema: jest.fn().mockResolvedValue(undefined) }));
const mockTitle = jest.fn();
jest.mock('../tvOembed', () => ({ fetchShortTitle: (id: string) => mockTitle(id) }));
// eslint-disable-next-line import/first
import { __resetTitleFillForTests, addShort, listAll, removeShort, reorderShorts, updateShort } from '../tvService';

/**
 * Campus v20 N3 (C134): every write lands with its audit row in one transaction; adding a link twice is one row; a stale order or a
 * missing short changes nothing.
 */
const A = '11111111-2222-4333-8444-000000000001';
const B = '11111111-2222-4333-8444-000000000002';
const row = (id: string, youtube_id: string, position: number, title: string | null = 'Short') =>
  ({ id, youtube_id, title, duration_s: null, audience: 'all', on_air: true, position, created_at: '2026-11-11T15:00:00Z' });
const sqls = () => mockQuery.mock.calls.map((c) => String(c[0]).replace(/\s+/g, ' ').trim());
const audits = () => mockQuery.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO colaberry_tv_audit'));

beforeEach(() => { mockQuery.mockReset(); mockTitle.mockReset(); __resetTitleFillForTests(); });

describe('addShort', () => {
  it('a new link: title from oEmbed, appended last, one audit row, in the transaction', async () => {
    mockTitle.mockResolvedValue('Week 1');
    mockQuery.mockResolvedValueOnce([row(A, 'aaaaaaaaaaa', 1)]) // current rows
      .mockResolvedValueOnce([row(B, 'bbbbbbbbbbb', 2, 'Week 1')]) // insert
      .mockResolvedValueOnce(undefined); // audit
    const r = await addShort('bbbbbbbbbbb', 'enrollment:e1');
    expect(r.created).toBe(true);
    expect(sqls()[1]).toMatch(/ON CONFLICT \(youtube_id\) DO NOTHING RETURNING/);
    expect(sqls()[1]).toMatch(/COALESCE\(MAX\(position\), 0\) \+ 1/);
    expect(audits()).toHaveLength(1);
    expect(audits()[0][1]).toMatchObject({ transaction: T, replacements: { action: 'add', actor: 'enrollment:e1', youtube_id: 'bbbbbbbbbbb' } });
  });

  it('the same link again returns the existing row and writes NOTHING (idempotent)', async () => {
    mockQuery.mockResolvedValueOnce([row(A, 'aaaaaaaaaaa', 1)]);
    const r = await addShort('aaaaaaaaaaa', 'enrollment:e1');
    expect(r).toEqual({ row: row(A, 'aaaaaaaaaaa', 1), created: false });
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockTitle).not.toHaveBeenCalled();
  });

  it('a race (inserted by someone else between the read and the insert) is not created and writes no audit row', async () => {
    mockTitle.mockResolvedValue(null);
    mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([row(A, 'aaaaaaaaaaa', 1)]);
    const r = await addShort('aaaaaaaaaaa', 'enrollment:e1');
    expect(r.created).toBe(false);
    expect(audits()).toHaveLength(0);
  });
});

describe('updateShort / removeShort', () => {
  it('an update changes only what was sent and audits it', async () => {
    mockQuery.mockResolvedValueOnce([row(A, 'aaaaaaaaaaa', 1)]).mockResolvedValueOnce(undefined);
    await updateShort(A, { on_air: false }, 'admin:ali');
    expect(mockQuery.mock.calls[0][1].replacements).toEqual({ id: A, title: null, audience: null, on_air: false });
    expect(audits()[0][1].replacements).toMatchObject({ action: 'update', actor: 'admin:ali', detail: JSON.stringify({ on_air: false }) });
  });
  it('an unknown id is not_found and writes no audit row', async () => {
    mockQuery.mockResolvedValueOnce([]);
    await expect(updateShort(A, { title: 'x' }, 'admin:ali')).resolves.toBe('not_found');
    mockQuery.mockResolvedValueOnce([]);
    await expect(removeShort(A, 'admin:ali')).resolves.toBe('not_found');
    expect(audits()).toHaveLength(0);
  });
  it('a removal is audited with what was removed', async () => {
    mockQuery.mockResolvedValueOnce([row(A, 'aaaaaaaaaaa', 1, 'Week 1')]).mockResolvedValueOnce(undefined);
    await expect(removeShort(A, 'enrollment:e1')).resolves.toBe('removed');
    expect(audits()[0][1].replacements).toMatchObject({ action: 'remove', youtube_id: 'aaaaaaaaaaa', detail: JSON.stringify({ title: 'Week 1' }) });
  });
});

describe('reorderShorts', () => {
  it('writes positions 1..n in the order sent, then audits once', async () => {
    mockQuery.mockResolvedValueOnce([row(A, 'aaaaaaaaaaa', 1), row(B, 'bbbbbbbbbbb', 2)])
      .mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([row(B, 'bbbbbbbbbbb', 1), row(A, 'aaaaaaaaaaa', 2)]);
    const r = await reorderShorts([B, A], 'enrollment:e1');
    expect(Array.isArray(r) && r.map((x) => x.id)).toEqual([B, A]);
    expect(mockQuery.mock.calls[1][1].replacements).toEqual({ pos: 1, id: B });
    expect(mockQuery.mock.calls[2][1].replacements).toEqual({ pos: 2, id: A });
    expect(audits()).toHaveLength(1);
  });
  it.each([
    ['a partial order', [A]],
    ['an unknown id', [A, '11111111-2222-4333-8444-000000000009']],
  ])('%s is a mismatch and writes nothing', async (_n, ids) => {
    mockQuery.mockResolvedValueOnce([row(A, 'aaaaaaaaaaa', 1), row(B, 'bbbbbbbbbbb', 2)]);
    await expect(reorderShorts(ids, 'enrollment:e1')).resolves.toBe('mismatch');
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});

describe('listAll fills missing titles once', () => {
  it('asks oEmbed only for untitled rows, stores what it gets, and does not ask again in the same process', async () => {
    mockTitle.mockResolvedValueOnce('Real title').mockResolvedValueOnce(null);
    mockQuery.mockResolvedValueOnce([row(A, 'aaaaaaaaaaa', 1, null), row(B, 'bbbbbbbbbbb', 2, 'Kept')])
      .mockResolvedValueOnce(undefined);
    const list = await listAll();
    expect(mockTitle).toHaveBeenCalledTimes(1);
    expect(sqls()[1]).toMatch(/UPDATE colaberry_tv_videos SET title = :title, updated_at = NOW\(\) WHERE id = :id AND title IS NULL/);
    expect(list[0].title).toBe('Real title');
    mockQuery.mockResolvedValueOnce([row(A, 'aaaaaaaaaaa', 1, null)]);
    await listAll();
    expect(mockTitle).toHaveBeenCalledTimes(1);
  });
});
