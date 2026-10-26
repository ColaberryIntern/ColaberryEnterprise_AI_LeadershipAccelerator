/**
 * C9 earned gear: unlocked iff real points reach the threshold (on the points ladder 150 / 400 / 900); one item per slot. C46: no ride
 * slot; the two milestones that were rides are now the Campus jacket (150) and the Gold Architect jacket (900); a saved ride is ignored.
 */
import { GEAR_CATALOG, GEAR_SLOTS, isUnlocked, validateEquip, wearable, publicGear, GearError } from '../campusUnlocks';
import { LEVELS } from '../../pointsService';

const by = (id: string) => GEAR_CATALOG.find((i) => i.id === id)!;

describe('unlock by points, at every boundary', () => {
  it.each([
    [0, []],
    [149, []],
    [150, ['cap', 'jacket']],
    [399, ['cap', 'jacket']],
    [400, ['cap', 'jacket', 'hoodie', 'shades']],
    [899, ['cap', 'jacket', 'hoodie', 'shades']],
    [900, ['cap', 'jacket', 'hoodie', 'shades', 'architect', 'chain']],
    [100000, ['cap', 'jacket', 'hoodie', 'shades', 'architect', 'chain']],
  ])('%i points unlock %j', (points, ids) => {
    expect(GEAR_CATALOG.filter((i) => isUnlocked(i, points)).map((i) => i.id)).toEqual(ids);
  });

  it('every threshold is a real rung of the points ladder (no invented ladder)', () => {
    const rungs = LEVELS.map((l) => l.min) as number[];
    for (const i of GEAR_CATALOG) expect({ id: i.id, onLadder: rungs.includes(i.threshold) && i.threshold > 0 }).toEqual({ id: i.id, onLadder: true });
  });

  it('every item has a known slot and a unique id; names never say "free" or "buy"', () => {
    expect(new Set(GEAR_CATALOG.map((i) => i.id)).size).toBe(GEAR_CATALOG.length);
    for (const i of GEAR_CATALOG) {
      expect(GEAR_SLOTS).toContain(i.slot);
      expect(i.name).not.toMatch(/\b(free|buy)\b/i);
    }
  });
});

describe('validateEquip (the complete set)', () => {
  it('accepts unlocked items in their own slots; a missing slot means nothing worn there', () => {
    expect(validateEquip(400, { head: 'cap', face: 'shades', ride: null })).toEqual({ head: 'cap', face: 'shades' });
    expect(validateEquip(0, {})).toEqual({});
  });
  it.each([
    ['an unknown id', 900, { head: 'crown' }, 'GearUnknown'],
    ['the wrong slot', 900, { head: 'jacket' }, 'GearWrongSlot'],
    ['a retired ride id', 900, { body: 'cruiser' }, 'GearUnknown'],
    ['a locked item, one point short', 399, { body: 'hoodie' }, 'GearLocked'],
  ])('refuses %s', (_n, points, set, cls) => {
    expect(() => validateEquip(points, set as Record<string, string>)).toThrow(GearError);
    try { validateEquip(points, set as Record<string, string>); } catch (e) { expect((e as GearError).error_class).toBe(cls); }
  });
  it('ignores keys that are not slots (the route refuses them earlier)', () => {
    expect(validateEquip(900, { hat: 'cap' } as Record<string, string>)).toEqual({});
  });
});

describe('what a stored set still allows, and what others see', () => {
  it('drops items that are unknown, in the wrong slot, or not earned', () => {
    expect(wearable(150, { head: 'cap', body: 'hoodie', face: 'jacket', neck: 'nope' })).toEqual({ head: 'cap' });
    expect(wearable(150, null)).toEqual({});
    expect(wearable(150, 'garbage')).toEqual({});
  });
  it('C46: a saved ride from before is ignored, never an error; there is no ride slot; both milestones still reward a jacket', () => {
    expect(wearable(900, { head: 'cap', ride: 'cruiser', body: 'architect' })).toEqual({ head: 'cap', body: 'architect' });
    expect(validateEquip(900, { ride: 'board', body: 'jacket' })).toEqual({ body: 'jacket' });
    expect(publicGear({ head: 'cap', body: 'jacket', neck: 'chain' })).toEqual({ head: 'cap', body: 'jacket', neck: 'chain' });
    expect(GEAR_SLOTS as readonly string[]).not.toContain('ride');
    expect([by('jacket').slot, by('jacket').threshold, by('architect').slot, by('architect').threshold]).toEqual(['body', 150, 'body', 900]);
    expect(GEAR_CATALOG.some((i) => i.id === 'board' || i.id === 'cruiser')).toBe(false);
  });
});
