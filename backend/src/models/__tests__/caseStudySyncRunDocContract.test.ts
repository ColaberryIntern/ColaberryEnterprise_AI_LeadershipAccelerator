import fs from 'fs';
import path from 'path';
import type { CaseStudySyncStatus, CaseStudySyncTrigger } from '../../types/caseStudy';

/**
 * The doc comments on `CaseStudySyncRun` must list exactly the unions they name.
 *
 * WHY THIS EXISTS. Both comments were wrong, and wrong in a way nothing could
 * catch. `trigger` was documented as `manual | scheduled | webhook`: it named
 * `scheduled`, which the Zod enum rejects outright, and omitted `reconciliation`
 * and `project_update`, which it accepts. `status` omitted `unchanged` — the
 * idempotent-rerun outcome, so a reader would conclude a re-sync could never
 * reach the state a correctly-behaving no-op actually returns.
 *
 * A stale comment is not a cosmetic defect on a typed column. `trigger` and
 * `status` are `DataTypes.STRING` here, so the model itself constrains nothing;
 * the union and the Zod enum are the whole contract, and this comment is the
 * only place a reader meets them while looking at the table. The realistic
 * failure is not that someone is briefly confused — it is that someone
 * "corrects" the working enum to match the broken comment, because the comment
 * sits next to the column and the enum lives two modules away.
 *
 * So the rule this file enforces is directional: COMMENTS FOLLOW THE UNION,
 * never the reverse. It reads the source text rather than the runtime value,
 * because a comment has no runtime value to assert against — which is precisely
 * why it drifted in the first place.
 *
 * Adding a member to either union WILL fail this test. That is the intent: the
 * failure names the file to update, and the alternative is a comment that
 * silently stops being true.
 */

const MODEL = path.join(__dirname, '..', 'CaseStudySyncRun.ts');
const TYPES = path.join(__dirname, '..', '..', 'types', 'caseStudy.ts');

const read = (file: string): string => fs.readFileSync(file, 'utf8');

/** Pull the members out of `export type X = 'a' | 'b';` in the types module. */
function unionMembers(source: string, name: string): string[] {
  const re = new RegExp(`export type ${name}\\s*=([^;]+);`);
  const body = source.match(re)?.[1];
  if (!body) throw new Error(`union ${name} not found — did it move or get renamed?`);
  return (body.match(/'([^']+)'/g) ?? []).map((q) => q.slice(1, -1));
}

/**
 * The members a doc comment lists for one field.
 *
 * Anchored on the field declaration and read BACKWARDS to the nearest comment,
 * so a second field's comment can never satisfy the first. The alternative -
 * scanning the whole file for a pipe-separated run - would pass if any comment
 * anywhere happened to carry the right words.
 */
function documentedFor(source: string, field: string): string[] {
  const at = source.indexOf(`  ${field}?: string;`);
  if (at === -1) throw new Error(`field ${field} not found in the attributes interface`);
  const before = source.slice(0, at);
  const commentStart = before.lastIndexOf('/**');
  if (commentStart === -1) throw new Error(`no doc comment precedes ${field}`);
  const comment = before.slice(commentStart);
  // The listing line is the one carrying pipe-separated lowercase members.
  const line = comment
    .split('\n')
    .map((l) => l.replace(/^\s*\*?\s?/, ''))
    .find((l) => /\b[a-z_]+(\s*\|\s*[a-z_]+)+/.test(l));
  if (!line) throw new Error(`no pipe-separated member list found in the comment for ${field}`);
  const listing = line.match(/\b[a-z_]+(?:\s*\|\s*[a-z_]+)+/)![0];
  return listing.split('|').map((s) => s.trim());
}

describe('the sync-run doc comments list exactly the unions they name', () => {
  const model = read(MODEL);
  const types = read(TYPES);

  it('finds both unions, so a rename fails loudly rather than passing vacuously', () => {
    // Non-vacuity. If either union were renamed and this helper returned an empty
    // list, every comparison below would compare [] to [] and pass.
    expect(unionMembers(types, 'CaseStudySyncTrigger').length).toBeGreaterThan(0);
    expect(unionMembers(types, 'CaseStudySyncStatus').length).toBeGreaterThan(0);
  });

  it('documents every trigger the code accepts, and none it does not', () => {
    expect([...documentedFor(model, 'trigger')].sort())
      .toEqual([...unionMembers(types, 'CaseStudySyncTrigger')].sort());
  });

  it('documents every status the code can record, including unchanged', () => {
    const documented = documentedFor(model, 'status');
    // Named explicitly as well as compared as a set: `unchanged` is the member
    // that was missing, and the one whose absence changes what a reader believes
    // about idempotent re-runs.
    expect(documented).toContain('unchanged');
    expect([...documented].sort()).toEqual([...unionMembers(types, 'CaseStudySyncStatus')].sort());
  });

  it('does not document `scheduled`, which nothing can produce', () => {
    // There is no cron entry for Case Study sync, the Zod enum rejects the value,
    // and the metric provenance scope declined to add scheduling. Documenting it
    // invites someone to widen the enum to match.
    expect(documentedFor(model, 'trigger')).not.toContain('scheduled');
  });

  it('the union is the source of truth, and the type system agrees', () => {
    // Compile-time corroboration that the runtime lists above are the real unions
    // rather than two strings that happen to match: these assignments fail `tsc`
    // if a member is renamed or removed, which the file-reading checks cannot see.
    const trigger: CaseStudySyncTrigger = 'reconciliation';
    const status: CaseStudySyncStatus = 'unchanged';
    expect(unionMembers(types, 'CaseStudySyncTrigger')).toContain(trigger);
    expect(unionMembers(types, 'CaseStudySyncStatus')).toContain(status);
  });
});
