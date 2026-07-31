import { getKitConfigDefaults } from '../kitConfigDefaults';
import { KitSessionInput } from '../kitSpec';

const week1Thursday: KitSessionInput = {
  id: 's-thu', session_number: 3, title: 'Week 1: Business Analyst',
  session_date: '2026-07-30', start_time: '18:30:00', end_time: '20:30:00', status: 'scheduled',
};
const week1Monday: KitSessionInput = {
  id: 's-mon', session_number: 2, title: 'Week 1: Business Analyst',
  session_date: '2026-07-27', start_time: '18:30:00', end_time: '20:30:00', status: 'scheduled',
};
const orientation: KitSessionInput = {
  id: 's-orient', session_number: 1, title: 'Orientation',
  session_date: '2026-07-23', start_time: '18:30:00', end_time: '20:30:00', status: 'scheduled',
};

describe('getKitConfigDefaults', () => {
  it('resolves Build Day defaults: teach slides, prompts, thursday trivia, and evidence', () => {
    const d = getKitConfigDefaults(week1Thursday);
    expect(d.dayKind).toBe('build');
    expect(d.week).toBe(1);
    expect(d.teach.length).toBeGreaterThan(0);
    expect(d.teach.some((s) => /Claude audits its own work/.test(s.title))).toBe(true);
    expect(d.interactions.every((q) => q.segment === 'readiness')).toBe(true);
    expect(d.interactions.some((q) => q.q.includes('Architecture Proposal'))).toBe(true);
    // Evidence is aggregated across rendered teach slides; may be empty for a
    // week with no authored EvidenceClaims, so just assert the shape is an array.
    expect(Array.isArray(d.evidence)).toBe(true);
  });

  it('resolves Architecture Day defaults: the Monday poll/trivia and story beats', () => {
    const d = getKitConfigDefaults(week1Monday);
    expect(d.dayKind).toBe('architecture');
    expect(d.interactions.filter((q) => q.segment === 'checkin' || q.segment === 'challenge').every((q) => q.q.includes('CLAUDE.md'))).toBe(true);
    expect(d.interactions.some((q) => q.segment === 'trivia' && q.q.includes('Plan Mode'))).toBe(true);
    expect(d.storyBeats.length).toBeGreaterThan(0);
    expect(d.storyBeats.every((b) => typeof b.segment === 'string')).toBe(true);
    expect(d.prompts).toEqual([]);
  });

  it('resolves Orientation defaults without a week number', () => {
    const d = getKitConfigDefaults(orientation);
    expect(d.dayKind).toBe('orientation');
    expect(d.week).toBeNull();
    expect(d.teach.length).toBeGreaterThan(0);
    expect(d.interactions.some((q) => q.segment === 'welcome')).toBe(true);
    expect(d.interactions.some((q) => q.segment === 'setup')).toBe(true);
  });
});
