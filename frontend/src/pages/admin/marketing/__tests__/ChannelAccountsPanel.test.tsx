import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import ChannelAccountsPanel from '../ChannelAccountsPanel';
import type { ChannelAccount, VaultStatus } from '../../../../services/channelAccountApi';

/**
 * ChannelAccountsPanel — the honest-empty-state rule.
 *
 * "No accounts connected" has three causes with three different owners, and the panel's job is
 * to say which one you are looking at. A surface that rendered all three identically would be
 * the "0 that is really unavailable" failure this workstream exists to stop, one layer up.
 */

let container: HTMLDivElement;
let root: Root;

const VAULT_OK: VaultStatus = { vault_available: true, active_key_id: 'a9f2c913df59c9d1', credentials_needing_rewrap: 0, reason: null };
const VAULT_OFF: VaultStatus = {
  vault_available: false, active_key_id: null, credentials_needing_rewrap: 0,
  reason: 'The credential store is not configured on this server (SOCIAL_CREDENTIAL_MASTER_KEY). Publishing stays in handoff mode.',
};

function account(over: Partial<ChannelAccount> = {}): ChannelAccount {
  return {
    id: 'acc-1', tenant_id: 't-1', brand_id: 'b-1', owner_member_id: null,
    provider: 'linkedin_organization', provider_account_id: '98765', display_name: 'Colaberry',
    handle: '@colaberry', avatar_url: null, status: 'connected',
    granted_scopes: ['w_organization_social'], missing_scopes: [],
    connected_at: '2026-09-13T12:00:00.000Z', last_health_check_at: null, last_health_ok: null,
    last_health_error_class: null, revoked_at: null,
    credentials: [{ credential_type: 'access_token', token_expires_at: '2026-12-01T00:00:00.000Z', rotated_at: null, key_id: 'a9f2c913df59c9d1', expired: false }],
    ...over,
  };
}

function render(props: Partial<React.ComponentProps<typeof ChannelAccountsPanel>> = {}) {
  act(() => {
    root.render(
      <ChannelAccountsPanel
        loading={false} error={null} vault={VAULT_OK} accounts={[]} brandId="b-1" busy={false}
        onConnect={() => {}} onRevoke={() => {}} onRetry={() => {}}
        {...props}
      />,
    );
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

describe('the three causes of an empty list are distinguishable', () => {
  it('CANNOT connect: says why, and the button is disabled rather than absent or failing', () => {
    render({ vault: VAULT_OFF });
    const banner = container.querySelector('[data-testid="vault-unavailable"]')!;
    expect(banner).not.toBeNull();
    expect(banner.textContent).toMatch(/SOCIAL_CREDENTIAL_MASTER_KEY/);
    // The operator is told what the product does instead, not left to infer it is broken.
    expect(banner.textContent).toMatch(/handoff mode/);
    const button = container.querySelector('[data-testid="connect-account"]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(container.querySelector('[data-testid="no-accounts"]')!.textContent)
      .toMatch(/none can be until the credential store is configured/);
  });

  it('CAN connect, nothing connected yet: the button is real', () => {
    render();
    expect(container.querySelector('[data-testid="vault-unavailable"]')).toBeNull();
    const button = container.querySelector('[data-testid="connect-account"]') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(container.querySelector('[data-testid="no-accounts"]')!.textContent)
      .toMatch(/No accounts are connected for this brand yet/);
  });

  it('connected but unreadable: shown as needing reconnection, never hidden or counted as fine', () => {
    render({ accounts: [account({ status: 'needs_reconnect', last_health_error_class: 'CredentialTampered' })] });
    const row = container.querySelector('[data-testid="account-acc-1"]')!;
    expect(row.textContent).toMatch(/Needs reconnecting/);
    expect(row.textContent).toMatch(/CredentialTampered/);
  });
});

describe('status an operator can act on', () => {
  it('flags an expired token as the reason publishing will fail', () => {
    render({ accounts: [account({ credentials: [{ credential_type: 'access_token', token_expires_at: '2020-01-01T00:00:00.000Z', rotated_at: null, key_id: 'k', expired: true }] })] });
    const row = container.querySelector('[data-testid="account-acc-1"]')!;
    expect(row.textContent).toMatch(/Token expired/);
    expect(row.textContent).toMatch(/Expired/);
  });

  it('says "No token stored" rather than implying an account is ready', () => {
    render({ accounts: [account({ credentials: [] })] });
    expect(container.querySelector('[data-testid="account-acc-1"]')!.textContent).toMatch(/No token stored/);
  });

  it('names missing permissions instead of hiding them until publish time', () => {
    render({ accounts: [account({ missing_scopes: ['r_organization_social'] })] });
    expect(container.querySelector('[data-testid="missing-scopes-acc-1"]')!.textContent)
      .toMatch(/Missing: r_organization_social/);
  });

  it('a healthy account reads as connected with its expiry', () => {
    render({ accounts: [account()] });
    const row = container.querySelector('[data-testid="account-acc-1"]')!;
    expect(row.textContent).toMatch(/Connected/);
    expect(row.textContent).toMatch(/Expires/);
    expect(row.textContent).toMatch(/LinkedIn Page/);
  });

  it('a disconnected account keeps its row but offers no disconnect', () => {
    // The row survives because published history points at it; what does not survive is the token.
    render({ accounts: [account({ status: 'revoked', revoked_at: '2026-09-13T12:00:00.000Z', credentials: [] })] });
    expect(container.querySelector('[data-testid="account-acc-1"]')!.textContent).toMatch(/Disconnected/);
    expect(container.querySelector('[data-testid="revoke-acc-1"]')).toBeNull();
  });
});

describe('rotation and interaction', () => {
  it('surfaces credentials still on an old master key, so a rotation is not left half-done', () => {
    render({ vault: { ...VAULT_OK, credentials_needing_rewrap: 3 } });
    expect(container.querySelector('[data-testid="rewrap-pending"]')!.textContent).toMatch(/3 stored credentials/);
  });

  it('passes the account id to disconnect, and disables while busy', () => {
    const onRevoke = jest.fn();
    render({ accounts: [account()], onRevoke });
    act(() => { (container.querySelector('[data-testid="revoke-acc-1"]') as HTMLButtonElement).click(); });
    expect(onRevoke).toHaveBeenCalledWith('acc-1');

    render({ accounts: [account()], onRevoke, busy: true });
    expect((container.querySelector('[data-testid="revoke-acc-1"]') as HTMLButtonElement).disabled).toBe(true);
  });


  it('a THIRD reason - the sign-in flow is not built - reads differently from a missing vault', () => {
    // Two different owners, two different fixes. Collapsing them would send an operator to
    // configure a server when the real gap is a feature nobody has written yet.
    render({ connectDisabledReason: 'Connecting needs the provider sign-in flow, which is not built yet.' });
    expect(container.querySelector('[data-testid="vault-unavailable"]')).toBeNull();
    expect(container.querySelector('[data-testid="connect-disabled-reason"]')!.textContent)
      .toMatch(/sign-in flow, which is not built yet/);
    expect((container.querySelector('[data-testid="connect-account"]') as HTMLButtonElement).disabled).toBe(true);
  });
  it('tells the operator to pick a brand rather than silently disabling connect', () => {
    render({ brandId: null });
    expect((container.querySelector('[data-testid="connect-account"]') as HTMLButtonElement).disabled).toBe(true);
    expect(container.textContent).toMatch(/Choose a brand first/);
  });

  it('offers a retry on error instead of an empty panel', () => {
    const onRetry = jest.fn();
    render({ error: 'Could not load accounts.', onRetry });
    expect(container.textContent).toMatch(/Could not load accounts/);
    act(() => { (container.querySelector('button') as HTMLButtonElement).click(); });
    expect(onRetry).toHaveBeenCalled();
  });
});
