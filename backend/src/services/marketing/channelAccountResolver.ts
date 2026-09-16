import { Op } from 'sequelize';
import { ChannelAccount } from '../../models';

/**
 * Which connected account publishes a brand's post on a given network.
 *
 * A variant is generated per PROVIDER, not per account; the account is chosen when the job
 * is created, here. One rule, stated: the brand's most recently connected, non-revoked,
 * `connected` account for that provider. If the marketing team ever connects two LinkedIn
 * profiles to one brand, the newer one wins until a per-post account picker exists - the
 * composer's confirmation names the account it chose, so that is visible, not silent.
 *
 * Returns null when there is none. The caller decides what null means: for a provider in
 * handoff mode it means nothing (a person posts), for a direct provider it is a refusal at
 * scheduling time rather than a dead letter at 6am.
 */
export async function resolveAccountFor(tenantId: string, brandId: string | null, provider: string): Promise<ChannelAccount | null> {
  if (!brandId) return null;
  return ChannelAccount.findOne({
    where: { tenant_id: tenantId, brand_id: brandId, provider, status: 'connected', revoked_at: { [Op.is]: null } },
    order: [['connected_at', 'DESC']],
  });
}
