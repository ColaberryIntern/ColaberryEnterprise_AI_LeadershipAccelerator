import type { Request, Response } from 'express';
import { z } from 'zod';
import { approveBrief, BriefError, briefView, startBrief, type BriefView } from '../services/weeklyLive/brief/briefService';

/**
 * Jackie's event brief API (WL4.4). Full administrators only (in the router). POST writes the brief in
 * the background (202); GET shows it with its HTML; POST /approve sends one Basecamp to-do to Jackie and
 * answers with its link. Bodies and ids are validated; answers are checked against BriefView.
 */
const Id = z.string().uuid();
const StartBody = z.object({ rewrite: z.boolean().optional() }).strict();
const Empty = z.object({}).strict();
const ViewSchema = z.object({
  status: z.enum(['none', 'writing', 'ready', 'failed']), error: z.string().nullable(), problems: z.array(z.string()), html: z.string().nullable(),
  approved: z.boolean(), sending: z.boolean(), sendError: z.string().nullable(), todoUrl: z.string().nullable(),
}).strict();
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const inStep: Same<z.infer<typeof ViewSchema>, BriefView> = true;
void inStep;

function checked(value: BriefView): BriefView {
  const p = ViewSchema.safeParse(value);
  if (!p.success) {
    const where = p.error.issues[0].path.join('.');
    if (process.env.NODE_ENV !== 'production') throw Object.assign(new Error(`Brief response does not match its type at ${where}`), { name: 'ContractViolation' });
    console.error(JSON.stringify({ level: 'error', service: 'backend', event: 'weekly_live.brief_response', outcome: 'failure', error_class: 'ContractViolation', context: { path: where } }));
  }
  return value;
}
function fail(res: Response, e: unknown) {
  if (e instanceof BriefError) return res.status(e.status).json({ error: e.message, code: e.code });
  console.error(JSON.stringify({ level: 'error', service: 'backend', event: 'weekly_live.brief', outcome: 'failure', error_class: e instanceof Error ? e.name : 'Unknown' }));
  return res.status(500).json({ error: 'Something went wrong' });
}
const invalid = (res: Response, e: z.ZodError) => res.status(400).json({ error: 'Invalid request', issues: e.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });

export async function handleGetBrief(req: Request, res: Response) {
  const id = Id.safeParse(req.params.id);
  if (!id.success) return res.status(404).json({ error: 'Not found' });
  try { return res.json(checked(await briefView(id.data))); } catch (e) { return fail(res, e); }
}

export async function handleStartBrief(req: Request, res: Response) {
  const id = Id.safeParse(req.params.id);
  if (!id.success) return res.status(404).json({ error: 'Not found' });
  const body = StartBody.safeParse(req.body ?? {});
  if (!body.success) return invalid(res, body.error);
  try { const v = checked(await startBrief(id.data, body.data.rewrite === true)); return res.status(v.status === 'writing' ? 202 : 200).json(v); } catch (e) { return fail(res, e); }
}

export async function handleApproveBrief(req: Request, res: Response) {
  const id = Id.safeParse(req.params.id);
  if (!id.success) return res.status(404).json({ error: 'Not found' });
  const body = Empty.safeParse(req.body ?? {});
  if (!body.success) return invalid(res, body.error);
  try { return res.json(checked(await approveBrief(id.data, req.admin?.email ?? 'an administrator'))); } catch (e) { return fail(res, e); }
}
