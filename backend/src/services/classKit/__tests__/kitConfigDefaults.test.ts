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
const week2Monday: KitSessionInput = {
  id: 's-w2-mon', session_number: 2, title: 'Week 2: Agent Skills',
  session_date: '2026-08-03', start_time: '18:30:00', end_time: '20:30:00', status: 'scheduled',
};

describe('getKitConfigDefaults', () => {
  it('resolves Build Day defaults: teach slides, prompts, thursday trivia, and evidence', () => {
    const d = getKitConfigDefaults(week1Thursday);
    expect(d.dayKind).toBe('build');
    expect(d.week).toBe(1);
    expect(d.teach.length).toBeGreaterThan(0);
    expect(d.teach.some((s) => /Claude audits its own work/.test(s.title))).toBe(true);
    // The fixed Build Day trivia slot still lands on `readiness`. It is no
    // longer the ONLY question — Week 1 gained authored extras when it was
    // migrated to a content pack — so assert placement, not exclusivity.
    expect(d.interactions.some((q) => q.segment === 'readiness' && q.q.includes('Architecture Proposal'))).toBe(true);
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
    // The design-choice poll is asked at check-in and revealed at the
    // challenge — same question in both slots. Week 1 now also carries
    // authored extras on those segments, so assert the pair is present rather
    // than that nothing else shares the segment.
    expect(d.interactions.filter((q) => (q.segment === 'checkin' || q.segment === 'challenge') && q.q.includes('CLAUDE.md')).length).toBe(2);
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

  it('resolves Week 2\'s Story Beats (the data-incident redesign\'s worked example, week2-architecture-day-redesign)', () => {
    const d = getKitConfigDefaults(week2Monday);
    expect(d.dayKind).toBe('architecture');
    expect(d.week).toBe(2);
    expect(d.storyBeats.length).toBe(4);
    expect(d.storyBeats.map((b) => b.segment).sort()).toEqual(['business-problem', 'checkin', 'deconstruct', 'micro-build']);
    expect(d.storyBeats.every((b) => typeof b.body === 'string' && b.body.length > 20)).toBe(true);
    expect(d.storyBeats.find((b) => b.segment === 'checkin')?.title).toContain('analyst');
    expect(d.storyBeats.find((b) => b.segment === 'micro-build')?.title).toContain('Leadership');
  });

  it('resolves Week 2\'s designChoice poll with its answer intact (week2-architecture-day-redesign)', () => {
    // Confirms the content fix survives the resolution pipeline, not just the
    // raw data file — designChoice is spread into two segments (checkin,
    // challenge), both must carry the same answer.
    const d = getKitConfigDefaults(week2Monday);
    const checkin = d.interactions.find((it) => it.segment === 'checkin');
    const challenge = d.interactions.find((it) => it.segment === 'challenge');
    expect(checkin?.answer).toBe(2);
    expect(challenge?.answer).toBe(2);
    expect(checkin?.options[2]).toContain('data-quality contract');
  });

  it('resolves Week 2\'s extraInteractions spliced into the architecture-day default list (week2-architecture-day-redesign)', () => {
    const d = getKitConfigDefaults(week2Monday);
    // 3 fixed slots (checkin, challenge, trivia) + 4 extras = 7 total.
    expect(d.interactions.length).toBe(7);
    const deconstructPoll = d.interactions.find((it) => it.segment === 'deconstruct');
    expect(deconstructPoll?.options).toContain('Skill description');
    const microBuildPolls = d.interactions.filter((it) => it.segment === 'micro-build');
    expect(microBuildPolls.length).toBe(2);
    const triviaQs = d.interactions.filter((it) => it.segment === 'trivia');
    expect(triviaQs.length).toBe(2);
    expect(triviaQs.some((q) => q.q.includes('allowed-tools'))).toBe(true);
  });

  it('does not leak Week 2\'s extraInteractions into any other week (week2-architecture-day-redesign)', () => {
    // Every week now authors its own extras, so a raw count no longer proves
    // isolation. Assert the real property instead: Week 2's distinctive
    // questions must not appear anywhere in Week 1's resolved set.
    const d1 = getKitConfigDefaults(week1Monday);
    const week1Text = JSON.stringify(d1.interactions);
    expect(week1Text).not.toContain('Skill description');
    expect(week1Text).not.toContain('allowed-tools');
    expect(week1Text).not.toContain('data-quality-gate');
    // and Week 1's own fixed slots are still all present
    expect(d1.interactions.filter((q) => ['checkin', 'challenge', 'trivia'].includes(q.segment)).length).toBeGreaterThanOrEqual(3);
  });

  it('scales segment lane widths to a session\'s actual (non-120-min) duration, proportionally', () => {
    const d = getKitConfigDefaults(shortBuildDay); // 90 min actual vs. 120 min nominal, factor 0.75
    const reset = d.segments.find((s) => s.id === 'reset');
    expect(reset).toEqual({ id: 'reset', label: 'Reset', startMin: 56, endMin: 64, mode: 'break' }); // round(75*.75)=56, round(85*.75)=64
    expect(d.breakSegment).toEqual({ segment: 'reset', startMin: 56, endMin: 64, label: 'Reset' });
  });
});
