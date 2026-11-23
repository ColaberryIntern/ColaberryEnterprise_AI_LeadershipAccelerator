/**
 * AF12.18 - the scoped-access panel, and the button on the read-only banner that opens it.
 *
 * Two things here are structural rather than cosmetic, and both would regress silently:
 *
 *   1. THE PANEL CONTAINS NO LINK. It exists because the management bridge is refused during
 *      view-as, so a route out of it would be a way around the refusal it is explaining. The
 *      assertion is on anchors and `[href]`, not on labels, for the same reason
 *      `adminLinkViewAs.test.tsx` is: what must not exist is something clickable.
 *   2. THE DIALOG IS NOT INSIDE THE BANNER. The banner is a `role="status"` `aria-live` region.
 *      A dialog rendered inside one is announced as a status update instead of entered as a
 *      dialog, and it would inherit the banner's white centred semibold text.
 *
 * The access RULE is not tested here. It lives in `viewAsAccess.ts` and is tested against an
 * injected sidebar in `pages/portal/__tests__/viewAsAccess.test.ts`, so these assertions stay
 * robust to any ordinary edit of the admin nav.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { ViewAsAccessPanel } from '../ViewAsAccessPanel';
import ReadOnlyBanner from '../ReadOnlyBanner';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tok = (claims: Record<string, unknown>): string => `h.${btoa(JSON.stringify(claims))}.s`;

let authToken: string | null = null;
jest.mock('../../../contexts/ParticipantAuthContext', () => ({
  useParticipantAuth: () => ({ token: authToken }),
}));

let mgmt = { is_mgmt: true, role: 'marketing', label: 'Marketing', sections: ['dashboard', 'campaigns', 'brands', 'agents'], loading: false };
jest.mock('../../../pages/portal/useMgmtStatus', () => ({
  useMgmtStatus: () => ({ ...mgmt, canSection: (s: string) => mgmt.sections.includes(s) }),
}));

/** Sarbjit's real grants: `mgmt_role: marketing` plus the one extra section. */
const SARBJIT = ['dashboard', 'campaigns', 'brands', 'agents'];

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  authToken = null;
  mgmt = { is_mgmt: true, role: 'marketing', label: 'Marketing', sections: [...SARBJIT], loading: false };
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => { act(() => { root.unmount(); }); document.body.removeChild(container); });

async function mount(ui: React.ReactElement) {
  await act(async () => { root = createRoot(container); root.render(ui); });
}
const text = () => container.textContent ?? '';
const q = (sel: string) => container.querySelector(sel);
const all = (sel: string) => Array.from(container.querySelectorAll(sel));

const panel = (over: Partial<React.ComponentProps<typeof ViewAsAccessPanel>> = {}) => (
  <ViewAsAccessPanel
    email="sarbjitsaini83@yahoo.com"
    roleLabel="Marketing"
    sections={SARBJIT}
    isMgmt
    loading={false}
    onClose={over.onClose ?? (() => undefined)}
    {...over}
  />
);

describe('the scoped-access panel', () => {
  it('names whose access it is, and says it was read from their session rather than the admin\'s', async () => {
    await mount(panel());
    expect(text()).toContain('What sarbjitsaini83@yahoo.com can reach in admin');
    expect(text()).toContain('Read from their own session, not yours');
    expect(text()).toContain('it does not open it');
  });

  it('leads with the role and a count, because the role name and the sidebar name differ', async () => {
    // Her role is called "marketing" and the sidebar group gated on `campaigns` is called
    // "Marketing". Printing the role beside what it resolves to is the point of the panel.
    await mount(panel());
    expect(q('[data-testid="va-summary"]')?.textContent).toContain('Role: Marketing');
    expect(q('[data-testid="va-summary"]')?.textContent).toMatch(/of \d+ admin areas/);
  });

  it('shows the sections her badge actually carries', async () => {
    await mount(panel());
    const chips = text();
    for (const s of SARBJIT) expect(chips).toContain(s);
  });

  it('shows something open and something reachable only through a list', async () => {
    await mount(panel());
    expect(all('[data-testid$="-open"]').length).toBeGreaterThan(0);
    expect(all('[data-testid$="-via_list"]').length).toBeGreaterThan(0);
    // The sub-list case has to say what it depends on, or it reads as a grant it is not.
    expect(text()).toContain('only if any of those rows are theirs');
  });

  it('CONTAINS NO LINK: it describes access, it is not a way around the refused bridge', async () => {
    await mount(panel());
    expect(all('a')).toEqual([]);
    expect(q('[href]')).toBeNull();
  });

  it('says the bridge stays closed and what opens it', async () => {
    await mount(panel());
    expect(text()).toContain('Leaving view-as is what opens it');
  });

  it('does not answer before it has read: loading says so instead of saying "no role"', async () => {
    await mount(panel({ loading: true, isMgmt: false, sections: [], roleLabel: null }));
    expect(q('[data-testid="va-loading"]')).not.toBeNull();
    expect(q('[data-testid="va-not-mgmt"]')).toBeNull();
    expect(text()).not.toContain('has no management role');
  });

  it('says plainly when the person has no management role at all', async () => {
    await mount(panel({ loading: false, isMgmt: false, sections: [], roleLabel: null }));
    expect(q('[data-testid="va-not-mgmt"]')).not.toBeNull();
    expect(text()).toContain('has no management role');
  });

  it('falls back to "this member" when the session carries no email', async () => {
    await mount(panel({ email: '' }));
    expect(text()).toContain('What this member can reach in admin');
  });

  it('closes on the button, on the scrim, and on Escape, but not on a click inside it', async () => {
    const onClose = jest.fn();
    await mount(panel({ onClose }));

    await act(async () => { (q('[data-testid="va-close"]') as HTMLButtonElement).click(); });
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => { (q('[data-testid="va-panel"]') as HTMLElement).click(); });
    expect(onClose).toHaveBeenCalledTimes(1); // a click inside must not dismiss it

    await act(async () => { (q('[data-testid="va-scrim"]') as HTMLElement).click(); });
    expect(onClose).toHaveBeenCalledTimes(2);

    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('is a dialog with an accessible name, and focuses its close button on open', async () => {
    await mount(panel());
    const dialog = q('[role="dialog"]');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(q('#va-title')).not.toBeNull();
    expect(dialog?.getAttribute('aria-labelledby')).toBe('va-title');
    expect(document.activeElement).toBe(q('[data-testid="va-close"]'));
  });
});

describe('the read-only banner that opens it', () => {
  it('renders nothing at all outside a read-only session', async () => {
    authToken = tok({ sub: 'member-sub' });
    await mount(<ReadOnlyBanner />);
    expect(text()).toBe('');
    expect(q('[data-testid="ro-see-access"]')).toBeNull();
  });

  it('offers the button in a read-only session, at a label that does not grow with an email', async () => {
    authToken = tok({ sub: 'member-sub', read_only: true, email: 'sarbjitsaini83@yahoo.com' });
    await mount(<ReadOnlyBanner />);
    const btn = q('[data-testid="ro-see-access"]');
    expect(btn?.textContent).toBe('What can they reach?');
    // Still the original explanation of the absence; the button answers the next question.
    expect(text()).toContain('Employee-only tools, including the Management Portal, are hidden');
  });

  it('opens the panel on click, for the person being viewed', async () => {
    authToken = tok({ sub: 'member-sub', read_only: true, email: 'sarbjitsaini83@yahoo.com' });
    await mount(<ReadOnlyBanner />);
    expect(q('[role="dialog"]')).toBeNull(); // not mounted until asked, so no request is made
    await act(async () => { (q('[data-testid="ro-see-access"]') as HTMLButtonElement).click(); });
    expect(q('[role="dialog"]')).not.toBeNull();
    expect(text()).toContain('What sarbjitsaini83@yahoo.com can reach in admin');
  });

  it('renders the dialog OUTSIDE the aria-live banner, not inside it', async () => {
    authToken = tok({ sub: 'member-sub', read_only: true, email: 'x@example.com' });
    await mount(<ReadOnlyBanner />);
    await act(async () => { (q('[data-testid="ro-see-access"]') as HTMLButtonElement).click(); });
    const banner = q('.ro-banner');
    const dialog = q('[role="dialog"]');
    expect(banner).not.toBeNull();
    expect(dialog).not.toBeNull();
    expect(banner?.getAttribute('aria-live')).toBe('polite');
    expect(banner?.contains(dialog as Node)).toBe(false);
  });

  it('closes again from the panel', async () => {
    authToken = tok({ sub: 'member-sub', read_only: true, email: 'x@example.com' });
    await mount(<ReadOnlyBanner />);
    await act(async () => { (q('[data-testid="ro-see-access"]') as HTMLButtonElement).click(); });
    await act(async () => { (q('[data-testid="va-close"]') as HTMLButtonElement).click(); });
    expect(q('[role="dialog"]')).toBeNull();
  });
});
