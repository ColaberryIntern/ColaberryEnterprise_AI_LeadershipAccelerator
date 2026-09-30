import { Request, Response } from 'express';
import { getPublicSalesKb } from '../services/publicKbService';

function log(
  level: 'info' | 'warn' | 'error',
  event: string,
  outcome: 'success' | 'failure' | 'partial',
  context: Record<string, unknown> = {}
): void {
  process.stdout.write(
    JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'public-kb', event, outcome, ...context }) + '\n'
  );
}

// GET /api/v1/knowledge/sales
// Public, unauthenticated, rate-limited. Never fails hard — the static sales
// KB page (frontend/public/knowledge/sales/kb-data.js) falls back on any
// non-2xx or empty response, so a degraded payload here is always safe.
export async function handleGetSalesKb(_req: Request, res: Response): Promise<void> {
  try {
    const payload = await getPublicSalesKb();
    res.json(payload);
  } catch (err) {
    log('error', 'public_kb_fetch_failure', 'failure', {
      error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
      message: err instanceof Error ? err.message : String(err),
    });
    res.json({ categories: [], qa: [] });
  }
}
