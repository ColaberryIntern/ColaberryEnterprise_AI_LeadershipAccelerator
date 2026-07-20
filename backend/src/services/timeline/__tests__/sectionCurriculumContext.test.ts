import { buildSectionCurriculumText, SECTION_ROSTER_TYPES } from '../sectionCurriculumContext';

describe('buildSectionCurriculumText', () => {
  const items = [
    { type: 'video', label: 'Video', title: 'Introduction to Claude Code 101', bucket: 'learn' },
    { type: 'prompt_lab', label: 'Prompt Lab', title: 'Claude Code Hands-On Lab', bucket: 'practice' },
    { type: 'implementation_task', label: 'Implementation Task', title: 'Build Your First Claude Code Project', bucket: 'build' },
  ];

  it('anchors to the week and numbers every activity with its label and title', () => {
    const text = buildSectionCurriculumText(1, items);
    expect(text).toContain("THIS WEEK'S ACTIVITIES");
    expect(text).toContain('Week 1');
    expect(text).toContain('1. Video: Introduction to Claude Code 101');
    expect(text).toContain('2. Prompt Lab: Claude Code Hands-On Lab');
    expect(text).toContain('3. Implementation Task: Build Your First Claude Code Project');
  });

  it('instructs the generator to describe the real activities, not invent others', () => {
    const text = buildSectionCurriculumText(2, items.slice(0, 1));
    expect(text).toMatch(/actually DO/);
    expect(text).toMatch(/rather than inventing others/);
  });

  it('is deterministic for the same input', () => {
    expect(buildSectionCurriculumText(3, items)).toEqual(buildSectionCurriculumText(3, items));
  });
});

describe('SECTION_ROSTER_TYPES', () => {
  it('includes overview (the week-summary type) and stays a small opt-in set', () => {
    expect(SECTION_ROSTER_TYPES.has('overview')).toBe(true);
    expect(SECTION_ROSTER_TYPES.has('video')).toBe(false);
    expect(SECTION_ROSTER_TYPES.has('prompt_lab')).toBe(false);
  });
});
