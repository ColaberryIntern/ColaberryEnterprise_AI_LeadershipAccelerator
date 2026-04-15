/**
 * Preview Proxy Middleware — mounted at /preview/:slug
 *
 * Looks up the slug in preview_stacks, wakes the stack if stopped, then
 * proxies the request to the stack's frontend port. Touches
 * last_accessed_at so the idle reaper knows the stack is active.
 *
 * This middleware replaces the static nginx location blocks for
 * /preview/shipces/ and /preview/landjet/ with a single dynamic router
 * keyed off the preview_stacks table.
 */

import type { Request, Response, NextFunction } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { bootStack, getStackBySlug, touchStack } from '../services/previewStackService';

const PREVIEW_HOST = process.env.PREVIEW_PROXY_HOST || 'host.docker.internal';
const BOOT_WAIT_MS = parseInt(process.env.PREVIEW_BOOT_WAIT_MS || '60000', 10);

function extractSlug(url: string): string | null {
  const m = url.match(/^\/preview\/([^/?#]+)/);
  return m ? m[1] : null;
}

async function waitForRunning(slug: string, timeoutMs: number): Promise<any | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const stack: any = await getStackBySlug(slug);
    if (!stack) return null;
    if (stack.status === 'running') return stack;
    if (stack.status === 'failed' || stack.status === 'archived' || stack.status === 'tearing_down') return stack;
    await new Promise(r => setTimeout(r, 1500));
  }
  return getStackBySlug(slug);
}

export function previewProxyMiddleware() {
  return async function handle(req: Request, res: Response, next: NextFunction) {
    const slug = extractSlug(req.originalUrl || req.url);
    if (!slug) return next();

    const stack: any = await getStackBySlug(slug);
    if (!stack) {
      res.status(404).json({ error: 'Unknown preview stack', slug });
      return;
    }

    // Block access to archived or torn-down stacks
    if (stack.status === 'archived') {
      res.status(410).json({ error: 'Preview archived — restore via admin', slug });
      return;
    }
    if (stack.status === 'tearing_down') {
      res.status(409).json({ error: 'Preview being torn down', slug });
      return;
    }
    if (stack.status === 'failed') {
      res.status(502).json({ error: 'Preview failed to start', slug, reason: stack.failure_reason });
      return;
    }

    // Wake-on-access: if stopped, start booting and ask caller to retry
    if (stack.status === 'stopped') {
      // Fire-and-forget boot
      bootStack(stack.project_id).catch(err => {
        console.error(`[previewProxy] bootStack failed for ${slug}:`, err?.message);
      });
      res.status(503).set('Retry-After', '3').json({
        status: 'booting',
        slug,
        message: 'Booting preview stack — retry in a moment.',
      });
      return;
    }

    // If still provisioning, tell caller to wait
    if (stack.status === 'provisioning') {
      const ready: any = await waitForRunning(slug, BOOT_WAIT_MS);
      if (!ready || ready.status !== 'running') {
        res.status(503).set('Retry-After', '5').json({
          status: ready?.status || 'unknown',
          slug,
          message: 'Preview stack still starting — retry shortly.',
        });
        return;
      }
    }

    // Update last-accessed for idle reaping; non-blocking
    touchStack(slug).catch(() => {});

    const port = stack.frontend_port;
    if (!port) {
      res.status(500).json({ error: 'Stack has no frontend_port allocated', slug });
      return;
    }

    const target = `http://${PREVIEW_HOST}:${port}`;
    const proxy = createProxyMiddleware({
      target,
      changeOrigin: true,
      ws: true,
      pathRewrite: (reqPath: string) => reqPath.replace(new RegExp(`^/preview/${slug}`), '') || '/',
      // Rewrite absolute asset/API paths in HTML so they flow back through /preview/{slug}/
      selfHandleResponse: false,
      onError: (err: any, _req: Request, resp: Response) => {
        console.error(`[previewProxy] upstream error for ${slug}:`, err?.message);
        if (!resp.headersSent) resp.status(502).json({ error: 'Preview upstream error', slug });
      },
    } as any);

    return (proxy as any)(req, res, next);
  };
}
