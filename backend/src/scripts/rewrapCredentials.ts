/**
 * Move every stored credential onto the ACTIVE master key. This is the bulk re-wrap sweep
 * ESC-001's Option A names as the remedy for a leaked or rotated key.
 *
 * Run (dry run first, always):
 *   cd backend && TS_NODE_TRANSPILE_ONLY=1 npx ts-node src/scripts/rewrapCredentials.ts
 *   cd backend && TS_NODE_TRANSPILE_ONLY=1 npx ts-node src/scripts/rewrapCredentials.ts --execute
 *
 * WHAT A ROTATION LOOKS LIKE, end to end:
 *   1. Mint a new key           -> src/scripts/generateCredentialMasterKey.ts
 *   2. Move the CURRENT key into SOCIAL_CREDENTIAL_PREVIOUS_KEYS as `<keyId>:<base64>`
 *      (the key id is printed by this script's dry run), and set the NEW key as
 *      SOCIAL_CREDENTIAL_MASTER_KEY. Deploy. Nothing is read-locked: rows sealed under the old
 *      key still open, because the vault resolves a row's key by its stored `key_id`.
 *   3. Run this with --execute. Every row moves to the new key.
 *   4. Confirm `credentials_needing_rewrap: 0` on GET /api/admin/channel-accounts/status.
 *   5. Remove the old entry from SOCIAL_CREDENTIAL_PREVIOUS_KEYS and deploy again.
 *
 * IT CANNOT READ A SINGLE CREDENTIAL, and that is the point. `rewrap` unwraps and re-wraps the
 * DATA KEY; the secret's own ciphertext, iv and auth tag are copied byte for byte and never
 * decrypted. An operator running a rotation therefore never handles plaintext, and a bug here
 * cannot leak one.
 *
 * FAILURE MODES:
 *   - A row whose `key_id` is neither the active key nor in PREVIOUS_KEYS cannot be moved. It
 *     is COUNTED AND NAMED, and the sweep continues: stopping at the first such row would leave
 *     a half-rotated table with no report of what remains. Those accounts need reconnecting.
 *   - Each row is written on its own. A crash halfway leaves earlier rows moved and later rows
 *     untouched, which is safe precisely because both keys still open their own rows; re-run it.
 */

import { ConnectorCredential } from '../models';
import { rewrap, activeKeyId, isVaultAvailable, CredentialVaultError } from '../services/security/credentialVault';

interface SweepResult {
  scanned: number;
  alreadyCurrent: number;
  rewrapped: number;
  unreadable: Array<{ id: string; channel_account_id: string; key_id: string }>;
}

export async function sweep(execute: boolean): Promise<SweepResult> {
  const active = activeKeyId();
  if (!isVaultAvailable() || !active) {
    throw new Error('SOCIAL_CREDENTIAL_MASTER_KEY is not set or is malformed. Nothing to re-wrap onto.');
  }

  const rows = await ConnectorCredential.findAll({ order: [['created_at', 'ASC']] });
  const result: SweepResult = { scanned: rows.length, alreadyCurrent: 0, rewrapped: 0, unreadable: [] };

  for (const row of rows) {
    if (row.key_id === active) {
      result.alreadyCurrent += 1;
      continue;
    }
    try {
      const moved = rewrap({
        ciphertext: row.ciphertext,
        iv: row.iv,
        auth_tag: row.auth_tag,
        wrapped_data_key: row.wrapped_data_key,
        key_id: row.key_id,
        encrypted_at: row.encrypted_at.toISOString(),
      });
      if (execute) {
        // Only the wrapping changes. The three secret-bearing columns are deliberately not in
        // this update: if a future edit adds them here, it is re-encrypting, which this is not.
        await row.update({ wrapped_data_key: moved.wrapped_data_key, key_id: moved.key_id });
      }
      result.rewrapped += 1;
    } catch (err) {
      const errorClass = err instanceof CredentialVaultError ? err.errorClass : 'Error';
      result.unreadable.push({ id: row.id, channel_account_id: row.channel_account_id, key_id: row.key_id });
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(), level: 'error', service: 'credential-rewrap',
        event: 'rewrap_failed', outcome: 'failure', error_class: errorClass,
        context: { credential_id: row.id, channel_account_id: row.channel_account_id, key_id: row.key_id },
      }));
    }
  }

  return result;
}

async function main(): Promise<void> {
  const execute = process.argv.includes('--execute');
  const result = await sweep(execute);

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'info', service: 'credential-rewrap',
    event: execute ? 'rewrap_complete' : 'rewrap_dry_run', outcome: result.unreadable.length > 0 ? 'partial' : 'success',
    context: {
      active_key_id: activeKeyId(),
      scanned: result.scanned,
      already_current: result.alreadyCurrent,
      rewrapped: result.rewrapped,
      unreadable: result.unreadable.length,
    },
  }, null, 2));

  if (!execute) console.log('\nDRY RUN. Nothing was written. Re-run with --execute to apply.');
  if (result.unreadable.length > 0) {
    console.log(`\n${result.unreadable.length} credential(s) could not be re-wrapped: their sealing key is neither active nor in SOCIAL_CREDENTIAL_PREVIOUS_KEYS.`);
    console.log('Those accounts must be reconnected. Ids are in the error lines above.');
  }
  process.exit(result.unreadable.length > 0 ? 1 : 0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('rewrapCredentials failed:', err?.message ?? err);
    process.exit(1);
  });
}
