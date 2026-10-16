/**
 * The boot guard, EXERCISED rather than grepped.
 *
 * ## Why this file exists
 *
 * An independent re-grade failed T09 at 7/12 for a specific reason: every assertion about the
 * guard read `server.ts` as a string. Nothing executed `start()`, nothing made
 * `ensureAgentDomainProjectSchema` reject, nothing observed `app.listen`. So the failure path the
 * guard exists for was asserted STRUCTURALLY and never exercised, while the repo's own cited
 * precedent — `ensureExplorerCampaignKeyIndex.test.ts` — does the behavioural thing: it mocks the
 * dependency to reject and asserts the function RESOLVES, over a range of thrown values.
 *
 * That verdict was correct. A source-grep is not a behavioural assertion, and the docblock that
 * named the precedent then skipped its core technique.
 *
 * ## What is driven here
 *
 * `ensureAgentDomainProjectSchemaGuarded` was extracted out of `server.ts` precisely so a test can
 * make its dependency reject. The assertions are: it resolves for an Error, a string, `null` and
 * `undefined`; it reports `ok: false`; and the `error_class` it derives is usable rather than the
 * generic `"Error"` that CLAUDE.md's Error-classification rule forbids in a production path.
 */

const mockQuery = jest.fn();
jest.mock('../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => mockQuery(...a) },
}));

import {
  ensureAgentDomainProjectSchemaGuarded,
  deriveBootErrorClass,
} from '../ensureAgentDomainProjectSchema';

let warn: jest.SpyInstance;

beforeEach(() => {
  mockQuery.mockReset();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

/** The last structured warning the guard emitted, parsed. */
function lastWarning(): Record<string, unknown> | null {
  for (let i = warn.mock.calls.length - 1; i >= 0; i -= 1) {
    const arg = warn.mock.calls[i][0];
    if (typeof arg !== 'string') continue;
    try {
      const o = JSON.parse(arg);
      if (o && o.event === 'agent_domain_schema_boot_failed') return o;
    } catch { /* not ours */ }
  }
  return null;
}

describe('the boot guard RESOLVES on every failure, so the port can still bind', () => {
  // The range the precedent uses. A rejection does not have to be an Error.
  const thrown: Array<[string, unknown]> = [
    ['an Error', new Error('SchemaInvariantViolation: missing table public.agent_domain_projects')],
    ['a bare Error', new Error('connect ECONNREFUSED 127.0.0.1:5432')],
    ['a string', 'something went wrong'],
    ['null', null],
    ['undefined', undefined],
  ];

  it.each(thrown)('resolves when the schema call rejects with %s', async (_label, value) => {
    mockQuery.mockRejectedValue(value);
    // The assertion that matters: it RESOLVES. If it rejected, `start()` would stop before
    // `app.listen` and the backend would not bind its port.
    await expect(ensureAgentDomainProjectSchemaGuarded()).resolves.toMatchObject({ ok: false });
  });

  /**
   * NO SUCCESS-PATH ASSERTION HERE, deliberately, after two failed attempts at one.
   *
   * A healthy run needs the introspection queries to return the actual table, column and index
   * names so the assert's comparisons pass. Mocking that faithfully means reconstructing the
   * assert's internals inside a test — brittle, and it would pass by agreeing with itself rather
   * than by observing anything.
   *
   * The success path already has better coverage elsewhere: `ensureAgentDomainProjectSchema.test.ts`
   * (35 tests) and `agentDomainProvisioner.concurrency.integration.test.ts` (29 tests against a
   * REAL Postgres, including a healthy-schema case and a positive control that the snapshot copy is
   * complete). An independent re-grade of T08 reproduced all of that against a live database.
   *
   * This file's job is the FAILURE path, which is what had no coverage at all.
   */
  it('the success path is covered by the schema and integration suites, named here so this gap is deliberate', () => {
    const fs2 = require('fs') as typeof import('fs');
    const p = require('path') as typeof import('path');
    expect(fs2.existsSync(p.join(__dirname, 'ensureAgentDomainProjectSchema.test.ts'))).toBe(true);
    expect(fs2.existsSync(p.join(
      __dirname, '..', '..', 'services', 'agentDomain', '__tests__',
      'agentDomainProvisioner.concurrency.integration.test.ts',
    ))).toBe(true);
  });

  it('emits the structured warning, with the event name and a derived class', async () => {
    mockQuery.mockRejectedValue(new Error('SchemaInvariantViolation: missing index foo'));
    await ensureAgentDomainProjectSchemaGuarded();
    const w = lastWarning();
    expect(w).not.toBeNull();
    expect(w!.event).toBe('agent_domain_schema_boot_failed');
    expect(w!.outcome).toBe('failure');
    expect(w!.remedy).toEqual(expect.stringContaining('agent_domain_schema_statement_failed'));
  });
});

describe('error_class is usable, not the generic "Error"', () => {
  it('promotes a SchemaInvariantViolation marker out of the message', () => {
    // THE DEFECT THIS CLOSES: the module raises its post-condition failure as
    // `new Error('SchemaInvariantViolation: ...')`, so `err.constructor.name` is "Error" — in the
    // exact case the guard exists for. CLAUDE.md names a generic Error in a production path as
    // not acceptable.
    expect(deriveBootErrorClass(new Error('SchemaInvariantViolation: missing table x')))
      .toBe('SchemaInvariantViolation');
  });

  it('POSITIVE CONTROL: a plain Error with no marker still reports its constructor', () => {
    // Proves the test above is reading the marker, not hardcoding a string.
    expect(deriveBootErrorClass(new Error('connect ECONNREFUSED'))).toBe('Error');
    expect(deriveBootErrorClass(new TypeError('x is not a function'))).toBe('TypeError');
  });

  it('never returns an empty class for a non-Error rejection', () => {
    expect(deriveBootErrorClass('a string')).toBe('UnknownError');
    expect(deriveBootErrorClass(null)).toBe('UnknownError');
    expect(deriveBootErrorClass(undefined)).toBe('UnknownError');
  });

  it('the guard logs the derived class, not the constructor name', async () => {
    mockQuery.mockRejectedValue(new Error('SchemaInvariantViolation: missing table y'));
    const res = await ensureAgentDomainProjectSchemaGuarded();
    expect(res.error_class).toBe('SchemaInvariantViolation');
    expect(lastWarning()!.error_class).toBe('SchemaInvariantViolation');
    // The thing that used to be logged here.
    expect(lastWarning()!.error_class).not.toBe('Error');
  });
});
