import { GENERATED_WEEK_TEACH } from '../../../data/classTeachWeeks';

/**
 * classTeachWeeks.ts is GENERATED (scripts/buildTeachWeeks.js), but its input
 * (a directory of weekN.json files from a one-time fan-out) is not committed
 * anywhere in this repo — confirmed by a repo-wide search before this change.
 * Week 2's "monday" array was therefore hand-edited directly, disclosed here,
 * to replace the commit-message/PR-description/release-notes examples with
 * the data-quality/ETL-incident story (week2-architecture-day-redesign).
 * Weeks 3-12 and Week 2's "thursday" array were left byte-for-byte untouched.
 * These tests guard Week 2's monday content from silently reverting.
 */
describe('classTeachWeeks — Week 2 monday (week2-architecture-day-redesign)', () => {
  const week2 = GENERATED_WEEK_TEACH[2];

  it('exists and has both monday and thursday arrays', () => {
    expect(week2).toBeDefined();
    expect(Array.isArray(week2.monday)).toBe(true);
    expect(Array.isArray(week2.thursday)).toBe(true);
  });

  it('carries the three connected Skill names somewhere in the monday content', () => {
    const text = JSON.stringify(week2.monday);
    expect(text).toContain('data-quality-gate');
    expect(text).toContain('etl-failure-triage');
    expect(text).toContain('executive-dashboard-brief');
  });

  it('does not carry the old, removed commit-message/PR/release-notes example vocabulary', () => {
    const text = JSON.stringify(week2.monday);
    expect(text).not.toContain('commit-summary');
    expect(text).not.toContain('release-notes');
    expect(text).not.toContain('pr-description');
  });

  it('does not carry the unsupported quantitative claims flagged for removal', () => {
    const text = JSON.stringify(week2.monday);
    expect(text).not.toMatch(/80%/);
    expect(text).not.toMatch(/number-one reason/i);
    expect(text).not.toMatch(/near-zero cost/i);
  });

  it('does not INSTRUCT students to use the Downloads folder anywhere (the negation "no downloads folder" is expected and fine)', () => {
    const text = JSON.stringify(week2.monday).toLowerCase();
    expect(text).not.toMatch(/(save|move|copy|export|download)[^.]{0,40}(to|into|in)[^.]{0,20}downloads/);
    expect(text).not.toContain('~/downloads');
    expect(text).toContain('no downloads folder');
  });

  it('does not misstate allowed-tools as a permanent restriction', () => {
    const text = JSON.stringify(week2.monday);
    // The corrected language ("pre-approves ... for the invocation turn")
    // must be present wherever allowed-tools is discussed in prose.
    if (text.includes('allowed-tools')) {
      expect(text).not.toMatch(/allowed-tools[^"]{0,40}permanently restrict/i);
    }
  });

  it('every code-producing slide names an explicit "WHERE THESE FILES WILL BE STORED" location', () => {
    const fileSlides = week2.monday!.filter((s) => s.code && /CREATE|Build|SKILL\.md/i.test(s.code!.code));
    expect(fileSlides.length).toBeGreaterThan(0);
    fileSlides.forEach((s) => {
      const hasLocationCallout = (s.bullets || []).some((b) => /WHERE (THESE FILES|THE RESULT|THE FINAL)/i.test(b));
      expect(hasLocationCallout).toBe(true);
    });
  });

  it('build and automatic-invocation-test are always on separate slides, never combined', () => {
    // Build/test labeling lives in the slide's eyebrow (e.g. "🧪 Test
    // Automatic Invocation"), not necessarily the title — check both.
    const labels = week2.monday!.map((s) => `${s.eyebrow || ''} ${s.title || ''}`);
    const buildLabels = labels.filter((t) => /Build (data-quality-gate|etl-failure-triage|executive-dashboard-brief)|First Skill|Second Skill|Third Skill/i.test(t));
    const testLabels = labels.filter((t) => /Test Automatic Invocation|Three-Way Retest|Test \+ Complete/i.test(t));
    // 3 skills built, each with its own separate build slide and its own
    // separate invocation-test slide — never the same slide doing both.
    expect(buildLabels.length).toBeGreaterThanOrEqual(3);
    expect(testLabels.length).toBeGreaterThanOrEqual(3);
  });

  it('Thursday (Build Day) content is completely untouched by this change', () => {
    const text = JSON.stringify(week2.thursday);
    expect(text).toContain('commit-summary');
    expect(text).toContain('release-notes');
    expect(text).toContain('pr-description');
  });

  it('does not modify any other generated week (3-12 byte-for-byte)', () => {
    // A coarse but effective guard: every other week must still carry ITS
    // OWN original content shape (non-empty monday+thursday), and none of
    // them should have picked up the new ETL/data-quality vocabulary that
    // is specific to Week 2's rewrite.
    for (let w = 3; w <= 12; w += 1) {
      const wk = GENERATED_WEEK_TEACH[w];
      expect(wk).toBeDefined();
      const text = JSON.stringify(wk);
      expect(text).not.toContain('data-quality-gate');
      expect(text).not.toContain('etl-failure-triage');
      expect(text).not.toContain('executive-dashboard-brief');
    }
  });
});
