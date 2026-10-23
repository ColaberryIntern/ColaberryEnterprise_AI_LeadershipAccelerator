/**
 * commercializationController — thin handler for the Commercialization Command Center
 * (/admin/commercialization). Read-only, no inputs to validate.
 */
import { Request, Response } from 'express';
import { getCommercializationBoard } from '../services/commercialization/commercializationBoardService';

export async function handleGetCommercializationBoard(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    const board = await getCommercializationBoard();
    res.json({ success: true, data: board });
  } catch (error) {
    const err = error as Error;
    // Classified rather than generic: a board that fails silently would render ten
    // empty tiles, which is exactly the "measured zero" this ticket forbids faking.
    console.error(JSON.stringify({
      level: 'error',
      service: 'commercialization-board',
      event: 'board_fetch_failed',
      error_class: err.name || 'UnknownError',
      outcome: 'failure',
      message: err.message,
    }));
    res.status(500).json({
      success: false,
      error: 'Could not build the commercialization board.',
    });
  }
}
