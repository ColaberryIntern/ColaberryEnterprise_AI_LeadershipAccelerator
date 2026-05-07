/**
 * sseTransport — Express-compatible Server-Sent Events handler that fans
 * cognitive events out to a long-lived HTTP response.
 *
 * Why SSE (not WebSocket): no extra dependencies, works through proxies,
 * one-way push is sufficient for awareness streams (clients poll mutations
 * via existing endpoints).
 *
 * Phase 8 §2.
 */
import type { Request, Response } from 'express';
import { cognitiveEventBus, type CognitiveEvent, type CognitiveEventKind } from './cognitiveEventBus';

export interface SSEStreamOptions {
  /** Filter to a specific project (most callers want this). */
  readonly project_id?: string;
  /** Filter to specific event kinds. Empty = all. */
  readonly kinds?: ReadonlyArray<CognitiveEventKind>;
  /** Heartbeat interval; sends a comment line so proxies don't kill the connection. */
  readonly heartbeat_ms?: number;
}

/**
 * Open an SSE stream on a Response. Returns a function to close it.
 * Caller is responsible for not calling res.end() before invoking close().
 */
export function openSSEStream(req: Request, res: Response, opts: SSEStreamOptions): () => void {
  // SSE headers
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',          // disable nginx buffering when present
  });
  res.flushHeaders?.();

  // Initial handshake event so clients know they're connected.
  writeEvent(res, {
    id: `handshake_${Date.now()}`,
    kind: 'awareness.heartbeat',
    project_id: opts.project_id ?? 'global',
    emitted_at: new Date().toISOString(),
    payload: { connected: true, kinds: opts.kinds ?? null },
  });

  const kindFilter = opts.kinds && opts.kinds.length > 0 ? new Set(opts.kinds) : null;
  const projectFilter = opts.project_id ?? null;

  const listener = (event: CognitiveEvent) => {
    if (projectFilter && event.project_id !== projectFilter) return;
    if (kindFilter && !kindFilter.has(event.kind)) return;
    try {
      writeEvent(res, event);
    } catch (err: any) {
      // Client disconnected mid-write — close cleanly.
      console.warn('[sseTransport] write failed:', err?.message);
      cleanup();
    }
  };

  const unsubscribe = cognitiveEventBus.subscribe(listener);

  // Heartbeats keep the connection alive through proxies.
  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat ${Date.now()}\n\n`);
    } catch (err: any) {
      console.warn('[sseTransport] heartbeat failed:', err?.message);
      cleanup();
    }
  }, opts.heartbeat_ms ?? 25000);

  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    unsubscribe();
    try { res.end(); } catch { /* ignore */ }
  };

  // Browser navigates away → req.on('close') fires.
  req.on('close', cleanup);
  req.on('aborted', cleanup);

  return cleanup;
}

function writeEvent(res: Response, event: CognitiveEvent): void {
  // SSE wire format: id, event, data lines separated, terminated by blank line.
  res.write(`id: ${event.id}\n`);
  res.write(`event: ${event.kind}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}
