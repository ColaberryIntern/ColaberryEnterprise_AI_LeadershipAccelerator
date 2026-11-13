/**
 * govBuildAssignment — the operator's assignment of a Build-track story to a student builder (P3-T2), plus the
 * read helpers the workspace/projection overlay onto the derived plan (P3-T1).
 *
 * THE LOAD-BEARING RAIL (the gws build-auth gap, closed for the write path): the delivery authorization engine is
 * wired INTO the assignment write. A story may be assigned ONLY to someone the engine recognises as a builder on
 * THIS delivery project — an active member whose role grants `story.execute`. You cannot assign build work to a
 * stranger, a client, or a reviewer-only member. The admin surface that calls this is itself operator-gated
 * (requireSection('program')); this adds the per-project, engine-checked constraint on WHO can receive the work.
 *
 * HONESTY: assignment is the only persisted plan transition, and it only ever sets `assigned` + an assignee — it
 * NEVER confers a built/verified state. Idempotent: one row per (project, story); re-assigning upserts in place.
 */
import GovBuildStoryAssignment, { type GovBuildStoryAssignmentAttributes } from '../../models/GovBuildStoryAssignment';
import DeliveryProjectMember from '../../models/DeliveryProjectMember';
import PlatformIdentity from '../../models/PlatformIdentity';
import { buildDeliveryContext, hasDeliveryPermission } from '../../modules/delivery/deliveryAuthorization';
import { rolesHaveDeliveryPermission, isKnownDeliveryRole, DELIVERY_ROLES } from '../../modules/delivery/deliveryRoles';

/**
 * `granted_by_identity_id` is a uuid column, but an admin actor reaches the service layer as their EMAIL on
 * several admin routes (`actorIdentity(req)` is documented "email preferred, sub fallback"). Postgres rejects the
 * string outright — `invalid input syntax for type uuid: "admin@colaberry.com"` — so an unguarded value fails the
 * INSERT that grants the role, over a field that is only attribution. `govDeliveryProject` already guards its two
 * uuid audit columns exactly this way; this is the same guard for the third.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const asIdentityId = (v: unknown): string | null => (typeof v === 'string' && UUID_RE.test(v) ? v : null);

export interface AssignmentView {
  id: string;
  storyId: string;
  canonicalReqId: string;
  assigneeIdentityId: string;
  assignedByIdentityId: string | null;
  assignedAt: string | null;
}

export interface AssignableBuilder {
  identityId: string;
  email: string | null;
  roles: string[];
}

export interface AssignBuildStoryInput {
  deliveryProjectId: string;
  storyId: string;
  canonicalReqId: string;
  assigneeIdentityId: string;
  /** The operator who assigned it (audit). Null is allowed only when their platform identity can't be resolved. */
  assignedByIdentityId?: string | null;
}

export class AssignmentError extends Error {
  constructor(message: string, readonly reason: string) { super(message); this.name = 'AssignmentError'; }
}

function toView(row: GovBuildStoryAssignmentAttributes): AssignmentView {
  return {
    id: String(row.id),
    storyId: row.story_id,
    canonicalReqId: row.canonical_req_id,
    assigneeIdentityId: row.assignee_identity_id,
    assignedByIdentityId: row.assigned_by_identity_id,
    assignedAt: row.assigned_at ? new Date(row.assigned_at).toISOString() : null,
  };
}

/**
 * PROVISION-ON-ASSIGN (operator-gated): the admin's deliberate assignment of a build story IS their act of
 * authorizing this person to build on this project. So, when the assignee has NO delivery membership here yet,
 * grant them the least-privilege builder role — `associate_builder`, which confers `story.execute` and nothing
 * architectural or review-bearing. This is what lets a freshly materialized gov intern receive build work: the
 * gov approve/materialize flow creates their monitored project but never a delivery membership, so without this
 * the engine gate below would always refuse them.
 *
 * SEPARATION OF DUTIES, PRESERVED: provision ONLY when there is no membership row at all for (project, identity).
 * An existing membership — active or revoked, any role — is left untouched, so a client or reviewer is never
 * silently promoted to builder, and a deliberately revoked builder is never silently reinstated by assigning them
 * a story. In those cases the engine gate below still decides and still fails closed. Idempotent: if the member
 * already exists it is a no-op, and a concurrent-create race is swallowed (the gate reads whichever row won).
 *
 * THE GRANT IS VERIFIED, NOT ASSUMED. This used to `catch {}` the create unconditionally, on the stated
 * assumption that the only way it could fail was a concurrent-insert race. Any other failure — a constraint, a
 * column the schema had not grown yet, a dropped connection — was therefore indistinguishable from success, and
 * the caller carried on. That is how the Crash Records build (delivery project 7a818ed2, materialized
 * 2026-11-05) ended up with ZERO membership rows: the intern could not open the cockpit for their own project
 * (`requireGovProjectAccess('project.read')`), could not hand in story evidence (`story.execute`), and the
 * contract was dropped from the admin left nav by `adminGovContractNavEntries`, whose `hasActiveIntern` test
 * reads exactly these rows. Nothing anywhere said so.
 *
 * So the catch now does what the story-assignment create 40 lines below has always done: re-read, and only treat
 * the failure as benign when the row it was trying to write is actually there. A genuine failure is logged with
 * an `error_class` and thrown, because a materialized project its own builder cannot open is worse than a loud
 * failure the operator can retry — and materialize IS retryable (it reuses the project on the solution_build
 * track rather than creating a second one).
 */
export async function ensureAssigneeCanBuild(
  deliveryProjectId: string,
  assigneeIdentityId: string,
  grantedByIdentityId: string | null,
): Promise<void> {
  const where = { delivery_project_id: deliveryProjectId, platform_identity_id: assigneeIdentityId };
  // ATTRIBUTION MUST NEVER BLOCK AUTHORIZATION. The materialize route passed the admin's email here, so every
  // "Create the monitored project" since the grant was added rejected on the uuid column and granted nothing.
  // Who granted the role is metadata; the role itself is the point. A non-uuid actor is therefore recorded as
  // null and logged, not thrown on.
  // An earlier version of this comment claimed 8 projects were left with a build and no members. Measured
  // afterwards, that was wrong in both directions: the bug had exactly ONE victim, and the other projects in
  // that query carry no build at all. The real blocker elsewhere is revoked membership, which the early return
  // below deliberately does not reinstate.
  const grantedBy = asIdentityId(grantedByIdentityId);
  if (grantedByIdentityId && !grantedBy) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'backend',
      event: 'gov_build_grant_by_not_an_identity', outcome: 'partial',
      context: { deliveryProjectId, assigneeIdentityId, grantedByIdentityId },
    }));
  }
  const existing = await DeliveryProjectMember.findOne({ where });
  if (existing) return; // never alter an existing membership — the engine gate decides
  try {
    await DeliveryProjectMember.create({
      ...where,
      delivery_role: DELIVERY_ROLES.ASSOCIATE_BUILDER,
      granted_by_identity_id: grantedBy,
    });
  } catch (err: any) {
    // Race: a concurrent assign inserted the membership between our findOne and create (the unique index
    // rejected ours). Benign ONLY if the row is now there — the gate reads whichever row won.
    const raced = await DeliveryProjectMember.findOne({ where });
    if (raced) return;
    const errorClass = err?.name ?? err?.constructor?.name ?? 'Error';
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'error', service: 'backend',
      event: 'gov_build_membership_grant_failed', outcome: 'failure', error_class: errorClass,
      context: { deliveryProjectId, assigneeIdentityId, message: err?.message ?? null },
    }));
    throw new AssignmentError(
      'The builder role could not be granted on this project, so the assignee would not be able to open it. Nothing was assigned; retry.',
      'grant_failed',
    );
  }
}

/**
 * Ensure the assigned builder can AUTHOR the proposal: raise their per-member proposal share to 'edit' if it is
 * currently lower. The share is the designed authoring axis (proposal.canEdit); it is a row, not a role change, so
 * it never widens anyone else's access and never touches evidence.verify / the reviewer axis. Idempotent, never
 * downgrades a higher grant, and best-effort — a failure here is logged and swallowed so it can never block an
 * assignment (the admin can still grant the share manually via the Team & access panel).
 */
async function ensureProposalEditShare(deliveryProjectId: string, assigneeIdentityId: string): Promise<void> {
  try {
    const { getProposalShareLevel, setProposalShareGrant, PROPOSAL_SHARE_LEVELS } = await import('./govProposalShare');
    const current = await getProposalShareLevel(deliveryProjectId, assigneeIdentityId);
    // Only raise, never lower: compare positions in the monotonic level ladder.
    if (PROPOSAL_SHARE_LEVELS.indexOf(current) < PROPOSAL_SHARE_LEVELS.indexOf('edit')) {
      await setProposalShareGrant(deliveryProjectId, assigneeIdentityId, 'edit');
    }
  } catch (err: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'error', service: 'backend',
      event: 'gov_proposal_edit_share_grant_failed', outcome: 'partial',
      error_class: err?.name ?? err?.constructor?.name ?? 'Error',
      context: { deliveryProjectId, assigneeIdentityId, message: err?.message ?? null },
    }));
  }
}

/**
 * Assign a story to a builder. The assignee MUST be an active delivery member of this project holding
 * `story.execute` (the engine check — the real gate), else `assignee_not_builder` (422). Idempotent upsert on
 * (delivery_project_id, story_id): a re-assign updates the existing row in place rather than stacking duplicates.
 */
export async function assignBuildStory(input: AssignBuildStoryInput): Promise<AssignmentView> {
  const deliveryProjectId = String(input.deliveryProjectId ?? '').trim();
  const storyId = String(input.storyId ?? '').trim();
  const canonicalReqId = String(input.canonicalReqId ?? '').trim();
  const assigneeIdentityId = String(input.assigneeIdentityId ?? '').trim();
  const assignedByIdentityId = input.assignedByIdentityId ? String(input.assignedByIdentityId).trim() || null : null;
  if (!deliveryProjectId || !storyId || !canonicalReqId) throw new AssignmentError('Missing story/project identifiers.', 'bad_input');
  if (!assigneeIdentityId) throw new AssignmentError('An assignee is required.', 'no_assignee');

  // The admin's assign is the authorization: grant the assignee the least-privilege builder role here if they
  // have no membership yet, so the engine gate below can recognise them. Provisions ONLY a brand-new membership;
  // it never alters an existing one (see ensureAssigneeCanBuild), so the gate still fails closed on anyone it
  // cannot provision (an existing client/reviewer, or a revoked builder).
  await ensureAssigneeCanBuild(deliveryProjectId, assigneeIdentityId, assignedByIdentityId);

  // THE RAIL: the assignee must be a builder on this project (story.execute). Fails closed on a non-member,
  // a client, a reviewer-only member, or an unreadable membership table.
  const ctx = await buildDeliveryContext({ platformIdentityId: assigneeIdentityId, deliveryProjectId });
  if (!hasDeliveryPermission(ctx, 'story.execute')) {
    throw new AssignmentError('The assignee is not a builder on this project.', 'assignee_not_builder');
  }

  // The assigned builder authors the proposal too (Phase B): ensure they hold at least an EDIT proposal share on this
  // project, the per-member authoring grant surfaced as proposal.canEdit. This runs for a new AND a re-assigned
  // builder (past ensureAssigneeCanBuild's existing-member early return), only after the story.execute gate confirms
  // a real builder. NEVER downgrades a higher grant; best-effort so a share failure can never block the assignment.
  await ensureProposalEditShare(deliveryProjectId, assigneeIdentityId);

  const existing: any = await GovBuildStoryAssignment.findOne({ where: { delivery_project_id: deliveryProjectId, story_id: storyId } });
  if (existing) {
    await existing.update({ canonical_req_id: canonicalReqId, assignee_identity_id: assigneeIdentityId, assigned_by_identity_id: assignedByIdentityId, updated_at: new Date() });
    return toView(existing.get({ plain: true }) as GovBuildStoryAssignmentAttributes);
  }
  try {
    const row = await GovBuildStoryAssignment.create({
      delivery_project_id: deliveryProjectId,
      story_id: storyId,
      canonical_req_id: canonicalReqId,
      assignee_identity_id: assigneeIdentityId,
      assigned_by_identity_id: assignedByIdentityId,
    });
    return toView(row.get({ plain: true }) as GovBuildStoryAssignmentAttributes);
  } catch (err: any) {
    // Race: a concurrent assign inserted the row between our findOne and create (the UNIQUE index rejected ours).
    // Re-resolve and update in place rather than surface a duplicate-key error — the upsert stays idempotent.
    const raced: any = await GovBuildStoryAssignment.findOne({ where: { delivery_project_id: deliveryProjectId, story_id: storyId } });
    if (!raced) throw err;
    await raced.update({ canonical_req_id: canonicalReqId, assignee_identity_id: assigneeIdentityId, assigned_by_identity_id: assignedByIdentityId, updated_at: new Date() });
    return toView(raced.get({ plain: true }) as GovBuildStoryAssignmentAttributes);
  }
}

/** Remove a story's assignment (back to `unassigned`). Idempotent: removing a non-existent assignment is a no-op. */
export async function unassignBuildStory(deliveryProjectId: string, storyId: string): Promise<{ ok: true; removed: number }> {
  if (!deliveryProjectId || !storyId) throw new AssignmentError('Missing story/project identifiers.', 'bad_input');
  const removed = await GovBuildStoryAssignment.destroy({ where: { delivery_project_id: deliveryProjectId, story_id: storyId } });
  return { ok: true, removed };
}

/** All assignments for a delivery project — to overlay per story in the workspace/projection. */
export async function listBuildStoryAssignments(deliveryProjectId: string): Promise<AssignmentView[]> {
  if (!deliveryProjectId) return [];
  const rows = await GovBuildStoryAssignment.findAll({ where: { delivery_project_id: deliveryProjectId } });
  return rows.map((r) => toView(r.get({ plain: true }) as GovBuildStoryAssignmentAttributes));
}

/**
 * The members of a delivery project a story can be assigned to: active members whose roles grant `story.execute`.
 * The admin picker is populated from this, so it can only offer real builders — the same constraint the write
 * enforces. Best-effort email join for display; an identity with no row still appears (email null).
 */
export async function listAssignableBuilders(deliveryProjectId: string): Promise<AssignableBuilder[]> {
  if (!deliveryProjectId) return [];
  const members: any[] = await DeliveryProjectMember.findAll({ where: { delivery_project_id: deliveryProjectId, status: 'active' } });
  const rolesByIdentity = new Map<string, string[]>();
  for (const m of members) {
    const id = String(m.platform_identity_id ?? '').trim();
    if (!id) continue;
    const list = rolesByIdentity.get(id) ?? [];
    if (isKnownDeliveryRole(m.delivery_role)) list.push(m.delivery_role);
    rolesByIdentity.set(id, list);
  }
  const builderIds: string[] = [];
  for (const [id, roles] of rolesByIdentity) if (rolesHaveDeliveryPermission(roles, 'story.execute')) builderIds.push(id);
  if (builderIds.length === 0) return [];

  const emailById = new Map<string, string | null>();
  try {
    const identities: any[] = await PlatformIdentity.findAll({ where: { id: builderIds } });
    for (const i of identities) emailById.set(String(i.id), i.primary_email ?? null);
  } catch { /* display-only — a failed email join never hides a real builder */ }

  return builderIds.map((id) => ({ identityId: id, email: emailById.get(id) ?? null, roles: rolesByIdentity.get(id) ?? [] }));
}

export interface ActiveInternOption {
  identityId: string;
  email: string | null;
  name: string;
  /** False when the intern has no project — the people available to staff, listed first. */
  hasProject: boolean;
}

/**
 * ALL active interns a gov build can be assigned to at materialization — NOT just this delivery project's current
 * builders. `materializeGovBuildProject` only needs the assignee to resolve to an ENROLLED intern (it creates the
 * project under their enrollment; it does NOT require a delivery membership), so the picker should offer the whole
 * active roster, UNASSIGNED first (the people available to staff). Each active intern (one row per enrollment) is
 * resolved to their platform identity by email; one with no resolvable identity is dropped (it could not be
 * assigned). Best-effort; a roster failure yields [] and never breaks the workspace.
 */
export async function listActiveInternsForAssignment(): Promise<ActiveInternOption[]> {
  try {
    const { getConsoleRoster } = await import('../internship/internConsoleRoster');
    const { normalizeEmail } = await import('../../modules/identity/platformIdentityService');
    const roster = await getConsoleRoster();
    const emails = Array.from(new Set(roster.map((r) => normalizeEmail(r.email ?? '')).filter(Boolean)));
    const idByEmail = new Map<string, string>();
    if (emails.length) {
      const identities: any[] = await PlatformIdentity.findAll({ where: { primary_email: emails } });
      for (const i of identities) { if (i.primary_email && i.id) idByEmail.set(String(i.primary_email), String(i.id)); }
    }
    const { ensurePlatformIdentity } = await import('../../modules/identity/platformIdentityService');
    const out: ActiveInternOption[] = [];
    for (const r of roster) {
      const ne = normalizeEmail(r.email ?? '');
      if (!ne) continue; // no email -> cannot be resolved or assigned
      let identityId = idByEmail.get(ne);
      if (!identityId) {
        // BACKFILL on demand: nothing creates a PlatformIdentity for an intern enrollment, so active interns with
        // no identity row were silently dropped here -> the "Assign to intern" picker came up EMPTY. Ensure one
        // (idempotent on normalized email) so every active intern is assignable, instead of hiding them.
        try {
          const ens = await ensurePlatformIdentity({ email: ne, displayName: r.name });
          identityId = String(ens.identity.id);
          idByEmail.set(ne, identityId);
        } catch { continue; } // if even the ensure fails, skip this one rather than break the whole picker
      }
      out.push({ identityId, email: r.email, name: r.name, hasProject: r.project !== null });
    }
    // Unassigned (no project) first — the people available to staff — then by name within each band.
    out.sort((a, b) => (a.hasProject === b.hasProject ? a.name.localeCompare(b.name) : (a.hasProject ? 1 : 0) - (b.hasProject ? 1 : 0)));
    return out;
  } catch {
    return [];
  }
}
