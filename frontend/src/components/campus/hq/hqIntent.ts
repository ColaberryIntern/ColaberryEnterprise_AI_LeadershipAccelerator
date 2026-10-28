/**
 * Campus HQ: a ride requested from outside the building (a Where-to pick of an HQ floor or room). The search records the
 * floor and opens the HQ on the map; the HQ takes the request once, as it opens, and rides there. One pending request,
 * replaced by the next and cleared when taken, so a stale pick can never move the elevator later.
 */
let pending: string | null = null;

export function setHqIntent(floor: string): void { pending = floor; }

export function takeHqIntent(): string | null {
  const f = pending;
  pending = null;
  return f;
}
