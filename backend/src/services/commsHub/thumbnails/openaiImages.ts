import { env } from '../../../config/env';

/**
 * OpenAI image calls for hub thumbnails (CH4.3). Same request shape as the image call already in
 * production (services/spark/sparkService.ts, gpt-image-1-mini via raw fetch), plus the photo-input
 * form (/v1/images/edits, multipart) so a speaker's own picture can be re-staged.
 *
 * Output is PNG (the media library does not accept webp). The model and quality come from env with
 * the precedent's defaults, so a model change is a config change. Nothing about the key or the raw
 * error body ever leaves this module; callers get a typed error with a status and a plain reason.
 */
export const IMAGE_MODEL = (): string => process.env.COMMS_HUB_IMAGE_MODEL?.trim() || 'gpt-image-1-mini';
export const IMAGE_QUALITY = (): string => process.env.COMMS_HUB_IMAGE_QUALITY?.trim() || 'medium';
export const IMAGE_TIMEOUT_MS = 90_000;

export type ImageCanvas = '1536x1024' | '1024x1024';

export class ImageApiError extends Error {
  constructor(message: string, public readonly kind: 'not_configured' | 'timeout' | 'http' | 'empty') { super(message); this.name = 'ImageApiError'; }
}

export interface ImageResult { png: Buffer; model: string; latencyMs: number; usage: Record<string, unknown> | null }

type Fetch = typeof fetch;

/** One image from a prompt, optionally re-staging up to 6 input photos. */
export async function generateImage(prompt: string, canvas: ImageCanvas, photos: Buffer[], fetchImpl: Fetch = fetch): Promise<ImageResult> {
  if (!env.openaiApiKey) throw new ImageApiError('AI images are not configured on this server.', 'not_configured');
  const model = IMAGE_MODEL();
  const started = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), IMAGE_TIMEOUT_MS);
  try {
    const res = photos.length ? await callEdit(fetchImpl, ctl.signal, model, prompt, canvas, photos) : await callGenerate(fetchImpl, ctl.signal, model, prompt, canvas);
    if (!res.ok) throw new ImageApiError(`The image service answered ${res.status}.`, 'http');
    const body = (await res.json()) as { data?: Array<{ b64_json?: string }>; usage?: Record<string, unknown> };
    const b64 = body.data?.[0]?.b64_json;
    if (!b64) throw new ImageApiError('The image service returned no image.', 'empty');
    return { png: Buffer.from(b64, 'base64'), model, latencyMs: Date.now() - started, usage: body.usage ?? null };
  } catch (err) {
    if (err instanceof ImageApiError) throw err;
    if ((err as { name?: string })?.name === 'AbortError') throw new ImageApiError(`The image took longer than ${IMAGE_TIMEOUT_MS / 1000} seconds.`, 'timeout');
    throw new ImageApiError('The image service could not be reached.', 'http');
  } finally {
    clearTimeout(timer);
  }
}

function callGenerate(f: Fetch, signal: AbortSignal, model: string, prompt: string, size: ImageCanvas): Promise<Response> {
  return f('https://api.openai.com/v1/images/generations', {
    method: 'POST', signal,
    headers: { Authorization: `Bearer ${env.openaiApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, size, quality: IMAGE_QUALITY(), output_format: 'png', n: 1 }),
  });
}

function callEdit(f: Fetch, signal: AbortSignal, model: string, prompt: string, size: ImageCanvas, photos: Buffer[]): Promise<Response> {
  const form = new FormData();
  form.append('model', model);
  form.append('prompt', prompt);
  form.append('size', size);
  form.append('quality', IMAGE_QUALITY());
  form.append('output_format', 'png');
  // Copy into a plain Uint8Array: a Node Buffer may sit on a SharedArrayBuffer, which Blob does not accept.
  photos.slice(0, 6).forEach((p, i) => {
    const jpeg = p.length > 2 && p[0] === 0xff && p[1] === 0xd8; // label each picture by its bytes
    form.append('image[]', new Blob([new Uint8Array(p)], { type: jpeg ? 'image/jpeg' : 'image/png' }), `photo-${i + 1}.${jpeg ? 'jpg' : 'png'}`);
  });
  return f('https://api.openai.com/v1/images/edits', { method: 'POST', signal, headers: { Authorization: `Bearer ${env.openaiApiKey}` }, body: form });
}
