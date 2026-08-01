import { lastRunInfo, InboxCaseEventRecord } from './inboxCaseApi';

// Pure-function coverage for the "last run" status-light fix (loop-architect
// run 20260801-0200-inbox-cos-activity-and-errors): there is no scheduled job
// for Assess/Plan/Execute (confirmed: no cron references this system in
// schedulerService.ts) — every step is a manual click, so the events log is
// the only real source for "when did this last actually run."

const event = (over: Partial<InboxCaseEventRecord>): InboxCaseEventRecord => ({
  id: 'evt', case_id: 'case-1', item_id: null, action_id: null, event_type: 'assessment_completed',
  actor_type: 'ai', actor_id: 'x', previous_state: null, new_state: null, details: {}, correlation_id: 'c',
  created_at: '2026-08-01T00:00:00Z', ...over,
});

describe('lastRunInfo', () => {
  it('returns status "never" with no timestamp when no matching event exists', () => {
    const result = lastRunInfo([], ['assessment_completed'], ['assessment_failed']);
    expect(result).toEqual({ status: 'never', at: null });
  });

  it('returns status "success" with the matching event\'s timestamp', () => {
    const events = [event({ event_type: 'assessment_completed', created_at: '2026-08-01T10:00:00Z' })];
    const result = lastRunInfo(events, ['assessment_completed'], ['assessment_failed']);
    expect(result).toEqual({ status: 'success', at: '2026-08-01T10:00:00Z' });
  });

  it('returns status "failed" when the most recent matching event is a failure type', () => {
    const events = [
      event({ id: 'e1', event_type: 'assessment_completed', created_at: '2026-08-01T09:00:00Z' }),
      event({ id: 'e2', event_type: 'assessment_failed', created_at: '2026-08-01T10:00:00Z' }),
    ];
    const result = lastRunInfo(events, ['assessment_completed'], ['assessment_failed']);
    expect(result).toEqual({ status: 'failed', at: '2026-08-01T10:00:00Z' });
  });

  it('picks the MOST RECENT matching event by created_at, not array order', () => {
    const events = [
      event({ id: 'e1', event_type: 'assessment_failed', created_at: '2026-08-01T10:00:00Z' }),
      event({ id: 'e2', event_type: 'assessment_completed', created_at: '2026-08-01T09:00:00Z' }),
    ];
    const result = lastRunInfo(events, ['assessment_completed'], ['assessment_failed']);
    expect(result.status).toBe('failed'); // the 10:00 failure is more recent than the 09:00 success
    expect(result.at).toBe('2026-08-01T10:00:00Z');
  });

  it('ignores events whose type is not in either success or failure list', () => {
    const events = [event({ event_type: 'case_resolved', created_at: '2026-08-01T10:00:00Z' })];
    const result = lastRunInfo(events, ['assessment_completed'], ['assessment_failed']);
    expect(result.status).toBe('never');
  });

  it('treats an empty failureTypes list as "everything matching successTypes is a success"', () => {
    const events = [event({ event_type: 'plan_generated', created_at: '2026-08-01T10:00:00Z' })];
    const result = lastRunInfo(events, ['plan_generated']);
    expect(result).toEqual({ status: 'success', at: '2026-08-01T10:00:00Z' });
  });
});
