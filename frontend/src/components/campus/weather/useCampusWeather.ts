import { useCallback, useEffect, useState } from 'react';
import portalApi from '../../../utils/portalApi';
import { placeForZone, timeOfDay, usesCelsius, type TimeOfDay, type WeatherReading } from './weatherModel';

/**
 * The campus's local weather and time of day (Campus v9 W1, Basecamp C37). WHERE: your exact location only if you tapped "Use my
 * exact location" (rounded to 2 decimals and kept in this browser only), otherwise the city for your time zone; nothing precise is
 * ever sent. The server answers { condition: null } while CAMPUS_WEATHER_ENABLED is off or Open-Meteo fails, and the campus then runs
 * on the clock alone. The time of day refreshes every minute, the weather every 20 minutes. "Weather effects off" is a per-device
 * choice (no particles or tint; windows still follow the time of day).
 */
export const EXACT_KEY = 'colaberry.campus.weather.exact';
export const EFFECTS_KEY = 'colaberry.campus.weather.effects';
const WEATHER_MS = 20 * 60_000;
const NONE: WeatherReading = { city: null, temp_f: null, temp_c: null, condition: null, is_day: null, sunrise: null, sunset: null };

const read = (k: string): string | null => { try { return window.localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string | null): void => { try { if (v === null) window.localStorage.removeItem(k); else window.localStorage.setItem(k, v); } catch { /* private window */ } };

export function placeOf(): { city: string; lat: number; lon: number } {
  const exact = read(EXACT_KEY);
  if (exact) { const [lat, lon] = exact.split(',').map(Number); if (Number.isFinite(lat) && Number.isFinite(lon)) return { city: 'your area', lat, lon }; }
  let tz = 'America/Chicago';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz; } catch { /* default */ }
  return placeForZone(tz);
}

/** One request per place per 20 minutes, shared by every consumer (the home, the room window, the arrival card): the window and the
 *  Chow Hall lead line read the same reading, never a second call. A failed request is dropped so the next tick retries. */
let shared: { key: string; at: number; p: Promise<WeatherReading> } | null = null;
export function fetchWeatherShared(p: { city: string; lat: number; lon: number }, nowMs = Date.now()): Promise<WeatherReading> {
  const key = `${p.lat},${p.lon},${p.city}`;
  if (shared && shared.key === key && nowMs - shared.at < WEATHER_MS - 5_000) return shared.p;
  const req = portalApi.get<WeatherReading>('/api/portal/campus/weather', { params: { lat: p.lat, lon: p.lon, city: p.city === 'your area' ? undefined : p.city }, timeout: 8000 })
    .then((r) => ({ ...NONE, ...r.data, city: r.data.city ?? (p.city === 'your area' ? null : p.city) }));
  const entry = { key, at: nowMs, p: req };
  shared = entry;
  req.catch(() => { if (shared === entry) shared = null; });
  return req;
}

export interface CampusWeather { w: WeatherReading; tod: TimeOfDay; celsius: boolean; effects: boolean; setEffects: (on: boolean) => void; useExact: () => void; now: Date }

export function useCampusWeather(enabled = true): CampusWeather {
  const [w, setW] = useState<WeatherReading>(NONE);
  const [now, setNow] = useState(() => new Date());
  const [effects, setEff] = useState(() => read(EFFECTS_KEY) !== 'off');
  const [tick, setTick] = useState(0);
  const load = useCallback(() => {
    if (!enabled) return;
    const p = placeOf();
    fetchWeatherShared(p).then(setW).catch(() => setW(NONE)); // clock only
  }, [enabled]);
  useEffect(() => { load(); const id = window.setInterval(load, WEATHER_MS); return () => window.clearInterval(id); }, [load, tick]);
  useEffect(() => { const id = window.setInterval(() => setNow(new Date()), 60_000); return () => window.clearInterval(id); }, []);
  let locale = 'en-US';
  try { locale = Intl.NumberFormat().resolvedOptions().locale; } catch { /* default */ }
  const setEffects = (on: boolean) => { write(EFFECTS_KEY, on ? null : 'off'); setEff(on); };
  const useExact = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      write(EXACT_KEY, `${Math.round(pos.coords.latitude * 100) / 100},${Math.round(pos.coords.longitude * 100) / 100}`);
      setTick((t) => t + 1);
    }, () => undefined, { maximumAge: 600_000, timeout: 10_000 });
  };
  return { w, tod: timeOfDay(now, w.sunrise, w.sunset), celsius: usesCelsius(locale), effects, setEffects, useExact, now };
}
