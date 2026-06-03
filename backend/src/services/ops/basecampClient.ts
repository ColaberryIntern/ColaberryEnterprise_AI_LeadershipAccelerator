/**
 * basecampClient — shared BC API helper for the ops services. Reads
 * BASECAMP_ACCESS_TOKEN + BASECAMP_ACCOUNT_ID from env, exposes typed
 * get/post.
 */

const BC_ACCOUNT_ID = process.env.BASECAMP_ACCOUNT_ID || '3945211';
const BC_API = `https://3.basecampapi.com/${BC_ACCOUNT_ID}`;
const BC_USER_AGENT =
  process.env.BASECAMP_USER_AGENT || 'Colaberry AI Ops Command Center (ali@colaberry.com)';

function getToken(): string {
  let t = process.env.BASECAMP_ACCESS_TOKEN;
  if (!t) throw new Error('BASECAMP_ACCESS_TOKEN not set');
  if (t.startsWith('Bearer ')) t = t.slice(7);
  return t;
}

function bcHeaders(token: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'User-Agent': BC_USER_AGENT,
    Accept: 'application/json',
    ...extra,
  };
}

export async function bcGet<T>(urlOrPath: string): Promise<T> {
  const token = getToken();
  const u = urlOrPath.startsWith('http') ? urlOrPath : `${BC_API}${urlOrPath}`;
  const r = await fetch(u, { headers: bcHeaders(token) });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`BC GET ${u} -> ${r.status} ${body.slice(0, 200)}`);
  }
  return (await r.json()) as T;
}

export async function bcPost<T>(urlOrPath: string, body: unknown): Promise<T> {
  const token = getToken();
  const u = urlOrPath.startsWith('http') ? urlOrPath : `${BC_API}${urlOrPath}`;
  const r = await fetch(u, {
    method: 'POST',
    headers: bcHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const errBody = await r.text().catch(() => '');
    throw new Error(`BC POST ${u} -> ${r.status} ${errBody.slice(0, 200)}`);
  }
  return (await r.json()) as T;
}

export const BC_BASE_URL = BC_API;
