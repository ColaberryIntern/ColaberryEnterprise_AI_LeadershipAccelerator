import { Request, Response, NextFunction, RequestHandler } from 'express';
import SystemProcess from '../../models/SystemProcess';

/**
 * Wraps an async function, measures execution time, and writes a SystemProcess record.
 */
export async function observeProcess<T>(
  name: string,
  sourceModule: string,
  eventType: string,
  fn: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();
  let status = 'completed';
  let errorMessage: string | undefined;

  try {
    const result = await fn();
    return result;
  } catch (error: any) {
    status = 'failed';
    errorMessage = error?.message || 'Unknown error';
    throw error;
  } finally {
    const duration = Date.now() - startTime;
    SystemProcess.create({
      process_name: name,
      source_module: sourceModule,
      event_type: eventType,
      execution_time_ms: duration,
      status,
      metadata: {},
      error_message: errorMessage,
    }).catch(() => {});
  }
}

/**
 * Express middleware that logs intelligence API requests to system_processes.
 */
export function intelligenceMiddleware(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    // Only observe intelligence routes
    if (!req.path.includes('/intelligence')) {
      return next();
    }

    const startTime = Date.now();
    const originalEnd = res.end;

    res.end = function (this: Response, ...args: any[]) {
      const duration = Date.now() - startTime;
      const status = res.statusCode < 400 ? 'completed' : 'failed';

      // Fire-and-forget logging
      SystemProcess.create({
        process_name: `api_${req.method.toLowerCase()}_intelligence`,
        source_module: 'intelligence_api',
        event_type: 'api_request',
        execution_time_ms: duration,
        status,
        metadata: {
          path: req.path,
          method: req.method,
          status_code: res.statusCode,
        },
      }).catch(() => {});

      return originalEnd.apply(this, args as any);
    } as any;

    next();
  };
}

/**
 * Fire-and-forget system event logger.
 */
export function logSystemEvent(
  name: string,
  sourceModule: string,
  metadata?: Record<string, any>
): void {
  SystemProcess.create({
    process_name: name,
    source_module: sourceModule,
    event_type: 'system_event',
    execution_time_ms: 0,
    status: 'completed',
    metadata: metadata || {},
  }).catch(() => {});
}
