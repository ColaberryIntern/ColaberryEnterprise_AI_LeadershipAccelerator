import type { Request, Response } from 'express';
import { z } from 'zod';
import { DeckError, deckStatus, startDeck, type DeckStatus } from '../services/weeklyLive/deck/deckService';

/**
 * Deck API (WL4.2). Full administrators only (in the router). POST starts writing the session plan in
 * the background (202) or rebuilds the deck from the stored plan at no cost (200); GET reports where it
 * is. Bodies and ids are validated; answers are checked against DeckStatus.
 */
const Id = z.string().uuid();
const StartBody = z.object({ rewrite: z.boolean().optional() }).strict();
const DeckStatusSchema = z.object({
  status: z.enum(['none', 'writing', 'ready', 'failed']), error: z.string().nullable(), problems: z.array(z.string()),
  saved: z.boolean(), slides: z.number().int().min(0), sessionId: Id,
}).strict();
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const inStep: Same<z.infer<typeof DeckStatusSchema>, DeckStatus> = true;
void inStep;

function checked(value: DeckStatus): DeckStatus {
  const p = DeckStatusSchema.safeParse(value);
  if (!p.success) {
    const where = p.error.issues[0].path.join('.');
    if (process.env.NODE_ENV !== 'production') throw Object.assign(new Error(`Deck response does not match its type at ${where}`), { name: 'ContractViolation' });
    console.error(JSON.stringify({ level: 'error', service: 'backend', event: 'weekly_live.deck_response', outcome: 'failure', error_class: 'ContractViolation', context: { path: where } }));
  }
  return value;
}

function fail(res: Response, e: unknown) {
  if (e instanceof DeckError) return res.status(e.status).json({ error: e.message, code: e.code });
  console.error(JSON.stringify({ level: 'error', service: 'backend', event: 'weekly_live.deck', outcome: 'failure', error_class: e instanceof Error ? e.name : 'Unknown' }));
  return res.status(500).json({ error: 'Something went wrong' });
}

export async function handleStartDeck(req: Request, res: Response) {
  const id = Id.safeParse(req.params.id);
  if (!id.success) return res.status(404).json({ error: 'Not found' });
  const body = StartBody.safeParse(req.body ?? {});
  if (!body.success) return res.status(400).json({ error: 'Invalid request', issues: body.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
  try {
    const s = checked(await startDeck(id.data, body.data.rewrite === true));
    return res.status(s.status === 'writing' ? 202 : 200).json(s);
  } catch (e) { return fail(res, e); }
}

export async function handleDeckStatus(req: Request, res: Response) {
  const id = Id.safeParse(req.params.id);
  if (!id.success) return res.status(404).json({ error: 'Not found' });
  try { return res.json(checked(await deckStatus(id.data))); } catch (e) { return fail(res, e); }
}
