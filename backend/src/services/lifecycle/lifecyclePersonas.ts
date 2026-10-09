/**
 * The five review personas, mapped onto the thirteen delivery roles that already exist.
 *
 * ── NO NEW ROLES, NO NEW LOGINS ──────────────────────────────────────────────
 * The request is explicit: "author/owner/designer/builder/viewer permissions and delegated
 * review using current roles … no proliferation of logins". So a persona here is a VIEW over
 * `DELIVERY_ROLES`, never a new constant, and nothing in this module grants anything. Every
 * answer is derived from `ROLE_GRANTS` through `rolesWithDeliveryPermission`, the inverse added
 * by P5-T2, so this module and the grant table cannot disagree.
 *
 * ── A PERSONA IS DEFINED BY A PERMISSION, NOT BY ITS NAME ────────────────────
 * `DESIGN_REVIEWER` sounds like the designer persona and `ARCHITECT` does not sound like an
 * author, and both readings would be wrong. Each persona is therefore pinned to the one
 * permission that makes someone that persona, and the roles fall out of the grant table. Name
 * similarity is how an earlier cycle got this vocabulary wrong in both directions.
 *
 * ── TWO MEASURED GAPS, NAMED RATHER THAN PAPERED OVER ────────────────────────
 *
 * 1. THERE IS NO `design.write` PERMISSION. The vocabulary has `design.read`, `design.comment`
 *    and `design.approve` and nothing else, so design AUTHORSHIP is not an authority this
 *    system models. The `designer` persona is therefore defined by `design.approve` — the design
 *    authority that does exist — and the absence is recorded here rather than closed by
 *    inventing a permission.
 *
 * 2. FOUR ROLES BELONG TO NO PERSONA. Mentor, QA reviewer, security reviewer and client reviewer
 *    are assurance and participation roles; none of them authors, owns, designs, builds or
 *    merely watches. They are listed in `ROLES_OUTSIDE_PERSONAS` with a reason each, so coverage
 *    can be asserted in BOTH directions. A subset assertion alone — "every persona's roles are
 *    real roles" — cannot detect a role nobody covers, which is the under-coverage that let an
 *    earlier cycle ship a nine-role answer for a thirteen-role table.
 */
import {
  ALL_DELIVERY_ROLES,
  deliveryRoleGrants,
  rolesWithDeliveryPermission,
  type DeliveryPermission,
  type DeliveryRole,
} from '../../modules/delivery/deliveryRoles';

/** The five personas, taken verbatim from the request's own sentence. */
export const PERSONAS = ['author', 'owner', 'designer', 'builder', 'viewer'] as const;

export type Persona = (typeof PERSONAS)[number];

/**
 * The permission that makes someone each persona.
 *
 * `viewer` is absent on purpose: it is not "holds one permission" but "holds ONLY reads", which
 * is a different shape of question and is answered by `isReadOnlyRole`.
 */
export const PERSONA_DEFINING_PERMISSION: Readonly<Record<
  Exclude<Persona, 'viewer'>, DeliveryPermission
>> = {
  // Writes the substance under review. Not `requirement.approve`: approving what someone else
  // wrote is the owner's act, not the author's.
  author: 'requirement.write',
  // Approves the agreement about what gets built. The same authority P5-T3 requires to request
  // changes, derived there from `STAGE_PERMISSION[AUTHORIZATION_STAGE]`.
  owner: 'contract.approve',
  // `design.approve`, because `design.write` DOES NOT EXIST — see this file's header.
  designer: 'design.approve',
  // Executes the work. `story.write` is the author of a story; executing it is the builder.
  builder: 'story.execute',
};

/** Why each role outside the five personas is outside them. */
export const ROLES_OUTSIDE_PERSONAS: Readonly<Record<string, string>> = {
  mentor: 'Reviews stories, verifies evidence and sets builder authority. An assurance role: it '
    + 'neither authors the blueprint, owns the agreement, designs, builds nor merely watches.',
  qa_reviewer: 'Reviews stories, verifies evidence and approves releases. Assurance, not one of '
    + 'the five review personas.',
  security_reviewer: 'Approves architecture and can block a release but cannot write either — '
    + '"a reviewer who can author what they review is not a reviewer". Assurance.',
  client_reviewer: 'Can look and comment but not decide. Holds `design.comment`, which is a '
    + 'write — it creates a comment record — so it is more than a viewer; and it lacks '
    + '`design.approve`, so it is less than a designer. It sits deliberately between the two.',
};

/** Every permission any role holds that is purely a read. Derived, not listed. */
function readOnlyPermissions(): Set<string> {
  const all = new Set<string>();
  for (const role of ALL_DELIVERY_ROLES) {
    for (const p of deliveryRoleGrants(role)) all.add(p);
  }
  return new Set([...all].filter((p) => p.endsWith('.read')));
}

/**
 * A role that can only look.
 *
 * Defined as "every permission it holds is a read", not as "it lacks some named write". A
 * deny-list would silently admit a role the day a new write permission is added and nobody
 * remembers to extend the list.
 */
export function isReadOnlyRole(role: string): boolean {
  const reads = readOnlyPermissions();
  const grants = deliveryRoleGrants(role);
  return grants.length > 0 && grants.every((p) => reads.has(p));
}

/** The roles that hold a persona. DERIVED from the grant table on every call. */
export function rolesForPersona(persona: Persona): readonly DeliveryRole[] {
  if (persona === 'viewer') return ALL_DELIVERY_ROLES.filter(isReadOnlyRole);
  return rolesWithDeliveryPermission(PERSONA_DEFINING_PERMISSION[persona]);
}

/** The personas a role holds. A role can hold several — an owner usually also authors. */
export function personasForRole(role: string): Persona[] {
  return PERSONAS.filter((p) => (rolesForPersona(p) as readonly string[]).includes(role));
}

/**
 * Roles belonging to no persona and not explicitly excluded.
 *
 * The both-ways half of the coverage assertion. A role added to `DELIVERY_ROLES` and mapped to
 * neither a persona nor an exclusion appears here, and a test fails — which a subset assertion
 * over the personas could never catch.
 */
export function rolesOutsideEveryPersona(): string[] {
  return ALL_DELIVERY_ROLES.filter(
    (role) => personasForRole(role).length === 0
      && !Object.prototype.hasOwnProperty.call(ROLES_OUTSIDE_PERSONAS, role),
  );
}
