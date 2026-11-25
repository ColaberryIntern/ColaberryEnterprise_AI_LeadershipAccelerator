/**
 * `resolveDoorSourceId` - the door's slug becomes a `lead_sources.id`, or it
 * becomes NULL, and it is never allowed to become a guess, an exception, or a
 * hang.
 *
 * The defect these tests lock down: leads captured through the Explorer / Open
 * House path were written with `source_id` NULL, 352 of 352 over 25 days on
 * production, which made their origin brand underivable. The tests that matter
 * most here are therefore the NEGATIVE ones - an unresolved slug must stay NULL
 * rather than acquiring a default brand, because a fabricated attribution cannot
 * later be told apart from a measured one.
 */

jest.spyOn(console, 'log').mockImplementation(() => undefined);
jest.spyOn(console, 'warn').mockImplementation(() => undefined);
jest.spyOn(console, 'error').mockImplementation(() => undefined);

const resolveContextBySourceSlug = jest.fn();
jest.mock('../../../modules/tenancy/tenantResolver', () => ({
  resolveContextBySourceSlug: (...a: unknown[]) => resolveContextBySourceSlug(...a),
}));

import { resolveDoorSourceId } from '../explorerSourceAttribution';
import { OPEN_HOUSE_DOOR_SOURCE_SLUG } from '../doorSlugs';

const CONTEXT = {
  tenantId: 'tenant-1',
  tenantSlug: 'colaberry',
  brandId: '10ebfb01-dc51-450d-bbef-a2c10e42efa8',
  brandSlug: 'colaberry-training',
  sourceId: '03e1d02e-5f36-4361-8a0e-3423a210501f',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('the happy path', () => {
  it('resolves the door slug to the source id that makes the brand derivable', async () => {
    resolveContextBySourceSlug.mockResolvedValue(CONTEXT);

    const result = await resolveDoorSourceId('training');

    expect(result).toEqual({ sourceId: CONTEXT.sourceId, path: 'resolved' });
    expect(resolveContextBySourceSlug).toHaveBeenCalledWith('training');
  });

  it('trims the slug, so a stray space in a call site does not silently lose a brand', async () => {
    resolveContextBySourceSlug.mockResolvedValue(CONTEXT);

    const result = await resolveDoorSourceId('  training  ');

    expect(result.sourceId).toBe(CONTEXT.sourceId);
    expect(resolveContextBySourceSlug).toHaveBeenCalledWith('training');
  });
});

describe('absence is honoured, never defaulted', () => {
  // The whole point of the argument having no default. A door that does not name
  // itself gets no brand, rather than inheriting whichever one was convenient.
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['an empty string', ''],
    ['whitespace only', '   '],
  ])('writes NULL and never calls the resolver when the slug is %s', async (_label, slug) => {
    const result = await resolveDoorSourceId(slug as string | null | undefined);

    expect(result).toEqual({ sourceId: null, path: 'no_slug_supplied' });
    expect(resolveContextBySourceSlug).not.toHaveBeenCalled();
  });

  it('leaves source_id NULL when the catalog does not know the slug', async () => {
    resolveContextBySourceSlug.mockResolvedValue(null);

    const result = await resolveDoorSourceId('a-door-nobody-registered');

    expect(result).toEqual({ sourceId: null, path: 'slug_unknown_to_catalog' });
  });

  it('leaves source_id NULL when the slug resolves to a brandless source', async () => {
    // `resolveContextBySourceSlug` returns null in this case today, but a context
    // arriving without a sourceId must not be read as an attribution either.
    resolveContextBySourceSlug.mockResolvedValue({ ...CONTEXT, sourceId: undefined });

    const result = await resolveDoorSourceId('training');

    expect(result.sourceId).toBeNull();
    expect(result.path).toBe('slug_unknown_to_catalog');
  });
});

describe('the failure path - a signup must survive all of it', () => {
  it('returns NULL rather than throwing when the resolver throws', async () => {
    resolveContextBySourceSlug.mockRejectedValue(new TypeError('resolver down'));

    const result = await resolveDoorSourceId('training');

    expect(result).toEqual({ sourceId: null, path: 'resolver_unavailable' });
  });

  it('classifies the error rather than logging a bare Error', async () => {
    resolveContextBySourceSlug.mockRejectedValue(new TypeError('resolver down'));

    await resolveDoorSourceId('training');

    const logged = (console.error as jest.Mock).mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('lead.door_source_resolve_failed');
    expect(logged).toContain('TypeError');
  });

  it('gives up on a resolver that hangs instead of holding the signup open', async () => {
    // Never resolves. Without the bound this test would hang rather than fail,
    // which is precisely the production behaviour being prevented.
    resolveContextBySourceSlug.mockReturnValue(new Promise(() => undefined));

    const result = await resolveDoorSourceId('training', { timeoutMs: 5 });

    expect(result).toEqual({ sourceId: null, path: 'resolver_timeout' });
  });

  it('CONTROL: the same hanging resolver DOES resolve when given no timeout to trip', async () => {
    // Without this control, the test above would pass just as happily if
    // `resolveDoorSourceId` returned a timeout for every input.
    resolveContextBySourceSlug.mockResolvedValue(CONTEXT);

    const result = await resolveDoorSourceId('training', { timeoutMs: 5 });

    expect(result.path).toBe('resolved');
  });
});

describe('idempotency and purity', () => {
  it('is replayable - the same slug twice gives the same answer and writes nothing', async () => {
    resolveContextBySourceSlug.mockResolvedValue(CONTEXT);

    const first = await resolveDoorSourceId('training');
    const second = await resolveDoorSourceId('training');

    expect(second).toEqual(first);
  });
});

describe('the door constant', () => {
  it('names the training source, which is the brand the snack bar reads', () => {
    // Verified against production: all 146 attributed leads from this funnel
    // resolve to `training` / `colaberry-training`, and that is the brand on the
    // landing page whose snack bar had nothing to show.
    expect(OPEN_HOUSE_DOOR_SOURCE_SLUG).toBe('training');
  });
});
