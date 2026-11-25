import { Request, Response } from 'express';
import { z } from 'zod';
import { RecapSummarySchema, NextEventUrlSchema } from '../services/weeklyLive/recap/recapContent';
import { draftSummary } from '../services/weeklyLive/recap/recapDraft';
import { lintObject } from '../services/weeklyLive/recap/recapLint';
import { RecapError, recapState, sendAll, sendTest, dryRun, classDate } from '../services/weeklyLive/recap/recapSendService';
import { verifyOptOutToken, verifyRecapToken } from '../services/weeklyLive/recap/recapToken';
import * as store from '../services/weeklyLive/recap/recapStore';
import { listMessages } from '../services/liveChat/liveChatStore';

/**
 * Weekly Live recap routes (WL1.2 to WL1.4). Admin routes sit behind requireAdmin (in the router);
 * the two public routes are rate limited and validate every input with Zod. Logs carry the session id
 * only, never a token or an email address.
 */
const SessionId = z.string().uuid();
const PutBody = z.object({ summary: RecapSummarySchema.optional(), nextEventUrl: z.union([NextEventUrlSchema, z.literal('')]).optional() }).strict();
const SendBody = z.object({ mode: z.enum(['dry', 'test', 'send']) }).strict();

function fail(res: Response, e: unknown) {
  if (e instanceof RecapError) return res.status(e.status).json({ error: e.message, code: e.code, violations: e.violations });
  console.error(JSON.stringify({ level: 'error', service: 'backend', event: 'weekly_live.recap', outcome: 'failure', error_class: e instanceof Error ? e.constructor.name : 'Unknown' }));
  return res.status(500).json({ error: 'Something went wrong' });
}

export async function handleGetRecap(req: Request, res: Response) {
  const sid = SessionId.safeParse(req.params.id);
  if (!sid.success) return res.status(404).json({ error: 'Not found' });
  try { return res.json(await recapState(sid.data)); } catch (e) { return fail(res, e); }
}

export async function handlePutRecap(req: Request, res: Response) {
  const sid = SessionId.safeParse(req.params.id);
  if (!sid.success) return res.status(404).json({ error: 'Not found' });
  const body = PutBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'Invalid recap', issues: body.error.issues.map((i) => i.path.join('.') + ': ' + i.message) });
  try {
    if (!(await store.getSession(sid.data))) return res.status(404).json({ error: 'Not found' });
    await store.upsertRecap(sid.data, { summary: body.data.summary, nextEventUrl: body.data.nextEventUrl === undefined ? undefined : (body.data.nextEventUrl || null) });
    return res.json({ ok: true, violations: body.data.summary ? lintObject(body.data.summary) : [] });
  } catch (e) { return fail(res, e); }
}

export async function handleDraftRecap(req: Request, res: Response) {
  const sid = SessionId.safeParse(req.params.id);
  if (!sid.success) return res.status(404).json({ error: 'Not found' });
  try {
    const session = await store.getSession(sid.data);
    if (!session) return res.status(404).json({ error: 'Not found' });
    const d = await draftSummary(session);
    if (d.source === 'ai') await store.upsertRecap(sid.data, { summary: d.summary });
    return res.json(d);
  } catch (e) { return fail(res, e); }
}

export async function handleSendRecap(req: Request, res: Response) {
  const sid = SessionId.safeParse(req.params.id);
  const body = SendBody.safeParse(req.body);
  if (!sid.success) return res.status(404).json({ error: 'Not found' });
  if (!body.success) return res.status(400).json({ error: 'mode must be dry, test or send' });
  try {
    if (body.data.mode === 'dry') return res.json(await dryRun(sid.data));
    if (body.data.mode === 'test') return res.json(await sendTest(sid.data));
    return res.json(await sendAll(sid.data));
  } catch (e) { return fail(res, e); }
}

/** Public: the recap page data. The class chat only with a valid personal token. */
export async function handlePublicRecap(req: Request, res: Response) {
  const sid = SessionId.safeParse(req.params.id);
  if (!sid.success) return res.status(404).json({ error: 'Not found' });
  try {
    const [session, recap] = await Promise.all([store.getSession(sid.data), store.getRecap(sid.data)]);
    const summary = RecapSummarySchema.safeParse(recap?.summary ?? null);
    if (!session || !summary.success) return res.status(404).json({ error: 'Not found' });
    const guestId = verifyRecapToken(req.query.t, sid.data);
    const chat = guestId
      ? (await listMessages(sid.data, 300)).map((m) => ({ id: m.id, kind: m.kind, name: m.display_name, content: m.content, at: m.created_at }))
      : null;
    return res.json({
      title: session.title, date: classDate(session.session_date), summary: summary.data,
      nextEventUrl: recap?.next_event_url ?? null, chat, personal: Boolean(guestId),
    });
  } catch (e) { return fail(res, e); }
}

const page = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | Colaberry Training</title></head>
<body style="margin:0;background:#EEF1F6;font-family:Segoe UI,Arial,sans-serif;color:#2D3748"><div style="max-width:560px;margin:60px auto;background:#fff;border-radius:12px;padding:28px 26px">
<div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#718096">Colaberry Training</div><h1 style="font-size:22px;color:#101A2E">${title}</h1><p>${body}</p></div></body></html>`;

/** Public: one-click opt-out from class recap emails. Idempotent. */
export async function handleRecapOptOut(req: Request, res: Response) {
  const em = verifyOptOutToken(req.query.t);
  if (!em) return res.status(400).type('html').send(page('This link is not valid', 'We could not read this link. Reply to any recap email and we will remove you by hand.'));
  try {
    await store.addOptOut(em);
    return res.type('html').send(page('You will not get class recaps anymore', 'You have been removed from class recap emails. You can still check in to any class.'));
  } catch (e) {
    console.error(JSON.stringify({ level: 'error', service: 'backend', event: 'weekly_live.recap_optout', outcome: 'failure', error_class: e instanceof Error ? e.constructor.name : 'Unknown' }));
    return res.status(503).type('html').send(page('Please try again', 'Something went wrong on our side. Please try the link again in a minute.'));
  }
}
