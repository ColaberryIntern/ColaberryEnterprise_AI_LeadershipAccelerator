/**
 * The library's write paths: saving a link, re-uploading a file, editing, archiving, tags.
 *
 * These are service tests, not HTTP tests. The routes are deliberately thin - Zod shape in,
 * service call, `fail()` out - so the rules that could be wrong all live here, and a test that
 * went through Express would be testing Express. The verification T9 asks for is about
 * behaviour, and this is where the behaviour is.
 */

jest.mock('../../../models', () => {
  const { makeFakeModelSet } = require('../../publishing/__tests__/fakeModels');
  return makeFakeModelSet();
});

import * as mockedModels from '../../../models';
import { type FakeModelSet, resetAll } from '../../publishing/__tests__/fakeModels';
import {
  archiveLibraryAsset,
  assertLibraryAltText,
  createLinkAsset,
  normaliseTags,
  updateLibraryAsset,
} from '../mediaLibraryService';
import { WorkflowError } from '../../content/contentWorkflowService';

const models = mockedModels as unknown as FakeModelSet;
const TENANT = 't-1';
const BRAND = '22222222-2222-4222-8222-222222222222';

const assetCount = () => models.MediaAsset.rows.length;

beforeEach(() => {
  resetAll(models);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => { jest.restoreAllMocks(); });

describe('saving a link', () => {
  const save = (over: Record<string, unknown> = {}) => createLinkAsset({
    tenantId: TENANT, brandId: BRAND, url: 'https://youtu.be/abc123', altText: 'Our open house clip', ...over,
  } as any);

  it('stores the shape the database CHECK requires of a link', async () => {
    const asset = await save() as any;
    expect(asset.kind).toBe('link');
    expect(asset.source_url).toBe('https://youtu.be/abc123');
    // storage_key must be null and mime_type must be set, or media_assets_kind_shape refuses it.
    expect(asset.storage_key).toBeNull();
    expect(asset.mime_type).toBe('text/uri-list');
  });

  it('stores nothing fetched FROM the url', async () => {
    // No HEAD request, no oEmbed, no thumbnail. Saving a link must not make an outbound request
    // on the operator's behalf to a host they pasted, and a derived id would be a cache with no
    // invalidation.
    const asset = await save() as any;
    expect(asset.metadata).toEqual({});
    expect(asset.original_filename).toBeNull();
    expect(asset.byte_size ?? null).toBeNull();
    expect(asset.width ?? null).toBeNull();
  });

  it('REFUSES javascript: and data:, which z.string().url() would accept', async () => {
    await expect(save({ url: 'javascript:alert(1)' })).rejects.toMatchObject({ status: 400, errorClass: 'LinkScheme' });
    await expect(save({ url: 'data:text/html;base64,PHM+' })).rejects.toMatchObject({ status: 400, errorClass: 'LinkScheme' });
    expect(assetCount()).toBe(0);
  });

  it('REFUSES a link with no description, because the library is browsed by description', async () => {
    await expect(save({ altText: 'x' })).rejects.toMatchObject({ status: 400, errorClass: 'AltTextRequired' });
    expect(assetCount()).toBe(0);
  });

  it('records rights when given, and leaves them unknown when not', async () => {
    const withRights = await save({ rightsHolder: 'Colaberry', rightsExpiresAt: new Date('2027-01-01T00:00:00Z') }) as any;
    expect(withRights.rights_holder).toBe('Colaberry');
    expect(withRights.rights_expires_at).toEqual(new Date('2027-01-01T00:00:00Z'));
    const without = await save({ url: 'https://vimeo.com/42' }) as any;
    expect(without.rights_holder).toBeNull();
    expect(without.rights_expires_at).toBeNull();
  });
});

describe('tags', () => {
  it('lowercases, trims and de-duplicates, so one tag is one tag', () => {
    // 'Q4' and 'q4' looking like two different tags in a filter list is the bug this prevents.
    expect(normaliseTags([' Q4 ', 'q4', 'Open House', 'open house'])).toEqual(['q4', 'open house']);
  });

  it('drops empties rather than storing a blank tag', () => {
    expect(normaliseTags(['', '   ', 'real'])).toEqual(['real']);
    expect(normaliseTags(undefined)).toEqual([]);
    expect(normaliseTags([])).toEqual([]);
  });

  it('refuses a tag long enough to be a paste accident', () => {
    expect(() => normaliseTags(['a'.repeat(41)])).toThrow(/40 characters/);
    expect(normaliseTags(['a'.repeat(40)])).toHaveLength(1);
  });

  it('caps the number of tags', () => {
    const many = Array.from({ length: 26 }, (_, i) => `tag-${i}`);
    expect(() => normaliseTags(many)).toThrow(/at most 25/);
    expect(normaliseTags(many.slice(0, 25))).toHaveLength(25);
  });
});

describe('alt text', () => {
  it('requires something a person could read, and caps it', () => {
    expect(assertLibraryAltText('  a photo  ')).toBe('a photo');
    expect(() => assertLibraryAltText('ab')).toThrow(/required/);
    expect(() => assertLibraryAltText('x'.repeat(301))).toThrow(/300 characters/);
    expect(assertLibraryAltText('x'.repeat(300))).toHaveLength(300);
  });
});

describe('editing', () => {
  const make = async () => createLinkAsset({
    tenantId: TENANT, brandId: BRAND, url: 'https://youtu.be/e1', altText: 'original text',
  } as any);

  it('changes only what was passed', async () => {
    const asset = await make() as any;
    await updateLibraryAsset(asset, { altText: 'new text' });
    expect(asset.alt_text).toBe('new text');
    expect(asset.source_url).toBe('https://youtu.be/e1');
    expect(asset.kind).toBe('link');
  });

  it('can clear rights by passing null, and leaves them alone when omitted', async () => {
    const asset = await make() as any;
    await updateLibraryAsset(asset, { rightsHolder: 'Someone' });
    expect(asset.rights_holder).toBe('Someone');
    await updateLibraryAsset(asset, { altText: 'untouched rights' });
    expect(asset.rights_holder).toBe('Someone');
    await updateLibraryAsset(asset, { rightsHolder: null });
    expect(asset.rights_holder).toBeNull();
  });

  it('applies the same alt-text and tag rules as creation', async () => {
    const asset = await make();
    await expect(updateLibraryAsset(asset, { altText: 'no' })).rejects.toMatchObject({ errorClass: 'AltTextRequired' });
    await expect(updateLibraryAsset(asset, { tags: ['x'.repeat(41)] })).rejects.toThrow(/40 characters/);
  });

  it('is a no-op when there is nothing to change', async () => {
    const asset = await make() as any;
    const before = asset.alt_text;
    await updateLibraryAsset(asset, {});
    expect(asset.alt_text).toBe(before);
  });

  it('never lets an edit change the kind, the url or the stored bytes', async () => {
    // updateLibraryAsset takes no such fields, which is the enforcement. This pins it, so adding
    // one later is a decision rather than an accident.
    const asset = await make() as any;
    await updateLibraryAsset(asset, { altText: 'still a link', tags: ['a'] } as any);
    expect(asset.kind).toBe('link');
    expect(asset.source_url).toBe('https://youtu.be/e1');
    expect(asset.storage_key).toBeNull();
  });
});

describe('archiving', () => {
  it('sets archived_at and DELETES NOTHING', async () => {
    // content_item_media references these rows and published posts reach them through that join,
    // so a hard delete would either break the FK or rewrite the record of what went out.
    const asset = await createLinkAsset({ tenantId: TENANT, brandId: BRAND, url: 'https://youtu.be/a1', altText: 'to archive' } as any) as any;
    const before = assetCount();
    await archiveLibraryAsset(asset);
    expect(asset.archived_at).toBeInstanceOf(Date);
    expect(assetCount()).toBe(before);
  });

  it('is idempotent: archiving twice keeps the first timestamp', async () => {
    const asset = await createLinkAsset({ tenantId: TENANT, brandId: BRAND, url: 'https://youtu.be/a2', altText: 'twice' } as any) as any;
    await archiveLibraryAsset(asset);
    const first = asset.archived_at;
    await archiveLibraryAsset(asset);
    expect(asset.archived_at).toBe(first);
  });
});

describe('CONTROL: these assertions can fail', () => {
  it('a known-bad link really is refused and a known-good one really is saved', async () => {
    // If createLinkAsset threw for everything, every REFUSES test above would pass vacuously;
    // if it threw for nothing, every rejects test would fail loudly. Both directions, together.
    await expect(createLinkAsset({ tenantId: TENANT, brandId: BRAND, url: 'javascript:1', altText: 'bad' } as any)).rejects.toThrow(WorkflowError);
    await expect(createLinkAsset({ tenantId: TENANT, brandId: BRAND, url: 'https://ok.example/1', altText: 'good' } as any)).resolves.toBeTruthy();
    expect(assetCount()).toBe(1);
  });
});
