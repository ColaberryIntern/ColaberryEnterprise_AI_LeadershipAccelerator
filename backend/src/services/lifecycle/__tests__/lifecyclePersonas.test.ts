import fs from 'fs';
import path from 'path';
import {
  PERSONAS,
  PERSONA_DEFINING_PERMISSION,
  ROLES_OUTSIDE_PERSONAS,
  isReadOnlyRole,
  rolesForPersona,
  personasForRole,
  rolesOutsideEveryPersona,
  type Persona,
} from '../lifecyclePersonas';
import {
  GATED_ACTIONS,
  ACTION_PERMISSION,
  personaMayPerform,
  permittedActionsForRole,
  type GatedAction,
} from '../lifecycleActions';
import {
  ALL_DELIVERY_ROLES,
  DELIVERY_ROLES,
  deliveryRoleGrants,
  rolesHaveDeliveryPermission,
  rolesWithDeliveryPermission,
} from '../../../modules/delivery/deliveryRoles';
import { STAGE_PERMISSION } from '../lifecycleTransition';
import { CHANGE_REQUEST_PERMISSION } from '../blueprintChangeRequest';

/**
 * THE PERSONA → ROLE MAPPING, PUBLISHED WITH THE COMMAND THAT PRODUCES IT.
 *
 * An earlier plan cycle got this vocabulary wrong in both directions, so the table is asserted
 * here as an explicit LIST rather than described in prose. Re-derive it with:
 *
 *   cd backend && npx ts-node -e "const p=require('./src/services/lifecycle/lifecyclePersonas');
 *     for (const k of p.PERSONAS) console.log(k, p.rolesForPersona(k).join(' '))"
 *
 * or read it off this test, which fails the moment the grant table moves underneath it.
 */
const EXPECTED_MAPPING: Readonly<Record<Persona, string[]>> = {
  author: ['delivery_owner', 'delivery_lead', 'architect', 'builder', 'associate_builder'],
  owner: ['delivery_owner', 'delivery_lead', 'client_owner', 'client_acceptance_owner'],
  designer: ['delivery_owner', 'delivery_lead', 'design_reviewer', 'client_owner', 'client_acceptance_owner'],
  builder: ['builder', 'associate_builder'],
  viewer: ['observer'],
};

describe('the five personas map onto the THIRTEEN existing roles', () => {
  it('names the five from the request’s own sentence, in order', () => {
    expect([...PERSONAS]).toEqual(['author', 'owner', 'designer', 'builder', 'viewer']);
  });

  it('introduces no new role: there are thirteen, and that is all there are', () => {
    expect(ALL_DELIVERY_ROLES).toHaveLength(13);
    expect(Object.keys(DELIVERY_ROLES)).toHaveLength(13);
  });

  it('maps each persona to exactly these roles', () => {
    const actual: Record<string, string[]> = {};
    for (const p of PERSONAS) actual[p] = [...rolesForPersona(p)];
    expect(actual).toEqual(EXPECTED_MAPPING);
  });

  it('every mapped role is a REAL role, not a string that looks like one', () => {
    const unknown = PERSONAS.flatMap((p) => rolesForPersona(p))
      .filter((r) => !(ALL_DELIVERY_ROLES as readonly string[]).includes(r));
    expect(unknown).toEqual([]);
  });

  it('derives the mapping from the grant table, not from a literal', () => {
    // If `rolesForPersona` returned a hardcoded list, this would disagree: it asks the registry
    // the same question by a different route.
    for (const persona of ['author', 'owner', 'designer', 'builder'] as const) {
      expect([...rolesForPersona(persona)])
        .toEqual([...rolesWithDeliveryPermission(PERSONA_DEFINING_PERMISSION[persona])]);
    }
  });
});

describe('the two measured GAPS are named, not invented away', () => {
  it('there is NO design.write permission anywhere in the grant table', () => {
    // The `designer` persona is defined by `design.approve` for this reason. Inventing
    // `design.write` to make the persona tidy would have been a permission the server never
    // checks, offered by a UI that believed it existed.
    const every = new Set(ALL_DELIVERY_ROLES.flatMap((r) => [...deliveryRoleGrants(r)]));
    expect([...every].filter((p) => p.startsWith('design.')).sort())
      .toEqual(['design.approve', 'design.comment', 'design.read']);
    expect(every.has('design.write' as never)).toBe(false);
    expect(PERSONA_DEFINING_PERMISSION.designer).toBe('design.approve');
  });

  it('FOUR roles belong to no persona, each excluded with a reason', () => {
    expect(Object.keys(ROLES_OUTSIDE_PERSONAS).sort())
      .toEqual(['client_reviewer', 'mentor', 'qa_reviewer', 'security_reviewer']);
    const silent = Object.entries(ROLES_OUTSIDE_PERSONAS)
      .filter(([, why]) => why.trim().length === 0).map(([r]) => r);
    expect(silent).toEqual([]);
  });

  it('the four excluded roles really do hold no persona', () => {
    // Otherwise the exclusion list would be stale in the other direction: a role listed as
    // outside the personas while actually inside one.
    const wronglyExcluded = Object.keys(ROLES_OUTSIDE_PERSONAS)
      .filter((r) => personasForRole(r).length > 0);
    expect(wronglyExcluded).toEqual([]);
  });

  it('client_reviewer is excluded because comment is a WRITE, which the test checks', () => {
    // The judgement call in this mapping, made explicit rather than buried in a comment.
    expect(deliveryRoleGrants('client_reviewer')).toContain('design.comment');
    expect(isReadOnlyRole('client_reviewer')).toBe(false);
    expect(deliveryRoleGrants('client_reviewer')).not.toContain('design.approve');
  });
});

describe('coverage is asserted BOTH WAYS over the thirteen roles', () => {
  // A subset assertion — "every persona's roles are real" — cannot detect a role nobody covers.
  // That is the under-coverage that let an earlier cycle ship a nine-role answer for a
  // thirteen-role table, and it is the half this test adds.

  it('leaves no role outside both the personas and the exclusion list', () => {
    expect(rolesOutsideEveryPersona()).toEqual([]);
    // Non-vacuity: an empty role registry would make the filter pass trivially.
    expect(ALL_DELIVERY_ROLES.length).toBe(13);
  });

  it('accounts for every role exactly once across personas-or-excluded', () => {
    const covered = new Set(PERSONAS.flatMap((p) => rolesForPersona(p)));
    const excluded = new Set(Object.keys(ROLES_OUTSIDE_PERSONAS));
    const unaccounted = ALL_DELIVERY_ROLES.filter((r) => !covered.has(r) && !excluded.has(r));
    const doubleCounted = ALL_DELIVERY_ROLES.filter((r) => covered.has(r) && excluded.has(r));
    expect({ unaccounted, doubleCounted }).toEqual({ unaccounted: [], doubleCounted: [] });
    expect(covered.size + excluded.size).toBe(13);
  });

  it('the viewer persona is read-only by DERIVATION, and only observer qualifies', () => {
    expect([...rolesForPersona('viewer')]).toEqual(['observer']);
    expect(isReadOnlyRole('observer')).toBe(true);
    // Control: the predicate does reject a role with a write, so it is not always-true.
    expect(isReadOnlyRole('delivery_owner')).toBe(false);
    // Control: an unknown role grants nothing and is not thereby "read-only".
    expect(isReadOnlyRole('not_a_role')).toBe(false);
  });
});

describe('ONE CASE PER PERSONA PER GATED ACTION, with a negative control each', () => {
  /**
   * The full 5 × 5 matrix. `true` means at least one role holding that persona may act — the
   * question a surface asks when deciding what to OFFER. It is never an authorisation decision:
   * the server checks the acting role, and `author` spans the whole delivery organisation.
   */
  const MATRIX: Readonly<Record<Persona, Readonly<Record<GatedAction, boolean>>>> = {
    author: {
      approve_blueprint: true, request_changes: true, advance_requirements: true,
      advance_design: true, execute_story: true,
    },
    owner: {
      approve_blueprint: true, request_changes: true, advance_requirements: true,
      advance_design: true, execute_story: false,
    },
    designer: {
      approve_blueprint: true, request_changes: true, advance_requirements: true,
      advance_design: true, execute_story: false,
    },
    builder: {
      approve_blueprint: false, request_changes: false, advance_requirements: false,
      advance_design: false, execute_story: true,
    },
    viewer: {
      approve_blueprint: false, request_changes: false, advance_requirements: false,
      advance_design: false, execute_story: false,
    },
  };

  it('covers every persona × action pair with no gaps', () => {
    const missing: string[] = [];
    for (const p of PERSONAS) {
      for (const a of GATED_ACTIONS) {
        if (typeof MATRIX[p]?.[a] !== 'boolean') missing.push(`${p}/${a}`);
      }
    }
    expect(missing).toEqual([]);
    expect(PERSONAS.length * GATED_ACTIONS.length).toBe(25);
  });

  it('matches the matrix for all 25 pairs, naming any that differ', () => {
    const wrong: string[] = [];
    for (const p of PERSONAS) {
      for (const a of GATED_ACTIONS) {
        const got = personaMayPerform(p, a);
        if (got !== MATRIX[p][a]) wrong.push(`${p}/${a}: expected ${MATRIX[p][a]}, got ${got}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('every action has a persona that MAY and a persona that MAY NOT', () => {
    // The negative control, per action. An action every persona could do, or none could, would
    // make its row of the matrix meaningless.
    const degenerate: string[] = [];
    for (const a of GATED_ACTIONS) {
      const may = PERSONAS.filter((p) => personaMayPerform(p, a));
      if (may.length === 0 || may.length === PERSONAS.length) degenerate.push(a);
    }
    expect(degenerate).toEqual([]);
  });

  it('every action has a ROLE that may and a role that may not, checked on the server predicate', () => {
    // Personas are a view; roles are what the server actually checks. This asserts the same
    // separation one level down, through `rolesHaveDeliveryPermission` rather than this module.
    const degenerate: string[] = [];
    for (const a of GATED_ACTIONS) {
      const permitted = ALL_DELIVERY_ROLES.filter((r) => rolesHaveDeliveryPermission([r], ACTION_PERMISSION[a]));
      const refused = ALL_DELIVERY_ROLES.filter((r) => !rolesHaveDeliveryPermission([r], ACTION_PERMISSION[a]));
      if (permitted.length === 0 || refused.length === 0) degenerate.push(a);
    }
    expect(degenerate).toEqual([]);
  });

  it('a viewer may perform NO gated action, and observer is refused on the server too', () => {
    expect(GATED_ACTIONS.filter((a) => personaMayPerform('viewer', a))).toEqual([]);
    expect(GATED_ACTIONS.filter((a) => rolesHaveDeliveryPermission(['observer'], ACTION_PERMISSION[a])))
      .toEqual([]);
  });

  it('a builder may execute a story and may NOT approve the blueprint', () => {
    expect(personaMayPerform('builder', 'execute_story')).toBe(true);
    expect(personaMayPerform('builder', 'approve_blueprint')).toBe(false);
    expect(rolesHaveDeliveryPermission(['builder'], ACTION_PERMISSION.execute_story)).toBe(true);
    expect(rolesHaveDeliveryPermission(['builder'], ACTION_PERMISSION.approve_blueprint)).toBe(false);
  });

  it('PERSONA IS NOT AUTHORISATION, and the author persona proves why', () => {
    // `author` contains both the most privileged delivery role and an associate builder, so
    // "may an author approve the blueprint" is true while an associate builder cannot. Anyone
    // using `personaMayPerform` as a gate would grant on the strongest member.
    const authors = rolesForPersona('author') as readonly string[];
    expect(authors).toContain('delivery_owner');
    expect(authors).toContain('associate_builder');
    expect(personaMayPerform('author', 'approve_blueprint')).toBe(true);
    expect(rolesHaveDeliveryPermission(['associate_builder'], ACTION_PERMISSION.approve_blueprint))
      .toBe(false);
  });
});

describe('VISIBLE ACTIONS AND SERVER PERMISSIONS AGREE, by derivation not by copy', () => {
  it('each gated action’s permission IS the constant the acting code uses', () => {
    // A literal here would be a second definition, free to drift into a surface offering an
    // action the server refuses. These assertions fail if one is reintroduced.
    expect(ACTION_PERMISSION.approve_blueprint).toBe(STAGE_PERMISSION.blueprint_approved);
    expect(ACTION_PERMISSION.request_changes).toBe(CHANGE_REQUEST_PERMISSION);
    expect(ACTION_PERMISSION.advance_requirements).toBe(STAGE_PERMISSION.requirements_ready);
    expect(ACTION_PERMISSION.advance_design).toBe(STAGE_PERMISSION.design_ready);
    expect(ACTION_PERMISSION.execute_story).toBe(STAGE_PERMISSION.building);
  });

  it('covers every gated action, so none is left unmapped', () => {
    const unmapped = GATED_ACTIONS.filter((a) => !ACTION_PERMISSION[a]);
    expect(unmapped).toEqual([]);
    expect(GATED_ACTIONS.length).toBe(5);
  });

  it('what a persona is offered is EXACTLY what some role of that persona is permitted', () => {
    // The agreement, stated as an equivalence rather than two lists that happen to match.
    const disagreements: string[] = [];
    for (const p of PERSONAS) {
      for (const a of GATED_ACTIONS) {
        const offered = personaMayPerform(p, a);
        const permitted = rolesForPersona(p)
          .some((r) => rolesHaveDeliveryPermission([r], ACTION_PERMISSION[a]));
        if (offered !== permitted) disagreements.push(`${p}/${a}`);
      }
    }
    expect(disagreements).toEqual([]);
  });
});

describe('permittedActionsForRole is what the surface is gated on', () => {
  // The derivation the status endpoint serves and the page uses to decide which buttons exist.
  // It was inline in `readLifecycleStatus` and therefore untestable; extracting it is what made
  // the agreement between visible actions and server permissions assertable at all.

  it('gives an observer NOTHING, so a viewer is offered no action to be refused', () => {
    expect(permittedActionsForRole('observer')).toEqual([]);
  });

  it('gives a delivery owner four of the five — NOT execute_story', () => {
    // My first expectation here was "every action", and the grant table refused it: a delivery
    // owner holds `story.write` and `story.review` but not `story.execute`. Owners do not write
    // the code, and only BUILDER and ASSOCIATE_BUILDER carry that authority. The test was wrong,
    // not the table.
    expect(permittedActionsForRole('delivery_owner').slice().sort()).toEqual([
      'advance_design', 'advance_requirements', 'approve_blueprint', 'request_changes',
    ]);
    expect(permittedActionsForRole('delivery_owner')).not.toContain('execute_story');
    // And the one action it lacks is held by someone, so this is a real separation of duties
    // rather than an action nobody can perform.
    expect(permittedActionsForRole('builder')).toContain('execute_story');
  });

  it('gives a builder exactly the one action it has authority for', () => {
    expect(permittedActionsForRole('builder')).toEqual(['execute_story']);
  });

  it('FAILS CLOSED on an unknown or absent role', () => {
    // A caller with no role must see a read-only surface, not every button.
    expect(permittedActionsForRole('not_a_role')).toEqual([]);
    expect(permittedActionsForRole('')).toEqual([]);
  });

  it('agrees with the server predicate for every role and action', () => {
    const disagreements: string[] = [];
    for (const role of ALL_DELIVERY_ROLES) {
      const offered = new Set(permittedActionsForRole(role));
      for (const action of GATED_ACTIONS) {
        const permitted = rolesHaveDeliveryPermission([role], ACTION_PERMISSION[action]);
        if (offered.has(action) !== permitted) disagreements.push(`${role}/${action}`);
      }
    }
    expect(disagreements).toEqual([]);
    // Non-vacuity: 13 roles x 5 actions really were compared.
    expect(ALL_DELIVERY_ROLES.length * GATED_ACTIONS.length).toBe(65);
  });
});

describe('ABSENCE TRIPWIRE: nothing but the one route may approve a blueprint', () => {
  /**
   * LC-14's fourth clause is "no worker or job bypasses the blueprint". There is no worker to
   * test: `approveLifecycleBlueprint` has exactly one caller and it already runs the audited
   * write guard. A worker-bypass test would assert that a NONEXISTENT job cannot do something —
   * a test that cannot fail.
   *
   * This stands in its place. The importer set is derived by walking the tree, so ADDING a
   * worker path later fails this test until its checks are written. The live refusal is owed by
   * P6-T1, and LC-14 is recorded PARTIAL rather than claimed whole.
   */
  const SRC = path.join(__dirname, '..', '..', '..');

  const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, out);
      else if (e.name.endsWith('.ts')) out.push(full);
    }
    return out;
  };

  const importers = () => walk(SRC)
    .filter((f) => !f.includes('__tests__') && !f.endsWith('.test.ts'))
    .filter((f) => fs.readFileSync(f, 'utf8').includes('approveLifecycleBlueprint'))
    .map((f) => path.relative(SRC, f).split(path.sep).join('/'))
    .sort();

  it('is referenced by EXACTLY the definition and the one route', () => {
    expect(importers()).toEqual([
      'routes/admin/projectLifecycleRoutes.ts',
      'services/lifecycle/lifecycleStatus.ts',
    ]);
  });

  it('POSITIVE CONTROL: the walk really does find files and really does read them', () => {
    // Without this, a walk that returned nothing would make the assertion above pass by
    // finding no importers at all.
    const all = walk(SRC);
    expect(all.length).toBeGreaterThan(500);
    expect(all.some((f) => f.endsWith('lifecyclePersonas.ts'))).toBe(true);
  });

  it('the one caller runs the audited write guard before approving', () => {
    const route = fs.readFileSync(
      path.join(SRC, 'routes', 'admin', 'projectLifecycleRoutes.ts'), 'utf8',
    );
    expect(route).toContain('approveLifecycleBlueprint');
    const service = fs.readFileSync(
      path.join(SRC, 'services', 'lifecycle', 'lifecycleStatus.ts'), 'utf8',
    );
    // The guard call inside `approveLifecycleBlueprint`, which is what makes the single caller
    // safe rather than merely singular.
    expect(service).toMatch(/approveLifecycleBlueprint[\s\S]{0,1200}loadAndAuthorize\([^)]*'write'/);
  });
});
