import { Op } from 'sequelize';
import { ChannelAccount } from '../../models';

/**
 * Which connected account publishes a brand's post on a given network.
 *
 * A variant is generated per PROVIDER, not per account; the account is chosen when the job
 * is created, here. Since 2026-09-29 a brand has AT MOST ONE account per network -
 * `connectAccount` revokes the previous one when a different account is connected - so this
 * finds the one, not a winner among several.
 *
 * It still orders by `connected_at` and still logs when it had to choose, because rows connected
 * before that rule existed can still be sitting in the database. A silent pick is what made
 * publishing from the wrong account invisible in the first place; if it ever happens again the
 * log says so.
 *
 * Returns null when there is none. The caller decides what null means: for a provider in
 * handoff mode it means nothing (a person posts), for a direct provider it is a refusal at
 * scheduling time rather than a dead letter at 6am.
 */
export async function resolveAccountFor(tenantId: string, brandId: string | null, provider: string): Promise<ChannelAccount | null> {
  if (!brandId) return null;
  const candidates = await ChannelAccount.findAll({
    where: { tenant_id: tenantId, brand_id: brandId, provider, status: 'connected', revoked_at: { [Op.is]: null } },
    order: [['connected_at', 'DESC']],
  });
  if (candidates.length > 1) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'marketing',
      event: 'account_resolution_ambiguous', outcome: 'partial',
      context: {
        brand_id: brandId,
        provider,
        candidate_count: candidates.length,
        chose: candidates[0].id,
        note: 'Predates the one-account-per-network rule; the newest is used.',
      },
    }));
  }
  return candidates[0] ?? null;
}
