/**
 * sessionRaffleController.ts — the presenter deck's giveaway draw and the
 * admin/packet winners list. Both are deck-authed (session kit token) or
 * admin, mounted with kitTokenOrAdmin in participantRoutes.ts. Inputs are
 * validated with zod; malformed input is a 400.
 */
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { drawRaffleWinner, listRaffleWinners, RaffleError } from '../services/sessionRaffleService';

const DrawBody = z.object({
  poll_key: z.string().min(1).max(200),
  draw_number: z.number().int().min(1).max(50),
  max_winners: z.number().int().min(1).max(50),
});

/** POST /api/portal/sessions/:id/raffle-draw {poll_key, draw_number, max_winners} */
export async function handleRaffleDraw(req: Request, res: Response, next: NextFunction) {
  try {
    const body = DrawBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'poll_key, draw_number and max_winners are required' });
    const w = await drawRaffleWinner(req.params.id as string, body.data.poll_key, body.data.draw_number, body.data.max_winners);
    // The projected deck only ever shows the redacted name.
    res.json({ poll_key: w.poll_key, draw_number: w.draw_number, display_name: w.display_name });
  } catch (err) {
    if (err instanceof RaffleError) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

/** GET /api/portal/sessions/:id/raffle-winners — every draw's winners, in order.
 *  `full=1` (admin only) adds full name + email for the post-event packet. */
export async function handleRaffleWinners(req: Request, res: Response, next: NextFunction) {
  try {
    const winners = await listRaffleWinners(req.params.id as string);
    const full = req.query.full === '1' && !!req.admin;
    res.json({
      winners: winners.map((w) => (full ? w : { poll_key: w.poll_key, draw_number: w.draw_number, display_name: w.display_name })),
    });
  } catch (err) { next(err); }
}
