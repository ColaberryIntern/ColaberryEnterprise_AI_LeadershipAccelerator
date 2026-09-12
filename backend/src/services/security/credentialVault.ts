import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'crypto';

/**
 * credentialVault — envelope encryption for secrets at rest (ESC-001, Option A).
 *
 * WHY THIS EXISTS. Before this module there was no encryption primitive anywhere in
 * `backend/src`: zero uses of `createCipheriv`. `github_connections.access_token_encrypted`
 * holds PLAINTEXT despite its name, and `oauth_token_vault` stores a refresh token as
 * plaintext TEXT. Storing social OAuth tokens the same way was escalated (ESC-001) because it
 * changes the security posture, and Ali approved this design on 2026-09-12. Student social
 * posting is planned, so the store is designed for many per-PERSON tokens from day one, not a
 * handful of brand-owned ones.
 *
 * ENVELOPE, NOT DIRECT ENCRYPTION. Each secret gets its own random 256-bit data key; the data
 * key is wrapped with the master key and stored beside the ciphertext. Two reasons this beats
 * encrypting every secret directly under the master key:
 *   1. Rotating the master key re-wraps N small data keys instead of decrypting and
 *      re-encrypting N secrets of arbitrary size. `key_id` lets the old and new master coexist
 *      while that runs, so rotation is not an outage.
 *   2. A single leaked data key exposes exactly one secret.
 *
 * AES-256-GCM, from Node's own `crypto`. No new dependency. GCM is authenticated: a flipped
 * bit in the ciphertext fails the auth tag rather than returning plausible garbage, which is
 * what lets `open()` distinguish "tampered or wrong key" from "this is the token".
 *
 * WHAT THIS DOES NOT DEFEND AGAINST, stated plainly. The master key lives in the production
 * container's environment, on the same host as the database. A full host compromise yields
 * both. What it does defend against is every way a secret leaks WITHOUT a host compromise: a
 * database dump, a backup file, a replica, a read-only reporting user, a stray `SELECT *` in a
 * log, an admin API that returns too much. That is the majority of real incidents, and it is
 * the standard first rung. Moving to an external KMS later changes `unwrapDataKey` alone,
 * because every call already goes through this seam.
 *
 * FAILURE MODES (Failure-First Design, CLAUDE.md):
 *   - Master key absent or malformed at boot -> `isVaultAvailable()` is false. Callers must
 *     refuse to connect accounts and fall back to handoff publishing, which is the state the
 *     product is in today, so nothing regresses. We never fall back to writing plaintext.
 *   - Auth-tag mismatch on open -> throws `CredentialVaultError` with class `CredentialTampered`.
 *     The caller marks the account `needs_reconnect`; it must never be retried silently,
 *     because a wrong key and a tampered row are indistinguishable here by design.
 *   - Unknown `key_id` -> `UnknownKeyId`. Happens if a row was sealed by a master key this
 *     process does not have (mid-rotation with a stale deploy). Loud, not silent.
 *   - No retry logic lives here. Encryption is deterministic and local; a failure is a
 *     configuration or integrity problem, and retrying it just hides it.
 */

/** Env var holding the active master key: 32 random bytes, base64. */
export const MASTER_KEY_ENV = 'SOCIAL_CREDENTIAL_MASTER_KEY';

/**
 * Env var holding PREVIOUS master keys during a rotation, as `keyId:base64` pairs separated by
 * commas. Rows sealed under an old key stay readable until the re-wrap script has passed over
 * them. Empty in normal operation.
 */
export const PREVIOUS_KEYS_ENV = 'SOCIAL_CREDENTIAL_PREVIOUS_KEYS';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12; // 96-bit nonce, the size GCM is defined for
const TAG_BYTES = 16;

export class CredentialVaultError extends Error {
  constructor(message: string, public readonly errorClass: string) {
    super(message);
    this.name = 'CredentialVaultError';
  }
}

/**
 * What a sealed record is bound to. Passed as GCM additional authenticated data, so a record
 * sealed for one account cannot be transplanted onto another: the auth tag covers this context
 * as well as the ciphertext.
 *
 * WHY THIS EXISTS. Without it, an attacker with database WRITE access could copy a whole sealed
 * row from a high-privilege account onto a low-privilege one and it would open cleanly, because
 * every field needed to decrypt travels together. ESC-001's threat model is read access (dumps,
 * backups, replicas, a stray SELECT), so this sits just outside what was approved - it is here
 * because binding costs nothing today and would cost a re-seal of every stored credential once
 * rows exist. Found by the T003 verification's own transplant probe.
 */
export interface CredentialContext {
  /** The account the secret belongs to. */
  accountId: string;
  /** Which secret of that account this is. */
  credentialType: string;
}

function aadFor(context: CredentialContext): Buffer {
  // Version-prefixed so a future change to what is bound is distinguishable rather than a
  // silent authentication failure nobody can explain.
  return Buffer.from(`v1|${context.accountId}|${context.credentialType}`, 'utf8');
}

/**
 * A sealed secret, exactly as it is stored. Every field is non-secret on its own: without the
 * master key the wrapped data key is inert.
 */
export interface SealedCredential {
  /** base64 ciphertext of the secret */
  ciphertext: string;
  /** base64 nonce used for the secret */
  iv: string;
  /** base64 GCM auth tag for the secret */
  auth_tag: string;
  /** base64 data key, itself encrypted under the master key (iv + tag + ciphertext, joined) */
  wrapped_data_key: string;
  /** which master key sealed this row; lets rotation proceed without an outage */
  key_id: string;
  /** when it was sealed, for age reporting and rotation sweeps */
  encrypted_at: string;
}

interface MasterKey {
  id: string;
  key: Buffer;
}

function decodeKey(raw: string, label: string): Buffer {
  let key: Buffer;
  try {
    key = Buffer.from(raw.trim(), 'base64');
  } catch {
    throw new CredentialVaultError(`${label} is not valid base64.`, 'MasterKeyMalformed');
  }
  if (key.length !== KEY_BYTES) {
    throw new CredentialVaultError(
      `${label} must decode to ${KEY_BYTES} bytes, got ${key.length}.`,
      'MasterKeyMalformed',
    );
  }
  return key;
}

/**
 * The active master key, or null when it is not configured.
 *
 * Read from the environment on every call rather than cached at module load: a cached null
 * would survive a key being added, and the boot order in this repo is not guaranteed.
 */
function activeMasterKey(): MasterKey | null {
  const raw = process.env[MASTER_KEY_ENV];
  if (!raw || raw.trim() === '') return null;
  return { id: keyIdFor(decodeKey(raw, MASTER_KEY_ENV)), key: decodeKey(raw, MASTER_KEY_ENV) };
}

function previousMasterKeys(): MasterKey[] {
  const raw = process.env[PREVIOUS_KEYS_ENV];
  if (!raw || raw.trim() === '') return [];
  return raw.split(',').map((pair) => {
    const idx = pair.indexOf(':');
    if (idx === -1) {
      throw new CredentialVaultError(
        `${PREVIOUS_KEYS_ENV} entries must be "keyId:base64Key".`,
        'MasterKeyMalformed',
      );
    }
    const id = pair.slice(0, idx).trim();
    return { id, key: decodeKey(pair.slice(idx + 1), `${PREVIOUS_KEYS_ENV}[${id}]`) };
  });
}

/**
 * A short, stable, NON-SECRET identifier for a master key: the first 8 bytes of the key's own
 * HMAC over a fixed label, hex-encoded.
 *
 * Deriving it from the key means two deploys holding the same key agree on the id without
 * anyone configuring one, and a typo'd key produces a different id (so it fails as
 * `UnknownKeyId` rather than as a confusing auth-tag error). It is not reversible to the key.
 */
function keyIdFor(key: Buffer): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createHmac } = require('crypto');
  return createHmac('sha256', key).update('credential-vault-key-id').digest('hex').slice(0, 16);
}

/** True when sealing and opening are possible. Callers gate account connection on this. */
export function isVaultAvailable(): boolean {
  try {
    return activeMasterKey() !== null;
  } catch {
    // A malformed key is NOT "available". Treated as unavailable so the caller falls back to
    // handoff rather than crashing the boot path, and the malformed-key error surfaces the
    // first time someone actually tries to connect an account.
    return false;
  }
}

function requireActiveKey(): MasterKey {
  const active = activeMasterKey();
  if (!active) {
    throw new CredentialVaultError(
      `${MASTER_KEY_ENV} is not set. Refusing to store a credential in plaintext.`,
      'VaultUnavailable',
    );
  }
  return active;
}

function wrapDataKey(dataKey: Buffer, master: MasterKey): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, master.key, iv);
  const wrapped = Buffer.concat([cipher.update(dataKey), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), wrapped]).toString('base64');
}

function unwrapDataKey(wrapped: string, master: MasterKey): Buffer {
  const raw = Buffer.from(wrapped, 'base64');
  if (raw.length <= IV_BYTES + TAG_BYTES) {
    throw new CredentialVaultError('Wrapped data key is truncated.', 'CredentialTampered');
  }
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const body = raw.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, master.key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(body), decipher.final()]);
  } catch {
    throw new CredentialVaultError(
      'The wrapped data key failed authentication: wrong master key, or the row was altered.',
      'CredentialTampered',
    );
  }
}

/**
 * Encrypt one secret. The returned record is safe to store in Postgres and safe to include in
 * a backup; it is NOT safe to return from an API, because it is still the secret under a key
 * the server holds.
 */
export function seal(plaintext: string, context: CredentialContext): SealedCredential {
  if (typeof plaintext !== 'string' || plaintext === '') {
    throw new CredentialVaultError('Refusing to seal an empty secret.', 'ValidationError');
  }
  const master = requireActiveKey();
  const dataKey = randomBytes(KEY_BYTES);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, dataKey, iv);
  cipher.setAAD(aadFor(context));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    auth_tag: cipher.getAuthTag().toString('base64'),
    wrapped_data_key: wrapDataKey(dataKey, master),
    key_id: master.id,
    encrypted_at: new Date().toISOString(),
  };
}

/**
 * Decrypt one secret.
 *
 * Throws rather than returning null on failure: a caller that forgets to check a null would
 * send an empty Bearer token to a provider and read the 401 as "the account is disconnected",
 * which is the wrong diagnosis and the wrong remedy.
 */
export function open(record: SealedCredential, context: CredentialContext): string {
  const master = resolveKeyById(record.key_id);
  const dataKey = unwrapDataKey(record.wrapped_data_key, master);
  const iv = Buffer.from(record.iv, 'base64');
  const tag = Buffer.from(record.auth_tag, 'base64');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new CredentialVaultError('Sealed record has a malformed iv or auth tag.', 'CredentialTampered');
  }
  const decipher = createDecipheriv(ALGORITHM, dataKey, iv);
  decipher.setAuthTag(tag);
  decipher.setAAD(aadFor(context));
  try {
    return Buffer.concat([
      decipher.update(Buffer.from(record.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new CredentialVaultError(
      'The credential failed authentication: it was altered, sealed with a different key, or '
      + 'belongs to a different account.',
      'CredentialTampered',
    );
  }
}

function resolveKeyById(keyId: string): MasterKey {
  const active = requireActiveKey();
  if (constantTimeEquals(active.id, keyId)) return active;
  const previous = previousMasterKeys().find((k) => constantTimeEquals(k.id, keyId));
  if (previous) return previous;
  throw new CredentialVaultError(
    `No master key with id ${keyId} is configured. If a rotation is in progress, the old key belongs in ${PREVIOUS_KEYS_ENV}.`,
    'UnknownKeyId',
  );
}

/** Key ids are not secret, but comparing them in constant time costs nothing and sets the habit. */
function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Re-wrap a sealed record under the ACTIVE master key without exposing the secret to the
 * caller. This is the whole of master-key rotation: the data key is unwrapped with whichever
 * key sealed it and re-wrapped with the current one. The ciphertext, iv and auth tag are
 * untouched, so nothing about the secret changes and the operation is safe to run in bulk.
 *
 * No `CredentialContext` is needed here, and that is not an oversight: the AAD binds the SECRET
 * layer, which this never opens. Rotation moves the wrapping only, so a sweep can re-wrap every
 * row in the database without being able to read a single credential. That property is worth
 * more than the symmetry would have been.
 */
export function rewrap(record: SealedCredential): SealedCredential {
  const current = requireActiveKey();
  if (constantTimeEquals(record.key_id, current.id)) return record;
  const dataKey = unwrapDataKey(record.wrapped_data_key, resolveKeyById(record.key_id));
  return {
    ...record,
    wrapped_data_key: wrapDataKey(dataKey, current),
    key_id: current.id,
  };
}

/** The active key's id, for reporting which rows still need a re-wrap. Null when unavailable. */
export function activeKeyId(): string | null {
  try {
    return requireActiveKey().id;
  } catch {
    return null;
  }
}

/** Generate a new master key, base64 encoded, for the operator to place in the environment. */
export function generateMasterKey(): string {
  return randomBytes(KEY_BYTES).toString('base64');
}
