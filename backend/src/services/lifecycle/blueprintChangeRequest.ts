/**
 * Compare two blueprint revisions, and request changes to one.
 *
 * ── NO NEW TABLE, AND THAT IS A DECISION, NOT A SHORTCUT ─────────────────────
 * `delivery_change_requests` already exists (`ensureRefactoredDeliverySchema.ts`) and cannot
 * serve this: it is keyed to `delivery_project_id` alone, with no `student_project_id`, no
 * `tenant_id`, and no unique constraint to make a resubmit idempotent. Using it would mean new
 * DDL on a shared delivery table for the student half of the lifecycle.
 *
 * Instead this reuses the mechanism the lifecycle already has. `project_lifecycle_states` persists
 * `condition` + `condition_reason`, and `awaiting_input` is already in `LIFECYCLE_CONDITIONS` —
 * it IS "changes requested, waiting on the author". That buys two things outright:
 *
 *   1. IDEMPOTENCY BY CONSTRUCTION. A change request is a STATE, not an event, so submitting the
 *      same one twice is the same end state. There is no row to double-insert, so there is no
 *      uniqueness constraint to get wrong. CLAUDE.md's idempotency rule is satisfied by the shape
 *      of the data rather than by a check that could be forgotten.
 *   2. The resume point survives. The condition is stored separately from the stage, so a project
 *      with changes requested has not lost where it was.
 *
 * ── WHY THE REASON IS STRUCTURED TEXT ────────────────────────────────────────
 * Free text in `condition_reason` cannot distinguish "changes requested on revision 3" from the
 * same words requested on revision 4, so a resubmit against a NEW revision would read as a
 * duplicate of the old one and be silently dropped. The value cannot carry that distinction, so
 * the STRUCTURE does: `CHANGES_REQUESTED r<n>: <text>`, with a parser that round-trips any text
 * including colons and newlines. A generated round-trip test enumerates the cases.
 */
import { AUTHORIZATION_STAGE } from './lifecycleStages';
import { STAGE_PERMISSION } from './lifecycleTransition';
import { diffRevisions, type RevisionDiff } from './blueprintRevisionDiff';
import { loadAndAuthorize, type AdminIdentity, type ProjectKind } from './lifecycleStatus';
// TYPE-ONLY, so no require is emitted and Sequelize is not initialised at module load — the
// same reason the services below use `await import` for the value.
import type OperatingBlueprintManifest from '../../models/OperatingBlueprintManifest';

/** Which revision a manifest row is, and enough to show it without re-reading it. */
export interface RevisionMeta {
  id: string;
  revision: number;
  status: string | null;
  contentSha256: string | null;
}

/**
 * The outcome of a compare.
 *
 * `single_revision` is its OWN state, not an empty diff. "There is only one revision, so there is
 * nothing to compare against" and "two revisions are identical" are different findings that lead
 * to different actions, and collapsing them would show a reviewer an all-clear screen for a
 * blueprint that has never been revised.
 */
export type CompareResult =
  | { state: 'compared'; from: RevisionMeta; to: RevisionMeta; diff: RevisionDiff }
  | { state: 'single_revision'; only: RevisionMeta }
  | { state: 'no_manifest' }
  | { state: 'revision_not_found'; requested: number[]; available: number[] };

export interface ChangeRequestResult {
  /** True when this call changed persisted state. False on an identical resubmit. */
  applied: boolean;
  revision: number;
  text: string;
  /** What is now persisted in `condition_reason`, exactly. */
  conditionReason: string;
}

export class ChangeRequestRefused extends Error {
  constructor(message: string, readonly status: number, readonly refusal: string) {
    super(message);
    this.name = 'ChangeRequestRefused';
  }
}

/** The authority requesting changes needs: the same one approving needs. */
export const CHANGE_REQUEST_PERMISSION = STAGE_PERMISSION[AUTHORIZATION_STAGE];

const PREFIX = 'CHANGES_REQUESTED';
const PATTERN = new RegExp(`^${PREFIX} r(\\d+): ([\\s\\S]*)$`);

/** Compose the persisted condition reason. Paired with `parseChangeRequest`. */
export function formatChangeRequest(revision: number, text: string): string {
  return `${PREFIX} r${revision}: ${text}`;
}

/**
 * Read a persisted condition reason back.
 *
 * Returns `null` for a reason this service did not write — a transition's own free-text reason,
 * for instance. Returning a default would make every blocked project look like it had changes
 * requested on revision 0.
 */
export function parseChangeRequest(reason: string | null): { revision: number; text: string } | null {
  if (!reason) return null;
  const m = PATTERN.exec(reason);
  if (!m) return null;
  return { revision: Number(m[1]), text: m[2] };
}

const metaOf = (row: OperatingBlueprintManifest): RevisionMeta => ({
  id: String(row.get('id')),
  revision: Number(row.get('revision')),
  status: (row.get('status') as string | null) ?? null,
  contentSha256: (row.get('content_sha256') as string | null) ?? null,
});

/** Every manifest for a project, newest revision first, scoped to the row's tenant. */
async function loadManifests(tenantId: string, kind: ProjectKind, projectId: string) {
  const { default: OperatingBlueprintManifest } = await import('../../models/OperatingBlueprintManifest');
  const where: Record<string, unknown> = { tenant_id: tenantId };
  where[kind === 'student' ? 'student_project_id' : 'delivery_project_id'] = projectId;
  return OperatingBlueprintManifest.findAll({ where, order: [['revision', 'DESC']] });
}

/**
 * Compare two revisions of a project's operating blueprint.
 *
 * With no revisions given it compares the newest two, which is the question a reviewer is
 * actually asking ("what changed since the version I approved?").
 */
export async function compareBlueprintRevisions(input: {
  projectId: string;
  kind: ProjectKind;
  fromRevision?: number;
  toRevision?: number;
  admin: AdminIdentity | undefined;
}): Promise<CompareResult> {
  const row = await loadAndAuthorize(input.projectId, input.kind, input.admin, 'read');
  if (!row) return { state: 'no_manifest' };

  const rows = await loadManifests(row.tenant_id, input.kind, input.projectId);
  if (rows.length === 0) return { state: 'no_manifest' };

  const explicit = input.fromRevision !== undefined || input.toRevision !== undefined;
  if (!explicit) {
    if (rows.length === 1) return { state: 'single_revision', only: metaOf(rows[0]) };
    return {
      state: 'compared',
      from: metaOf(rows[1]),
      to: metaOf(rows[0]),
      diff: diffRevisions(rows[1].get('refs_json'), rows[0].get('refs_json')),
    };
  }

  const available = rows.map((r) => Number(r.get('revision')));
  const requested = [input.fromRevision, input.toRevision].filter(
    (n): n is number => n !== undefined,
  );
  const missing = requested.filter((n) => !available.includes(n));
  if (missing.length > 0 || requested.length < 2) {
    // A partial request is refused rather than half-honoured: silently defaulting the other side
    // would compare against a revision the caller never named.
    return { state: 'revision_not_found', requested, available };
  }

  const from = rows.find((r) => Number(r.get('revision')) === input.fromRevision)!;
  const to = rows.find((r) => Number(r.get('revision')) === input.toRevision)!;
  return {
    state: 'compared',
    from: metaOf(from),
    to: metaOf(to),
    diff: diffRevisions(from.get('refs_json'), to.get('refs_json')),
  };
}

/**
 * Request changes to one exact revision.
 *
 * `revision` is required with no default. A default would record a change request against
 * whatever happened to be newest, which is the same stale-target bug the approval CAS exists to
 * stop — a reviewer looking at r3 would file against r4 without being told.
 */
export async function requestBlueprintChanges(input: {
  projectId: string;
  kind: ProjectKind;
  revision: number;
  text: string;
  admin: AdminIdentity | undefined;
}): Promise<ChangeRequestResult> {
  const row = await loadAndAuthorize(input.projectId, input.kind, input.admin, 'write');
  if (!row) throw new ChangeRequestRefused('No lifecycle state for this project.', 404, 'no_lifecycle_row');

  const { deliveryPermissionsFor } = await import('../../modules/delivery/deliveryRoles');
  const held = deliveryPermissionsFor(input.admin?.role ? [input.admin.role] : []);
  if (!held.includes(CHANGE_REQUEST_PERMISSION)) {
    throw new ChangeRequestRefused(
      `Requesting blueprint changes requires ${CHANGE_REQUEST_PERMISSION}.`,
      403,
      'insufficient_permission',
    );
  }

  const rows = await loadManifests(row.tenant_id, input.kind, input.projectId);
  const target = rows.find((r) => Number(r.get('revision')) === input.revision);
  if (!target) {
    // Refused, not coerced. Accepting a request against a revision that does not exist would
    // leave a reason nobody can trace back to a blueprint.
    throw new ChangeRequestRefused(
      `Revision ${input.revision} does not exist for this project.`,
      404,
      'revision_not_found',
    );
  }

  const conditionReason = formatChangeRequest(input.revision, input.text);
  // Read-then-compare decides only what is REPORTED. The write itself is idempotent either way,
  // so a concurrent duplicate ends in the same persisted state and only the `applied` flag races.
  const already = row.condition === 'awaiting_input' && row.condition_reason === conditionReason;

  if (!already) {
    const { default: ProjectLifecycleState } = await import('../../models/ProjectLifecycleState');
    await ProjectLifecycleState.update(
      { condition: 'awaiting_input', condition_reason: conditionReason },
      // Scoped by id only, and deliberately NOT by stage: requesting changes does not move the
      // project, so a concurrent stage transition must not make this write vanish.
      { where: { id: row.id } },
    );
  }

  return { applied: !already, revision: input.revision, text: input.text, conditionReason };
}
