import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import ConnectNetworks from '../ConnectNetworks';
import type { ConnectorStatus } from '../../../../services/channelAccountApi';

/**
 * The network list on the Brands page.
 *
 * The property worth holding is BUG-7: whoever is about to press Connect must be able to read who
 * is allowed to press it WITHOUT opening anything. Facebook refuses an unauthorized signer at its
 * own sign-in screen, before any redirect back to us, so no callback arrives and the product gets
 * no second chance to explain. Sohail pressed Connect three times on 13 Nov against a row that
 * said "Ready to connect" and learned nothing from any attempt.
 *
 * So these tests assert the note is OUTSIDE the <details>, not merely present somewhere in the
 * markup. A test that only checked for the text would have passed before the fix.
 */

let container: HTMLDivElement;
let root: Root;

const ACCESS_NOTE = 'Only someone with a role on our Meta app can connect Facebook or Instagram.';

function connector(over: Partial<ConnectorStatus> = {}): ConnectorStatus {
  return {
    key: 'meta',
    label: 'Facebook & Instagram',
    providers: ['meta_facebook_page', 'meta_instagram'],
    configured: true,
    missing_env: [],
    redirect_uri: 'https://enterprise.colaberry.ai/api/marketing/oauth/meta/callback',
    requirements: 'Needs a Meta developer app (Business type) with Facebook Login for Business.',
    access_note: ACCESS_NOTE,
    ...over,
  } as ConnectorStatus;
}

function render(connectors: ConnectorStatus[]) {
  act(() => {
    root.render(
      <ConnectNetworks
        connectors={connectors}
        error={null}
        blockedReason={null}
        busy={false}
        onConnect={() => undefined}
      />,
    );
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => { root = createRoot(container); });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('who is allowed to press Connect (BUG-7)', () => {
  it('shows the access note without the operator opening anything', () => {
    render([connector()]);
    const note = container.querySelector('[data-testid="connector-access-meta"]');
    expect(note).not.toBeNull();
    expect(note!.textContent).toContain('role on our Meta app');
    expect(note!.textContent).toContain('Before you press Connect');
  });

  it('puts the note OUTSIDE the collapsed detail, which is the whole point', () => {
    render([connector()]);
    const note = container.querySelector('[data-testid="connector-access-meta"]')!;
    const details = container.querySelector('[data-testid="connector-setup-meta"]')!;
    expect(details.contains(note)).toBe(false);
    // And the detail really is closed by default, so "present in the DOM" would not have been
    // enough on its own.
    expect((details as HTMLDetailsElement).open).toBe(false);
  });

  it('a configured network with an access note does not claim to be ready to connect', () => {
    render([connector()]);
    const state = container.querySelector('[data-testid="connector-state-meta"]')!;
    expect(state.textContent).toContain('Set up on the server');
    expect(state.textContent).not.toContain('Ready to connect');
  });

  it('a configured network with no access note still reads as ready, and shows no note', () => {
    render([connector({ key: 'tiktok', label: 'TikTok', access_note: null })]);
    expect(container.querySelector('[data-testid="connector-state-tiktok"]')!.textContent)
      .toContain('Ready to connect');
    expect(container.querySelector('[data-testid="connector-access-tiktok"]')).toBeNull();
  });

  it('the note shows even when the server is not set up, because it is about the person', () => {
    render([connector({ configured: false, missing_env: ['META_APP_SECRET'] })]);
    expect(container.querySelector('[data-testid="connector-access-meta"]')).not.toBeNull();
    // No Connect button to press yet, but the precondition is still worth knowing now.
    expect(container.querySelector('[data-testid="connect-meta"]')).toBeNull();
  });
});
