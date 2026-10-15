/**
 * AF2.3 — the declared role list and the stored role list must agree.
 *
 * ## The drift this catches
 *
 * `mgmtRoles.ts` declared EIGHT roles. The CHECK constraint in `server.ts` permitted SEVEN.
 * `mentor` was added to the TS union and to `MGMT_ROLE_DEFS` — deliberately, with a careful
 * comment explaining that the section grant is the coarse gate and `careerMentorScopeService`
 * applies the per-mentor scope — and the constraint was never widened. So
 * `UPDATE community_members SET mgmt_role = 'mentor'` was rejected by Postgres, and the mentor
 * role could not be assigned to anybody.
 *
 * Measured in production 2026-10-15, before the fix:
 *
 *     ck_community_members_mgmt_role  →  owner, admin, curriculum, revenue, admissions,
 *                                        support, community_organizer        (7)
 *     MGMT_ROLES                      →  ...those seven, plus mentor         (8)
 *     career_mentor_scopes rows        →  0
 *     community_members with 'mentor'  →  0
 *
 * Latent rather than live-broken: nobody held the role, so nothing visibly failed. The portfolio
 * review queue simply had no mentors and no error anywhere said why.
 *
 * ## Why a parity test rather than a schema assertion
 *
 * The DDL runs in a loop that swallows every failure into a `console.warn`, so the constraint is
 * applied best-effort and a rejected `ALTER` is invisible. A test that connected to a database
 * would therefore prove something about one machine's database rather than about this repo. The
 * drift this test catches is between two statements IN THE SOURCE, so the source is where it is
 * checked, and it fails at the moment the next role is added to one of the two places.
 *
 * This is the same class as the `tsc`-vs-runtime gap elsewhere in the subsystem: a type union is
 * not an enforcement mechanism, and a CHECK constraint is not a type.
 */
import * as fs from 'fs';
import * as path from 'path';
import { MGMT_ROLES } from '../mgmtRoles';

const SERVER = path.join(__dirname, '..', '..', '..', 'server.ts');
/**
 * The THIRD copy. The frontend cannot import backend code, so the role list is restated there,
 * and it had already drifted the same way: `mentor` reached both backend copies and never this
 * one, so the role could not be SELECTED in the picker even once the database would accept it.
 * Two lists agreeing while a third disagrees is the same defect wearing a different hat.
 */
const FRONTEND = path.join(
  __dirname, '..', '..', '..', '..', '..', 'frontend', 'src', 'services', 'communityAdminApi.ts',
);

/** The roles the CHECK constraint actually permits, read out of the DDL this repo ships. */
function rolesPermittedByCheckConstraint(): string[] {
  const src = fs.readFileSync(SERVER, 'utf8');
  const m = src.match(
    /ck_community_members_mgmt_role CHECK \(mgmt_role IS NULL OR mgmt_role IN \(([^)]*)\)\)/,
  );
  if (!m) {
    throw new Error(
      'The mgmt_role CHECK constraint was not found in server.ts. It was either renamed or '
      + 'restructured — update this test deliberately rather than deleting it, because without '
      + 'it a declared role can again become unstorable with no failing test.',
    );
  }
  return m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
}

describe('AF2.3 mgmt_role declared list vs stored list', () => {
  it('finds the constraint at all', () => {
    // If the regex stops matching, every assertion below would pass vacuously on an empty array,
    // so this is asserted on its own rather than relying on the comparisons.
    expect(rolesPermittedByCheckConstraint().length).toBeGreaterThan(0);
  });

  it('permits EXACTLY the roles MGMT_ROLES declares', () => {
    const permitted = rolesPermittedByCheckConstraint();
    // Sorted, because the two lists are sets and their order carries no meaning.
    expect([...permitted].sort()).toEqual([...MGMT_ROLES].sort());
  });

  it('names the specific role on a mismatch, so the failure is actionable', () => {
    const permitted = new Set(rolesPermittedByCheckConstraint());
    const declaredButUnstorable = MGMT_ROLES.filter((r) => !permitted.has(r));
    // This is the exact assertion that would have failed before the fix, with 'mentor' in it.
    expect(declaredButUnstorable).toEqual([]);
  });

  it('has no storable role that the code does not define', () => {
    // The other direction matters too: a role the database accepts but `sectionsForRole` does not
    // recognise gets NOTHING (deny by default), which looks like a broken account rather than a
    // misconfiguration.
    const declared = new Set<string>(MGMT_ROLES);
    const storableButUndefined = rolesPermittedByCheckConstraint().filter((r) => !declared.has(r));
    expect(storableButUndefined).toEqual([]);
  });

  it('still includes mentor specifically', () => {
    // Named rather than inferred: this is the role the drift hid, and a future refactor that
    // quietly drops it from both lists at once would satisfy every assertion above.
    expect(rolesPermittedByCheckConstraint()).toContain('mentor');
    expect(MGMT_ROLES).toContain('mentor');
  });
});

/** The frontend's `MGMT_ROLES` array, read out of the file the picker imports. */
function rolesOfferedByThePicker(): string[] {
  const src = fs.readFileSync(FRONTEND, 'utf8');
  const m = src.match(/export const MGMT_ROLES: MgmtRole\[\] = \[([^\]]*)\]/);
  if (!m) {
    throw new Error(
      'The frontend MGMT_ROLES array was not found in communityAdminApi.ts. Update this test '
      + 'deliberately rather than deleting it — without it, a role can exist in the database and '
      + 'be unassignable because no picker offers it.',
    );
  }
  return m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
}

describe('AF2.3 the THIRD copy — what the role picker offers', () => {
  it('finds the frontend list at all', () => {
    expect(rolesOfferedByThePicker().length).toBeGreaterThan(0);
  });

  it('offers exactly the roles the backend declares', () => {
    expect([...rolesOfferedByThePicker()].sort()).toEqual([...MGMT_ROLES].sort());
  });

  it('has no role that is storable but unassignable', () => {
    // The exact shape of the drift this file was written for: `mentor` was storable (after the
    // CHECK fix) and still absent from the picker, so nobody could give it to anyone.
    const offered = new Set(rolesOfferedByThePicker());
    expect(MGMT_ROLES.filter((r) => !offered.has(r))).toEqual([]);
  });

  it('labels every role it offers', () => {
    // An unlabelled role renders as `undefined` in the dropdown, which is worse than absent:
    // it is selectable and nobody can tell what it grants.
    const src = fs.readFileSync(FRONTEND, 'utf8');
    const block = src.match(/MGMT_ROLE_LABEL: Record<MgmtRole, string> = \{([\s\S]*?)\};/);
    expect(block).not.toBeNull();
    const labelled = [...block![1].matchAll(/(\w+)\s*:\s*'/g)].map((x) => x[1]);
    expect(rolesOfferedByThePicker().filter((r) => !labelled.includes(r))).toEqual([]);
  });
});
