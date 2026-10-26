/**
 * The campus weather (Campus v9 W1, Basecamp C37): the local weather for a ROUNDED location (2 decimals, about 1 km), proxied from
 * Open-Meteo (no key). DARK BY DEFAULT: with CAMPUS_WEATHER_ENABLED off it answers { condition: null } and makes no outbound call;
 * Ali must confirm Open-Meteo's licence for commercial use before it is turned on (the spec's "Ask Ali" item).
 *
 * PRIVACY. Coordinates arrive already rounded by the client (and are rounded again here); they are never stored, never logged, and
 * the city label is only echoed back to the person who sent it. The cache is in memory, keyed on the rounded location.
 * FAILURE. A 5 s timeout; any failure answers { condition: null } so the client falls back to the clock only (time of day still
 * works, no weather effects). Cached for 20 minutes per rounded location (at most 500 entries, oldest evicted).
 */
export type Condition = 'clear' | 'partly' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm';
export interface Weather {
  city: string | null; temp_f: number | null; temp_c: number | null; code: number | null; condition: Condition | null;
  is_day: boolean | null; sunrise: string | null; sunset: string | null; fetched_at: string | null;
}
export const NO_WEATHER: Weather = { city: null, temp_f: null, temp_c: null, code: null, condition: null, is_day: null, sunrise: null, sunset: null, fetched_at: null };
export const CACHE_MS = 20 * 60_000;
export const CACHE_MAX = 500;
export const TIMEOUT_MS = 5_000;

/** WMO weather_code to the campus's seven conditions (the prototype's codeToCond). */
export function codeToCond(code: number): Condition {
  if (code === 0) return 'clear';
  if (code === 1 || code === 2) return 'partly';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95 && code <= 99) return 'storm';
  return 'cloudy';
}

export const round2 = (n: number): number => Math.round(n * 100) / 100;
export const fToC = (f: number): number => Math.round(((f - 32) * 5) / 9);

type Fetcher = (url: string, init: { signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
const cache = new Map<string, { at: number; w: Omit<Weather, 'city'> }>();
export function __resetWeatherCacheForTests(): void { cache.clear(); }

function log(event: string, outcome: 'success' | 'failure', extra: Record<string, unknown> = {}): void {
  // never the coordinates or the city
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: outcome === 'failure' ? 'warn' : 'info', service: 'backend', event, outcome, ...extra }));
}

interface OpenMeteo { current?: { temperature_2m?: number; weather_code?: number; is_day?: number }; daily?: { sunrise?: string[]; sunset?: string[] } }

export async function weatherFor(q: { lat: number; lon: number; city: string | null }, opts: { enabled: boolean; fetcher?: Fetcher; now?: number }): Promise<Weather> {
  if (!opts.enabled) return NO_WEATHER;
  const lat = round2(q.lat); const lon = round2(q.lon);
  const key = `${lat},${lon}`;
  const now = opts.now ?? Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_MS) return { ...hit.w, city: q.city };
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day&daily=sunrise,sunset&temperature_unit=fahrenheit&timezone=auto&forecast_days=1`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await (opts.fetcher ?? (globalThis.fetch as unknown as Fetcher))(url, { signal: ctl.signal });
    if (!res.ok) { log('campus_weather_upstream', 'failure', { status: res.status, duration_ms: Date.now() - started, error_class: 'UpstreamUnavailable' }); return NO_WEATHER; }
    const body = (await res.json()) as OpenMeteo;
    const t = body.current?.temperature_2m; const code = body.current?.weather_code;
    if (typeof t !== 'number' || typeof code !== 'number') { log('campus_weather_upstream', 'failure', { duration_ms: Date.now() - started, error_class: 'ContractViolation' }); return NO_WEATHER; }
    const w = { temp_f: Math.round(t), temp_c: fToC(t), code, condition: codeToCond(code), is_day: body.current?.is_day === 1,
      sunrise: body.daily?.sunrise?.[0] ?? null, sunset: body.daily?.sunset?.[0] ?? null, fetched_at: new Date(now).toISOString() };
    cache.delete(key); cache.set(key, { at: now, w });
    while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
    log('campus_weather_upstream', 'success', { duration_ms: Date.now() - started });
    return { ...w, city: q.city };
  } catch (err) {
    const e = err as { name?: string };
    log('campus_weather_upstream', 'failure', { duration_ms: Date.now() - started, error_class: e?.name === 'AbortError' ? 'TimeoutError' : 'UpstreamUnavailable' });
    return NO_WEATHER;
  } finally {
    clearTimeout(timer);
  }
}
