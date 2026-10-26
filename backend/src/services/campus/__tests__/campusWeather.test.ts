// C37 (v9 W1): the weather proxy: the WMO mapping, dark by default (no outbound call), the 20-minute cache per rounded location,
// a 5 s timeout and upstream failures answer { condition: null }, and no coordinates or city ever reach a log line.
import { codeToCond, weatherFor, NO_WEATHER, round2, fToC, __resetWeatherCacheForTests, CACHE_MS } from '../campusWeather';

const OK = { current: { temperature_2m: 71.6, weather_code: 61, is_day: 1 }, daily: { sunrise: ['2026-10-25T07:28'], sunset: ['2026-10-25T18:41'] } };
const fetcher = (body: unknown = OK, ok = true) => jest.fn(async () => ({ ok, status: ok ? 200 : 503, json: async () => body }));
let logs: string[] = [];
beforeEach(() => { __resetWeatherCacheForTests(); logs = []; jest.spyOn(console, 'log').mockImplementation((s: unknown) => { logs.push(String(s)); }); });
afterEach(() => jest.restoreAllMocks());

it('maps every WMO code band to a condition', () => {
  expect([0, 1, 2, 3, 45, 48, 51, 67, 80, 82, 71, 77, 85, 86, 95, 99].map(codeToCond))
    .toEqual(['clear', 'partly', 'partly', 'cloudy', 'fog', 'fog', 'rain', 'rain', 'rain', 'rain', 'snow', 'snow', 'snow', 'snow', 'storm', 'storm']);
  expect([round2(32.776), fToC(72)]).toEqual([32.78, 22]);
});

it('dark by default: off answers { condition: null } and calls nothing', async () => {
  const f = fetcher();
  expect(await weatherFor({ lat: 32.78, lon: -96.8, city: 'Dallas' }, { enabled: false, fetcher: f })).toEqual(NO_WEATHER);
  expect(f).not.toHaveBeenCalled();
});

it('on: the reading, cached for 20 minutes per rounded location (the city is only echoed)', async () => {
  const f = fetcher();
  const w = await weatherFor({ lat: 32.776, lon: -96.797, city: 'Dallas' }, { enabled: true, fetcher: f, now: 1000 });
  expect(w).toMatchObject({ city: 'Dallas', temp_f: 72, temp_c: 22, code: 61, condition: 'rain', is_day: true, sunrise: '2026-10-25T07:28' });
  expect((f.mock.calls[0] as unknown as [string])[0]).toContain('latitude=32.78&longitude=-96.8');
  await weatherFor({ lat: 32.78, lon: -96.8, city: 'Dallas' }, { enabled: true, fetcher: f, now: 1000 + CACHE_MS - 1 });
  expect(f).toHaveBeenCalledTimes(1);
  await weatherFor({ lat: 32.78, lon: -96.8, city: 'Dallas' }, { enabled: true, fetcher: f, now: 1000 + CACHE_MS + 1 });
  expect(f).toHaveBeenCalledTimes(2);
});

it('an upstream error, a wrong shape or a timeout answers { condition: null }; nothing logged names the place', async () => {
  expect((await weatherFor({ lat: 1, lon: 1, city: 'X' }, { enabled: true, fetcher: fetcher(OK, false) })).condition).toBeNull();
  expect((await weatherFor({ lat: 2, lon: 2, city: 'X' }, { enabled: true, fetcher: fetcher({ current: {} }) })).condition).toBeNull();
  const hang = jest.fn((_u: string, init: { signal: AbortSignal }) => new Promise<never>((_r, reject) => { init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))); }));
  jest.useFakeTimers();
  const p = weatherFor({ lat: 3, lon: 3, city: 'X' }, { enabled: true, fetcher: hang as never });
  jest.advanceTimersByTime(5_001);
  expect((await p).condition).toBeNull();
  jest.useRealTimers();
  expect(logs.some((l) => l.includes('TimeoutError'))).toBe(true);
  expect(logs.join('\n')).not.toMatch(/latitude|32\.78|"X"|Dallas/);
});
