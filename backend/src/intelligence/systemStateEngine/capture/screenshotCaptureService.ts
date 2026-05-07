/**
 * screenshotCaptureService — Puppeteer-driven page capture.
 *
 * Provider interface so tests can stub. Production wires Puppeteer
 * lazily via dynamic import — the dep is OPTIONAL. If `puppeteer` is not
 * installed, the service returns a structured error and never throws to
 * the caller.
 *
 * Phase 7 §3.
 */
import path from 'path';
import { promises as fs } from 'fs';
import type { ViewportSpec } from './viewportVariantGenerator';

export interface CaptureInput {
  readonly url: string;
  readonly viewport: ViewportSpec;
  readonly output_dir: string;
  readonly cookie_string?: string | null;
  readonly wait_selector?: string | null;
  readonly settle_ms?: number;
}

export interface CaptureResult {
  readonly ok: true;
  readonly screenshot_path: string;
  readonly viewport_label: ViewportSpec['label'];
  readonly captured_at: string;
  readonly bytes: number;
  readonly elapsed_ms: number;
}

export interface CaptureFailure {
  readonly ok: false;
  readonly reason: string;
  readonly recoverable: boolean;
}

export type CaptureOutcome = CaptureResult | CaptureFailure;

export interface CaptureProvider {
  readonly id: 'puppeteer' | 'stub';
  capture(input: CaptureInput): Promise<CaptureOutcome>;
}

let activeProvider: CaptureProvider | null = null;

export function setCaptureProvider(p: CaptureProvider | null): void {
  activeProvider = p;
}

/**
 * Lazily construct a Puppeteer-backed provider. Dynamic import means a
 * missing puppeteer dep doesn't crash the backend.
 */
async function getDefaultProvider(): Promise<CaptureProvider | null> {
  if (activeProvider) return activeProvider;
  try {
    // puppeteer is an OPTIONAL runtime dep. We use Function('return import')
    // to escape TypeScript's static module resolution — otherwise tsc fails
    // when the dep isn't installed locally. At runtime, if puppeteer isn't
    // installed, the import throws and we return null cleanly.
    // eslint-disable-next-line
    const puppeteerImport: any = await (Function('m', 'return import(m)') as any)('puppeteer');
    const puppeteer = puppeteerImport.default ?? puppeteerImport;
    const provider: CaptureProvider = {
      id: 'puppeteer',
      async capture(input: CaptureInput): Promise<CaptureOutcome> {
        const t0 = Date.now();
        let browser: any = null;
        try {
          browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
          const page = await browser.newPage();
          await page.setViewport({
            width: input.viewport.width,
            height: input.viewport.height,
            deviceScaleFactor: input.viewport.device_scale_factor,
            isMobile: input.viewport.is_mobile,
          });
          if (input.viewport.user_agent) await page.setUserAgent(input.viewport.user_agent);
          if (input.cookie_string) {
            // Set the cookie string verbatim against the URL host.
            const url = new URL(input.url);
            await page.setCookie({ name: 'session', value: input.cookie_string, url: url.origin });
          }
          await page.goto(input.url, { waitUntil: 'networkidle0', timeout: 30000 });
          if (input.wait_selector) {
            await page.waitForSelector(input.wait_selector, { timeout: 10000 }).catch(() => {});
          }
          if (input.settle_ms && input.settle_ms > 0) {
            await new Promise(r => setTimeout(r, Math.min(5000, input.settle_ms!)));
          }
          await fs.mkdir(input.output_dir, { recursive: true });
          const outPath = path.join(
            input.output_dir,
            `${slugifyUrl(input.url)}_${input.viewport.label}_${Date.now()}.png`,
          );
          const bytes = await page.screenshot({ path: outPath as any, fullPage: false }) as Buffer;
          await browser.close();
          return {
            ok: true,
            screenshot_path: outPath,
            viewport_label: input.viewport.label,
            captured_at: new Date().toISOString(),
            bytes: bytes?.length ?? 0,
            elapsed_ms: Date.now() - t0,
          };
        } catch (err: any) {
          if (browser) try { await browser.close(); } catch { /* ok */ }
          return {
            ok: false,
            reason: err?.message ?? 'Puppeteer capture failed',
            recoverable: true,
          };
        }
      },
    };
    activeProvider = provider;
    return provider;
  } catch (err: any) {
    console.warn('[screenshotCaptureService] puppeteer unavailable:', err?.message);
    return null;
  }
}

export async function capture(input: CaptureInput): Promise<CaptureOutcome> {
  const provider = await getDefaultProvider();
  if (!provider) {
    return {
      ok: false,
      reason: 'puppeteer dependency not installed; capture deferred',
      recoverable: false,
    };
  }
  return provider.capture(input);
}

function slugifyUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);
}
