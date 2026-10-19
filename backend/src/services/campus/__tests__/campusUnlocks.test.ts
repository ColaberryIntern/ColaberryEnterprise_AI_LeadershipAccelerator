/**
 * C9 earned gear: unlocked iff real points reach the threshold (on the points ladder 150 / 400 / 900); one item per slot; a ride is
 * never part of what others see.
 */
import { GEAR_CATALOG, GEAR_SLOTS, isUnlocked, validateEquip, wearable, publicGear, GearError } from '../campusUnlocks';
import { LEVELS } from '../../pointsService';

const by = (id: string) => GEAR_CATALOG.find((i) => i.id === id)!;

describe('unlock by points, at every boundary', () => {
  it.each([
    [0, []],
    [149, []],
    [150, ['cap', 'board']],
    [399, ['cap', 'board']],
    [400, ['cap', 'board', 'hoodie', 'shades']],
    [899, ['cap', 'board', 'hoodie', 'shades']],
    [900, ['cap', 'board', 'hoodie', 'shades', 'cruiser', 'chain']],
    [100000, ['cap', 'board', 'hoodie', 'shades', 'cruiser', 'chain']],
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
    ['the wrong slot', 900, { head: 'board' }, 'GearWrongSlot'],
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
    expect(wearable(150, { head: 'cap', body: 'hoodie', face: 'board', neck: 'nope', ride: 'board' })).toEqual({ head: 'cap', ride: 'board' });
    expect(wearable(150, null)).toEqual({});
    expect(wearable(150, 'garbage')).toEqual({});
  });
  it('others never see the ride', () => {
    expect(publicGear({ head: 'cap', ride: 'cruiser', neck: 'chain' })).toEqual({ head: 'cap', neck: 'chain' });
    expect(by('cruiser').slot).toBe('ride');
  });
});
