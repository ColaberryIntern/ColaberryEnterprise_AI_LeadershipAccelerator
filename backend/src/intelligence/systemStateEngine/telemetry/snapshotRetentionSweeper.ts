/**
 * snapshotRetentionSweeper — prevents `system_state_snapshots` from growing
 * without bound.
 *
 * Retention policy (configurable via env):
 *   - Keep ALL snapshots from the last 24h
 *   - Keep one per hour for 7d
 *   - Keep one per day for 90d
 *   - Drop everything older
 *
 * Idempotent: running twice in a row is a no-op the second time.
 *
 * Pure helpers split from the IO so the policy can be unit-tested.
 */

export interface RetentionPolicy {
  readonly fullDetailMs: number;       // keep everything younger than this
  readonly hourlyDetailMs: number;     // keep one per hour up to this age
  readonly dailyDetailMs: number;      // keep one per day up to this age
}

export const DEFAULT_POLICY: RetentionPolicy = {
  fullDetailMs: 24 * 60 * 60 * 1000,
  hourlyDetailMs: 7 * 24 * 60 * 60 * 1000,
  dailyDetailMs: 90 * 24 * 60 * 60 * 1000,
};

export interface SnapshotRow {
  readonly id: string;
  readonly project_id: string;
  readonly generated_at: Date;
}

/**
 * Pure: given a list of snapshots and a current timestamp, decide which IDs
 * should be deleted. Empty array if nothing needs deletion.
 *
 * Algorithm:
 *   - Sort by generated_at descending (newest first)
 *   - For each snapshot, decide whether it falls in the full / hourly / daily
 *     bucket based on age. Within the hourly window, keep only the newest
 *     snapshot per hour. Within the daily window, keep only the newest per
 *     day. Anything older than dailyDetailMs is dropped.
 */
export function decideDeletions(
  snapshots: ReadonlyArray<SnapshotRow>,
  now: number,
  policy: RetentionPolicy = DEFAULT_POLICY,
): string[] {
  const sorted = [...snapshots].sort(
    (a, b) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime(),
  );
  const keepHourly = new Set<string>();   // hour-bucket key
  const keepDaily = new Set<string>();    // day-bucket key
  const deletions: string[] = [];

  for (const snap of sorted) {
    const ts = new Date(snap.generated_at).getTime();
    const ageMs = now - ts;

    if (ageMs < 0 || ageMs <= policy.fullDetailMs) {
      // Younger than full-detail threshold: keep
      continue;
    }
    if (ageMs <= policy.hourlyDetailMs) {
      const hourKey = `${snap.project_id}:${Math.floor(ts / (60 * 60 * 1000))}`;
      if (keepHourly.has(hourKey)) {
        deletions.push(snap.id);
      } else {
        keepHourly.add(hourKey);
      }
      continue;
    }
    if (ageMs <= policy.dailyDetailMs) {
      const dayKey = `${snap.project_id}:${Math.floor(ts / (24 * 60 * 60 * 1000))}`;
      if (keepDaily.has(dayKey)) {
        deletions.push(snap.id);
      } else {
        keepDaily.add(dayKey);
      }
      continue;
    }
    // Older than dailyDetailMs: drop
    deletions.push(snap.id);
  }

  return deletions;
}

/**
 * DB-backed sweeper. Runs the policy and DELETEs the rows it returns.
 * Returns count deleted.
 */
export async function sweepProject(
  projectId: string,
  policy: RetentionPolicy = DEFAULT_POLICY,
): Promise<{ scanned: number; deleted: number }> {
  const { default: SystemStateSnapshot } = await import('../../../models/SystemStateSnapshot');
  const rows = await SystemStateSnapshot.findAll({
    where: { project_id: projectId },
    attributes: ['id', 'project_id', 'generated_at'],
  });
  const snapshots: SnapshotRow[] = rows.map((r: any) => ({
    id: r.id,
    project_id: r.project_id,
    generated_at: r.generated_at,
  }));
  const deletions = decideDeletions(snapshots, Date.now(), policy);
  if (deletions.length === 0) return { scanned: snapshots.length, deleted: 0 };

  const { Op } = await import('sequelize');
  const deleted = await SystemStateSnapshot.destroy({
    where: { id: { [Op.in]: deletions } },
  });
  return { scanned: snapshots.length, deleted };
}

/**
 * Sweep across all projects. Used by a scheduled job (cron / setInterval).
 */
export async function sweepAll(policy: RetentionPolicy = DEFAULT_POLICY): Promise<{
  projects_scanned: number;
  total_scanned: number;
  total_deleted: number;
}> {
  const { default: SystemStateSnapshot } = await import('../../../models/SystemStateSnapshot');
  // Distinct project IDs with snapshots
  const projectRows: any = await SystemStateSnapshot.findAll({
    attributes: ['project_id'],
    group: ['project_id'],
    raw: true,
  });
  let total_scanned = 0;
  let total_deleted = 0;
  for (const row of projectRows as Array<{ project_id: string }>) {
    const result = await sweepProject(row.project_id, policy);
    total_scanned += result.scanned;
    total_deleted += result.deleted;
  }
  return {
    projects_scanned: projectRows.length,
    total_scanned,
    total_deleted,
  };
}
