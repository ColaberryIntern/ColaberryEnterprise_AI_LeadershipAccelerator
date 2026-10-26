import type { Condition } from '../weather/weatherModel';

/**
 * Chow Hall (Campus v11, Basecamp C39): food links only. Colaberry takes no orders and no payments: every app is a plain outbound link
 * that opens the app's own site in a new tab, searching for the craving where the app supports search. No logos (names in text), no
 * tracking redirect, no stored location: the region comes from the browser's time zone.
 * The spec asks for every search URL to be checked by hand before shipping (apps change their formats); the table below is the
 * spec's, and any that no longer land on results fall back to the app's home page (listed in the PR).
 */
export type Region = 'US' | 'GB' | 'IN' | 'ANY';
export interface DeliveryApp { name: string; search: string | null; home: string; regions: Region[] }

export const DELIVERY_APPS: DeliveryApp[] = [
  { name: 'DoorDash', search: 'https://www.doordash.com/search/store/{q}/', home: 'https://www.doordash.com/', regions: ['US', 'ANY'] },
  { name: 'Uber Eats', search: 'https://www.ubereats.com/search?q={q}', home: 'https://www.ubereats.com/', regions: ['US', 'GB', 'ANY'] },
  { name: 'Grubhub', search: null, home: 'https://www.grubhub.com/', regions: ['US'] },
  { name: 'Instacart', search: null, home: 'https://www.instacart.com/', regions: ['US'] },
  { name: 'Deliveroo', search: null, home: 'https://deliveroo.co.uk/', regions: ['GB'] },
  { name: 'Just Eat', search: null, home: 'https://www.just-eat.co.uk/', regions: ['GB'] },
  { name: 'Swiggy', search: null, home: 'https://www.swiggy.com/', regions: ['IN'] },
  { name: 'Zomato', search: null, home: 'https://www.zomato.com/', regions: ['IN'] },
];

export const CRAVINGS: { id: string; label: string; emoji: string }[] = [
  { id: 'pizza', label: 'Pizza', emoji: '🍕' }, { id: 'burgers', label: 'Burgers', emoji: '🍔' }, { id: 'tacos', label: 'Tacos', emoji: '🌮' },
  { id: 'noodles', label: 'Noodles', emoji: '🍜' }, { id: 'sushi', label: 'Sushi', emoji: '🍣' }, { id: 'salad', label: 'Salad', emoji: '🥗' },
  { id: 'coffee', label: 'Coffee', emoji: '☕' }, { id: 'treats', label: 'Treats', emoji: '🍩' },
];

/** The region from the time zone: US zones, London, India; anything else ANY. */
export function foodRegion(tz: string): Region {
  if (tz === 'Europe/London') return 'GB';
  if (tz === 'Asia/Kolkata' || tz === 'Asia/Calcutta') return 'IN';
  if (/^America\/(New_York|Chicago|Denver|Phoenix|Los_Angeles|Anchorage|Detroit|Boise|Indiana\/|Kentucky\/|North_Dakota\/|Juneau|Adak|Nome|Sitka|Yakutat|Menominee|Metlakatla)/.test(tz) || tz === 'Pacific/Honolulu') return 'US';
  return 'ANY';
}

export const appsFor = (region: Region, all = false): DeliveryApp[] => (all ? DELIVERY_APPS : DELIVERY_APPS.filter((a) => a.regions.includes(region)));

/** The link: the app's search for the craving (encoded), else its home page. */
export const urlFor = (app: DeliveryApp, craving: string): string => (app.search ? app.search.replace('{q}', encodeURIComponent(craving.toLowerCase())) : app.home);

export type Meal = 'breakfast' | 'lunch' | 'snack' | 'dinner' | 'late';
/** The local meal time: before 10:30 breakfast/coffee, 10:30-14:30 lunch, 14:30-17:00 snack, 17:00-21:30 dinner, later late-night. */
export function mealAt(now: Date): Meal {
  const m = now.getHours() * 60 + now.getMinutes();
  if (m < 10 * 60 + 30) return 'breakfast';
  if (m < 14 * 60 + 30) return 'lunch';
  if (m < 17 * 60) return 'snack';
  if (m < 21 * 60 + 30) return 'dinner';
  return 'late';
}
export const DEFAULT_CRAVING: Record<Meal, string> = { breakfast: 'coffee', lunch: 'salad', snack: 'treats', dinner: 'pizza', late: 'noodles' };
const MEAL_LINE: Record<Meal, string> = {
  breakfast: 'Coffee and breakfast to start the day.', lunch: 'Lunchtime: something good between lessons.', snack: 'An afternoon snack to keep you going.',
  dinner: 'Dinner time: order in and keep building.', late: 'Late-night fuel for a long build.',
};

/** The lead line from the meal time and the window's weather (no second weather call): rain or snow adds "perfect day for delivery". */
export function foodLead(now: Date, condition: Condition | null): string {
  const base = MEAL_LINE[mealAt(now)];
  return condition === 'rain' || condition === 'snow' || condition === 'storm' ? `${base.replace(/\.$/, '')}, a perfect day for delivery.` : base;
}
