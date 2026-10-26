/** C37 (v9 W1-W4): the sky's rules: time of day and its boundaries, the moon's phase on known dates, °C/°F, the zone's city, the lead. */
import { timeOfDay, moonPhase, usesCelsius, placeForZone, emojiFor, weatherLead, skyClasses, clockMinutes } from '../weather/weatherModel';

const at = (h: number, m = 0) => new Date(2026, 9, 25, h, m);

it('time of day: dawn and dusk are sunrise/sunset ±45 min, night outside them, day between; defaults 6:45 and 18:35', () => {
  const rise = '2026-10-25T07:28'; const set = '2026-10-25T18:41';
  expect(clockMinutes(rise)).toBe(448);
  expect([timeOfDay(at(6, 42), rise, set), timeOfDay(at(6, 44), rise, set), timeOfDay(at(8, 13), rise, set), timeOfDay(at(8, 14), rise, set)]).toEqual(['night', 'dawn', 'dawn', 'day']); // dawn starts 6:43
  expect([timeOfDay(at(14), rise, set), timeOfDay(at(18, 0), rise, set), timeOfDay(at(19, 26), rise, set), timeOfDay(at(19, 27), rise, set), timeOfDay(at(23), rise, set)])
    .toEqual(['day', 'dusk', 'dusk', 'night', 'night']);
  expect([timeOfDay(at(6, 45)), timeOfDay(at(12)), timeOfDay(at(18, 35)), timeOfDay(at(22))]).toEqual(['dawn', 'day', 'dusk', 'night']);
});

it('the moon: new on 2024-01-11, full on 2024-01-25 (within a day)', () => {
  const p1 = moonPhase(new Date(Date.UTC(2024, 0, 11, 11, 57)));
  expect(Math.min(p1, 1 - p1)).toBeLessThan(1 / 29.5);
  expect(Math.abs(moonPhase(new Date(Date.UTC(2024, 0, 25, 17, 54))) - 0.5)).toBeLessThan(1 / 29.5);
});

it('°F in the US, °C elsewhere; the zone gives a city (Dallas for Central, the default)', () => {
  expect([usesCelsius('en-US'), usesCelsius('en-GB'), usesCelsius('en-IN'), usesCelsius('de-DE')]).toEqual([false, true, true, true]);
  expect(placeForZone('Europe/London')).toEqual({ city: 'London', lat: 51.51, lon: -0.13 });
  expect(placeForZone('Mars/Olympus').city).toBe('Dallas');
});

it('the chip, the lead and the map classes', () => {
  expect([emojiFor('clear', 'day'), emojiFor('clear', 'night'), emojiFor('rain', 'night'), emojiFor(null, 'day')]).toEqual(['☀️', '🌙', '🌧️', '🕒']);
  const w = { city: 'Dallas', temp_f: 72, temp_c: 22, condition: 'clear' as const, is_day: true, sunrise: null, sunset: null };
  expect(weatherLead(w, 'day', false)).toBe('It’s 72° and clear in Dallas.');
  expect(weatherLead(w, 'day', true)).toBe('It’s 22° and clear in Dallas.');
  expect(weatherLead({ ...w, condition: 'rain' }, 'day', false)).toBe('It’s raining in Dallas, a good day to stay in and build.');
  expect(weatherLead({ ...w, condition: 'snow' }, 'dusk', false)).toBe('Snow in Dallas today. Stay warm.');
  expect(weatherLead(w, 'night', false)).toBe('Working late? The moon’s out over Dallas.');
  expect(weatherLead({ ...w, condition: null }, 'day', false)).toBeNull();
  expect(skyClasses('rain', 'day')).toEqual(['wx-day', 'wx-overcast']);
  expect(skyClasses('clear', 'night')).toEqual(['wx-night']);
  expect(skyClasses(null, 'dusk')).toEqual(['wx-dusk']);
});
