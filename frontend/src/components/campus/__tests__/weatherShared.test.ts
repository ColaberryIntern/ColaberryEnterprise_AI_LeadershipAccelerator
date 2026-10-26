/**
 * C37/C39: one weather request per place per 20 minutes, shared by the home, the room window, the arrival card and the order sheet (the
 * Chow Hall lead line reads the same reading as the window, never a second call). A failed request is dropped so the next tick retries.
 */
import portalApi from '../../../utils/portalApi';
import { fetchWeatherShared } from '../weather/useCampusWeather';

jest.mock('../../../utils/portalApi', () => ({ __esModule: true, default: { get: jest.fn() } }));
const get = portalApi.get as unknown as jest.Mock;
const DALLAS = { city: 'Dallas', lat: 32.78, lon: -96.8 };
const READING = { city: 'Dallas', temp_f: 71, temp_c: 22, condition: 'clear', is_day: true, sunrise: null, sunset: null };

it('two consumers in the same window share one request; a new window or a new place asks again', async () => {
  get.mockResolvedValue({ data: READING });
  const [a, b] = await Promise.all([fetchWeatherShared(DALLAS, 1_000_000), fetchWeatherShared(DALLAS, 1_000_500)]);
  expect(a).toEqual(b);
  expect(a.condition).toBe('clear');
  expect(get).toHaveBeenCalledTimes(1);
  expect(get.mock.calls[0][1].params).toEqual({ lat: 32.78, lon: -96.8, city: 'Dallas' });
  await fetchWeatherShared(DALLAS, 1_000_000 + 20 * 60_000);
  expect(get).toHaveBeenCalledTimes(2);
  await fetchWeatherShared({ city: 'London', lat: 51.51, lon: -0.13 }, 1_000_000 + 20 * 60_000);
  expect(get).toHaveBeenCalledTimes(3);
});

it('a failed request is not reused: the next call retries', async () => {
  get.mockRejectedValueOnce(new Error('UpstreamUnavailable')).mockResolvedValue({ data: READING });
  const at = 5_000_000;
  await expect(fetchWeatherShared({ city: 'Austin', lat: 30.27, lon: -97.74 }, at)).rejects.toThrow('UpstreamUnavailable');
  await Promise.resolve();
  await expect(fetchWeatherShared({ city: 'Austin', lat: 30.27, lon: -97.74 }, at + 1)).resolves.toMatchObject({ condition: 'clear' });
  expect(get).toHaveBeenCalledTimes(2);
});

it('"your area" (an exact location) sends no city and keeps the city empty when the server has none', async () => {
  get.mockResolvedValue({ data: { ...READING, city: null } });
  const r = await fetchWeatherShared({ city: 'your area', lat: 41.88, lon: -87.63 }, 9_000_000);
  expect(get.mock.calls[0][1].params.city).toBeUndefined();
  expect(r.city).toBeNull();
});
