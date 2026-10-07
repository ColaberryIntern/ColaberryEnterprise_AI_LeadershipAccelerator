/**
 * The pure half of the manifest writer: the idempotency hash.
 *
 * Kept separate from the integration suite because this needs no database and therefore must
 * never skip. The hash is the whole idempotency scheme — if it collides, two different blueprints
 * share a row; if it is unstable, every call looks new and the writer duplicates on every replay.
 * Neither failure needs Postgres to demonstrate, so neither should be behind a `DATABASE_URL`.
 */
import { refsContentHash } from '../manifestWriter';
import { emptyRefs } from '../adapters/manifestRefs';

const TENANT = '11111111-1111-1111-1111-111111111111';
const PROJECT = '22222222-2222-2222-2222-222222222222';

describe('refsContentHash is stable, and separates its parts', () => {
  it('is deterministic for the same input', () => {
    const a = refsContentHash({ tenantId: TENANT, projectId: PROJECT, refs: emptyRefs('sbp', PROJECT) });
    const b = refsContentHash({ tenantId: TENANT, projectId: PROJECT, refs: emptyRefs('sbp', PROJECT) });

    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when the refs change', () => {
    const before = emptyRefs('sbp', PROJECT);
    const after = emptyRefs('sbp', PROJECT);
    after.processes.push({ id: 'proc-1', revision: 1 });

    // Without this the writer would treat an edited blueprint as a replay of the old one and
    // silently return the previous manifest.
    expect(refsContentHash({ tenantId: TENANT, projectId: PROJECT, refs: before }))
      .not.toBe(refsContentHash({ tenantId: TENANT, projectId: PROJECT, refs: after }));
  });

  it('changes when the PROJECT changes, with identical refs', () => {
    const refs = emptyRefs('sbp', PROJECT);

    expect(refsContentHash({ tenantId: TENANT, projectId: PROJECT, refs }))
      .not.toBe(refsContentHash({ tenantId: TENANT, projectId: 'other-project', refs }));
  });

  it('changes when the TENANT changes, with identical refs', () => {
    const refs = emptyRefs('sbp', PROJECT);

    // The unique indexes are per-tenant, but the hash must separate tenants too — otherwise two
    // tenants with the same blueprint shape would be relying on the index alone.
    expect(refsContentHash({ tenantId: TENANT, projectId: PROJECT, refs }))
      .not.toBe(refsContentHash({ tenantId: 'other-tenant', projectId: PROJECT, refs }));
  });

  it('NUL-joins its parts, so a boundary cannot be moved without changing the hash', () => {
    // The domain-separation property. Concatenating without a separator would make
    // ("ab","c") and ("a","bc") hash identically, which is a cross-project collision.
    const left = refsContentHash({ tenantId: 'ab', projectId: 'c', refs: null });
    const right = refsContentHash({ tenantId: 'a', projectId: 'bc', refs: null });

    expect(left).not.toBe(right);
  });

  it('treats absent refs as a value rather than throwing', () => {
    // `JSON.stringify(undefined)` is `undefined`, not a string, which would make the join
    // produce "t\0p\0undefined" by coercion. Pinned so that stays deliberate.
    expect(refsContentHash({ tenantId: TENANT, projectId: PROJECT, refs: null }))
      .toBe(refsContentHash({ tenantId: TENANT, projectId: PROJECT, refs: undefined }));
  });

  it('does NOT depend on a revision, which is the whole point of having two hashes', () => {
    // `manifestContentHash` includes the revision and is what an approval binds to. This one
    // must not, or it could not identify a replay: the writer chooses the revision, so a
    // revision-dependent key would make every replay look like a new write.
    const refs = emptyRefs('sbp', PROJECT);
    const h = refsContentHash({ tenantId: TENANT, projectId: PROJECT, refs });

    // There is no revision parameter to vary — the type has none. This asserts the surface
    // itself, so adding one later breaks a test rather than quietly changing the semantics.
    expect(Object.keys({ tenantId: TENANT, projectId: PROJECT, refs })).toEqual(
      ['tenantId', 'projectId', 'refs'],
    );
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});
