import { bcGetAll, bcPost, bcUploadAttachment } from '../../ops/basecampClient';
import { APPROVED_PHOTOS } from './briefRender';

/**
 * Send the approved brief to Jackie (WL4.4): one Basecamp to-do in the Open Houses & Events list of the
 * AI Systems Architect Accelerator project, assigned to Jackie, with the PDF, the HTML and Ali's four
 * photos attached. Targets are config with the spec's values as defaults.
 *
 * Idempotency (CLAUDE.md, Basecamp todo create): before posting, the list is read for an open to-do
 * with the same title assigned to Jackie; when one exists it is adopted, never duplicated. The caller
 * also holds a send claim and records the id, so a second approve never reaches this code.
 * Failure modes: PDF render timeout (60 s), photo fetch timeout (15 s each), Basecamp errors (the shared
 * client retries 429/5xx with backoff and times out). Any failure leaves no to-do id, so approve again.
 */
export const BC_BUCKET = Number(process.env.WEEKLY_LIVE_BRIEF_BUCKET || 47502609);
export const BC_LIST = Number(process.env.WEEKLY_LIVE_BRIEF_LIST || 9946469026);
export const JACKIE_ID = Number(process.env.WEEKLY_LIVE_BRIEF_ASSIGNEE || 37184021);
const PDF_TIMEOUT_MS = 60_000;
const FETCH_TIMEOUT_MS = 15_000;

export interface Todo { id: number; title: string; app_url: string; assignees?: { id: number }[]; completed?: boolean }
export interface SendDeps {
  pdf: (html: string) => Promise<Buffer>;
  fetchPhoto: (url: string) => Promise<Buffer>;
  listTodos: () => Promise<Todo[]>;
  upload: (name: string, bytes: Buffer, type: string) => Promise<string>;
  createTodo: (body: Record<string, unknown>) => Promise<Todo>;
}

async function renderPdf(html: string): Promise<Buffer> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  let timer: NodeJS.Timeout | undefined;
  try {
    const work = (async () => {
      const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
      await page.setContent(html, { waitUntil: 'networkidle', timeout: PDF_TIMEOUT_MS });
      return Buffer.from(await page.pdf({ format: 'Letter', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' } }));
    })();
    const limit = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('The brief PDF took too long to render.'), { name: 'TimeoutError' })), PDF_TIMEOUT_MS); });
    return await Promise.race([work, limit]);
  } finally { if (timer) clearTimeout(timer); await browser.close().catch(() => undefined); } // close failures are not the send's failure
}

async function fetchPhoto(url: string): Promise<Buffer> {
  const r = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!r.ok) throw Object.assign(new Error(`Photo ${url} answered ${r.status}`), { name: 'UpstreamUnavailable' });
  return Buffer.from(await r.arrayBuffer());
}

export const REAL: SendDeps = {
  pdf: renderPdf, fetchPhoto,
  listTodos: () => bcGetAll<Todo>(`/buckets/${BC_BUCKET}/todolists/${BC_LIST}/todos.json`),
  upload: bcUploadAttachment,
  createTodo: (body) => bcPost<Todo>(`/buckets/${BC_BUCKET}/todolists/${BC_LIST}/todos.json`, body),
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
export const todoTitle = (eventName: string, airLabel: string) => `Weekly Live ${airLabel}: Eventbrite event, thumbnail and promotion for "${eventName}"`;

export async function sendToJackie(input: { title: string; html: string; slug: string; summary: string; dueOn: string; siteUrl: string; approvedBy: string }, deps: SendDeps = REAL): Promise<{ todoId: number; url: string; adopted: boolean }> {
  const existing = (await deps.listTodos()).find((t) => t.title === input.title && (t.assignees || []).some((a) => a.id === JACKIE_ID));
  if (existing) return { todoId: existing.id, url: existing.app_url, adopted: true };
  const pdf = await deps.pdf(input.html);
  const photos = await Promise.all(APPROVED_PHOTOS.map(async (p, k) => ({ name: `ali-photo-${k + 1}.jpg`, bytes: await deps.fetchPhoto(input.siteUrl + p.path) })));
  const files = [
    { name: `${input.slug}-event-brief.pdf`, bytes: pdf, type: 'application/pdf' },
    { name: `${input.slug}-event-brief.html`, bytes: Buffer.from(input.html, 'utf8'), type: 'text/html' },
    ...photos.map((p) => ({ ...p, type: 'image/jpeg' })),
  ];
  const sgids: string[] = [];
  for (const f of files) sgids.push(await deps.upload(f.name, f.bytes, f.type)); // one at a time: the client paces Basecamp
  const description = `<div>${esc(input.summary)}</div><div><br>Everything for the event page, the thumbnail and the week of posts is in the brief below (PDF to read, HTML to copy from), with Ali's four approved photos. Approved by ${esc(input.approvedBy)}.</div>`
    + sgids.map((sgid) => `<bc-attachment sgid="${sgid}"></bc-attachment>`).join('');
  const todo = await deps.createTodo({ content: input.title, description, assignee_ids: [JACKIE_ID], due_on: input.dueOn, notify: true });
  return { todoId: todo.id, url: todo.app_url, adopted: false };
}
