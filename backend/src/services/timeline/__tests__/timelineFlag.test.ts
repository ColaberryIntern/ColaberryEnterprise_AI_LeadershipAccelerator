import { isTimelineEngineEnabled } from '../timelineFlag';

describe('timelineFlag', () => {
  const OLD_ENV = process.env;
  beforeEach(() => { process.env = { ...OLD_ENV }; });
  afterAll(() => { process.env = OLD_ENV; });

  it('is off when the flag is unset', () => {
    delete process.env.TIMELINE_ENGINE_ENABLED;
    expect(isTimelineEngineEnabled('cohort-1')).toBe(false);
  });

  it('is off when the flag is not exactly "true"', () => {
    process.env.TIMELINE_ENGINE_ENABLED = '1';
    expect(isTimelineEngineEnabled('cohort-1')).toBe(false);
  });

  it('is on for all cohorts when enabled with no allowlist', () => {
    process.env.TIMELINE_ENGINE_ENABLED = 'true';
    delete process.env.TIMELINE_ENGINE_COHORTS;
    expect(isTimelineEngineEnabled('any-cohort')).toBe(true);
    expect(isTimelineEngineEnabled()).toBe(true);
  });

  it('respects a per-cohort allowlist (blast-radius control)', () => {
    process.env.TIMELINE_ENGINE_ENABLED = 'true';
    process.env.TIMELINE_ENGINE_COHORTS = 'cohort-1, cohort-2';
    expect(isTimelineEngineEnabled('cohort-1')).toBe(true);
    expect(isTimelineEngineEnabled('cohort-2')).toBe(true);
    expect(isTimelineEngineEnabled('cohort-3')).toBe(false);
    expect(isTimelineEngineEnabled()).toBe(false);
  });
});
