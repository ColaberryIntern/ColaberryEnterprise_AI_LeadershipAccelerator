import { buildSectionCurriculumText, SECTION_ROSTER_TYPES } from '../sectionCurriculumContext';

describe('buildSectionCurriculumText', () => {
  const items = [
    { type: 'video', label: 'Video', title: 'Introduction to Claude Code 101', bucket: 'learn', est_minutes: 12 },
    { type: 'prompt_lab', label: 'Prompt Lab', title: 'Claude Code Hands-On Lab', bucket: 'practice', est_minutes: 30 },
    { type: 'implementation_task', label: 'Implementation Task', title: 'Build Your First Claude Code Project', bucket: 'build', est_minutes: 60 },
  ];

  it('leads with count + total time and tags each activity with its phase and minutes', () => {
    const text = buildSectionCurriculumText(1, items);
    expect(text).toContain("THIS WEEK'S ACTIVITIES");
    expect(text).toContain('Week 1');
    expect(text).toContain('3 items');
    expect(text).toContain('102 min');       // total minutes (12 + 30 + 60)
    expect(text).toContain('1.7 hours');     // total, humanized
    expect(text).toContain('Learn 12 min');  // per-phase subtotal
    expect(text).toContain('Build 60 min');
    expect(text).toContain('1. [Learn] Video (12 min): Introduction to Claude Code 101');
    expect(text).toContain('2. [Practice] Prompt Lab (30 min): Claude Code Hands-On Lab');
    expect(text).toContain('3. [Build] Implementation Task (60 min): Build Your First Claude Code Project');
  });

  it('instructs the generator to use the exact numbers and cover every activity', () => {
    const text = buildSectionCurriculumText(2, items.slice(0, 1));
    expect(text).toMatch(/use these exact numbers/);
    expect(text).toMatch(/Cover ALL activities/);
    expect(text).toMatch(/do not invent or omit any/);
  });

  it('is deterministic for the same input', () => {
    expect(buildSectionCurriculumText(3, items)).toEqual(buildSectionCurriculumText(3, items));
  });
});

describe('SECTION_ROSTER_TYPES', () => {
  it('includes overview (the week-summary type) and stays a small opt-in set', () => {
    expect(SECTION_ROSTER_TYPES.has('overview')).toBe(true);
    expect(SECTION_ROSTER_TYPES.has('announcement')).toBe(true);
    expect(SECTION_ROSTER_TYPES.has('video')).toBe(false);
    expect(SECTION_ROSTER_TYPES.has('prompt_lab')).toBe(false);
  });
});
