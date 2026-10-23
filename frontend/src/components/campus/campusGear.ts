/**
 * How earned gear is DRAWN on the campus (Colaberry Campus C9). What exists, what each item costs in points and what is unlocked
 * all come from the server (backend services/campus/campusUnlocks.ts, via GET /api/portal/campus/look); this file only knows how
 * to draw an id. campusGear.test asserts every server item id has a drawing here.
 */
export type GearSlot = 'head' | 'face' | 'body' | 'neck' | 'ride';
export type PublicSlot = Exclude<GearSlot, 'ride'>;
export type Equipped = Partial<Record<GearSlot, string>>;
export type PublicGear = Partial<Record<PublicSlot, string>>;

export const SLOT_ORDER: GearSlot[] = ['head', 'face', 'body', 'neck', 'ride'];
export const SLOT_LABEL: Record<GearSlot, string> = { head: 'Head', face: 'Face', body: 'Body', neck: 'Neck', ride: 'Ride' };

/** The drawable item ids. A ride draws only under the learner's OWN avatar while it travels. */
export const GEAR_DRAWINGS: Record<string, GearSlot> = {
  cap: 'head', shades: 'face', hoodie: 'body', chain: 'neck', board: 'ride', cruiser: 'ride',
};

/** Display names (presence sends ids only). campusGear.test asserts each matches the server catalog's name. */
export const GEAR_NAMES: Record<string, string> = {
  cap: 'Cohort cap', shades: 'Shades', hoodie: 'Colaberry hoodie', chain: 'Gold chain', board: 'Skateboard', cruiser: 'Cherry Cruiser',
};

/** WP-4/5: each item's icon (the prototype's UNLOCKS icons): the unlock cheer and the person card's gear row. */
export const GEAR_ICON: Record<string, string> = { cap: '🧢', shades: '🕶️', board: '🛹', hoodie: '🧥', cruiser: '🚗', chain: '📿' };

/** WP-3: how a ride travels (the prototype's UNLOCKS speed and verb): faster, and the toast says so. The prototype's "car" is the
 *  Cherry Cruiser here; there is no jetpack (decision Q4). */
export const RIDE_TRAVEL: Record<string, { speed: number; verb: string }> = {
  board: { speed: 1.35, verb: 'Skating' },
  cruiser: { speed: 1.9, verb: 'Driving' },
};
/** Walking speed in world units per second (the prototype: 330 walking, 560 running), times the ride's. */
export function travelSpeed(ride: string | undefined, run = false): number {
  return (run ? 560 : 330) * (ride && RIDE_TRAVEL[ride] ? RIDE_TRAVEL[ride].speed : 1);
}
export function travelVerb(ride: string | undefined, run = false): string {
  return ride && RIDE_TRAVEL[ride] ? RIDE_TRAVEL[ride].verb : run ? 'Running' : 'Walking';
}

/** Only the public slots, whatever arrives (a ride is never drawn on someone else's token, even if a server sent one). */
export function publicOnly(gear: Record<string, string | undefined> | undefined): PublicGear {
  const out: PublicGear = {};
  if (!gear) return out;
  for (const slot of ['head', 'face', 'body', 'neck'] as PublicSlot[]) {
    const id = gear[slot];
    if (id && GEAR_DRAWINGS[id] === slot) out[slot] = id;
  }
  return out;
}
