import api from '../utils/api';
import type { AttentionItem, ExcludedSignal } from '../pages/admin/marketing/NeedsAttentionQueue';

/**
 * marketingOpsApi — clients for the Marketing Operations command-center endpoints.
 *
 * Kept separate from `adminBrandApi` because they are different surfaces with different
 * lifecycles; a client module that grows to cover everything under /api/admin/marketing
 * becomes the 15-import module the composition rule warns about.
 */

export type ScopeMode = 'scoped' | 'migration_open' | 'denied';

export interface NeedsAttentionResponse {
  items: AttentionItem[];
  /** Signals NOT shown because their metric is not trusted, with the registry's reason. */
  excluded: ExcludedSignal[];
  scope_mode: ScopeMode;
}

export async function getNeedsAttention(params?: { brand_id?: string }): Promise<NeedsAttentionResponse> {
  const res = await api.get('/api/admin/marketing/needs-attention', { params });
  return {
    items: res.data.items ?? [],
    excluded: res.data.excluded ?? [],
    scope_mode: res.data.scope_mode,
  };
}
