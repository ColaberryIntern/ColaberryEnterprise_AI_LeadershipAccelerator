/**
 * Argument parsing for enableBrandSnackbar. The flag that matters is `--apply`: without it the
 * script writes nothing, so a parse that quietly treated a bare run as "apply" would turn the
 * snack bar on across every brand in the database without anyone asking for it.
 */
jest.mock('../../config/database', () => ({ connectDatabase: jest.fn(), sequelize: { query: jest.fn() } }));
jest.mock('../../models', () => ({ Brand: { findAll: jest.fn() }, LandingPage: { findAll: jest.fn() } }));

import { parseArgs } from '../enableBrandSnackbar';

describe('enableBrandSnackbar parseArgs', () => {
  it('happy path: a brand slug alone is a dry run', () => {
    expect(parseArgs(['colaberry-training'])).toEqual({
      slugs: ['colaberry-training'],
      all: false,
      apply: false,
    });
  });

  it('--apply is the only thing that authorizes a write', () => {
    expect(parseArgs(['colaberry-training', '--apply']).apply).toBe(true);
  });

  it('takes several slugs', () => {
    expect(parseArgs(['a', 'b', 'c']).slugs).toEqual(['a', 'b', 'c']);
  });

  it('--all is distinct from naming slugs', () => {
    const parsed = parseArgs(['--all']);
    expect(parsed.all).toBe(true);
    expect(parsed.slugs).toEqual([]);
  });

  it('boundary: no arguments at all yields no slugs and no flags, which the caller rejects', () => {
    expect(parseArgs([])).toEqual({ slugs: [], all: false, apply: false });
  });

  it('an unrecognized flag is never mistaken for a slug', () => {
    const parsed = parseArgs(['colaberry-training', '--dry-run']);
    expect(parsed.slugs).toEqual(['colaberry-training']);
    expect(parsed.apply).toBe(false);
  });

  it('flag order does not matter', () => {
    expect(parseArgs(['--apply', 'colaberry-training'])).toEqual({
      slugs: ['colaberry-training'],
      all: false,
      apply: true,
    });
  });
});
