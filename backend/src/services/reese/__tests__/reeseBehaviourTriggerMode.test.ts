import { getTriggerMode, computeStatusFacts } from '../reeseBehaviourTriggerMode';

describe('getTriggerMode', () => {
  it('happy path: model-selected for the two tool-choosing behaviours, rule-triggered for the rest', () => {
    expect(getTriggerMode('reactive_dm_reply')).toBe('model_selected');
    expect(getTriggerMode('health_assessment')).toBe('model_selected');
    expect(getTriggerMode('autonomous_outreach_sweep')).toBe('rule_triggered');
    expect(getTriggerMode('outreach_follow_ups')).toBe('rule_triggered');
    expect(getTriggerMode('welcome_dms')).toBe('rule_triggered');
    expect(getTriggerMode('student_support_supersession_resolver')).toBe('rule_triggered');
    expect(getTriggerMode('presence_heartbeat')).toBe('rule_triggered');
  });
});

describe('computeStatusFacts', () => {
  it('happy path: a cron behaviour with zero errors over real tracked runs is healthy', () => {
    const facts = computeStatusFacts('autonomous_outreach_sweep', {
      enabled: true, configured: true, cronRunCount: 12, cronErrorCount: 0,
    });
    expect(facts).toEqual({ callable: true, configured: true, authorized: true, enabled: true, healthy: true });
  });

  it('happy path: a cron behaviour with real recorded errors is unhealthy', () => {
    const facts = computeStatusFacts('presence_heartbeat', {
      enabled: true, configured: true, cronRunCount: 40, cronErrorCount: 3,
    });
    expect(facts.healthy).toBe(false);
  });

  it('boundary: a non-cron-tracked behaviour (reactive_dm_reply) has no health signal -- null, never guessed', () => {
    const facts = computeStatusFacts('reactive_dm_reply', {
      enabled: true, configured: true, cronRunCount: null, cronErrorCount: null,
    });
    expect(facts.healthy).toBeNull();
  });

  it('boundary: a cron behaviour whose sibling row was never fetched (no run stats) is also honestly null', () => {
    const facts = computeStatusFacts('outreach_follow_ups', {
      enabled: false, configured: false, cronRunCount: null, cronErrorCount: null,
    });
    expect(facts.healthy).toBeNull();
    expect(facts.configured).toBe(false);
    expect(facts.enabled).toBe(false);
  });

  it('callable is always true for a real behaviour, independent of enabled/configured state', () => {
    const facts = computeStatusFacts('welcome_dms', {
      enabled: false, configured: false, cronRunCount: null, cronErrorCount: null,
    });
    expect(facts.callable).toBe(true);
  });
});
