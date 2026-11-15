const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => mockQuery(...a) },
}));
// eslint-disable-next-line import/first
import { listLibraryShorts } from '../tvLibrarySource';

/**
 * Colaberry TV now plays the Colaberry Training library (Ali, 2026-11-15). What matters here is
 * what reaches the player and what is refused: a YouTube link becomes a short, anything the player
 * cannot embed is dropped rather than rendered broken, and the same video never appears twice.
 */
const BRAND = '10ebfb01-dc51-450d-bbef-a2c10e42efa8';
const brandOk = () => mockQuery.mockResolvedValueOnce([{ id: BRAND }]);
const asset = (over: Partial<Record<string, unknown>> = {}) => ({
  id: '11111111-2222-4333-8444-000000000001',
  source_url: 'https://youtube.com/shorts/DS47jZuWF0g?si=d0y3IxZC92CPkO6x',
  alt_text: 'Anthropic investing $100 Million in Ai training',
  duration_ms: null,
  created_at: '2026-11-13T15:00:00Z',
  ...over,
});
const sqls = () => mockQuery.mock.calls.map((c) => String(c[0]).replace(/\s+/g, ' ').trim());

beforeEach(() => { mockQuery.mockReset(); });

describe('listLibraryShorts', () => {
  it('turns a brand library link into a playable short, newest first', async () => {
    brandOk().mockResolvedValueOnce([
      asset({ id: 'a-old', source_url: 'https://youtu.be/aaaaaaaaaaa', alt_text: 'Older', created_at: '2026-11-01T00:00:00Z' }),
    ]);
    const list = await listLibraryShorts();
    expect(list).toEqual([{ id: 'a-old', youtube_id: 'aaaaaaaaaaa', title: 'Older', duration_s: null, created_at: '2026-11-01T00:00:00.000Z' }]);
    // The order is the database's, and it must be newest first.
    expect(sqls()[1]).toMatch(/ORDER BY created_at DESC/);
    // Only live links of this brand are eligible.
    expect(sqls()[1]).toMatch(/kind = 'link'/);
    expect(sqls()[1]).toMatch(/archived_at IS NULL/);
    expect(mockQuery.mock.calls[1][1].replacements).toEqual({ brandId: BRAND });
  });

  it('parses the shorts form the library actually stores, tracking parameters and all', async () => {
    brandOk().mockResolvedValueOnce([asset()]);
    const [short] = await listLibraryShorts();
    expect(short.youtube_id).toBe('DS47jZuWF0g');
    expect(short.title).toBe('Anthropic investing $100 Million in Ai training');
  });

  it('drops what the player cannot embed instead of rendering it broken', async () => {
    brandOk().mockResolvedValueOnce([
      asset({ id: 'vimeo', source_url: 'https://vimeo.com/123456789' }),
      asset({ id: 'plain', source_url: 'https://colaberry.com/a-blog-post' }),
      // CONTROL: a real YouTube link in the same batch is still kept, so the filter is not
      // vacuously dropping everything.
      asset({ id: 'keep', source_url: 'https://youtube.com/shorts/Pa5J5T6MZok' }),
    ]);
    const list = await listLibraryShorts();
    expect(list.map((v) => v.id)).toEqual(['keep']);
  });

  it('never plays the same video twice, however many library rows point at it', async () => {
    brandOk().mockResolvedValueOnce([
      asset({ id: 'first', source_url: 'https://youtube.com/shorts/DS47jZuWF0g?si=one' }),
      asset({ id: 'second', source_url: 'https://youtu.be/DS47jZuWF0g' }),
    ]);
    const list = await listLibraryShorts();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('first');
  });

  it('shows a neutral label rather than inventing a name, and converts duration to seconds', async () => {
    brandOk().mockResolvedValueOnce([asset({ alt_text: '   ', duration_ms: 47_400 })]);
    const [short] = await listLibraryShorts();
    expect(short.title).toBe('Colaberry short');
    expect(short.duration_s).toBe(47);
  });

  it("an unresolvable brand is an empty playlist, not another brand's videos", async () => {
    mockQuery.mockResolvedValueOnce([]); // no brand with that slug
    await expect(listLibraryShorts()).resolves.toEqual([]);
    expect(mockQuery).toHaveBeenCalledTimes(1); // never reached media_assets
  });

  it('refuses to guess when a slug matches more than one brand', async () => {
    mockQuery.mockResolvedValueOnce([{ id: BRAND }, { id: 'other-tenant-brand' }]);
    await expect(listLibraryShorts()).resolves.toEqual([]);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('lets a database failure surface, so the campus keeps the playlist it had', async () => {
    brandOk().mockRejectedValueOnce(new Error('db down'));
    await expect(listLibraryShorts()).rejects.toThrow('db down');
  });
});
