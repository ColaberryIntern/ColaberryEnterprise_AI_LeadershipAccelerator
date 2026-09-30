/**
 * rewrapCredentials — the bulk key-rotation sweep.
 *
 * The property worth testing hardest is the one an operator is trusting: the sweep moves the
 * WRAPPING and never the secret. If a future edit started re-encrypting, rotation would become
 * an operation that handles plaintext, and a bug in it could leak one.
 */

const mockFindAll = jest.fn();
jest.mock('../../models', () => ({ ConnectorCredential: { findAll: (...a: unknown[]) => mockFindAll(...a) } }));

import { randomBytes } from 'crypto';
import { sweep } from '../rewrapCredentials';
import { seal, activeKeyId, MASTER_KEY_ENV, PREVIOUS_KEYS_ENV } from '../../services/security/credentialVault';

const KEY_OLD = randomBytes(32).toString('base64');
const KEY_NEW = randomBytes(32).toString('base64');
const TOKEN = ['EAA', 'G7ZC8ZBxyz0123456789', 'abcdefghijklmnopqrstuvwxyz'].join('');
const CTX = { accountId: 'acc-1', credentialType: 'access_token' };

function row(sealed: ReturnType<typeof seal>, over: Record<string, unknown> = {}) {
  const r: any = {
    id: 'cred-1', channel_account_id: 'acc-1', credential_type: 'access_token',
    ciphertext: sealed.ciphertext, iv: sealed.iv, auth_tag: sealed.auth_tag,
    wrapped_data_key: sealed.wrapped_data_key, key_id: sealed.key_id,
    encrypted_at: new Date(sealed.encrypted_at), created_at: new Date(), ...over,
  };
  r.update = jest.fn(async (patch: Record<string, unknown>) => { Object.assign(r, patch); return r; });
  return r;
}

const original = { active: process.env[MASTER_KEY_ENV], previous: process.env[PREVIOUS_KEYS_ENV] };
afterAll(() => {
  if (original.active === undefined) delete process.env[MASTER_KEY_ENV]; else process.env[MASTER_KEY_ENV] = original.active;
  if (original.previous === undefined) delete process.env[PREVIOUS_KEYS_ENV]; else process.env[PREVIOUS_KEYS_ENV] = original.previous;
});

beforeEach(() => { mockFindAll.mockReset(); });

/** Seal under the old key, then switch the environment to mid-rotation. */
function sealedUnderOldKey() {
  process.env[MASTER_KEY_ENV] = KEY_OLD;
  delete process.env[PREVIOUS_KEYS_ENV];
  const sealed = seal(TOKEN, CTX);
  process.env[MASTER_KEY_ENV] = KEY_NEW;
  process.env[PREVIOUS_KEYS_ENV] = `${sealed.key_id}:${KEY_OLD}`;
  return sealed;
}

describe('sweep', () => {
  it('moves a row to the active key and writes ONLY the wrapping', async () => {
    const sealed = sealedUnderOldKey();
    const r = row(sealed);
    mockFindAll.mockResolvedValue([r]);

    const result = await sweep(true);

    expect(result).toMatchObject({ scanned: 1, alreadyCurrent: 0, rewrapped: 1, unreadable: [] });
    const patch = r.update.mock.calls[0][0];
    // The whole guarantee, asserted as a shape: two keys, and neither is secret-bearing.
    expect(Object.keys(patch).sort()).toEqual(['key_id', 'wrapped_data_key']);
    expect(patch.key_id).toBe(activeKeyId());
    expect(r.ciphertext).toBe(sealed.ciphertext);
    expect(r.iv).toBe(sealed.iv);
    expect(r.auth_tag).toBe(sealed.auth_tag);
  });

  it('a dry run reports what it would do and writes nothing', async () => {
    const r = row(sealedUnderOldKey());
    mockFindAll.mockResolvedValue([r]);

    const result = await sweep(false);

    expect(result.rewrapped).toBe(1);
    expect(r.update).not.toHaveBeenCalled();
  });

  it('skips rows already on the active key, so re-running is free', async () => {
    process.env[MASTER_KEY_ENV] = KEY_NEW;
    delete process.env[PREVIOUS_KEYS_ENV];
    const r = row(seal(TOKEN, CTX));
    mockFindAll.mockResolvedValue([r]);

    const result = await sweep(true);

    expect(result).toMatchObject({ alreadyCurrent: 1, rewrapped: 0 });
    expect(r.update).not.toHaveBeenCalled();
  });

  it('names an unmovable row and KEEPS GOING, rather than halting half-rotated', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const movable = row(sealedUnderOldKey());
    // A row sealed under a key nobody has any more.
    const orphan = row({ ...movable, key_id: 'aaaaaaaaaaaaaaaa' } as any, { id: 'cred-orphan', key_id: 'aaaaaaaaaaaaaaaa' });
    mockFindAll.mockResolvedValue([orphan, movable]);

    const result = await sweep(true);

    // Stopping at the orphan would leave the table half-moved with no report of what remains.
    expect(result.rewrapped).toBe(1);
    expect(result.unreadable).toEqual([{ id: 'cred-orphan', channel_account_id: 'acc-1', key_id: 'aaaaaaaaaaaaaaaa' }]);
    expect(movable.update).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('refuses to run at all with no active key, rather than reporting a clean sweep', async () => {
    delete process.env[MASTER_KEY_ENV];
    await expect(sweep(true)).rejects.toThrow(/not set or is malformed/);
    expect(mockFindAll).not.toHaveBeenCalled();
  });
});
