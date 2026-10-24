/**
 * commercializationController — thin handler for the Commercialization Command Center
 * (/admin/commercialization). Read-only, no inputs to validate.
 */
import { Request, Response } from 'express';
import { getCommercializationBoard } from '../services/commercialization/commercializationBoardService';
import { getHypothesisHealth } from '../services/commercialization/hypothesisHealthService';

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

/**
 * C8.6 - which revenue hypotheses are gaining evidence and which are dying.
 *
 * Read-only, and every count comes from the C8.4 funnel rather than from manual entry,
 * which is an acceptance criterion on that ticket rather than a preference.
 */
export async function handleGetHypothesisHealth(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    res.json({ success: true, data: await getHypothesisHealth() });
  } catch (error) {
    const err = error as Error;
    console.error(JSON.stringify({
      level: 'error',
      service: 'commercialization-hypotheses',
      event: 'hypothesis_health_failed',
      error_class: err.name || 'UnknownError',
      outcome: 'failure',
      message: err.message,
    }));
    res.status(500).json({ success: false, error: 'Could not read hypothesis health.' });
  }
}
