import type { CommsHubMessageStatus } from '../../../models/CommsHubMessage';

/**
 * A message's result once none of its deliveries is pending or sending (CH7.2): every one sent ->
 * sent; some -> partially_failed; none (failed, skipped as not allowed, or cancelled) -> failed.
 * Null while any is still pending or sending.
 */
export function resultOf(statuses: string[]): CommsHubMessageStatus | null {
  if (statuses.some((s) => s === 'pending' || s === 'sending')) return null;
  const sent = statuses.filter((s) => s === 'sent').length;
  if (sent === statuses.length && sent > 0) return 'sent';
  return sent > 0 ? 'partially_failed' : 'failed';
}
