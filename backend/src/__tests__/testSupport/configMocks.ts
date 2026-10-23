/**
 * Complete mocks for the two config modules every suite accidentally depends on.
 *
 * Session CC-20261021-h9v3. Written to retire the `jest.ci.config.ts` ignore list, whose cause
 * the register had recorded as UNIDENTIFIED after three ruled-out hypotheses.
 *
 * ## The one pattern behind the whole ignore list
 *
 * Every excluded suite failed the same way, and it was never about the database being absent: a
 * PARTIAL MOCK OF A SHARED CONFIG MODULE, missing a field that some transitively-imported module
 * needs AT IMPORT TIME. The suite then dies before a single test runs, so the failure reads as
 * "Test suite failed to run" with no test names attached, which is why it looked like twenty
 * unrelated problems.
 *
 * Two shapes of it:
 *
 *   `config/database` — the stub supplies `define: jest.fn()`, which looks exactly right and is
 *   never consulted. `Model.init` reads `this.sequelize.options.define` and then calls
 *   `this.sequelize.runHooks` (`sequelize/lib/model.js`, `static init`). So a direct `require`
 *   of the mocked module sees a healthy-looking object while any model importing it throws
 *   `Cannot read properties of undefined (reading 'define')` — the "same module, two answers"
 *   oddity the register flagged as the thread to pull. There is no contradiction: the two code
 *   paths read different properties.
 *
 *   `config/env` — the stub supplies only the fields that suite cares about (`{ env: {} }`,
 *   `{ env: { jwtSecret, frontendUrl } }`). Anything that transitively imports `config/database`
 *   then reads `env.databaseUrl` as `undefined` and `new Sequelize(undefined)` throws
 *   `The "url" argument must be of type string`.
 *
 * ## Why completing the stub by hand is the wrong fix
 *
 * It was tried first. Adding `options: { define: {} }` moved the error from `define` to
 * `runHooks` — a treadmill where each missing internal reveals the next, and a hand-written stub
 * cannot track Sequelize's internals across upgrades. Both helpers below start from the REAL
 * thing and override only what a test needs, so there is nothing to keep in sync.
 */
import { Sequelize } from 'sequelize';

/**
 * A real Sequelize that never connects.
 *
 * The constructor performs NO I/O — it parses the URL and builds the dialect, and the first
 * socket is opened by `authenticate`/`query`. So `Model.init` gets exactly the object it expects
 * while nothing dials anything. The host is a literal nobody can reach, and `connectDatabase`
 * stays a `jest.fn()` in the suites that mock it, because that is the function that would
 * actually open a connection.
 *
 * `logging: false` because a suite that prints every generated statement is unreadable.
 */
export function unconnectedSequelize(): Sequelize {
  return new Sequelize('postgres://unused:unused@127.0.0.1:1/unused', {
    dialect: 'postgres',
    logging: false,
  });
}

/**
 * The module shape `jest.mock('../../config/database', ...)` should return.
 *
 * `spyOn` NAMES THE METHODS THE TEST ASSERTS ON, and they are replaced with `jest.fn()` on the
 * real instance rather than being the only thing that exists. Several suites stub `query`,
 * `transaction` or `getQueryInterface` precisely because they assert the call — so handing them
 * a bare real Sequelize would fix the import and break the assertion. Starting from the real
 * object and overwriting those few keeps both: `Model.init` finds the internals it needs, and
 * the test still owns the method it is checking.
 *
 * The test reads its mock back off the imported `sequelize` (the same object), so nothing extra
 * has to be exported for it to assert on.
 *
 * ONLY NAME A METHOD WHOSE RETURN VALUE NOTHING NAVIGATES INTO. A `jest.fn()` returns
 * `undefined`, so overriding `getQueryInterface` — whose result callers read `.queryGenerator`
 * off — trades one import error for another. That was measured, not predicted: it is exactly
 * what happened to `typeLaunchGate` on the first pass of this change. `query`, `authenticate`,
 * `close` and `transaction` are safe because callers await the value rather than reaching
 * through it.
 */
export function databaseModuleMock(
  spyOn: ReadonlyArray<string> = [],
): { sequelize: Sequelize; connectDatabase: jest.Mock } {
  const sequelize = unconnectedSequelize();
  for (const method of spyOn) {
    (sequelize as unknown as Record<string, unknown>)[method] = jest.fn();
  }
  return { sequelize, connectDatabase: jest.fn() };
}

/**
 * The real `env`, with specific fields overridden.
 *
 * `requireActual` rather than a literal, so a field the suite never thought about —
 * `databaseUrl` being the one that broke six suites — is simply present. Safe to call under
 * jest: `config/env` only throws when `NODE_ENV === 'production'` and `JWT_SECRET` is unset,
 * and jest sets `NODE_ENV=test`.
 *
 * `Record<string, unknown>` for the overrides rather than `Partial<typeof env>`: a test
 * legitimately sets fields that the real type marks required, and tightening this would push
 * every caller back to a cast.
 */
export function envWith(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
  const actual = jest.requireActual('../../config/env') as { env: Record<string, unknown> };
  return { ...actual.env, ...overrides };
}

/** The module shape `jest.mock('../../config/env', ...)` should return. */
export function envModuleMock(overrides: Record<string, unknown> = {}): { env: Record<string, unknown> } {
  return { env: envWith(overrides) };
}
