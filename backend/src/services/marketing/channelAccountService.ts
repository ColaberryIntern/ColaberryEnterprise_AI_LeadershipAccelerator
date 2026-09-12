import { Op } from 'sequelize';
import { ChannelAccount, ConnectorCredential } from '../../models';
import type { ChannelAccountStatus } from '../../models/ChannelAccount';
import type { CredentialType } from '../../models/ConnectorCredential';
import { WorkflowError } from '../content/contentWorkflowService';
import { isVaultAvailable, seal, open, activeKeyId, CredentialVaultError } from '../security/credentialVault';
import { redactedJson } from '../security/secretRedaction';

/**
 * channelAccountService — connect, read, refresh and revoke social accounts.
 *
 * THE ONE RULE THIS MODULE EXISTS TO ENFORCE: a secret enters through `connectAccount` or
 * `rotateCredential` and leaves only through `getAccessToken`. Nothing else in the codebase
 * touches `ConnectorCredential`'s sealed columns, so "where can a token escape?" has three
 * greppable answers instead of being a property of the whole backend.
 *
 * NO PLAINTEXT FALLBACK. If the vault is unavailable (master key absent or malformed),
 * `connectAccount` refuses. The product then behaves exactly as it does today, with every
 * provider in handoff mode, which is a known-good state rather than a silent downgrade to
 * storing bare tokens.
 */

export interface ConnectInput {
  tenantId: string;
  /** Exactly one of brandId / ownerMemberId. Brand for company pages, member for a person. */
  brandId?: string | null;
  ownerMemberId?: string | null;
  provider: string;
  providerAccountId: string;
  displayName: string;
  handle?: string | null;
  avatarUrl?: string | null;
  grantedScopes?: string[];
  /** Scopes the integration asked for and did not receive; surfaced to the operator. */
  missingScopes?: string[];
  accessToken: string;
  refreshToken?: string | null;
  /** When the access token stops working, if the provider said. */
  tokenExpiresAt?: Date | null;
  connectedBy?: string | null;
  metadata?: Record<string, unknown>;
}

/** The account as any caller outside this module may see it. No secret, by construction. */
export interface AccountView {
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
  connected_at: Date;
  last_health_check_at: Date | null;
  last_health_ok: boolean | null;
  last_health_error_class: string | null;
  revoked_at: Date | null;
  /** Lifecycle only: whether a secret exists and when it expires, never the secret. */
  credentials: Array<{
    credential_type: CredentialType;
    token_expires_at: Date | null;
    rotated_at: Date | null;
    key_id: string;
    expired: boolean;
  }>;
}

function log(level: 'info' | 'warn' | 'error', event: string, context: Record<string, unknown>, outcome = 'success'): void {
  // Redacted at the boundary rather than trusting each caller: this is the log line most
  // likely to be handed an object that contains a token.
  console[level](redactedJson({
    timestamp: new Date().toISOString(),
    level,
    service: 'marketing-channel-accounts',
    event,
    outcome,
    context,
  }));
}

function toView(account: ChannelAccount, credentials: ConnectorCredential[]): AccountView {
  const now = Date.now();
  return {
    id: account.id,
    tenant_id: account.tenant_id,
    brand_id: account.brand_id,
    owner_member_id: account.owner_member_id,
    provider: account.provider,
    provider_account_id: account.provider_account_id,
    display_name: account.display_name,
    handle: account.handle,
    avatar_url: account.avatar_url,
    status: account.status,
    granted_scopes: account.granted_scopes ?? [],
    missing_scopes: account.missing_scopes ?? [],
    connected_at: account.connected_at,
    last_health_check_at: account.last_health_check_at,
    last_health_ok: account.last_health_ok,
    last_health_error_class: account.last_health_error_class,
    revoked_at: account.revoked_at,
    credentials: credentials.map((c) => ({
      credential_type: c.credential_type,
      token_expires_at: c.token_expires_at,
      rotated_at: c.rotated_at,
      key_id: c.key_id,
      expired: c.token_expires_at ? c.token_expires_at.getTime() <= now : false,
    })),
  };
}

function assertExactlyOneOwner(input: Pick<ConnectInput, 'brandId' | 'ownerMemberId'>): void {
  const hasBrand = Boolean(input.brandId);
  const hasMember = Boolean(input.ownerMemberId);
  if (hasBrand === hasMember) {
    throw new WorkflowError(
      'A channel account belongs to exactly one owner: a brand or a person, never both and never neither.',
      400,
      'ValidationError',
    );
  }
}

/**
 * Connect an account and seal its tokens.
 *
 * Idempotent on `(tenant, provider, provider_account_id)` among non-revoked rows: reconnecting
 * the same page updates it and replaces the credentials rather than creating a second account
 * that would publish a duplicate of every post.
 */
export async function connectAccount(input: ConnectInput): Promise<AccountView> {
  assertExactlyOneOwner(input);

  if (!isVaultAvailable()) {
    log('error', 'account_connect_refused', {
      provider: input.provider,
      reason: 'credential vault unavailable',
    }, 'failure');
    throw new WorkflowError(
      'The credential store is not configured on this server, so accounts cannot be connected. '
      + 'Publishing stays in handoff mode until it is.',
      503,
      'VaultUnavailable',
    );
  }

  const existing = await ChannelAccount.findOne({
    where: {
      tenant_id: input.tenantId,
      provider: input.provider,
      provider_account_id: input.providerAccountId,
      revoked_at: { [Op.is]: null } as any,
    },
  });

  const fields = {
    tenant_id: input.tenantId,
    brand_id: input.brandId ?? null,
    owner_member_id: input.ownerMemberId ?? null,
    provider: input.provider,
    provider_account_id: input.providerAccountId,
    display_name: input.displayName,
    handle: input.handle ?? null,
    avatar_url: input.avatarUrl ?? null,
    status: 'connected' as ChannelAccountStatus,
    granted_scopes: input.grantedScopes ?? [],
    missing_scopes: input.missingScopes ?? [],
    connected_by: input.connectedBy ?? null,
    connected_at: new Date(),
    last_health_check_at: null,
    last_health_ok: null,
    last_health_error_class: null,
    metadata: input.metadata ?? {},
  };

  const account = existing
    ? await existing.update(fields)
    : await ChannelAccount.create(fields as any);

  await writeCredential(account, 'access_token', input.accessToken, input.tokenExpiresAt ?? null);
  if (input.refreshToken) {
    // Refresh tokens have their own lifetime, which is why they are a separate row rather than
    // a second column: an expired access token beside a live refresh token is the normal state.
    await writeCredential(account, 'refresh_token', input.refreshToken, null);
  }

  log('info', existing ? 'account_reconnected' : 'account_connected', {
    account_id: account.id,
    provider: account.provider,
    owner: account.brand_id ? 'brand' : 'member',
    granted_scope_count: (input.grantedScopes ?? []).length,
    missing_scope_count: (input.missingScopes ?? []).length,
  });

  return toView(account, await credentialsFor(account.id));
}

async function writeCredential(
  account: ChannelAccount,
  type: CredentialType,
  secret: string,
  expiresAt: Date | null,
): Promise<void> {
  const sealed = seal(secret, { accountId: account.id, credentialType: type });
  const existing = await ConnectorCredential.findOne({
    where: { channel_account_id: account.id, credential_type: type },
  });
  const row = {
    tenant_id: account.tenant_id,
    channel_account_id: account.id,
    credential_type: type,
    ciphertext: sealed.ciphertext,
    iv: sealed.iv,
    auth_tag: sealed.auth_tag,
    wrapped_data_key: sealed.wrapped_data_key,
    key_id: sealed.key_id,
    encrypted_at: new Date(sealed.encrypted_at),
    token_expires_at: expiresAt,
    rotated_at: existing ? new Date() : null,
  };
  if (existing) await existing.update(row);
  else await ConnectorCredential.create(row as any);
}

async function credentialsFor(accountId: string): Promise<ConnectorCredential[]> {
  return ConnectorCredential.findAll({
    where: { channel_account_id: accountId },
    order: [['credential_type', 'ASC']],
  });
}

/** Replace one secret for an account, keeping the account row and its history intact. */
export async function rotateCredential(
  accountId: string,
  type: CredentialType,
  secret: string,
  expiresAt: Date | null = null,
): Promise<AccountView> {
  const account = await ChannelAccount.findByPk(accountId);
  if (!account) throw new WorkflowError('Channel account not found', 404, 'NotFound');
  if (!isVaultAvailable()) {
    throw new WorkflowError('The credential store is not configured on this server.', 503, 'VaultUnavailable');
  }
  await writeCredential(account, type, secret, expiresAt);
  if (account.status === 'needs_reconnect') {
    await account.update({ status: 'connected', last_health_error_class: null });
  }
  log('info', 'credential_rotated', { account_id: accountId, credential_type: type });
  return toView(account, await credentialsFor(accountId));
}

/**
 * The ONLY way to obtain a usable token. Every caller is an adapter about to talk to a
 * provider; nothing else has a reason to call it.
 *
 * A tampered or unopenable row marks the account `needs_reconnect` rather than throwing
 * anonymously, because the operator's remedy is the same in both cases and silence would leave
 * the account looking healthy while every publish failed.
 */
export async function getAccessToken(accountId: string, type: CredentialType = 'access_token'): Promise<string> {
  const account = await ChannelAccount.findByPk(accountId);
  if (!account) throw new WorkflowError('Channel account not found', 404, 'NotFound');
  if (account.status === 'revoked' || account.revoked_at) {
    throw new WorkflowError('This account was disconnected.', 409, 'AccountRevoked');
  }

  const credential = await ConnectorCredential.findOne({
    where: { channel_account_id: accountId, credential_type: type },
  });
  if (!credential) {
    throw new WorkflowError(`This account has no ${type}. Reconnect it.`, 409, 'CredentialMissing');
  }

  try {
    return open(
      {
        ciphertext: credential.ciphertext,
        iv: credential.iv,
        auth_tag: credential.auth_tag,
        wrapped_data_key: credential.wrapped_data_key,
        key_id: credential.key_id,
        encrypted_at: credential.encrypted_at.toISOString(),
      },
      // Binds the row to this account and type: a row transplanted from another account fails
      // authentication instead of opening.
      { accountId: accountId, credentialType: type },
    );
  } catch (err) {
    const errorClass = err instanceof CredentialVaultError ? err.errorClass : 'Error';
    await account.update({
      status: 'needs_reconnect',
      last_health_ok: false,
      last_health_error_class: errorClass,
      last_health_check_at: new Date(),
    });
    log('error', 'credential_unreadable', {
      account_id: accountId,
      credential_type: type,
      error_class: errorClass,
      key_id: credential.key_id,
      active_key_id: activeKeyId(),
    }, 'failure');
    throw new WorkflowError(
      'This account\'s credential could not be read, so it has been marked for reconnection.',
      409,
      errorClass,
    );
  }
}

export interface ListScope {
  /**
   * Tenants the caller may see. `null` means no tenant filter, which is ONLY correct for the
   * membership ramp's `migration_open` mode; a route must never pass null on a scoped caller.
   */
  tenantIds: string[] | null;
  brandId?: string | null;
  ownerMemberId?: string | null;
  includeRevoked?: boolean;
}

/** List accounts as views. There is no variant of this that returns secrets. */
export async function listAccounts(scope: ListScope): Promise<AccountView[]> {
  const where: Record<string, unknown> = {};
  if (scope.tenantIds) {
    // An empty allow-list means "no tenants", not "every tenant". Returning early keeps a
    // future caller from turning a denied scope into an unfiltered read.
    if (scope.tenantIds.length === 0) return [];
    where.tenant_id = { [Op.in]: scope.tenantIds };
  }
  if (scope.brandId) where.brand_id = scope.brandId;
  if (scope.ownerMemberId) where.owner_member_id = scope.ownerMemberId;
  if (!scope.includeRevoked) where.revoked_at = { [Op.is]: null };

  const accounts = await ChannelAccount.findAll({ where, order: [['display_name', 'ASC']] });
  if (accounts.length === 0) return [];

  const credentials = await ConnectorCredential.findAll({
    where: { channel_account_id: { [Op.in]: accounts.map((a) => a.id) } },
  });
  const byAccount = new Map<string, ConnectorCredential[]>();
  for (const c of credentials) {
    const list = byAccount.get(c.channel_account_id) ?? [];
    list.push(c);
    byAccount.set(c.channel_account_id, list);
  }
  return accounts.map((a) => toView(a, byAccount.get(a.id) ?? []));
}

export async function getAccount(accountId: string): Promise<AccountView | null> {
  const account = await ChannelAccount.findByPk(accountId);
  if (!account) return null;
  return toView(account, await credentialsFor(account.id));
}

/**
 * Disconnect an account: destroy every secret, keep the account row.
 *
 * The row survives on purpose. `content_variants.channel_account_id` and published history
 * point at it, and deleting it would orphan the record of what was posted where. What must not
 * survive is the token, so the credential rows are deleted rather than flagged.
 */
export async function revokeAccount(accountId: string, revokedBy: string | null): Promise<AccountView> {
  const account = await ChannelAccount.findByPk(accountId);
  if (!account) throw new WorkflowError('Channel account not found', 404, 'NotFound');

  const destroyed = await ConnectorCredential.destroy({ where: { channel_account_id: accountId } });
  await account.update({
    status: 'revoked',
    revoked_at: new Date(),
    revoked_by: revokedBy,
  });

  log('info', 'account_revoked', {
    account_id: accountId,
    provider: account.provider,
    credentials_destroyed: destroyed,
  });

  return toView(account, []);
}

/** Rows still sealed under a retired master key. Drives the rotation sweep's reporting. */
export async function credentialsNeedingRewrap(tenantId?: string): Promise<number> {
  const active = activeKeyId();
  if (!active) return 0;
  return ConnectorCredential.count({
    where: {
      key_id: { [Op.ne]: active },
      ...(tenantId ? { tenant_id: tenantId } : {}),
    },
  });
}
