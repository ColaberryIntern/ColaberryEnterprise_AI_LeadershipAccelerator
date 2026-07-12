import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { runWithRequestContext } from '../utils/requestContext';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      traceId?: string;
    }
  }
}

/**
 * Trace middleware (TBI audit P1-4). Assigns each request a trace id (honoring an inbound
 * `x-trace-id` header if present, else minting one), echoes it on the response, and runs the
 * rest of the request inside an AsyncLocalStorage context so downstream AI events carry it.
 */
export function traceMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers['x-trace-id'];
  const traceId = (Array.isArray(header) ? header[0] : header) || randomUUID();
  req.traceId = traceId;
  res.setHeader('x-trace-id', traceId);
  runWithRequestContext({ traceId }, () => next());
}
