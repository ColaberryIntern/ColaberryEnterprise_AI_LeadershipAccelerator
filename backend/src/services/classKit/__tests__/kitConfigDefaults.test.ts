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
const week2Thursday: KitSessionInput = {
  id: 's-w2-thu', session_number: 3, title: 'Week 2: Agent Skills',
  session_date: '2026-08-06', start_time: '18:30:00', end_time: '20:30:00', status: 'scheduled',
};
const shortBuildDay: KitSessionInput = {
  id: 's-short-thu', session_number: 3, title: 'Week 1: Business Analyst',
  session_date: '2026-07-30', start_time: '18:30:00', end_time: '20:00:00', status: 'scheduled', // 90 min, not the nominal 120
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
    // Build Day has no cold-open/hook (Monday-only); result-preview is authored.
    expect(d.opening.coldOpen).toBeNull();
    expect(d.opening.hook).toBeNull();
    expect(d.opening.resultPreview?.title).toBe('What you are producing today');
    // Phase 4: read-only checkpoint/break landmarks, Build Day only.
    expect(d.checkpoints.length).toBe(5); // Week 1 authors CP0..CP4 (5 entries)
    expect(d.checkpoints.every((cp) => cp.segment === 'build-map')).toBe(true);
    expect(d.checkpoints[0]).toEqual(expect.objectContaining({ n: 0, label: 'CLAUDE.md ready', segment: 'build-map' }));
    expect(d.breakSegment).toEqual({ segment: 'reset', startMin: 75, endMin: 85, label: 'Reset' });
    // Phase 5: every real Build Day lane, in show order, unscaled (this
    // fixture's 120-min session matches the nominal template exactly).
    expect(d.segments.map((s) => s.id)).toEqual(['result-preview', 'readiness', 'build-map', 'guided-build', 'reset', 'failure', 'demos', 'broadcast', 'cta']);
    expect(d.segments.find((s) => s.id === 'reset')).toEqual({ id: 'reset', label: 'Reset', startMin: 75, endMin: 85, mode: 'break' });
  });

  it('resolves Architecture Day defaults: the Monday poll/trivia, story beats, and opening content', () => {
    const d = getKitConfigDefaults(week1Monday);
    expect(d.dayKind).toBe('architecture');
    expect(d.interactions.filter((q) => q.segment === 'checkin' || q.segment === 'challenge').every((q) => q.q.includes('CLAUDE.md'))).toBe(true);
    expect(d.interactions.some((q) => q.segment === 'trivia' && q.q.includes('Plan Mode'))).toBe(true);
    expect(d.storyBeats.length).toBeGreaterThan(0);
    expect(d.storyBeats.every((b) => typeof b.segment === 'string')).toBe(true);
    expect(d.prompts).toEqual([]);
    expect(d.opening.coldOpen?.title).toBe('By Thursday, this will exist');
    expect(d.opening.hook).not.toBeNull(); // Week 1 has an authored hook
    expect(d.opening.resultPreview).toBeNull(); // Thursday-only
    // Phase 4: checkpoints are Build-Day-only content; Architecture Day still
    // gets its own break landmark (a different 'reset' window than Build Day's).
    expect(d.checkpoints).toEqual([]);
    expect(d.breakSegment).toEqual({ segment: 'reset', startMin: 60, endMin: 65, label: 'Reset' });
    expect(d.segments.map((s) => s.id)).toEqual(['cold-open', 'checkin', 'business-problem', 'architecture', 'deconstruct', 'reset', 'micro-build', 'challenge', 'trivia', 'trailer']);
  });

  it('resolves Orientation defaults without a week number, and no opening content (Monday/Thursday-only)', () => {
    const d = getKitConfigDefaults(orientation);
    expect(d.dayKind).toBe('orientation');
    expect(d.week).toBeNull();
    expect(d.teach.length).toBeGreaterThan(0);
    expect(d.interactions.some((q) => q.segment === 'welcome')).toBe(true);
    expect(d.interactions.some((q) => q.segment === 'setup')).toBe(true);
    expect(d.opening.coldOpen).toBeNull();
    expect(d.opening.hook).toBeNull();
    expect(d.opening.resultPreview).toBeNull();
    // Phase 4: Orientation's run-of-show template has no 'break' segment and
    // no checkpoints are ever authored for it.
    expect(d.checkpoints).toEqual([]);
    expect(d.breakSegment).toBeNull();
    expect(d.segments.map((s) => s.id)).toEqual(['welcome', 'big-picture', 'platform', 'setup']);
    expect(d.segments.every((s) => s.mode !== 'break')).toBe(true);
  });

  it('resolves checkpoint count per week (not hardcoded to Week 1\'s 5) — Week 2 authors 4 (n:0..3)', () => {
    const d = getKitConfigDefaults(week2Thursday);
    expect(d.checkpoints.length).toBe(4);
    expect(d.checkpoints.map((cp) => cp.n)).toEqual([0, 1, 2, 3]);
    expect(d.checkpoints.every((cp) => cp.segment === 'build-map')).toBe(true);
  });

  it('scales segment lane widths to a session\'s actual (non-120-min) duration, proportionally', () => {
    const d = getKitConfigDefaults(shortBuildDay); // 90 min actual vs. 120 min nominal, factor 0.75
    const reset = d.segments.find((s) => s.id === 'reset');
    expect(reset).toEqual({ id: 'reset', label: 'Reset', startMin: 56, endMin: 64, mode: 'break' }); // round(75*.75)=56, round(85*.75)=64
    expect(d.breakSegment).toEqual({ segment: 'reset', startMin: 56, endMin: 64, label: 'Reset' });
  });
});
