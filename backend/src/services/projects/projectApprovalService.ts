/**
 * projectApprovalService — "review your project, then approve it".
 *
 * A built project can be held in `pending_approval` so the student reviews the
 * whole build and either APPROVES it (the workspace unlocks) or asks for changes
 * (it is flagged for revision). This service owns those transitions.
 *
 * OWNERSHIP is the query, not a separate check: every function loads the project
 * by (id AND enrollment_id), so a student can only move their own project and a
 * request for someone else's id returns null → 404. The enrollment id is the
 * authenticated `req.participant.sub`, established by requireParticipant before
 * this service is reached.
 *
 * The gate is scoped per enrollment (env.projectApprovalGate: 'off' | 'all' |
 * id-list), so it can be tested on one account while a class runs on the same
 * deployment. OFF is the default and means no project is ever moved to
 * pending_approval — nothing is gated and existing students are untouched.
 */
import Project from '../../models/Project';
import type { ProjectApprovalState } from '../../models/Project';
import { env } from '../../config/env';

export interface ProjectApprovalDto {
  id: string;
  approval_state: ProjectApprovalState | null;
  approved_at: string | null;
  approval_notes: string | null;
  approval_updated_at: string | null;
}

/**
 * Is the approve/pending gate switched on for this enrollment? Mirrors
 * agentScopingEnabledFor: 'off'/'' → no, 'all' → yes, else membership of the
 * comma-separated id list. Kept local rather than shared so the two gates cannot
 * drift into one another by accident.
 */
export function approvalGateAppliesTo(enrollmentId: string | null | undefined, setting: string = env.projectApprovalGate): boolean {
  const v = (setting || 'off').trim();
  if (v === 'off' || v === '') return false;
  if (v === 'all') return true;
  if (!enrollmentId) return false;
  return v.split(',').map((s) => s.trim()).filter(Boolean).includes(enrollmentId);
}

function toDto(p: Project): ProjectApprovalDto {
  const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);
  return {
    id: String(p.id),
    approval_state: (p.approval_state ?? null) as ProjectApprovalState | null,
    approved_at: iso(p.approved_at),
    approval_notes: p.approval_notes ?? null,
    approval_updated_at: iso(p.approval_updated_at),
  };
}

async function loadOwned(enrollmentId: string, projectId: string): Promise<Project | null> {
  if (!enrollmentId || !projectId) return null;
  return Project.findOne({ where: { id: projectId, enrollment_id: enrollmentId } });
}

/**
 * The student approves their build. Idempotent: approving an already-approved
 * project is a no-op that returns the same state.
 */
export async function approveProject(enrollmentId: string, projectId: string): Promise<ProjectApprovalDto | null> {
  const project = await loadOwned(enrollmentId, projectId);
  if (!project) return null;
  if (project.approval_state !== 'approved') {
    project.approval_state = 'approved';
    project.approved_at = new Date();
    project.approved_by = enrollmentId;
    project.approval_notes = null; // an approval clears any prior change request
    project.approval_updated_at = new Date();
    await project.save();
  }
  return toDto(project);
}

/**
 * The student says the build is not what they wanted. Flags it for revision and
 * records what was wrong. Idempotent; overwrites the note with the latest.
 */
export async function requestProjectChanges(
  enrollmentId: string,
  projectId: string,
  notes: string,
): Promise<ProjectApprovalDto | null> {
  const project = await loadOwned(enrollmentId, projectId);
  if (!project) return null;
  project.approval_state = 'changes_requested';
  project.approval_notes = (notes || '').trim() || null;
  project.approved_at = null;
  project.approved_by = null;
  project.approval_updated_at = new Date();
  await project.save();
  return toDto(project);
}

/**
 * Called from the publish path when a build becomes visible. Holds the project
 * in pending_approval so the student reviews it first.
 *
 * FAILURE-FIRST: this runs inside publishBuild. It must never throw — a failure
 * to set the review flag cannot be allowed to fail the build itself, which is
 * the exact outage this pipeline exists to prevent. It catches, logs, and
 * returns whether it set the state.
 *
 * Scope + idempotency:
 *  - No-op unless the gate is on for this enrollment (OFF → existing students
 *    and every ungated project are never touched).
 *  - Sets pending_approval only from NULL (first publish) or changes_requested
 *    (a revision the student asked for → re-review the new build). Leaves
 *    'approved' alone, so re-publishing an approved build does not re-gate it.
 */
export async function markProjectPendingApproval(
  projectId: string,
  enrollmentId: string,
): Promise<boolean> {
  try {
    if (!approvalGateAppliesTo(enrollmentId)) return false;
    const project = await loadOwned(enrollmentId, projectId);
    if (!project) return false;
    const state = project.approval_state ?? null;
    if (state === null || state === 'changes_requested') {
      project.approval_state = 'pending_approval';
      project.approval_updated_at = new Date();
      await project.save();
      return true;
    }
    return false;
  } catch (err: any) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'backend',
      event: 'project_pending_approval_mark_failed',
      outcome: 'failure',
      error_class: err?.name ?? 'Error',
      context: { projectId, message: err?.message },
    }));
    return false;
  }
}
