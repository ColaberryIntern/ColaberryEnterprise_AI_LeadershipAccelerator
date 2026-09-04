import TimelineCardProgress from '../../models/TimelineCardProgress';
import { SnapshotField, TimelineProgressValue } from './types';

/**
 * Real, live-progress signal — the discovery report's own finding: this is
 * the richest, most real-time source in the platform, and Reese's own
 * autonomous-outreach eligibility already reads it directly
 * (reeseSignalService.ts). No reliability gate wired for this source yet —
 * Checkpoint B only built the gate + attendance as its first consumer;
 * extending it to other sources (timeline, assessments, ...) once each has
 * a real declared-unreliable case is real, separate follow-up work, not
 * silently assumed complete here.
 */
export async function getTimelineProgressField(enrollmentId: string): Promise<SnapshotField<TimelineProgressValue>> {
  const rows = await TimelineCardProgress.findAll({ where: { enrollment_id: enrollmentId } });

  const completed = rows.filter((r: any) => r.status === 'completed');
  const lastActivity = rows.reduce<Date | null>((latest, r: any) => {
    const t = r.completed_at || r.started_at;
    if (!t) return latest;
    return !latest || t > latest ? t : latest;
  }, null);

  return {
    value: {
      cardsCompleted: completed.length,
      totalCardsSeen: rows.length,
      lastActivityAt: lastActivity ? lastActivity.toISOString() : null,
    },
    status: 'known',
    sourceSystem: 'timeline_card_progress',
    sourceRecordIds: rows.map((r: any) => r.id),
    observedAt: new Date(),
    freshnessPolicy: 'real-time-synchronous-on-user-action',
    reliabilityState: 'healthy',
  };
}
