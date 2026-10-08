/**
 * The lifecycle actions a persona can be gated on, and the permission each one needs.
 *
 * Split from `lifecyclePersonas.ts`, which had reached CLAUDE.md's hard ceiling of 12 public
 * symbols. The seam is the one the obligations doc predicted: that module answers WHO SOMEONE
 * IS — which personas a role holds — and this one answers WHAT THEY MAY DO.
 *
 * Nothing here grants anything. Every answer is derived from the constants the acting code
 * already checks, so a change to `STAGE_PERMISSION` moves this with it instead of leaving a
 * matrix that quietly disagrees with the server.
 */
import {
  rolesHaveDeliveryPermission,
  rolesWithDeliveryPermission,
  type DeliveryPermission,
} from '../../modules/delivery/deliveryRoles';
import { STAGE_PERMISSION } from './lifecycleTransition';
import { CHANGE_REQUEST_PERMISSION } from './blueprintChangeRequest';
import { rolesForPersona, type Persona } from './lifecyclePersonas';

/**
 * The lifecycle actions a persona can be gated on — a SCOPED list, not every route.
 *
 * Reads are absent on purpose. `GET` status, compare and linked-records are gated by the audited
 * tenancy guard rather than by a delivery permission, so "which persona may read" has the same
 * answer for all five and a test over it would assert nothing.
 */
export const GATED_ACTIONS = [
  'approve_blueprint', 'request_changes', 'advance_requirements', 'advance_design', 'execute_story',
] as const;

export type GatedAction = (typeof GATED_ACTIONS)[number];

/**
 * The permission each gated action requires, DERIVED from the constants the acting code uses.
 *
 * Not a literal in sight, and that is the whole point: a matrix with its own copy of
 * `'contract.approve'` is a second definition free to drift from the server, and the drift would
 * show up as a surface offering an action the server then refuses — which is precisely the
 * disagreement this task's last acceptance item forbids. Change `STAGE_PERMISSION` and this
 * moves with it.
 */
export const ACTION_PERMISSION: Readonly<Record<GatedAction, DeliveryPermission>> = {
  approve_blueprint: STAGE_PERMISSION.blueprint_approved,
  // The same authority as approving: P5-T3 derives it from STAGE_PERMISSION[AUTHORIZATION_STAGE],
  // and it is imported rather than re-derived so there is one chain, not two.
  request_changes: CHANGE_REQUEST_PERMISSION,
  advance_requirements: STAGE_PERMISSION.requirements_ready,
  advance_design: STAGE_PERMISSION.design_ready,
  execute_story: STAGE_PERMISSION.building,
};

/**
 * May any role holding this persona perform this action?
 *
 * ANY, not EVERY, and the distinction matters: `author` covers both an architect and an
 * associate builder, and they do not have the same authority. A UI asking "can an author do
 * this" is really asking "is there an author who can", and the server still checks the acting
 * role. This function never authorises anything — it answers what a surface may OFFER.
 */
export function personaMayPerform(persona: Persona, action: GatedAction): boolean {
  const permitted = rolesWithDeliveryPermission(ACTION_PERMISSION[action]) as readonly string[];
  return rolesForPersona(persona).some((role) => permitted.includes(role));
}

/**
 * The gated actions a ROLE may actually perform.
 *
 * This is the field the status endpoint serves and the page gates its buttons on. Role, not
 * persona: a persona spans roles of different authority, so an associate builder must not be
 * offered what a delivery owner may do merely because both are authors.
 *
 * An unknown or empty role grants nothing, matching `deliveryRoleGrants`'s fail-closed
 * behaviour. A caller whose role the registry does not recognise sees a read-only surface
 * rather than every button.
 */
export function permittedActionsForRole(role: string): GatedAction[] {
  return GATED_ACTIONS.filter(
    (action) => rolesHaveDeliveryPermission([role], ACTION_PERMISSION[action]),
  );
}
