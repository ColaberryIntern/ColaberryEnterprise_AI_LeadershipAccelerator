import api from '../utils/api';

/**
 * channelAccountApi — the client for connected social accounts (T003).
 *
 * Types mirror the backend's `AccountView` field for field. That view is built explicitly on
 * the server and has no path to the sealed credential columns, so there is deliberately no type
 * here for a token: the shape of this file is part of how "no secret reaches the browser" is
 * enforced, not just a convenience.
 *
 * What IS here is the lifecycle metadata an operator needs to answer "why did publishing stop":
 * whether a secret exists, when it expires, whether it has expired, and which master key sealed
 * it. Omitting those would have made the vault unobservable from the UI, which is its own kind
 * of dishonesty.
 */

export type ChannelAccountStatus = 'connected' | 'needs_reconnect' | 'revoked' | 'disabled';

export type CredentialType = 'access_token' | 'refresh_token';

export interface CredentialSummary {
  credential_type: CredentialType;
  token_expires_at: string | null;
  rotated_at: string | null;
  key_id: string;
  expired: boolean;
}

export interface ChannelAccount {
  id: string;
  tenant_id: string;
  brand_id: string | null;
  owner_member_id: string | null;
  provider: string;
  provider_account_id: string;
  display_name: string;
  handle: string | null;
  avatar_url: string | null;
  status: ChannelAccountStatus;
  granted_scopes: string[];
  missing_scopes: string[];
  connected_at: string;
  last_health_check_at: string | null;
  last_health_ok: boolean | null;
  last_health_error_class: string | null;
  revoked_at: string | null;
  credentials: CredentialSummary[];
}

/**
 * Whether accounts can be connected on this server at all.
 *
 * The page reads this BEFORE offering a Connect button. Without it the button would be present,
 * be pressed, and fail with a 503 - which teaches an operator that the feature is broken rather
 * than that it is not configured. Those are different problems with different owners.
 */
export interface VaultStatus {
  vault_available: boolean;
  active_key_id: string | null;
  credentials_needing_rewrap: number;
  reason: string | null;
}

export async function getVaultStatus(): Promise<VaultStatus> {
  const res = await api.get('/api/admin/channel-accounts/status');
  return res.data;
}

export async function listChannelAccounts(params: { brand_id?: string; include_revoked?: boolean } = {}): Promise<ChannelAccount[]> {
  const res = await api.get('/api/admin/channel-accounts', {
    params: {
      ...(params.brand_id ? { brand_id: params.brand_id } : {}),
      ...(params.include_revoked ? { include_revoked: 'true' } : {}),
    },
  });
  return res.data.accounts ?? [];
}

export interface ConnectAccountInput {
  brand_id: string;
  provider: string;
  provider_account_id: string;
  display_name: string;
  access_token: string;
  granted_scopes?: string[];
}

export async function connectChannelAccount(input: ConnectAccountInput): Promise<ChannelAccount> {
  const res = await api.post('/api/admin/channel-accounts', input);
  return res.data.account;
}

export async function revokeChannelAccount(accountId: string): Promise<ChannelAccount> {
  const res = await api.delete(`/api/admin/channel-accounts/${accountId}`);
  return res.data.account;
}

/** The backend's error class, when it sent one, so the page can explain rather than apologise. */
export function errorClassOf(err: unknown): string | null {
  const e = err as { response?: { data?: { error_class?: string } } };
  return e?.response?.data?.error_class ?? null;
}

export function errorMessageOf(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { error?: string } } };
  return e?.response?.data?.error ?? fallback;
}
