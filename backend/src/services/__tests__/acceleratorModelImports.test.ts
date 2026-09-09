import * as fs from 'fs';
import * as path from 'path';
import { Cohort } from '../../models';

/**
 * Guards the defect that took the Accelerator dashboard down in production on
 * 2026-09-09, which nothing else in the pipeline could see.
 *
 * `acceleratorCurrentClassesService` imported `Cohort` from '../models/Cohort'
 * rather than '../models'. The model FILES define columns only; every
 * association is wired in models/index.ts. So the import produced a valid
 * Cohort with no `program` association, and
 * `findAll({ include: [{ association: 'program' }] })` threw
 * "Association with alias program does not exist on Cohort" — but only at query
 * time, on a live database.
 *
 * That is why it shipped: it typechecks (the include is an untyped string),
 * the unit tests cover the pure selection rules rather than the query, and CI
 * has no database. The failure mode is invisible until the endpoint is called
 * against real data, and the page then renders a generic error.
 *
 * Two assertions, because there are two ways to reintroduce it: the association
 * could stop being registered, or a service could go back to importing the
 * model file directly.
 */

const SERVICES_DIR = path.join(__dirname, '..');

describe('Cohort associations are registered', () => {
  it('exposes `program`, which the accelerator services include', () => {
    expect(Object.keys(Cohort.associations)).toContain('program');
  });
});

describe('accelerator services import models from the barrel, not model files', () => {
  const files = fs
    .readdirSync(SERVICES_DIR)
    .filter((f) => /^accelerator.*\.ts$/.test(f));

  it('finds the services it is meant to be guarding', () => {
    // Non-vacuity: a rename that emptied this list would make every assertion
    // below pass while guarding nothing.
    expect(files.length).toBeGreaterThan(0);
  });

  /** Source with comments removed. Required, not cosmetic: the services carry a
   *  comment naming the bad import in order to warn against it, and scanning
   *  raw text flags that warning as the very thing it warns about. */
  const stripComments = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it.each(files)('%s imports no model file directly', (file) => {
    const code = stripComments(fs.readFileSync(path.join(SERVICES_DIR, file), 'utf8'));
    // Matches `from '../models/Cohort'` but deliberately NOT `from '../models'`.
    const direct = [...code.matchAll(/from\s+'\.\.\/models\/([A-Za-z0-9_]+)'/g)].map((m) => m[1]);
    expect(direct).toEqual([]);
  });

  it('still detects a direct import when one is present', () => {
    // Non-vacuity for the stripper: proves it did not simply delete everything,
    // which would make every assertion above pass on an empty string.
    const sample = "import { X } from '../models/Cohort';\n// from '../models/Enrollment'\n";
    const code = stripComments(sample);
    const direct = [...code.matchAll(/from\s+'\.\.\/models\/([A-Za-z0-9_]+)'/g)].map((m) => m[1]);
    expect(direct).toEqual(['Cohort']);
  });
});
