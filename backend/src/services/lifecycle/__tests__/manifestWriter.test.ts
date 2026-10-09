/**
 * The pure half of the manifest writer: the idempotency hash, and the replay mapping.
 *
 * Kept separate from the integration suite because this needs no database and therefore must
 * never skip. The hash is the whole idempotency scheme — if it collides, two different blueprints
 * share a row; if it is unstable, every call looks new and the writer duplicates on every replay.
 * Neither failure needs Postgres to demonstrate, so neither should be behind a `DATABASE_URL`.
 */
import { refsContentHash, replayedManifest } from '../manifestWriter';
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
    // `source` is REQUIRED on PinnedRef and both fixtures omitted it. Nothing caught that:
    // tsconfig excludes `**/*.test.ts`, and ts-jest runs with `isolatedModules`, so a green
    // jest run is not a typecheck. Found by pointing tsc at the test files directly.
    //
    // The value is a self-labelling fixture rather than a table name, because no
    // business-process table exists yet — naming one would be inventing a fact to satisfy a
    // type.
    after.processes.push({ id: 'proc-1', revision: 1, source: 'synthetic-fixture' });

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

    //
    // THE PREVIOUS VERSION OF THIS TEST COULD NOT FAIL. It asserted `Object.keys` of a literal
    // it had just built, under a comment claiming it would break if a parameter were added — a
    // verifier added one and hashed it, and 963 of 963 tests still passed. Standing rule 11:
    // when a value cannot distinguish two states, change the STRUCTURE, not the assertion. So
    // this varies the input the function actually receives.
    const base = { tenantId: TENANT, projectId: PROJECT, refs };
    const withRevision = { ...base, revision: 7 } as unknown as Parameters<typeof refsContentHash>[0];
    const withMore = { ...base, revision: 99, proposedBy: 'synthetic-reviewer' } as unknown as Parameters<typeof refsContentHash>[0];
    expect(refsContentHash(withRevision)).toBe(h);
    expect(refsContentHash(withMore)).toBe(h);

    // POSITIVE CONTROL, without which the two lines above also hold for a constant function:
    // a field the hash DOES depend on moves it.
    expect(refsContentHash({ ...base, projectId: PROJECT + 'x' })).not.toBe(h);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('replayedManifest maps the row another writer committed', () => {
  // An isolating control per operand of `row.content_sha256 ?? fallback`: delete the left side
  // and the first test fails, delete the right side and the second fails. The stored hash and
  // the fallback are deliberately DIFFERENT values, so neither can pass by coincidence.
  const row = { id: 'row-1', revision: 4, content_sha256: 'a'.repeat(64) };
  const FALLBACK = 'b'.repeat(64);
  const REFS_SHA = 'c'.repeat(64);

  it('reports the hash STORED on the row when the row has one', () => {
    const out = replayedManifest(row, FALLBACK, REFS_SHA);
    expect(out.contentSha256).toBe(row.content_sha256);
    expect(out.contentSha256).not.toBe(FALLBACK);
  });

  it('a replayed row with NO stored hash still reports a usable one', () => {
    // `content_sha256 VARCHAR(64)` is nullable in the DDL and in a live database, so this is a
    // real row shape rather than a defensive hypothetical. A row without a hash is one this
    // module did not write, and the caller’s own hash keeps the result usable while the null
    // is what says where the row came from.
    const out = replayedManifest({ ...row, content_sha256: null }, FALLBACK, REFS_SHA);
    expect(out.contentSha256).toBe(FALLBACK);
    expect(out.contentSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('reports created:false and carries the row identity through', () => {
    const out = replayedManifest(row, FALLBACK, REFS_SHA);
    expect(out.created).toBe(false);
    expect(out.manifestId).toBe(row.id);
    expect(out.revision).toBe(row.revision);
    expect(out.refsSha256).toBe(REFS_SHA);
  });
});
