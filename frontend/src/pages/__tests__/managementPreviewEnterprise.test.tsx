import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * W21 (Ali, 2026-11-17): "Create a free account should be in enterprise branding."
 *
 * /try and its create-account pop-up wear the Colaberry Enterprise brand, and never say
 * "free" (site copy rule). What this pins:
 *  1. The page root carries data-brand="enterprise" and the scoped theme is on the page.
 *  2. The header is the Enterprise lockup, not the Training wordmark or the accelerator label.
 *  3. No "free" in the page text, the pop-up text, or any aria-label.
 *  4. Account creation sends name, company, email and the now-required phone (PH1).
 *  5. The theme cannot leak: every rule is scoped to the enterprise shell, and errors stay red.
 */
jest.mock('../../services/orgApi', () => ({
  __esModule: true,
  registerOrg: jest.fn(),
  persistParticipantSession: jest.fn(),
}));
jest.mock('../../components/capability/CompanyMomentumDashboard', () => ({
  __esModule: true,
  default: () => <div data-testid="momentum" />,
}));

/* eslint-disable import/first */
import ManagementPreviewPage from '../ManagementPreviewPage';
import { registerOrg } from '../../services/orgApi';
import { MANAGEMENT_PREVIEW_ENTERPRISE_CSS } from '../managementPreviewEnterpriseStyles';
/* eslint-enable import/first */

const register = registerOrg as jest.Mock;
let host: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
    observe(): void { /* jsdom */ }
    unobserve(): void { /* jsdom */ }
    disconnect(): void { /* jsdom */ }
  };
});

beforeEach(() => {
  register.mockReset();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<ManagementPreviewPage />));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const openPopup = (): void => {
  const btn = Array.from(host.querySelectorAll('button')).find((b) => /Make this real/.test(b.textContent || ''))!;
  act(() => btn.click());
};
const allText = (): string =>
  (host.textContent || '') + ' ' + Array.from(host.querySelectorAll('[aria-label]')).map((e) => e.getAttribute('aria-label')).join(' ');

function type(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('W21: /try in Colaberry Enterprise branding', () => {
  it('marks the shell enterprise and carries the scoped theme', () => {
    const shell = host.querySelector('.te-shell')!;
    expect(shell.getAttribute('data-brand')).toBe('enterprise');
    expect(host.querySelector('style')!.textContent).toContain('.te-shell[data-brand="enterprise"]');
  });

  it('shows the Enterprise lockup, not the Training wordmark or the accelerator label', () => {
    expect(host.querySelector('.cbv2-lockup')).not.toBeNull();
    expect(host.querySelector('.cbv2-lockup__tag')!.textContent).toBe('Enterprise');
    expect(host.querySelector('img[src="/colaberry-horizontal.png"]')).toBeNull();
    expect(host.textContent).not.toContain('Forward Deployed AI Engineer Accelerator');
  });

  it('never says "free", on the page or in the pop-up', () => {
    expect(allText()).not.toMatch(/\bfree\b/i);
    openPopup();
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    expect(allText()).not.toMatch(/\bfree\b/i);
    expect(host.textContent).toContain('Create your account');
  });

  it('still creates the account with the same request', async () => {
    register.mockResolvedValue({ jwt: null, message: 'You already have an account.' });
    openPopup();
    const inputs = host.querySelectorAll<HTMLInputElement>('[role="dialog"] input');
    type(inputs[0], 'Dana Lead');
    type(inputs[1], 'Acme');
    type(inputs[2], 'dana@example.com');
    type(inputs[3], '(214) 555-0100');
    const submit = Array.from(host.querySelectorAll('[role="dialog"] button')).find((b) => b.textContent === 'Create account') as HTMLButtonElement;
    await act(async () => { submit.click(); });
    // PH1: the phone is required; the call/text box was left alone, so no permission is sent.
    expect(register).toHaveBeenCalledWith({
      name: 'Dana Lead', company: 'Acme', email: 'dana@example.com', phone: '(214) 555-0100', phone_consent: false,
    });
    expect(host.textContent).toContain('You already have an account.');
  });
});

describe('W21: the theme is scoped and keeps errors red', () => {
  const css = MANAGEMENT_PREVIEW_ENTERPRISE_CSS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\$\{[^}]*\}/g, '');
  it('scopes every rule except the font face to the enterprise shell', () => {
    const selectors = Array.from(css.matchAll(/([^{}]+)\{/g)).map((m) => m[1].trim()).filter((s) => s && s !== '@font-face');
    expect(selectors.length).toBeGreaterThan(3);
    for (const s of selectors) expect(s.startsWith('.te-shell[data-brand="enterprise"]')).toBe(true);
  });
  it('re-points the accent to the enterprise blue and leaves the danger colour alone', () => {
    expect(css).toMatch(/--brand-accent:#2E6A86/);
    expect(css).toMatch(/--action-bg:#2E6A86/);
    expect(css).not.toMatch(/--status-danger/);
  });
});
