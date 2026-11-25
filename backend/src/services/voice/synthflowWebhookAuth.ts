import * as crypto from 'crypto';

/**
 * OH1 security audit (2026-11-17): the Synthflow call-complete webhook was unauthenticated.
 * When SYNTHFLOW_WEBHOOK_TOKEN is set, every call we place carries ?token=<it> on its
 * webhook URL (synthflowService), and this is the constant-time check on the way in.
 * VS4.2: with no token configured, production refuses every request (fail closed). Outside production an
 * empty token still means "not enforced", so local work needs no setup.
 */
export function webhookTokenOk(configured: string, given: unknown, production: boolean = process.env.NODE_ENV === 'production'): boolean {
  if (!configured) return !production;
  const g = Buffer.from(String(given ?? ''));
  const c = Buffer.from(configured);
  return g.length === c.length && crypto.timingSafeEqual(g, c);
}

/** A vendor value on one log line: letters, digits and - _ . : only, bounded. */
export const logToken = (v: unknown): string => String(v ?? '').replace(/[^\w.:-]/g, '_').slice(0, 80);

/** Recording links are rendered as links in the admin UI: https only, otherwise dropped. */
export function safeRecordingUrl(v: unknown): string {
  if (typeof v !== 'string' || v.length > 2_000) return '';
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && !u.username && !u.password ? u.toString() : '';
  } catch {
    return ''; // not a URL: there is nothing to link to
  }
}
