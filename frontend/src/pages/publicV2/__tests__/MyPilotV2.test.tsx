/**
 * W32: /my-pilot. A client asks for a sign-in link by email, then sees their steps and what is
 * next. An expired link offers a new one.
 */
jest.mock('../../../services/enterpriseIntakeApi', () => ({
  requestClientLink: jest.fn(),
  getClientStatus: jest.fn(),
}));

/* eslint-disable import/first */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import * as api from '../../../services/enterpriseIntakeApi';
import { MyPilotV2 } from '../MyPilotV2';
/* eslint-enable import/first */

const linkMock = api.requestClientLink as jest.Mock;
const statusMock = api.getClientStatus as jest.Mock;

let container: HTMLDivElement;
let root: Root;

async function mount(path: string): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <MyPilotV2 />
      </MemoryRouter>,
    );
  });
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

const q = (s: string) => container.querySelector(s);

async function type(value: string): Promise<void> {
  const input = q('#mp-email') as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function submit(): Promise<void> {
  await act(async () => {
    (q('form') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

describe('asking for a link', () => {
  it('sends the email and says the same thing whether or not we know it', async () => {
    linkMock.mockResolvedValue(undefined);
    await mount('/my-pilot');
    await type('dana@acme.test');
    await submit();
    expect(linkMock).toHaveBeenCalledWith('dana@acme.test');
    expect(q('[data-testid="mp-sent"]')!.textContent).toContain('If we have a pilot request for that email');
  });

  it('does not send a malformed email', async () => {
    await mount('/my-pilot');
    await type('not-an-email');
    await submit();
    expect(linkMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Please enter the email you used');
  });
});

describe('the status', () => {
  it('shows their steps, dated, the options once sent, and what is next', async () => {
    statusMock.mockResolvedValue({
      company: 'Acme Logistics',
      firstName: 'Dana',
      steps: [
        { label: 'You asked for a demo pilot', done: true, at: '2026-11-20T15:00:00Z' },
        { label: 'Your AI interview', done: true, at: '2026-11-20T15:20:00Z' },
        { label: 'Your proposal was sent to you', done: false, at: null },
      ],
      options: ['Order intake agent'],
      next: 'Reply to the options email to pick a time to walk through them.',
      closed: null,
    });
    await mount('/my-pilot/status?token=tok-abc');
    expect(statusMock).toHaveBeenCalledWith('tok-abc');
    const text = q('[data-testid="mp-status"]')!.textContent || '';
    expect(text).toContain('Dana, here is where your pilot for Acme Logistics stands.');
    expect(text).toContain('Nov 20');
    expect(text).toContain('Order intake agent');
    expect(text).toContain('Reply to the options email');
    expect(container.querySelectorAll('.cbv2-mp__steps li.is-done')).toHaveLength(2);
  });

  it('v2: offers the Meet link for an upcoming meeting, and not for one long past', async () => {
    const base = { company: 'Acme', firstName: 'Dana', steps: [], options: [], next: 'Meet Ali on Monday.', closed: null };
    statusMock.mockResolvedValue({ ...base, meeting: { start: '2099-11-23T15:00:00Z', link: 'https://meet.google.com/x' } });
    await mount('/my-pilot/status?token=t1');
    expect((q('[data-testid="my-pilot-meet"]') as HTMLAnchorElement).href).toBe('https://meet.google.com/x');
    act(() => root.unmount());
    container.remove();
    statusMock.mockResolvedValue({ ...base, meeting: { start: '2020-01-01T15:00:00Z', link: 'https://meet.google.com/x' } });
    await mount('/my-pilot/status?token=t2');
    expect(q('[data-testid="my-pilot-meet"]')).toBeNull();
  });

  it('takes the sign-in token out of the address bar once it has read it', async () => {
    statusMock.mockResolvedValue({ company: 'Acme', firstName: 'Dana', steps: [], options: [], next: 'x', closed: null });
    window.history.pushState({}, '', '/my-pilot/status?token=tok-secret');
    try {
      await mount('/my-pilot/status?token=tok-secret');
      expect(statusMock).toHaveBeenCalledWith('tok-secret');
      expect(window.location.search).toBe('');
      expect(window.location.pathname).toBe('/my-pilot/status');
    } finally {
      window.history.pushState({}, '', '/');
    }
  });

  it('offers a new link when the token has expired', async () => {
    statusMock.mockRejectedValue(new Error('401'));
    await mount('/my-pilot/status?token=old');
    expect(container.textContent).toContain('That link has expired');
    expect(q('#mp-email')).not.toBeNull();
  });
});
