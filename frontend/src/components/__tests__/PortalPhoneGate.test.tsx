import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../utils/portalApi', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn() },
}));
jest.mock('../../utils/participantToken', () => ({
  isReadOnlyParticipantSession: jest.fn(() => false),
}));

/* eslint-disable import/first */
import portalApi from '../../utils/portalApi';
import { isReadOnlyParticipantSession } from '../../utils/participantToken';
import PortalPhoneGate from '../PortalPhoneGate';
import { PHONE_CONSENT_TEXT } from '../../config/consentText';
/* eslint-enable import/first */

/**
 * PH1 (Ali, 2026-11-19): a signed-in portal user with no phone on file must add one before any
 * portal page renders. No skip. The call/text permission beside it stays optional.
 */

const get = portalApi.get as jest.Mock;
const put = portalApi.put as jest.Mock;
const readOnly = isReadOnlyParticipantSession as jest.Mock;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  jest.clearAllMocks();
  readOnly.mockReturnValue(false);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const mount = async () => {
  await act(async () => {
    root.render(<PortalPhoneGate><div data-testid="page">The portal page</div></PortalPhoneGate>);
  });
  await act(async () => { await Promise.resolve(); });
};

function type(el: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

const page = () => host.querySelector('[data-testid="page"]');
const gate = () => host.querySelector('[data-testid="portal-phone-gate"]');

it('SHOWS the gate, and not the page, for a user with no phone on file', async () => {
  get.mockResolvedValue({ data: { has_phone: false, required: true } });
  await mount();
  expect(gate()).not.toBeNull();
  expect(page()).toBeNull();
  // No skip: there is no other button than the save.
  expect(host.querySelectorAll('button')).toHaveLength(1);
});

it('does NOT show the gate for a user who has a phone', async () => {
  get.mockResolvedValue({ data: { has_phone: true, required: false } });
  await mount();
  expect(gate()).toBeNull();
  expect(page()).not.toBeNull();
});

it('never asks in a read-only "View as" tab, and never calls the server for it', async () => {
  readOnly.mockReturnValue(true);
  await mount();
  expect(get).not.toHaveBeenCalled();
  expect(page()).not.toBeNull();
});

it('fails OPEN when the check itself fails, so an outage cannot lock students out', async () => {
  get.mockRejectedValue(new Error('down'));
  await mount();
  expect(page()).not.toBeNull();
});

it('shows the optional call/text box unticked, and saves with no permission when left alone', async () => {
  get.mockResolvedValue({ data: { has_phone: false, required: true } });
  put.mockResolvedValue({ data: { has_phone: true } });
  await mount();

  const box = host.querySelector<HTMLInputElement>('#pg-phone-consent')!;
  expect(box.checked).toBe(false);
  expect(box.required).toBe(false);
  expect(host.textContent).toContain(PHONE_CONSENT_TEXT);

  await act(async () => { type(host.querySelector<HTMLInputElement>('#pg-phone')!, '(214) 555-0100'); });
  await act(async () => {
    host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await act(async () => { await Promise.resolve(); });

  expect(put).toHaveBeenCalledWith('/api/portal/phone', { phone: '(214) 555-0100', phone_consent: false });
  expect(page()).not.toBeNull();
});

it('refuses a number without an area code, without calling the server', async () => {
  get.mockResolvedValue({ data: { has_phone: false, required: true } });
  await mount();
  await act(async () => { type(host.querySelector<HTMLInputElement>('#pg-phone')!, '555-0100'); });
  await act(async () => {
    host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  expect(put).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]')!.textContent).toMatch(/area code/i);
  expect(page()).toBeNull();
});
