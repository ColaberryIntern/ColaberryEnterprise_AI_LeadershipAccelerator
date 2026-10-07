/**
 * govSourceBundleStore — idempotency within a (tenant, qualification) scope is the non-negotiable (CLAUDE.md).
 * Re-attesting the same solicitation ZIP must not produce two rows and two files on the volume; two different
 * tenants attesting identical bytes must get their OWN rows; a lost unique-index race must resolve to the winner
 * and clean up its own orphan file. File-first-then-row, never throws silently.
 */
jest.mock('../../../../models/GovSourceBundle', () => ({
  __esModule: true,
  default: { findOne: jest.fn(), create: jest.fn(), findByPk: jest.fn() },
}));
jest.mock('../../../../config/upload', () => ({ GOV_SOURCE_BUNDLE_DIR: '/tmp/gov-source-bundles-test' }));
jest.mock('fs/promises', () => ({
  __esModule: true,
  default: { writeFile: jest.fn(), mkdir: jest.fn(), unlink: jest.fn(), access: jest.fn() },
}));

import fs from 'fs/promises';
import GovSourceBundle from '../../../../models/GovSourceBundle';
import { storeGovSourceBundle } from '../govSourceBundleStore';

const mockFindOne = GovSourceBundle.findOne as unknown as jest.Mock;
const mockCreate = GovSourceBundle.create as unknown as jest.Mock;
const mockWrite = fs.writeFile as unknown as jest.Mock;
const mockUnlink = fs.unlink as unknown as jest.Mock;

const TENANT = '11111111-1111-4111-8111-111111111111';
const OTHER_TENANT = '99999999-9999-4999-8999-999999999999';
const KEY = 'gws:22222222-2222-4222-a222-222222222222';

const zip = (name = 'solicitation.zip', body = 'the-same-zip-bytes') => ({
  originalname: name, mimetype: 'application/zip', buffer: Buffer.from(body),
});

beforeEach(() => {
  jest.clearAllMocks();
  (fs.mkdir as unknown as jest.Mock).mockResolvedValue(undefined);
  mockWrite.mockResolvedValue(undefined);
  mockUnlink.mockResolvedValue(undefined);
});

describe('storeGovSourceBundle — first store', () => {
  it('writes the file and creates the row, keyed to (tenant, qualification) with a real sha256', async () => {
    mockFindOne.mockResolvedValue(null);
    mockCreate.mockImplementation(async (v: any) => ({ id: 'new-id', ...v }));

    const r = await storeGovSourceBundle(TENANT, KEY, zip());

    expect(mockWrite).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(r.deduped).toBe(false);
    expect(r.id).toBe('new-id');
    expect(r.sha256).toHaveLength(64);
    const created = mockCreate.mock.calls[0][0];
    expect(created.tenant_id).toBe(TENANT);
    expect(created.qualification_key).toBe(KEY);
    expect(created.stored_name).toMatch(/\.zip$/); // opaque uuid + .zip
  });

  it('strips any path components from the display name (prod is Linux; a Windows path must not leak)', async () => {
    mockFindOne.mockResolvedValue(null);
    mockCreate.mockImplementation(async (v: any) => ({ id: 'new-id', ...v }));
    await storeGovSourceBundle(TENANT, KEY, zip('C:\\Users\\me\\bids\\solicitation.zip'));
    expect(mockCreate.mock.calls[0][0].filename).toBe('solicitation.zip');
  });
});

describe('storeGovSourceBundle — idempotency & scoping', () => {
  it('returns the existing bundle for the same bytes, writing nothing new', async () => {
    mockFindOne.mockResolvedValue({ id: 'existing-id', filename: 'solicitation.zip', mime: 'application/zip', byte_size: 18 });
    const r = await storeGovSourceBundle(TENANT, KEY, zip());
    expect(r).toMatchObject({ id: 'existing-id', deduped: true });
    expect(mockWrite).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('dedupes per (tenant, qualification) — two tenants with identical bytes get their own rows', async () => {
    mockFindOne.mockResolvedValue(null);
    mockCreate.mockImplementation(async (v: any) => ({ id: `id-for-${v.tenant_id}`, ...v }));
    const a = await storeGovSourceBundle(TENANT, KEY, zip());
    const b = await storeGovSourceBundle(OTHER_TENANT, KEY, zip());
    expect(a.id).not.toBe(b.id);
    expect(mockFindOne.mock.calls[0][0].where.tenant_id).toBe(TENANT);
    expect(mockFindOne.mock.calls[1][0].where.tenant_id).toBe(OTHER_TENANT);
  });

  it('resolves a lost unique-index race to the winner and cleans up its own orphan file', async () => {
    mockFindOne
      .mockResolvedValueOnce(null) // fast path missed
      .mockResolvedValueOnce({ id: 'winner-id', filename: 'solicitation.zip', mime: 'application/zip', byte_size: 18 });
    mockCreate.mockRejectedValue(Object.assign(new Error('duplicate key'), { name: 'SequelizeUniqueConstraintError' }));

    const r = await storeGovSourceBundle(TENANT, KEY, zip());

    expect(r.id).toBe('winner-id');
    expect(r.deduped).toBe(true);
    expect(mockUnlink).toHaveBeenCalledTimes(1); // the duplicate file did not stay on the volume
  });

  it('rethrows a create failure that is NOT a lost race', async () => {
    mockFindOne.mockResolvedValue(null); // still nothing after the failure
    mockCreate.mockRejectedValue(new Error('connection terminated'));
    await expect(storeGovSourceBundle(TENANT, KEY, zip())).rejects.toThrow('connection terminated');
  });
});
