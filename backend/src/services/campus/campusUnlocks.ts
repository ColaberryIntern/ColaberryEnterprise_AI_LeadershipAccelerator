/**
 * Earned avatar gear (Colaberry Campus C9). THE single source: the frontend only draws a glyph per id.
 *
 * EARNED, NEVER BOUGHT. An item is unlocked iff the learner's real points total (student_points_events, the same total the HUD
 * and leaderboard use) reaches its threshold. Thresholds sit exactly on the real points ladder (pointsService.LEVELS and
 * bandLadder POINTS_SUBLEVELS: 150 / 400 / 900), so a new item arrives with each points rung. Nothing above the top points rung:
 * the prototype's higher items (crown, jetpack) would need a ladder that does not exist. Unlocks are computed, never stored.
 *
 * Five slots, one item each. A ride is the learner's OWN: it is drawn only on their own avatar while it travels, and is never
 * sent to anyone else (campusLookService strips it).
 */
export const GEAR_SLOTS = ['head', 'face', 'body', 'neck', 'ride'] as const;
export type GearSlot = typeof GEAR_SLOTS[number];
/** The slots other people may see. */
export const PUBLIC_SLOTS: readonly GearSlot[] = ['head', 'face', 'body', 'neck'];

export interface GearItem { id: string; name: string; slot: GearSlot; threshold: number }

export const GEAR_CATALOG: readonly GearItem[] = [
  { id: 'cap', name: 'Cohort cap', slot: 'head', threshold: 150 },
  { id: 'board', name: 'Skateboard', slot: 'ride', threshold: 150 },
  { id: 'hoodie', name: 'Colaberry hoodie', slot: 'body', threshold: 400 },
  { id: 'shades', name: 'Shades', slot: 'face', threshold: 400 },
  { id: 'cruiser', name: 'Cherry Cruiser', slot: 'ride', threshold: 900 },
  { id: 'chain', name: 'Gold chain', slot: 'neck', threshold: 900 },
];

export type Equipped = Partial<Record<GearSlot, string>>;

export const isUnlocked = (item: GearItem, points: number): boolean => points >= item.threshold;
export const itemById = (id: string): GearItem | undefined => GEAR_CATALOG.find((i) => i.id === id);

/** Why an equip request is refused (a 400 with this class). */
export class GearError extends Error {
  constructor(message: string, readonly error_class: 'GearUnknown' | 'GearWrongSlot' | 'GearLocked') { super(message); this.name = 'GearError'; }
}

/**
 * Validate a COMPLETE equipped set (a slot not present means nothing worn there) against the learner's points.
 * Throws GearError on an unknown id, an item in the wrong slot, or an item the points have not earned.
 */
export function validateEquip(points: number, equipped: Record<string, string | null | undefined>): Equipped {
  const out: Equipped = {};
  for (const slot of GEAR_SLOTS) {
    const id = equipped[slot];
    if (id === null || id === undefined) continue;
    const item = itemById(id);
    if (!item) throw new GearError(`Unknown item "${id}"`, 'GearUnknown');
    if (item.slot !== slot) throw new GearError(`${item.name} is worn as ${item.slot}, not ${slot}`, 'GearWrongSlot');
    if (!isUnlocked(item, points)) throw new GearError(`${item.name} is earned at ${item.threshold} points`, 'GearLocked');
    out[slot] = id;
  }
  return out;
}

/** What a stored set still allows: items now locked or unknown are dropped (points never fall today; the read is defensive). */
export function wearable(points: number, stored: unknown): Equipped {
  const out: Equipped = {};
  if (!stored || typeof stored !== 'object') return out;
  for (const slot of GEAR_SLOTS) {
    const id = (stored as Record<string, unknown>)[slot];
    const item = typeof id === 'string' ? itemById(id) : undefined;
    if (item && item.slot === slot && isUnlocked(item, points)) out[slot] = item.id;
  }
  return out;
}

/** The part of a set other people may see: never the ride. */
export function publicGear(set: Equipped): Partial<Record<'head' | 'face' | 'body' | 'neck', string>> {
  const out: Partial<Record<'head' | 'face' | 'body' | 'neck', string>> = {};
  for (const slot of PUBLIC_SLOTS) if (set[slot]) out[slot as 'head'] = set[slot];
  return out;
}
