// Spark Hour API (Ali + Addie's weekly Sparks). Public routes, but every call needs the private link
// key, and everything past /unlock needs a session from the person's 4-digit code. Nothing a person
// answered is ever returned. See services/spark/sparkService.ts.
import { Router, Request, Response, NextFunction } from 'express';
import * as S from '../services/spark/sparkService';

const router = Router();
type Authed = Request & { sparkPerson?: S.Person };

const fail = (res: Response, e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.warn('[Spark] request failed:', msg);
  res.status(msg === 'not found' ? 404 : 400).json({ error: msg === 'bad image' ? 'That image could not be read. Try a smaller screenshot.' : 'Something went wrong. Try again.' });
};

async function needKey(req: Request, res: Response, next: NextFunction) {
  try {
    if (!(await S.keyOk(req.get('x-spark-key')))) return res.status(404).json({ error: 'Not found' });
    next();
  } catch (e) { fail(res, e); }
}
async function needSession(req: Authed, res: Response, next: NextFunction) {
  try {
    const p = await S.sessionPerson(req.get('x-spark-session'));
    if (!p) return res.status(401).json({ error: 'locked' });
    req.sparkPerson = p;
    next();
  } catch (e) { fail(res, e); }
}
const me = (req: Request) => (req as Authed).sparkPerson as S.Person;

router.post('/api/spark/unlock', needKey, async (req, res) => {
  try {
    const { who, pin } = req.body || {};
    if (!S.isPerson(who)) return res.status(400).json({ error: 'Pick your name.' });
    const r = await S.unlock(who, String(pin || ''));
    if (!r.ok) return res.status(401).json({ error: r.error });
    res.json({ session: r.session });
  } catch (e) { fail(res, e); }
});

router.get('/api/spark/today', needKey, needSession, async (req, res) => {
  try { res.json({ ...(await S.today(me(req))), reasons: S.SWITCH_REASONS }); } catch (e) { fail(res, e); }
});

router.post('/api/spark/survey', needKey, needSession, async (req, res) => {
  try { res.json({ saved: await S.saveSurvey(me(req), req.body?.answers) }); } catch (e) { fail(res, e); }
});

router.post('/api/spark/daily', needKey, needSession, async (req, res) => {
  try { res.json({ saved: await S.saveDaily(me(req), String(req.body?.day || ''), req.body?.answers) }); } catch (e) { fail(res, e); }
});

router.post('/api/spark/calendar/image', needKey, needSession, async (req, res) => {
  try { res.json(await S.readScreenshot(me(req), String(req.body?.image || ''))); } catch (e) { fail(res, e); }
});

router.post('/api/spark/calendar/done', needKey, needSession, async (req, res) => {
  try { res.json(await S.finishPlanning(me(req), String(req.body?.note || ''))); } catch (e) { fail(res, e); }
});

router.post('/api/spark/plan-now', needKey, needSession, async (req, res) => {
  try { await S.planNow(me(req)); res.json({ planning: true }); } catch (e) { fail(res, e); }
});

router.post('/api/spark/item/:id/time', needKey, needSession, async (req, res) => {
  try { res.json(await S.changeTime(me(req), String(req.params.id), req.body?.reason)); } catch (e) { fail(res, e); }
});

router.post('/api/spark/item/:id/notfit', needKey, needSession, async (req, res) => {
  try { res.json(await S.notFit(me(req), String(req.params.id), req.body?.reason)); } catch (e) { fail(res, e); }
});

export default router;
