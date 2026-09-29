import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import ConnectionBanner from '../ConnectionBanner';
import type { ChannelAccount } from '../../../../services/channelAccountApi';

/**
 * The banner that follows you around the Marketing tab.
 *
 * The property worth holding: hiding it hides THIS problem, for this browser session, and the
 * next problem brings it straight back. A banner that can be dismissed permanently is a banner
 * that stops working the week after someone clicks it.
 */

let container: HTMLDivElement;
let root: Root;

const NOW = new Date('2026-11-01T15:00:00Z');
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();
const BRANDS = new Map([['b-1', 'Refactored.ai'], ['b-2', 'Colaberry Training']]);

function account(over: Partial<ChannelAccount> = {}): ChannelAccount {
  return {
    id: 'acc-1', tenant_id: 't-1', brand_id: 'b-1', owner_member_id: null,
    provider: 'linkedin_member', provider_account_id: 'p-1', display_name: 'Ali Muwwakkil',
    handle: null, avatar_url: null, status: 'connected', granted_scopes: [], missing_scopes: [],
    connected_at: inDays(-60), last_health_check_at: null, last_health_ok: null,
    last_health_error_class: null, revoked_at: null, credentials: [],
    health: 'ok', usable_until: inDays(90),
    ...over,
  } as ChannelAccount;
}

function render(accounts: ChannelAccount[]) {
  act(() => {
    root.render(
      <MemoryRouter>
        <ConnectionBanner accounts={accounts} brandNames={BRANDS} now={NOW} />
      </MemoryRouter>,
    );
  });
}

/**
 * The next page load. Dismissal must survive through sessionStorage, not through the component
 * keeping its own state - re-rendering the same instance would prove nothing about either.
 */
function remount(accounts: ChannelAccount[]) {
  act(() => { root.unmount(); });
  container.remove();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  render(accounts);
}

const banner = () => container.querySelector('[data-testid="connection-banner"]');
const click = (testId: string) => act(() => { (container.querySelector(`[data-testid="${testId}"]`) as HTMLElement).click(); });

beforeEach(() => {
  window.sessionStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

describe('when it appears at all', () => {
  it('stays silent when every connection is healthy', () => {
    render([account()]);
    expect(banner()).toBeNull();
  });

  it('shows red for a connection that is failing now, and names it with its brand', () => {
    render([account({ health: 'expired', usable_until: inDays(-2) })]);
    expect(banner()!.getAttribute('data-severity')).toBe('failing');
    expect(banner()!.textContent).toContain('LinkedIn on Refactored.ai');
    expect(banner()!.textContent).toMatch(/Posts to it will fail/);
  });

  it('shows amber, with the date, for one that is about to expire', () => {
    // The real case: Ali's LinkedIn dies on 15 Nov 2026.
    render([account({ health: 'expiring', usable_until: '2026-11-16T01:50:34.000Z' })]);
    expect(banner()!.getAttribute('data-severity')).toBe('expiring');
    expect(banner()!.textContent).toContain('Nov 15, 2026');
  });

  it('always offers the way to fix it', () => {
    render([account({ health: 'expired' })]);
    expect(container.querySelector('[data-testid="connection-banner-fix"]')!.getAttribute('href'))
      .toBe('/admin/marketing/brands');
  });
});

describe('hiding it hides THIS problem only', () => {
  it('hides on click, and stays hidden while nothing changes', () => {
    render([account({ health: 'expired' })]);
    click('connection-banner-dismiss');
    expect(banner()).toBeNull();
    remount([account({ health: 'expired' })]);
    expect(banner()).toBeNull();
  });

  it('comes back when a DIFFERENT connection breaks', () => {
    render([account({ id: 'a', health: 'expired' })]);
    click('connection-banner-dismiss');
    expect(banner()).toBeNull();

    remount([
      account({ id: 'a', health: 'expired' }),
      account({ id: 'b', health: 'unhealthy', provider: 'meta_facebook_page', brand_id: 'b-2' }),
    ]);
    expect(banner()).not.toBeNull();
    expect(banner()!.textContent).toMatch(/^2 connections are not working/);
  });

  it('comes back when a warning turns into a failure', () => {
    render([account({ health: 'expiring', usable_until: inDays(3) })]);
    click('connection-banner-dismiss');
    expect(banner()).toBeNull();

    remount([account({ health: 'expired' })]);
    expect(banner()).not.toBeNull();
  });

  it('a browser that refuses session storage shows it again rather than crashing', () => {
    const spy = jest.spyOn(window.sessionStorage.__proto__, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    render([account({ health: 'expired' })]);
    expect(() => click('connection-banner-dismiss')).not.toThrow();
    // Nothing was stored, so the next page shows it again. Warned twice is the acceptable
    // failure here; not warned is not.
    remount([account({ health: 'expired' })]);
    expect(banner()).not.toBeNull();
    spy.mockRestore();
  });
});
