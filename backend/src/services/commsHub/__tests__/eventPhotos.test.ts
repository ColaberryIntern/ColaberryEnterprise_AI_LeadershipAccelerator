/**
 * CH4.1 the hub's photo rules against mocked models and media: proven-by-bytes type, at most 6, the
 * same picture once, never on a cancelled event, and a plain error when the media brand is missing.
 */
type Row = Record<string, any>;
const events = new Map<string, Row>();
let links: Row[] = [];
let seq = 0;

jest.mock('../../../config/database', () => ({ sequelize: { transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb({ LOCK: { UPDATE: 'UPDATE' } })) } }));
jest.mock('../../../models/CommsHubEvent', () => ({ __esModule: true, default: { findByPk: jest.fn(async (id: string) => events.get(id) ?? null) } }));
jest.mock('../../../models/CommsHubEventPhoto', () => ({
  __esModule: true,
  default: {
    count: jest.fn(async ({ where }: Row) => links.filter((l) => l.event_id === where.event_id).length),
    findOne: jest.fn(async ({ where }: Row) => links.find((l) => l.event_id === where.event_id && l.media_asset_id === where.media_asset_id) ?? null),
    create: jest.fn(async (r: Row) => { seq += 1; const row = { id: `p${seq}`, created_at: new Date(seq), ...r }; links.push(row); return row; }),
    findAll: jest.fn(async ({ where }: Row) => links.filter((l) => l.event_id === where.event_id)),
    destroy: jest.fn(async ({ where }: Row) => { const n = links.length; links = links.filter((l) => !(l.id === where.id && l.event_id === where.event_id)); return n - links.length; }),
  },
}));
jest.mock('../../../models/MediaAsset', () => ({ __esModule: true, default: { findAll: jest.fn(async ({ where }: Row) => (where.id as string[]).map((id) => ({ id, alt_text: 'alt', width: 10, height: 10, storage_key: null }))) } }));
const mockBrands = jest.fn();
jest.mock('../../../models/Brand', () => ({ __esModule: true, default: { findAll: (...a: unknown[]) => mockBrands(...a) } }));
const mockIngest = jest.fn();
jest.mock('../../media/mediaAssetService', () => ({
  ingestFileBytes: (...a: unknown[]) => mockIngest(...a),
  findOrCreateLibraryAsset: jest.fn(async ({ ingest }: Row) => ({ asset: { id: `asset-${ingest.sha256}` }, reused: false })),
}));
const mockActivity = jest.fn();
jest.mock('../activityLog', () => ({ logActivity: (...a: unknown[]) => mockActivity(...a) }));

import { addPhoto, removePhoto, sniffImage, MAX_PHOTOS, PhotoRuleError } from '../eventPhotos';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const JACKIE = { id: 'jackie-1', label: 'jackie@colaberry.com' };
const pic = (n: number) => ({ bytes: Buffer.concat([JPG, Buffer.from([n])]), originalName: `p${n}.jpg`, altText: 'Speaker photo' });

beforeEach(() => {
  events.clear(); links = []; seq = 0; jest.clearAllMocks();
  events.set('e1', { id: 'e1', status: 'scheduled' });
  mockBrands.mockResolvedValue([{ get: (k: string) => (k === 'id' ? 'brand-1' : 'tenant-1') }]);
  mockIngest.mockImplementation(async (_b: string, bytes: Buffer) => ({ sha256: bytes.toString('hex') }));
});

describe('CH4.1 sniffImage', () => {
  it('trusts bytes, not names: PNG and JPEG yes; SVG, PDF, GIF, text and empty no', () => {
    expect(sniffImage(PNG)).toBe('image/png');
    expect(sniffImage(JPG)).toBe('image/jpeg');
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffImage(Buffer.from('%PDF-1.7'))).toBeNull();
    expect(sniffImage(Buffer.from('GIF89a'))).toBeNull();
    expect(sniffImage(Buffer.alloc(0))).toBeNull();
  });
});

describe('CH4.1 addPhoto / removePhoto', () => {
  it('happy: stored under the hub brand, linked in order, activity logged', async () => {
    const photos = await addPhoto('e1', pic(1), JACKIE);
    expect(mockIngest).toHaveBeenCalledWith('brand-1', expect.any(Buffer), 'image/jpeg');
    expect(photos).toHaveLength(1);
    expect(mockActivity).toHaveBeenCalledWith(JACKIE, 'photo.added', 'event', 'e1', expect.any(Object), expect.anything());
  });

  it('a file that is not an image by its bytes is refused before anything is decoded or stored', async () => {
    await expect(addPhoto('e1', { bytes: Buffer.from('<svg/>'), originalName: 'x.jpg', altText: 'x x x' }, JACKIE)).rejects.toMatchObject({ status: 415 });
    expect(mockIngest).not.toHaveBeenCalled();
  });

  it(`at most ${MAX_PHOTOS}: the next one is refused with a 409 and nothing is linked`, async () => {
    for (let i = 1; i <= MAX_PHOTOS; i += 1) await addPhoto('e1', pic(i), JACKIE);
    await expect(addPhoto('e1', pic(99), JACKIE)).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/6 pictures/) });
    expect(links).toHaveLength(MAX_PHOTOS);
  });

  it('idempotent: the same picture twice is linked once (even when the event is full)', async () => {
    await addPhoto('e1', pic(1), JACKIE);
    await addPhoto('e1', pic(1), JACKIE);
    expect(links).toHaveLength(1);
    expect(mockActivity).toHaveBeenCalledTimes(1);
  });

  it('a cancelled event takes no pictures; an unknown event is a 404', async () => {
    events.set('e2', { id: 'e2', status: 'cancelled' });
    await expect(addPhoto('e2', pic(1), JACKIE)).rejects.toMatchObject({ status: 409 });
    await expect(addPhoto('nope', pic(1), JACKIE)).rejects.toMatchObject({ status: 404 });
  });

  it('a missing or ambiguous media brand is a plain error, never a guess', async () => {
    mockBrands.mockResolvedValue([]);
    await expect(addPhoto('e1', pic(1), JACKIE)).rejects.toThrow(/not found; set COMMS_HUB_BRAND_SLUG/);
    mockBrands.mockResolvedValue([{ get: () => 'a' }, { get: () => 'b' }]);
    await expect(addPhoto('e1', pic(1), JACKIE)).rejects.toThrow(PhotoRuleError);
  });

  it('remove unlinks only that picture of that event, and logs only when something was removed', async () => {
    await addPhoto('e1', pic(1), JACKIE);
    const id = links[0].id;
    await removePhoto('other-event', id, JACKIE);
    expect(links).toHaveLength(1);
    await removePhoto('e1', id, JACKIE);
    expect(links).toHaveLength(0);
    expect(mockActivity.mock.calls.map((c) => c[1])).toEqual(['photo.added', 'photo.removed']);
  });
});
