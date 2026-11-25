/**
 * platformBuild/viewToken - a short-lived link to ONE project's platform-hosted pages. PURE.
 *
 * ## Why a token in the URL and not the portal session
 *
 * Portal auth is a Bearer header (`requireParticipant`). A link opened in a new tab sends no
 * header, and the Command Center is a static page whose own fetches (`./.colaberry/plan.json`)
 * cannot add one. So the authenticated portal request MINTS a link, and the link carries its own
 * proof: which project, until when, signed by the server.
 *
 * ## Properties
 *
 * - Bound to one project id. A token for project A can never read project B.
 * - Expires (12 hours by default). The portal mints a fresh one every time it loads the project,
 *   so a student never sees an expired link in practice; a link pasted into an email does expire.
 * - Signed with a key DERIVED from JWT_SECRET under its own label, so a view token can never be
 *   replayed as a session JWT or vice versa, and no new secret has to be provisioned.
 * - Stateless: verifying needs no database read, so a page load costs one HMAC per file.
 */
import crypto from 'crypto';

export const VIEW_TOKEN_TTL_SECONDS = 12 * 60 * 60;
const LABEL = 'colaberry-platform-build-view-v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const b64url = (buf: Buffer): string => buf.toString('base64url');

function key(secret: string): Buffer {
  if (!secret) throw new Error('view token secret is empty');
  return crypto.createHmac('sha256', secret).update(LABEL).digest();
}

function sign(payload: string, secret: string): string {
  return b64url(crypto.createHmac('sha256', key(secret)).update(payload).digest());
}

export function mintViewToken(
  projectId: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  ttlSeconds: number = VIEW_TOKEN_TTL_SECONDS,
): string {
  if (!UUID.test(projectId)) throw new Error('view token needs a project uuid');
  const payload = b64url(Buffer.from(JSON.stringify({ p: projectId.toLowerCase(), e: nowSeconds + ttlSeconds })));
  return `${payload}.${sign(payload, secret)}`;
}

/** The project id the token grants, or null for anything forged, malformed or expired. */
export function verifyViewToken(
  token: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string | null {
  if (typeof token !== 'string' || token.length > 400) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [payload, sig] = parts;
  const expected = sign(payload, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { p?: unknown; e?: unknown };
    if (typeof body.p !== 'string' || !UUID.test(body.p)) return null;
    if (typeof body.e !== 'number' || body.e <= nowSeconds) return null;
    return body.p;
  } catch {
    return null;
  }
}
