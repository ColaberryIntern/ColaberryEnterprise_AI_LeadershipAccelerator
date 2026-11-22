/**
 * Career Prep R2/R3 (execution contract, safety rules after audit cycle 2): the provider join URL is only ever returned by
 * the room routes, after consent. Every other endpoint that serves interview rows runs its response through this deep
 * scan. It walks every key and value (objects, arrays, nested) and fails on:
 *   - a key named room_url, roomUrl, joinUrl, join_url or providerEventId (whatever its value), or
 *   - any string containing the fixtures' sentinel provider URL.
 */
export const SENTINEL_PROVIDER_URL = 'https://zoom.example/j/SECRET';
const BANNED_KEYS = new Set(['room_url', 'roomUrl', 'joinUrl', 'join_url', 'providerEventId']);

/** Every offending path in `body` ("" when clean). */
export function findRoomUrl(body: unknown, path = '$'): string[] {
  if (typeof body === 'string') return body.includes(SENTINEL_PROVIDER_URL) ? [path] : [];
  if (Array.isArray(body)) return body.flatMap((v, i) => findRoomUrl(v, `${path}[${i}]`));
  if (body && typeof body === 'object') {
    return Object.entries(body as Record<string, unknown>).flatMap(([k, v]) => [
      ...(BANNED_KEYS.has(k) ? [`${path}.${k}`] : []),
      ...findRoomUrl(v, `${path}.${k}`),
    ]);
  }
  return [];
}

/** Throws (a jest failure) naming every path that leaks a room link. */
export function expectNoRoomUrl(body: unknown): void {
  const hits = findRoomUrl(body);
  if (hits.length) throw new Error(`room link leaked at ${hits.join(', ')}`);
}
