import { analyzerInputsFor } from '../caseStudyAnalyzerInputs';
import type { CaseStudyRepositoryRecord } from '../caseStudyRepoRecord';

/**
 * The seam between "what this Case Study cites" and "what the analyzer reads".
 *
 * WHY IT IS TESTED SEPARATELY. Both the sync service and the metric runner turn
 * attached repositories into analyzer inputs, and each is otherwise expensive to
 * drive — one needs sync-run rows, the other an approved snapshot. That cost is
 * precisely why the mapping drifted apart between them in the first place. Pulled
 * out as a pure function, the one line that actually matters is cheap to assert.
 */

const record = (over: Partial<CaseStudyRepositoryRecord> = {}): CaseStudyRepositoryRecord => ({
  id: 'r1', collectionId: 'c1',
  repoOwner: 'acme', repoName: 'monorepo', repoUrl: 'https://github.com/acme/monorepo',
  role: 'primary', visibility: 'private', accessStatus: 'connected',
  allowPublicRepoLink: false,
  ...over,
});

describe('analyzerInputsFor', () => {
  it('carries the path scope through to the analyzer', () => {
    // THE ASSERTION THE WHOLE FEATURE RESTS ON. Everything else about scoping can
    // be correct and the Case Study still describes the whole monorepo if this
    // one field does not make the trip.
    const scope = ['backend/src/services/agents/corybrain'];
    const [input] = analyzerInputsFor([record({ pathScope: scope })], { correlationId: 'cid' });
    expect(input.pathScope).toEqual(scope);
  });

  it('omits the field entirely when the repository is unscoped', () => {
    const [input] = analyzerInputsFor([record()], { correlationId: 'cid' });
    // `in`, not a truthiness check: an explicit `pathScope: undefined` would pass
    // `toBeUndefined()` while still changing the shape of an object that gets
    // logged and compared.
    expect('pathScope' in input).toBe(false);
  });

  it('treats an empty scope as no scope', () => {
    const [input] = analyzerInputsFor([record({ pathScope: [] })], { correlationId: 'cid' });
    expect('pathScope' in input).toBe(false);
  });

  it('scopes each repository independently', () => {
    // A collection where one repo is scoped and another is not must not leak the
    // scope sideways — the second repository is cited whole, deliberately.
    const inputs = analyzerInputsFor([
      record({ id: 'r1', repoName: 'monorepo', pathScope: ['backend/src'] }),
      record({ id: 'r2', repoName: 'sdk' }),
    ], { correlationId: 'cid' });
    expect(inputs[0].pathScope).toEqual(['backend/src']);
    expect('pathScope' in inputs[1]).toBe(false);
  });

  it('passes the correlation id and only injects fetchImpl when given one', () => {
    const [plain] = analyzerInputsFor([record()], { correlationId: 'cid-1' });
    expect(plain.correlationId).toBe('cid-1');
    // Production omits it so the client uses global fetch; an explicit
    // `fetchImpl: undefined` would override that with nothing.
    expect('fetchImpl' in plain).toBe(false);

    const fake = (async () => new Response('')) as unknown as typeof fetch;
    const [injected] = analyzerInputsFor([record()], { correlationId: 'cid-2', fetchImpl: fake });
    expect(injected.fetchImpl).toBe(fake);
  });

  it('maps owner and name from the record, not the URL', () => {
    // The URL is display text and can be stale; owner/name are what the parser
    // stored and what GitHub is actually asked for.
    const [input] = analyzerInputsFor(
      [record({ repoOwner: 'real', repoName: 'name', repoUrl: 'https://github.com/stale/url' })],
      { correlationId: 'cid' },
    );
    expect([input.owner, input.repo]).toEqual(['real', 'name']);
  });
});
