/**
 * How earned gear is DRAWN on the campus (Colaberry Campus C9). What exists, what each item costs in points and what is unlocked
 * all come from the server (backend services/campus/campusUnlocks.ts, via GET /api/portal/campus/look); this file only knows how
 * to draw an id. campusGear.test asserts every server item id has a drawing here.
 */
// C46: no rides (the campus is walked); every slot is public.
export type GearSlot = 'head' | 'face' | 'body' | 'neck';
export type PublicSlot = GearSlot;
export type Equipped = Partial<Record<GearSlot, string>>;
export type PublicGear = Partial<Record<PublicSlot, string>>;

export const SLOT_ORDER: GearSlot[] = ['head', 'face', 'body', 'neck'];
export const SLOT_LABEL: Record<GearSlot, string> = { head: 'Head', face: 'Face', body: 'Body', neck: 'Neck' };

/** The drawable item ids. */
export const GEAR_DRAWINGS: Record<string, GearSlot> = {
  cap: 'head', shades: 'face', jacket: 'body', hoodie: 'body', architect: 'body', chain: 'neck',
};

/** Display names (presence sends ids only). campusGear.test asserts each matches the server catalog's name. */
export const GEAR_NAMES: Record<string, string> = {
  cap: 'Cohort cap', shades: 'Shades', jacket: 'Campus jacket', hoodie: 'Colaberry hoodie', architect: 'Gold Architect jacket', chain: 'Gold chain',
};

/** WP-4/5: each item's icon (the prototype's UNLOCKS icons): the unlock cheer and the person card's gear row. */
export const GEAR_ICON: Record<string, string> = { cap: '🧢', shades: '🕶️', jacket: '🥼', hoodie: '🧥', architect: '🏅', chain: '📿' };

/** Walking speed in world units per second (the prototype: 330 walking, 560 running). C46: everyone walks; running is a faster walk. */
export function travelSpeed(run = false): number {
  return run ? 560 : 330;
}
export function travelVerb(run = false): string {
  return run ? 'Running' : 'Walking';
}

/** Only the known slots and drawable ids, whatever arrives (an old saved ride is dropped). */
export function publicOnly(gear: Record<string, string | undefined> | undefined): PublicGear {
  const out: PublicGear = {};
  if (!gear) return out;
  for (const slot of ['head', 'face', 'body', 'neck'] as PublicSlot[]) {
    const id = gear[slot];
    if (id && GEAR_DRAWINGS[id] === slot) out[slot] = id;
  }
  return out;
}
