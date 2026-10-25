/**
 * The campus sky's rules (Campus v9 W1-W4, Basecamp C37), pure so each is tested: the time of day from your clock and the day's
 * sunrise and sunset, the moon's real phase, °F or °C by locale, the city for your time zone (no location is asked for), the
 * condition's emoji and the side panel's line. The weather itself comes from GET /api/portal/campus/weather (dark by default).
 */
export type Condition = 'clear' | 'partly' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm';
export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';
export interface WeatherReading { city: string | null; temp_f: number | null; temp_c: number | null; condition: Condition | null; is_day: boolean | null; sunrise: string | null; sunset: string | null }

const HALF = 45 * 60_000;
const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes();
/** "2026-10-25T07:28" (local to the place) to minutes after midnight; null when unreadable. */
export const clockMinutes = (iso: string | null): number | null => { const m = /T(\d{2}):(\d{2})/.exec(iso || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

/** dawn = sunrise ±45 min, dusk = sunset ±45 min, night before dawn or after dusk, day otherwise; without them 6:45 and 18:35. */
export function timeOfDay(now: Date, sunrise: string | null = null, sunset: string | null = null): TimeOfDay {
  const t = minutesOf(now);
  const rise = clockMinutes(sunrise) ?? 6 * 60 + 45;
  const set = clockMinutes(sunset) ?? 18 * 60 + 35;
  const h = HALF / 60_000;
  if (Math.abs(t - rise) <= h) return 'dawn';
  if (Math.abs(t - set) <= h) return 'dusk';
  if (t < rise - h || t > set + h) return 'night';
  return 'day';
}

/** The moon's age as a fraction of its cycle (0 new, 0.5 full), from a known new moon (2000-01-06 18:14 UTC). */
export function moonPhase(at: Date): number {
  const SYNODIC = 29.530588853;
  const days = (at.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 86_400_000;
  return (((days / SYNODIC) % 1) + 1) % 1;
}

/** °C where the locale's region uses Celsius (everywhere but the US and a few others). */
export function usesCelsius(locale: string): boolean {
  const region = (locale.split('-')[1] || '').toUpperCase();
  return !['US', 'LR', 'MM', 'BS', 'BZ', 'KY', 'PW', ''].includes(region);
}

/** The city for a time zone (the prototype's TZCITY), with its coordinates rounded to 2 decimals. */
export const TZ_CITY: Record<string, { city: string; lat: number; lon: number }> = {
  'America/Chicago': { city: 'Dallas', lat: 32.78, lon: -96.8 },
  'America/New_York': { city: 'New York', lat: 40.71, lon: -74.01 },
  'America/Denver': { city: 'Denver', lat: 39.74, lon: -104.99 },
  'America/Phoenix': { city: 'Phoenix', lat: 33.45, lon: -112.07 },
  'America/Los_Angeles': { city: 'Los Angeles', lat: 34.05, lon: -118.24 },
  'America/Toronto': { city: 'Toronto', lat: 43.65, lon: -79.38 },
  'Europe/London': { city: 'London', lat: 51.51, lon: -0.13 },
  'Asia/Kolkata': { city: 'Bengaluru', lat: 12.97, lon: 77.59 },
  'Asia/Calcutta': { city: 'Bengaluru', lat: 12.97, lon: 77.59 },
  'Asia/Kathmandu': { city: 'Kathmandu', lat: 27.72, lon: 85.32 },
  'Africa/Lagos': { city: 'Lagos', lat: 6.52, lon: 3.38 },
  'Africa/Addis_Ababa': { city: 'Addis Ababa', lat: 9.03, lon: 38.74 },
  'Africa/Nairobi': { city: 'Nairobi', lat: -1.29, lon: 36.82 },
};
export const placeForZone = (tz: string): { city: string; lat: number; lon: number } => TZ_CITY[tz] ?? TZ_CITY['America/Chicago'];

export const EMOJI: Record<Condition, string> = { clear: '☀️', partly: '⛅', cloudy: '☁️', fog: '🌫️', rain: '🌧️', snow: '❄️', storm: '⛈️' };
export const WORDS: Record<Condition, string> = { clear: 'clear', partly: 'partly cloudy', cloudy: 'cloudy', fog: 'foggy', rain: 'raining', snow: 'snowing', storm: 'stormy' };

/** The chip's emoji: the moon on a clear night. */
export const emojiFor = (c: Condition | null, tod: TimeOfDay): string => (!c ? '🕒' : tod === 'night' && (c === 'clear' || c === 'partly') ? '🌙' : EMOJI[c]);

/** The temperature to show, in the viewer's unit. */
export const tempFor = (w: Pick<WeatherReading, 'temp_f' | 'temp_c'>, celsius: boolean): number | null => (celsius ? w.temp_c : w.temp_f);

/** The side panel's line (prototype wxLead), only when nothing urgent is happening; null with no reading. */
export function weatherLead(w: WeatherReading, tod: TimeOfDay, celsius: boolean): string | null {
  if (!w.condition || !w.city) return null;
  if (w.condition === 'rain' || w.condition === 'storm') return `It’s raining in ${w.city}, a good day to stay in and build.`;
  if (w.condition === 'snow') return `Snow in ${w.city} today. Stay warm.`;
  if (tod === 'night') return `Working late? The moon’s out over ${w.city}.`;
  const t = tempFor(w, celsius);
  return t === null ? null : `It’s ${t}° and ${WORDS[w.condition]} in ${w.city}.`;
}

/** The map's classes: the time-of-day tint, and the grey wash on an overcast day. */
export function skyClasses(c: Condition | null, tod: TimeOfDay): string[] {
  const out = [`wx-${tod}`];
  if (c && tod === 'day' && ['cloudy', 'rain', 'storm', 'fog'].includes(c)) out.push('wx-overcast');
  return out;
}
