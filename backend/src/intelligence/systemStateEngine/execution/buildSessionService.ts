/**
 * buildSessionService — start/complete/reject lifecycle for BuildSession rows.
 *
 * Used by the build-session endpoints. Wraps the model so callers don't
 * touch Sequelize directly.
 *
 * Phase 4 §12.
 */
import type { BuildSessionStatus } from '../../../models/BuildSession';

export interface StartSessionInput {
  readonly project_id: string;
  readonly task_id: string;
  readonly bp_id: string | null;
  readonly task_type: string;
}

export interface StartSessionResult {
  readonly session_id: string;
  readonly started_at: string;
}

export async function startSession(input: StartSessionInput): Promise<StartSessionResult> {
  const { default: BuildSession } = await import('../../../models/BuildSession');
  const row = await BuildSession.create({
    project_id: input.project_id,
    task_id: input.task_id,
    bp_id: input.bp_id,
    task_type: input.task_type,
    status: 'running',
    started_at: new Date(),
    completed_at: null,
    manifest_id: null,
    telemetry_validated: false,
    validation_passed: false,
    contradictions_detected: 0,
    queue_changes_triggered: 0,
    rejection_reason: null,
    rejection_details: null,
  } as any);
  return {
    session_id: (row as any).id,
    started_at: new Date((row as any).started_at).toISOString(),
  };
}

export interface CompleteSessionInput {
  readonly session_id: string;
  readonly status: 'completed' | 'rejected' | 'abandoned';
  readonly manifest_id?: string | null;
  readonly telemetry_validated?: boolean;
  readonly validation_passed?: boolean;
  readonly contradictions_detected?: number;
  readonly queue_changes_triggered?: number;
  readonly rejection_reason?: string | null;
  readonly rejection_details?: any | null;
}

export async function completeSession(input: CompleteSessionInput): Promise<void> {
  const { default: BuildSession } = await import('../../../models/BuildSession');
  await BuildSession.update(
    {
      status: input.status as BuildSessionStatus,
      completed_at: new Date(),
      manifest_id: input.manifest_id ?? null,
      telemetry_validated: input.telemetry_validated ?? false,
      validation_passed: input.validation_passed ?? false,
      contradictions_detected: input.contradictions_detected ?? 0,
      queue_changes_triggered: input.queue_changes_triggered ?? 0,
      rejection_reason: input.rejection_reason ?? null,
      rejection_details: input.rejection_details ?? null,
    } as any,
    { where: { id: input.session_id } },
  );
}

export async function getSession(sessionId: string): Promise<any | null> {
  const { default: BuildSession } = await import('../../../models/BuildSession');
  const row = await BuildSession.findByPk(sessionId);
  if (!row) return null;
  const r = row as any;
  return {
    id: r.id,
    project_id: r.project_id,
    task_id: r.task_id,
    bp_id: r.bp_id,
    task_type: r.task_type,
    status: r.status,
    started_at: new Date(r.started_at).toISOString(),
    completed_at: r.completed_at ? new Date(r.completed_at).toISOString() : null,
    manifest_id: r.manifest_id,
    telemetry_validated: r.telemetry_validated,
    validation_passed: r.validation_passed,
    contradictions_detected: r.contradictions_detected,
    queue_changes_triggered: r.queue_changes_triggered,
    rejection_reason: r.rejection_reason,
    rejection_details: r.rejection_details,
  };
}

export async function listProjectSessions(
  projectId: string,
  opts: { limit?: number } = {},
): Promise<any[]> {
  const { default: BuildSession } = await import('../../../models/BuildSession');
  const rows = await BuildSession.findAll({
    where: { project_id: projectId },
    order: [['started_at', 'DESC']],
    limit: opts.limit ?? 50,
  });
  return rows.map((r: any) => ({
    id: r.id,
    task_id: r.task_id,
    bp_id: r.bp_id,
    task_type: r.task_type,
    status: r.status,
    started_at: new Date(r.started_at).toISOString(),
    completed_at: r.completed_at ? new Date(r.completed_at).toISOString() : null,
    telemetry_validated: r.telemetry_validated,
    validation_passed: r.validation_passed,
    contradictions_detected: r.contradictions_detected,
    queue_changes_triggered: r.queue_changes_triggered,
  }));
}
