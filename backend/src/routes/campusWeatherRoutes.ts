import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireParticipant } from '../middlewares/participantAuth';
import { campusOnFor } from '../services/campus/campusPilot';
import { weatherFor } from '../services/campus/campusWeather';
import { sendValidated } from './campusRoutes';

/**
 * GET /api/portal/campus/weather?lat=&lon=&city= (Campus v9 W1, Basecamp C37). Participant-authed, behind the campus pilot. lat/lon
 * must already be rounded to 2 decimals (more precision is refused, so a precise location can never reach us); city is a short label
 * echoed back to the caller only. Dark by default (CAMPUS_WEATHER_ENABLED): off, it answers { condition: null } without calling out.
 */
const coord = (max: number) => z.coerce.number().min(-max).max(max).refine((n) => Math.round(n * 100) / 100 === n, 'at most 2 decimals');
export const WeatherQuery = z.object({ lat: coord(90), lon: coord(180), city: z.string().trim().min(1).max(60).regex(/^[\p{L} .,'-]+$/u).optional() }).strict();
const Cond = z.enum(['clear', 'partly', 'cloudy', 'fog', 'rain', 'snow', 'storm']);
export const WeatherResponse = z.object({
  city: z.string().nullable(), temp_f: z.number().nullable(), temp_c: z.number().nullable(), code: z.number().nullable(), condition: Cond.nullable(),
  is_day: z.boolean().nullable(), sunrise: z.string().nullable(), sunset: z.string().nullable(), fetched_at: z.string().nullable(),
}).strict();

export async function getWeatherRoute(req: Request, res: Response): Promise<void> {
  const q = WeatherQuery.safeParse(req.query ?? {});
  if (!q.success) { res.status(400).json({ error: 'Invalid location', error_class: 'ValidationFailed' }); return; }
  if (!campusOnFor(req)) { res.status(403).json({ error: 'The campus is not enabled for this account', error_class: 'CampusNotEnabled' }); return; }
  const w = await weatherFor({ lat: q.data.lat, lon: q.data.lon, city: q.data.city ?? null }, { enabled: process.env.CAMPUS_WEATHER_ENABLED === 'true' });
  sendValidated(res, WeatherResponse, w, 'campus_weather');
}

const router = Router();
router.get('/api/portal/campus/weather', requireParticipant, getWeatherRoute);
export default router;
