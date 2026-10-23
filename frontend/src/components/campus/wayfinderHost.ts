/**
 * Is a Wayfinder on screen (WP-4)? The campus home mounts one; a page banner keeps its inline "Where to?" box. "Go somewhere
 * else" asks openWayfinder() first and, with no Wayfinder mounted, falls back to focusing the inline box. A counter, not a
 * boolean, so a remount during a route change cannot unregister the live one (the dmHost pattern).
 */
const OPEN_EVENT = 'cm-wayfinder-open';
let hosts = 0;

export function registerWayfinder(open: () => void): () => void {
  hosts += 1;
  const h = () => open();
  window.addEventListener(OPEN_EVENT, h);
  let done = false;
  return () => { if (!done) { done = true; hosts = Math.max(0, hosts - 1); window.removeEventListener(OPEN_EVENT, h); } };
}

/** Opens the Wayfinder; false when none is mounted (the caller falls back). */
export function openWayfinder(): boolean {
  if (hosts === 0) return false;
  window.dispatchEvent(new Event(OPEN_EVENT));
  return true;
}
