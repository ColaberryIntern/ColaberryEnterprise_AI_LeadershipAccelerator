/**
 * prepTaskPoints — the one place every surface reads a task's price from.
 * Pure, so it is imported by the tree mapper and the route tests that stub the
 * database; a single I/O import here would break those on module load.
 */
import { PREP_TASK_POINTS, isPrepStory, priceForStory } from '../prepTaskPoints';

const priced = new Map([['STORY-001', 50], ['STORY-000', 50]]);

describe('isPrepStory', () => {
  it('matches the generator\'s ids and nothing else', () => {
    for (const id of ['PREP-1', 'PREP-6', 'prep-2', ' PREP-3 ']) expect(isPrepStory(id)).toBe(true);
    for (const id of ['STORY-001', 'STORY-000', 'PREP', 'PREP-', 'PREP-x', '', null, undefined]) expect(isPrepStory(id)).toBe(false);
  });
});

describe('priceForStory', () => {
  it('pays a plan story its share of the build budget', () => {
    expect(priceForStory('STORY-001', priced)).toBe(50);
    expect(priceForStory('STORY-000', priced)).toBe(50);
  });

  it('pays a Demo Prep task the flat rate, whether or not the map knows it', () => {
    expect(priceForStory('PREP-1', priced)).toBe(PREP_TASK_POINTS);
    expect(priceForStory('PREP-4', new Map())).toBe(PREP_TASK_POINTS);
  });

  it('pays nothing for a story the plan does not know, or a task with no story', () => {
    expect(priceForStory('STORY-099', priced)).toBeNull();
    expect(priceForStory(null, priced)).toBeNull();
    expect(priceForStory(undefined, priced)).toBeNull();
    expect(priceForStory('', priced)).toBeNull();
  });

  it('never turns a zero share into a badge', () => {
    expect(priceForStory('STORY-001', new Map([['STORY-001', 0]]))).toBeNull();
  });

  it('the rate is a real, positive number a tile can show', () => {
    expect(PREP_TASK_POINTS).toBeGreaterThan(0);
    expect(Number.isInteger(PREP_TASK_POINTS)).toBe(true);
  });
});
