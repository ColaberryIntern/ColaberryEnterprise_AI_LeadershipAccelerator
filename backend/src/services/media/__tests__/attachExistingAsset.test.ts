/**
 * attachExistingAsset — picking something already in the library.
 *
 * THE LOAD-BEARING ASSERTION IS A COUNT. LIB-4's whole promise is that choosing an existing
 * asset creates a JOIN ROW and no second `media_assets` row. A library that quietly duplicates
 * an asset every time someone reuses it is worse than no library, because the duplicates look
 * identical and nobody notices until the volume fills. So every test here checks the
 * `media_assets` count across the call, not just the return value.
 *
 * No sharp, no bytes, no filesystem: this function exists precisely because none of that should
 * happen on this path.
 */

jest.mock('../../../models', () => {
  const { makeFakeModelSet } = require('../../publishing/__tests__/fakeModels');
  return makeFakeModelSet();
});

import * as mockedModels from '../../../models';
import { type FakeModelSet, resetAll } from '../../publishing/__tests__/fakeModels';
import { attachExistingAsset } from '../mediaAssetService';
import { WorkflowError } from '../../content/contentWorkflowService';

const models = mockedModels as unknown as FakeModelSet;
const TENANT = 't-1';
const BRAND = '22222222-2222-4222-8222-222222222222';
const OTHER_BRAND = '33333333-3333-4333-8333-333333333333';

let itemId: string;

const assetCount = () => models.MediaAsset.rows.length;
const joinCount = () => models.ContentItemMedia.rows.length;

async function makeAsset(over: Record<string, unknown> = {}): Promise<string> {
  const a = await models.MediaAsset.create({
    tenant_id: TENANT, brand_id: BRAND, kind: 'file',
    storage_key: 'media/b/abc.png', mime_type: 'image/png', alt_text: 'a picture', ...over,
  });
  return a.id;
}

beforeEach(async () => {
  resetAll(models);
  const item = await models.ContentItem.create({
    tenant_id: TENANT, brand_id: BRAND, title: 'Post', status: 'draft', revision: 1,
  });
  itemId = item.id;
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => { jest.restoreAllMocks(); });

describe('attaching an asset that is already in the library', () => {
  it('creates a join row and NO new media_assets row', async () => {
    const mediaAssetId = await makeAsset();
    const before = assetCount();

    const result = await attachExistingAsset({ contentItemId: itemId, mediaAssetId });

    expect(result).toMatchObject({ mediaAssetId, position: 0, alreadyAttached: false });
    expect(joinCount()).toBe(1);
    // The assertion this task exists for.
    expect(assetCount()).toBe(before);
  });

  it('is idempotent: attaching the same asset twice leaves one join row and changes nothing', async () => {
    const mediaAssetId = await makeAsset();
    const first = await attachExistingAsset({ contentItemId: itemId, mediaAssetId });
    const before = { assets: assetCount(), joins: joinCount() };

    const second = await attachExistingAsset({ contentItemId: itemId, mediaAssetId });

    expect(second.alreadyAttached).toBe(true);
    expect(second.position).toBe(first.position);
    expect(assetCount()).toBe(before.assets);
    expect(joinCount()).toBe(before.joins);
  });

  it('appends in order when several assets are picked', async () => {
    const a = await makeAsset({ storage_key: 'media/b/a.png' });
    const b = await makeAsset({ storage_key: 'media/b/b.png' });
    const before = assetCount();

    expect((await attachExistingAsset({ contentItemId: itemId, mediaAssetId: a })).position).toBe(0);
    expect((await attachExistingAsset({ contentItemId: itemId, mediaAssetId: b })).position).toBe(1);
    expect(assetCount()).toBe(before);
    expect(joinCount()).toBe(2);
  });
});

describe('what it refuses', () => {
  it('REFUSES a link asset with a 422 that says what to do instead', async () => {
    const mediaAssetId = await makeAsset({
      kind: 'link', storage_key: null, source_url: 'https://youtu.be/abc', mime_type: 'text/uri-list',
    });
    const before = assetCount();

    await expect(attachExistingAsset({ contentItemId: itemId, mediaAssetId })).rejects.toThrow(WorkflowError);
    await expect(attachExistingAsset({ contentItemId: itemId, mediaAssetId })).rejects.toMatchObject({
      status: 422, errorClass: 'LinkNotAttachable',
    });
    // A link attached as media would publish as a post whose attachment the worker then skips.
    await expect(attachExistingAsset({ contentItemId: itemId, mediaAssetId })).rejects.toThrow(/link post/);

    expect(joinCount()).toBe(0);
    expect(assetCount()).toBe(before);
  });

  it('REFUSES a read-only imported item, reusing assertWritable', async () => {
    const imported = await models.ContentItem.create({
      tenant_id: TENANT, brand_id: BRAND, title: 'Imported', status: 'published', revision: 1,
      // `readOnly`, camelCase, plus a string `provenance` - both are required by
      // isReadOnlyImport (contentWorkflow.ts:202). snake_case here would silently not trigger,
      // and this test would assert a refusal that never happened.
      metadata: { provenance: 'linkedin_import', readOnly: true },
    });
    const mediaAssetId = await makeAsset();

    await expect(attachExistingAsset({ contentItemId: imported.id, mediaAssetId }))
      .rejects.toMatchObject({ status: 409 });
    expect(joinCount()).toBe(0);
  });

  it('REFUSES an archived asset rather than attaching something the library hid', async () => {
    const mediaAssetId = await makeAsset({ archived_at: new Date() });
    await expect(attachExistingAsset({ contentItemId: itemId, mediaAssetId }))
      .rejects.toMatchObject({ status: 409, errorClass: 'AssetArchived' });
    expect(joinCount()).toBe(0);
  });

  it('REFUSES an asset from another brand, and says only that it was not found', async () => {
    // An asset id is guessable. Without this, an operator on brand A could attach brand B's
    // asset by pasting an id - and a distinct error would confirm the id exists.
    const mediaAssetId = await makeAsset({ brand_id: OTHER_BRAND });
    await expect(attachExistingAsset({ contentItemId: itemId, mediaAssetId }))
      .rejects.toMatchObject({ status: 404, errorClass: 'AssetNotFound' });
    expect(joinCount()).toBe(0);
  });

  it('REFUSES an asset from another tenant with the SAME message as another brand', async () => {
    // Identical answers on purpose: a different one would turn this into a probe for which
    // tenant an id belongs to.
    const mediaAssetId = await makeAsset({ tenant_id: 'other-tenant' });
    await expect(attachExistingAsset({ contentItemId: itemId, mediaAssetId }))
      .rejects.toMatchObject({ status: 404, errorClass: 'AssetNotFound' });
    expect(joinCount()).toBe(0);
  });

  it('REFUSES past the attachment cap', async () => {
    for (let i = 0; i < 10; i += 1) {
      await attachExistingAsset({
        contentItemId: itemId,
        mediaAssetId: await makeAsset({ storage_key: `media/b/${i}.png` }),
      });
    }
    expect(joinCount()).toBe(10);
    await expect(attachExistingAsset({ contentItemId: itemId, mediaAssetId: await makeAsset({ storage_key: 'media/b/x.png' }) }))
      .rejects.toMatchObject({ status: 409, errorClass: 'TooManyAttachments' });
    expect(joinCount()).toBe(10);
  });

  it('404s on an asset that does not exist, and on an item that does not exist', async () => {
    await expect(attachExistingAsset({ contentItemId: itemId, mediaAssetId: 'nope' }))
      .rejects.toMatchObject({ status: 404 });
    await expect(attachExistingAsset({ contentItemId: 'nope', mediaAssetId: await makeAsset() }))
      .rejects.toMatchObject({ status: 404, errorClass: 'NotFound' });
  });
});

describe('CONTROL: the count assertions can actually detect a change', () => {
  it('a deliberately created asset moves the count, so "unchanged" means something', async () => {
    // Every test above rests on assetCount() being a real measurement. If the fake model did not
    // record rows, "unchanged" would be true no matter what the function did.
    const before = assetCount();
    await makeAsset({ storage_key: 'media/b/control.png' });
    expect(assetCount()).toBe(before + 1);
  });

  it('a deliberately created join row moves the join count too', async () => {
    const before = joinCount();
    await models.ContentItemMedia.create({ content_item_id: itemId, media_asset_id: 'control', position: 0 });
    expect(joinCount()).toBe(before + 1);
  });
});
