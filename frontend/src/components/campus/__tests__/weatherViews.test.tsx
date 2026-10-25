/**
 * C37 (v9 W2-W4): the sky layer, the chip and the room window from a weather reading. Rain at 14:00: the overcast class and a moving
 * canvas, rain on the window; clear at 23:00: the night tint and a moon with stars; reduced motion or effects off: the canvas does not
 * move; no reading (flag off): the time of day only. The chip's popover offers exact location and the effects toggle.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { WeatherSky, WeatherChip, RoomWindow } from '../weather/WeatherViews';
import type { CampusWeather } from '../weather/useCampusWeather';
import { timeOfDay, type WeatherReading } from '../weather/weatherModel';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const reading = (o: Partial<WeatherReading>): WeatherReading => ({ city: 'Dallas', temp_f: 72, temp_c: 22, condition: 'clear', is_day: true, sunrise: '2026-10-25T07:28', sunset: '2026-10-25T18:41', ...o });
const wxAt = (h: number, o: Partial<WeatherReading> = {}, effects = true): CampusWeather => {
  const now = new Date(2026, 9, 25, h, 0);
  const w = reading(o);
  return { w, tod: timeOfDay(now, w.sunrise, w.sunset), celsius: false, effects, setEffects: jest.fn(), useExact: jest.fn(), now };
};

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const q = (s: string) => container.querySelector(s);
const render = (el: React.ReactElement) => act(() => { root.render(el); });

it('rain at 14:00: the overcast wash, a moving canvas; the window has rain', () => {
  render(<><WeatherSky wx={wxAt(14, { condition: 'rain' })} reduceMotion={false} /><RoomWindow wx={wxAt(14, { condition: 'rain' })} /></>);
  expect(q('[data-testid="cm-wx"]')!.className).toContain('wx-overcast');
  expect(q('[data-testid="cm-wx-canvas"]')!.getAttribute('data-moving')).toBe('true');
  expect(q('[data-testid="cm-win-rain"]')).not.toBeNull();
  expect(q('[data-testid="cm-room-window"]')!.getAttribute('title')).toBe('Outside: Raining in Dallas');
});

it('clear at 23:00: the night tint, a moon and stars in the window, the sign says 🌙', () => {
  render(<><WeatherSky wx={wxAt(23)} reduceMotion={false} /><RoomWindow wx={wxAt(23)} /></>);
  expect(q('[data-testid="cm-wx"]')!.className).toContain('wx-night');
  expect(q('[data-testid="cm-win-moon"]')).not.toBeNull();
  expect(q('[data-testid="cm-win-stars"]')).not.toBeNull();
  expect(q('.cm-win .sign')!.textContent).toBe('🌙 72° · Dallas');
});

it('reduced motion or effects off: no moving canvas (effects off also drops the tint); no reading: time of day only', () => {
  render(<WeatherSky wx={wxAt(14, { condition: 'storm' })} reduceMotion />);
  expect(q('[data-testid="cm-wx-canvas"]')!.hasAttribute('data-moving')).toBe(false);
  render(<WeatherSky wx={wxAt(14, { condition: 'rain' }, false)} reduceMotion={false} />);
  expect(q('[data-testid="cm-wx-canvas"]')!.hasAttribute('data-moving')).toBe(false);
  expect(q('[data-testid="cm-wx"]')!.className).not.toContain('wx-');
  render(<RoomWindow wx={wxAt(23, { condition: null, city: null, temp_f: null, temp_c: null })} />);
  expect(q('[data-testid="cm-win-moon"]')).not.toBeNull(); // the clock still makes it night
  expect(q('[data-testid="cm-room-window"]')!.getAttribute('title')).toBe('Outside: night');
});

it('the chip shows emoji and temperature; its popover offers exact location and the effects toggle', () => {
  const wx = wxAt(14);
  render(<WeatherChip wx={wx} />);
  expect(q('[data-testid="cm-wx-chip"]')!.textContent).toBe('☀️ 72°');
  act(() => { (q('[data-testid="cm-wx-chip"]') as HTMLButtonElement).click(); });
  expect(q('[data-testid="cm-wx-pop"]')!.textContent).toContain('Clear · 72°F · Dallas');
  expect(q('[data-testid="cm-wx-pop"]')!.textContent).toContain('The campus sky, the windows in every room and the light follow your local weather and time of day.');
  act(() => { (Array.from(container.querySelectorAll('[data-testid="cm-wx-pop"] button')).find((b) => b.textContent?.includes('exact location')) as HTMLButtonElement).click(); });
  expect(wx.useExact).toHaveBeenCalled();
  act(() => { (q('[data-testid="cm-wx-pop"] input[type="checkbox"]') as HTMLInputElement).click(); });
  expect(wx.setEffects).toHaveBeenCalledWith(false);
});
