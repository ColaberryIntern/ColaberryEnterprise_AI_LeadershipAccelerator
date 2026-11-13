/**
 * A LINK ASSET MUST NEVER BE PUBLISHED AS A FILE.
 *
 * `buildPayload` fills `ref` from `asset?.storage_key ?? m.media_asset_id`. That fallback is
 * deliberate for a MISSING asset row: the adapter then fails loudly instead of the post
 * publishing without its image. A link asset is a different case the fallback was never written
 * for - the row is present and `storage_key` is legitimately null, because the asset is a URL
 * somebody pasted rather than bytes we stored.
 *
 * Without the guard, `ref` becomes a UUID. A UUID cannot match `KEY_PATTERN`
 * (`mediaStore.ts:80`, `/^media\/[0-9a-f-]{36}\/[0-9a-f]{64}\.(png|jpg|gif|mp4|pdf)$/`), and the
 * consequence is real and provider-specific:
 *   - LinkedIn wraps the MediaStoreError into a permanent `MediaUnreadable` and dead-letters the
 *     job on its first attempt;
 *   - Meta does not wrap it at all, so the worker classifies it transient and burns all three
 *     retries before dead-lettering, with the unhelpful error class `MediaStoreError`.
 * `adapter.validate` passes in both cases, so the external call is attempted first. Nothing is
 * silent - but the operator is left reading "could not be read (Not a media key.)" about a row
 * that was never supposed to carry a key.
 *
 * These tests pin the guard AND the fallback it must not disturb, because removing the guard and
 * removing the fallback break the same line in opposite directions.
 */

jest.mock('../../../models', () => {
  const { makeFakeModelSet } = require('./fakeModels');
  return makeFakeModelSet();
});
jest.mock('../../launchSafety', () => ({ isKillSwitchActive: jest.fn(async () => false) }));

import * as mockedModels from '../../../models';
import { type FakeModelSet, resetAll } from './fakeModels';
import { DryRunAdapter } from '../dryRunAdapter';
import { NoLiveAdapterError } from '../adapterRegistry';
import { runDueJobs } from '../publishingWorker';
import type { SocialProviderAdapter } from '../socialProviderAdapter';
import type { ProviderKey } from '../providerCapabilities';
import type { PublishPayload } from '../socialProviderAdapter';

const models = mockedModels as unknown as FakeModelSet;
const NOW = new Date('2026-11-03T15:00:30Z');
const OCC = '2026-11-03T15:00:00.000Z';
const FILE_KEY = 'media/11111111-1111-4111-8111-111111111111/'
  + 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png';

let warnSpy: jest.SpyInstance;
beforeEach(() => {
  resetAll(models);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => { jest.restoreAllMocks(); });

/** Capture the payload the adapter is actually handed, which is what this file is about. */
function capturingAdapter(): { adapter: SocialProviderAdapter; seen: PublishPayload[] } {
  const inner = new DryRunAdapter('x', () => NOW);
  const seen: PublishPayload[] = [];
  const adapter = {
    ...inner,
    key: inner.key,
    validate: inner.validate.bind(inner),
    publish: async (payload: PublishPayload) => {
      seen.push(payload);
      return inner.publish(payload);
    },
  } as unknown as SocialProviderAdapter;
  return { adapter, seen };
}

const factoryOf = (a: SocialProviderAdapter) => (p: ProviderKey) => {
  if (p !== 'x') throw new NoLiveAdapterError(p);
  return a;
};

async function seedWithAttachments(assets: Array<Record<string, unknown>>): Promise<string> {
  const item = await models.ContentItem.create({
    tenant_id: 't-1', brand_id: 'b-1', title: 'Post', canonical_body: 'Hello world',
    content_type: 'text', status: 'scheduled', revision: 1, scheduled_for: new Date(OCC),
  });
  let position = 0;
  for (const attrs of assets) {
    const asset = await models.MediaAsset.create({ tenant_id: 't-1', brand_id: 'b-1', ...attrs });
    await models.ContentItemMedia.create({
      content_item_id: item.id, media_asset_id: asset.id, position: position += 1,
    });
  }
  const v = await models.ContentVariant.create({ content_item_id: item.id, provider: 'x', body: 'Hello' });
  await models.PublishingJob.create({
    tenant_id: 't-1', brand_id: 'b-1', content_item_id: item.id, content_variant_id: v.id, provider: 'x',
    publish_at: new Date(OCC), scheduled_occurrence: OCC, content_revision: 1,
    idempotency_key: `${item.id}:${v.id}:1:${OCC}`,
  });
  return item.id;
}

const tick = (adapter: SocialProviderAdapter) =>
  runDueJobs({ now: () => NOW, killSwitch: async () => false, adapterFor: factoryOf(adapter), workerId: 'w', random: () => 0.5 });

describe('a link asset is never handed to a provider as a file', () => {
  it('skips the link and publishes the file, so no UUID ever reaches ref', async () => {
    await seedWithAttachments([
      { kind: 'file', storage_key: FILE_KEY, mime_type: 'image/png', alt_text: 'a real file' },
      { kind: 'link', storage_key: null, source_url: 'https://youtu.be/abc123', mime_type: 'text/uri-list', alt_text: 'a link' },
    ]);
    const { adapter, seen } = capturingAdapter();
    const r = await tick(adapter);

    expect(r).toMatchObject({ published: 1, failed: 0, retried: 0 });
    expect(seen).toHaveLength(1);
    expect(seen[0].media).toHaveLength(1);
    expect(seen[0].media[0].ref).toBe(FILE_KEY);
    expect(seen[0].mediaRefs).toEqual([FILE_KEY]);
    // The specific failure this guard prevents: a bare UUID in place of a storage key.
    const linkAssetId = models.MediaAsset.rows.find((a: any) => a.kind === 'link').id;
    expect(seen[0].mediaRefs).not.toContain(linkAssetId);
  });

  it('logs the skip loudly, with the ids needed to trace it', async () => {
    // A post publishing without an attachment someone chose is a content defect. Skipping in
    // silence would make it unexplainable after the fact.
    await seedWithAttachments([
      { kind: 'link', storage_key: null, source_url: 'https://vimeo.com/42', mime_type: 'text/uri-list' },
    ]);
    const { adapter } = capturingAdapter();
    await tick(adapter);

    const lines = warnSpy.mock.calls.map((c) => String(c[0]));
    const skip = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .find((o) => o && o.event === 'publish_media_skipped_link');
    expect(skip).toBeTruthy();
    expect(skip.level).toBe('warn');
    expect(skip.outcome).toBe('partial');
    expect(skip.correlation_id).toBeTruthy();
    expect(skip.context.media_asset_id).toBeTruthy();
    expect(skip.context.provider).toBe('x');
    expect(skip.context.reason).toMatch(/no stored bytes/);
  });

  it('publishes with NO media when every attachment is a link, rather than failing the job', async () => {
    // The text still has value, and the URL belongs in the body. Failing the whole post because
    // one attachment cannot be uploaded would be the worse outcome.
    await seedWithAttachments([
      { kind: 'link', storage_key: null, source_url: 'https://youtu.be/one', mime_type: 'text/uri-list' },
      { kind: 'link', storage_key: null, source_url: 'https://youtu.be/two', mime_type: 'text/uri-list' },
    ]);
    const { adapter, seen } = capturingAdapter();
    const r = await tick(adapter);

    expect(r).toMatchObject({ published: 1, failed: 0 });
    expect(seen[0].media).toEqual([]);
    expect(seen[0].mediaRefs).toEqual([]);
  });

  it('CONTROL: the missing-asset fallback still fires, so the guard did not replace it', async () => {
    // If the guard had been written as "skip anything without a storage_key", this case would
    // also be skipped - and a dangling attachment would publish silently, which is exactly the
    // behaviour the `??` was added to prevent. Here the asset ROW is absent, not a link.
    const item = await models.ContentItem.create({
      tenant_id: 't-1', brand_id: 'b-1', title: 'Post', canonical_body: 'Hello',
      content_type: 'text', status: 'scheduled', revision: 1, scheduled_for: new Date(OCC),
    });
    const orphanId = 'masset-does-not-exist';
    await models.ContentItemMedia.create({ content_item_id: item.id, media_asset_id: orphanId, position: 1 });
    const v = await models.ContentVariant.create({ content_item_id: item.id, provider: 'x', body: 'Hello' });
    await models.PublishingJob.create({
      tenant_id: 't-1', brand_id: 'b-1', content_item_id: item.id, content_variant_id: v.id, provider: 'x',
      publish_at: new Date(OCC), scheduled_occurrence: OCC, content_revision: 1,
      idempotency_key: `${item.id}:${v.id}:1:${OCC}`,
    });
    const { adapter, seen } = capturingAdapter();
    await tick(adapter);

    expect(seen[0].media).toHaveLength(1);
    expect(seen[0].media[0].ref).toBe(orphanId);
    expect(seen[0].media[0].mimeType).toBe('application/octet-stream');
  });

  it('CONTROL: an asset with no kind at all is treated as a file, not skipped', async () => {
    // Every row in production has `kind` NOT NULL DEFAULT 'file', but a fake row - or a row read
    // before the migration ran - can have it undefined. Skipping those would drop real images.
    await seedWithAttachments([
      { storage_key: FILE_KEY, mime_type: 'image/png' },
    ]);
    const { adapter, seen } = capturingAdapter();
    await tick(adapter);

    expect(seen[0].media).toHaveLength(1);
    expect(seen[0].media[0].ref).toBe(FILE_KEY);
  });
});
