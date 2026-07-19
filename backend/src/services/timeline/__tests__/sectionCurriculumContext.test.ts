import { buildSectionCurriculumText, SECTION_ROSTER_TYPES } from '../sectionCurriculumContext';

describe('buildSectionCurriculumText', () => {
  const items = [
    { type: 'video', label: 'Video', title: 'Introduction to Claude Code 101', bucket: 'learn' },
    { type: 'prompt_lab', label: 'Prompt Lab', title: 'Claude Code Hands-On Lab', bucket: 'practice' },
    { type: 'implementation_task', label: 'Implementation Task', title: 'Build Your First Claude Code Project', bucket: 'build' },
  ];

  it('leads with the total count and numbers every activity with its phase, label and title', () => {
    const text = buildSectionCurriculumText(1, items);
    expect(text).toContain("THIS WEEK'S ACTIVITIES");
    expect(text).toContain('Week 1');
    expect(text).toContain('3 concrete curriculum items');
    expect(text).toContain('1. [Learn] Video: Introduction to Claude Code 101');
    expect(text).toContain('2. [Practice] Prompt Lab: Claude Code Hands-On Lab');
    expect(text).toContain('3. [Build] Implementation Task: Build Your First Claude Code Project');
  });

  it('instructs the generator to cover every activity, not invent others', () => {
    const text = buildSectionCurriculumText(2, items.slice(0, 1));
    expect(text).toMatch(/cover ALL of these/);
    expect(text).toMatch(/do not invent others or omit any/);
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
