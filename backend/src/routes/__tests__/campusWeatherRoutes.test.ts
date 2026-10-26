// C37 (v9 W1): GET /api/portal/campus/weather: auth, the pilot gate, only rounded coordinates, the flag (off = no call), the contract.
jest.mock('../../middlewares/authFailureLog', () => ({ logAuthFailure: jest.fn(), describeCaller: () => ({ forwarded_for: null, user_agent: null }) }));
const mockCalls: Array<[unknown, unknown]> = [];
jest.mock('../../services/campus/campusWeather', () => ({
  weatherFor: async (q: unknown, opts: { enabled: boolean }) => {
    mockCalls.push([q, opts]);
    return opts.enabled ? { city: 'Dallas', temp_f: 72, temp_c: 22, code: 0, condition: 'clear', is_day: true, sunrise: null, sunset: null, fetched_at: '2026-10-25T12:00:00.000Z' }
      : { city: null, temp_f: null, temp_c: null, code: null, condition: null, is_day: null, sunrise: null, sunset: null, fetched_at: null };
  },
}));
jest.mock('../campusRoutes', () => ({
  sendValidated: (res: { json: (b: unknown) => void }, schema: { parse: (b: unknown) => unknown }, body: unknown) => { schema.parse(body); res.json(body); },
  logFailure: jest.fn(),
}));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const SECRET = ['campus', 'weather', 'secret'].join('-');
process.env.JWT_SECRET = SECRET;
const auth = () => ({ Authorization: `Bearer ${jwt.sign({ sub: 'enr-w', email: 'w@example.com', cohort_id: 'coh-1', role: 'participant' }, SECRET)}` });
function buildApp(campus = 'all', weather?: string): express.Express {
  process.env.CAMPUS_ENABLED = campus;
  if (weather === undefined) delete process.env.CAMPUS_WEATHER_ENABLED; else process.env.CAMPUS_WEATHER_ENABLED = weather;
  let router: express.Router = express.Router();
  jest.isolateModules(() => { router = require('../campusWeatherRoutes').default as express.Router; });
  const app = express(); app.use(router); return app;
}
const URL = '/api/portal/campus/weather?lat=32.78&lon=-96.8&city=Dallas';
beforeAll(() => { buildApp(); }, 120_000);
beforeEach(() => { mockCalls.length = 0; });

it('401 without a token; 403 off the pilot', async () => {
  expect((await request(buildApp()).get(URL)).status).toBe(401);
  expect((await request(buildApp('off')).get(URL).set(auth())).status).toBe(403);
  expect(mockCalls).toHaveLength(0);
});

it('the flag is off by default: { condition: null }, and the service is told so', async () => {
  const res = await request(buildApp('all')).get(URL).set(auth());
  expect(res.status).toBe(200);
  expect(res.body.condition).toBeNull();
  expect(mockCalls[0][1]).toEqual({ enabled: false });
});

it('on: the reading for the rounded place', async () => {
  const res = await request(buildApp('all', 'true')).get(URL).set(auth());
  expect(res.body).toMatchObject({ city: 'Dallas', temp_f: 72, condition: 'clear' });
  expect(mockCalls[0][0]).toEqual({ lat: 32.78, lon: -96.8, city: 'Dallas' });
});

it('400 for a precise location (more than 2 decimals), an out-of-range one, a missing one or an odd city', async () => {
  const app = buildApp('all', 'true');
  for (const q of ['lat=32.7767&lon=-96.8', 'lat=91&lon=0', 'lon=-96.8', 'lat=1&lon=1&city=%3Cscript%3E', 'lat=1&lon=1&extra=1']) {
    expect((await request(app).get(`/api/portal/campus/weather?${q}`).set(auth())).status).toBe(400);
  }
  expect(mockCalls).toHaveLength(0);
});
