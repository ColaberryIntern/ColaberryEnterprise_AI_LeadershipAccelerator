import type { CommsHubSummary } from './commsHubSchemas';

/**
 * The Today tiles (CH1.3). Each count belongs to the feature that owns its rows: events (CH2) count
 * upcoming events and missing thumbnails, messages (CH6/CH7) count approvals, the schedule and
 * failures, settings (CH7) report the pause. A feature contributes its counter by registering it
 * when its module loads, so this file never imports a feature and a feature never edits this file.
 * A count with no registered counter is zero because no feature has rows of that kind.
 */
export interface SummaryCounters {
  awaitingApproval: () => Promise<number>;
  scheduledNext7Days: (now: Date) => Promise<number>;
  upcomingEvents: (now: Date) => Promise<number>;
  eventsMissingThumbnail: (now: Date) => Promise<number>;
  needsAttention: () => Promise<number>;
  sendingPaused: () => Promise<boolean>;
}

let counters: Partial<SummaryCounters> = {};

export function registerSummaryCounters(c: Partial<SummaryCounters>): void {
  counters = { ...counters, ...c };
}

/** Test seam: forget every registered counter. */
export function resetSummaryCounters(): void {
  counters = {};
}

export async function getSummary(now: Date = new Date()): Promise<CommsHubSummary> {
  const zero = async (): Promise<number> => 0;
  const [awaiting, scheduled, upcoming, missing, attention, paused] = await Promise.all([
    (counters.awaitingApproval ?? zero)(),
    (counters.scheduledNext7Days ?? zero)(now),
    (counters.upcomingEvents ?? zero)(now),
    (counters.eventsMissingThumbnail ?? zero)(now),
    (counters.needsAttention ?? zero)(),
    (counters.sendingPaused ?? (async () => false))(),
  ]);
  return {
    awaiting_approval: awaiting,
    scheduled_next_7_days: scheduled,
    upcoming_events: upcoming,
    events_missing_thumbnail: missing,
    needs_attention: attention,
    sending_paused: paused,
  };
}
