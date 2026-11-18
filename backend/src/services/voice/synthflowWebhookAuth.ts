import * as crypto from 'crypto';

/**
 * OH1 security audit (2026-11-17): the Synthflow call-complete webhook was unauthenticated.
 * When SYNTHFLOW_WEBHOOK_TOKEN is set, every call we place carries ?token=<it> on its
 * webhook URL (synthflowService), and this is the constant-time check on the way in.
 * An empty configured token means "not enforced" (the prior behaviour).
 */
export function webhookTokenOk(configured: string, given: unknown): boolean {
  if (!configured) return true;
  const g = Buffer.from(String(given ?? ''));
  const c = Buffer.from(configured);
  return g.length === c.length && crypto.timingSafeEqual(g, c);
}
