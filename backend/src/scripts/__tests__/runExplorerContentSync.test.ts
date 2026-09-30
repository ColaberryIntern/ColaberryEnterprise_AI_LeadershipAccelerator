jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../services/explorerGrowth/content/syncTimelineCards', () => ({
  syncTimelineCards: jest.fn(),
  retireMissingCards: jest.fn(),
}));
jest.mock('../../services/explorerGrowth/content/resolveContentAssets', () => ({
  resolveContentAssets: jest.fn(),
}));

import { parseArgs, assertSafeTarget } from '../runExplorerContentSync';

/**
 * EPIC 5 T007. The guard, not the happy path.
 *
 * A prod-writing script without `--confirm-production` is a deviation from the
 * sibling `runExplorerGovernor.ts`, and the kind of deviation nobody notices
 * until it has already written.
 */

const withEnv = (url: string | undefined, fn: () => void) => {
  const prev = process.env.DATABASE_URL;
  if (url === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = url;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prev;
  }
};

describe('it refuses to write to production by accident', () => {
  it('throws against a prod-looking DATABASE_URL without the flag', () => {
    withEnv('postgres://u:p@host:5432/accelerator_prod', () => {
      expect(() => assertSafeTarget(parseArgs([]))).toThrow(/--confirm-production/);
    });
  });

  it('allows the write when the flag is passed deliberately', () => {
    withEnv('postgres://u:p@host:5432/accelerator_prod', () => {
      expect(() => assertSafeTarget(parseArgs(['--confirm-production']))).not.toThrow();
    });
  });

  it('always allows a dry run', () => {
    withEnv('postgres://u:p@host:5432/accelerator_prod', () => {
      expect(() => assertSafeTarget(parseArgs(['--dry-run']))).not.toThrow();
    });
  });

  it('always allows a read-only report', () => {
    // --report writes nothing, so gating it would only teach people to reach
    // for --confirm-production reflexively, which is how the guard stops working.
    withEnv('postgres://u:p@host:5432/accelerator_prod', () => {
      expect(() => assertSafeTarget(parseArgs(['--report']))).not.toThrow();
    });
  });

  it('does not treat a dev database as production', () => {
    withEnv('postgres://u:p@host:5432/accelerator_dev1', () => {
      expect(() => assertSafeTarget(parseArgs([]))).not.toThrow();
    });
  });

  it('does not fire when DATABASE_URL is unset', () => {
    // Local runs have no URL. A guard that blocks every local invocation gets
    // routed around, and a routed-around guard protects nothing.
    withEnv(undefined, () => {
      expect(() => assertSafeTarget(parseArgs([]))).not.toThrow();
    });
  });
});

describe('argument parsing', () => {
  it('defaults to writing, not to a dry run', () => {
    // The opposite default would be safer-seeming and worse: an operator who
    // believes they synced, and did not, gets an empty registry and no error.
    expect(parseArgs([])).toEqual({
      dryRun: false,
      confirmProduction: false,
      reportOnly: false,
    });
  });

  it('rejects an unknown flag rather than ignoring it', () => {
    // `--confirm-prod` silently ignored would mean the operator thinks they
    // passed the guard flag and the guard then blocks them — or worse, that a
    // typo'd `--dry-runn` writes for real.
    expect(() => parseArgs(['--dry-runn'])).toThrow(/unknown flag/);
  });

  it('accepts the three real flags together', () => {
    expect(parseArgs(['--dry-run', '--report', '--confirm-production'])).toEqual({
      dryRun: true,
      confirmProduction: true,
      reportOnly: true,
    });
  });
});

describe('it carries the same guard as its sibling', () => {
  it('never passes --as-of, which would overwrite EPIC 4 evidence', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'runExplorerContentSync.ts'), 'utf8');
    // `runExplorerGovernor --as-of 2026-08-24` is what someone reproducing the
    // EPIC 4 comparison would type, and it walks straight into
    // `existing.update()` on the 153 rows dated that day. This script has no
    // such flag at all, which is the strongest form of not offering it.
    expect(src).not.toContain('--as-of');
  });
});
