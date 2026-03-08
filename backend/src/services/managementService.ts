/**
 * Management Service
 * Blueprint snapshot/rollback, system status, and preview operations.
 */

import { ProgramBlueprint } from '../models';
import BlueprintSnapshot from '../models/BlueprintSnapshot';
import AuditLog from '../models/AuditLog';

export interface SystemStatus {
  blueprintCount: number;
  snapshotCount: number;
  recentAuditEntries: number;
  lastAuditAt: string | null;
}

/**
 * Get system health status.
 */
export async function getSystemStatus(): Promise<SystemStatus> {
  const [blueprintCount, snapshotCount, recentAuditEntries] = await Promise.all([
    ProgramBlueprint.count(),
    BlueprintSnapshot.count(),
    AuditLog.count(),
  ]);

  const lastAudit = await AuditLog.findOne({ order: [['created_at', 'DESC']] });

  return {
    blueprintCount,
    snapshotCount,
    recentAuditEntries,
    lastAuditAt: lastAudit?.created_at?.toISOString() || null,
  };
}

/**
 * Create a snapshot of a blueprint's current state.
 */
export async function createSnapshot(
  blueprintId: string,
  description?: string,
  createdBy?: string
): Promise<BlueprintSnapshot> {
  const blueprint = await ProgramBlueprint.findByPk(blueprintId);
  if (!blueprint) throw new Error(`Blueprint ${blueprintId} not found`);

  const snapshotData = (blueprint as any).toJSON();

  return BlueprintSnapshot.create({
    blueprint_id: blueprintId,
    snapshot_data: snapshotData,
    description: description || `Snapshot at ${new Date().toISOString()}`,
    created_by: createdBy || null,
  });
}

/**
 * List all snapshots for a blueprint.
 */
export async function listSnapshots(blueprintId: string): Promise<BlueprintSnapshot[]> {
  return BlueprintSnapshot.findAll({
    where: { blueprint_id: blueprintId },
    order: [['created_at', 'DESC']],
  });
}

/**
 * Rollback a blueprint to a specific snapshot.
 */
export async function rollbackToSnapshot(
  blueprintId: string,
  snapshotId: string
): Promise<ProgramBlueprint> {
  const snapshot = await BlueprintSnapshot.findOne({
    where: { id: snapshotId, blueprint_id: blueprintId },
  });
  if (!snapshot) throw new Error(`Snapshot ${snapshotId} not found for blueprint ${blueprintId}`);

  const blueprint = await ProgramBlueprint.findByPk(blueprintId);
  if (!blueprint) throw new Error(`Blueprint ${blueprintId} not found`);

  const data = snapshot.snapshot_data;
  // Remove non-updatable fields
  delete data.id;
  delete data.created_at;
  delete data.updated_at;

  await blueprint.update(data);
  return blueprint;
}

/**
 * Preview what a blueprint looked like at a snapshot point.
 */
export async function previewSnapshot(snapshotId: string): Promise<any> {
  const snapshot = await BlueprintSnapshot.findByPk(snapshotId);
  if (!snapshot) throw new Error(`Snapshot ${snapshotId} not found`);
  return snapshot.snapshot_data;
}
