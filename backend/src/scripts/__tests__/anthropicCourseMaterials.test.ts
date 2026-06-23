import { computeMaterialsUpdate, CourseMaterial } from '../lib/anthropicCourseMaterials';

const COURSES: CourseMaterial[] = [
  { title: 'Claude Code 101 (Anthropic Skilljar)', type: 'reading', url: 'https://anthropic.skilljar.com/claude-code-101' },
  { title: 'Claude Code in Action (Anthropic Skilljar)', type: 'reading', url: 'https://anthropic.skilljar.com/claude-code-in-action' },
];

describe('computeMaterialsUpdate', () => {
  it('first run on empty materials adds both, prepended', () => {
    const { toAdd, next } = computeMaterialsUpdate([], COURSES);
    expect(toAdd).toHaveLength(2);
    expect(next).toEqual([...COURSES]);
  });

  it('is idempotent: a second run on its own output adds nothing', () => {
    const first = computeMaterialsUpdate([], COURSES);
    const second = computeMaterialsUpdate(first.next, COURSES);
    expect(second.toAdd).toHaveLength(0);
    expect(second.next).toEqual(first.next);
  });

  it('adds only the missing course when one is already present', () => {
    const existing = [COURSES[0]];
    const { toAdd, next } = computeMaterialsUpdate(existing, COURSES);
    expect(toAdd).toEqual([COURSES[1]]);
    expect(next).toEqual([COURSES[1], COURSES[0]]); // missing prepended, existing preserved
  });

  it('preserves unrelated existing materials and does not duplicate', () => {
    const other: CourseMaterial = { title: 'Reading: Syllabus', type: 'reading', url: 'https://x/syllabus' };
    const { toAdd, next } = computeMaterialsUpdate([other], COURSES);
    expect(toAdd).toHaveLength(2);
    expect(next).toEqual([...COURSES, other]);
  });

  it.each([null, undefined, {}, 'not-an-array', 42])(
    'treats non-array materials_json (%p) as empty and adds both',
    (bad) => {
      const { toAdd, next } = computeMaterialsUpdate(bad as unknown, COURSES);
      expect(toAdd).toHaveLength(2);
      expect(next).toEqual([...COURSES]);
    }
  );
});
