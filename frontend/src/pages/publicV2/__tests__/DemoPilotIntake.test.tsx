/**
 * W28 (Ali, 2026-11-20): after the form, their own time figure, then a 10-minute AI
 * interview by phone or typed. Q2 A: the figure is built from THEIR numbers.
 */
jest.mock('../../../services/enterpriseIntakeApi', () => ({
  getIntakeStatus: jest.fn(),
  interviewTurn: jest.fn(),
  requestCall: jest.fn(),
}));

/* eslint-disable import/first */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import * as api from '../../../services/enterpriseIntakeApi';
import DemoPilotIntake from '../DemoPilotIntake';
/* eslint-enable import/first */

const statusMock = api.getIntakeStatus as jest.Mock;
const turnMock = api.interviewTurn as jest.Mock;
const callMock = api.requestCall as jest.Mock;

const STATUS = {
  status: 'form',
  interviewed: false,
  call: 'none',
  callAvailable: true,
  company: 'Acme Logistics',
  peopleCount: 4,
  hoursPerWeek: 20,
};

let container: HTMLDivElement;
let root: Root;

async function mount(): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<DemoPilotIntake token="tok-1" phone="214 555 0100" />);
  });
}

const q = (s: string): HTMLElement | null => container.querySelector(s);
const buttons = (): HTMLButtonElement[] => Array.from(container.querySelectorAll('button'));
const press = async (label: string): Promise<void> => {
  const b = buttons().find((x) => x.textContent === label);
  if (!b) throw new Error(`no button ${label}: ${buttons().map((x) => x.textContent).join(', ')}`);
  await act(async () => {
    b.click();
  });
};

beforeEach(() => {
  statusMock.mockResolvedValue(STATUS);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

describe('the time figure', () => {
  it('shows their own hours a year, from their hours a week', async () => {
    await mount();
    const save = q('[data-testid="intake-savings"]')!.textContent || '';
    expect(save).toContain('1,040 hours a year');
    expect(save).toContain('4 people, 20 hours a week');
    expect(save).toContain('10 minutes now replaces our discovery meeting');
  });

  it('shows no figure when they gave no hours, rather than inventing one', async () => {
    statusMock.mockResolvedValue({ ...STATUS, hoursPerWeek: null, peopleCount: null });
    await mount();
    expect(q('[data-testid="intake-savings"]')!.textContent).not.toMatch(/hours a year/);
  });
});

describe('call or type', () => {
  it('offers the call when it is available, and says the caller is an AI', async () => {
    await mount();
    expect(buttons().map((b) => b.textContent)).toEqual(['Call me now', 'Type it instead']);
    expect(container.textContent).toContain('The call comes from our AI');
  });

  it('offers only typing when no call is available', async () => {
    statusMock.mockResolvedValue({ ...STATUS, callAvailable: false });
    await mount();
    expect(buttons().map((b) => b.textContent)).toEqual(['Start the interview']);
  });

  it('places the call and says so', async () => {
    callMock.mockResolvedValue({ status: 'calling', callId: 'call_9' });
    await mount();
    await press('Call me now');
    expect(callMock).toHaveBeenCalledWith('tok-1');
    expect(container.textContent).toContain('Calling you now at 214 555 0100');
  });

  it('falls back to typing when the call cannot be placed', async () => {
    callMock.mockResolvedValue({ status: 'unavailable', reason: 'voice_not_configured' });
    await mount();
    await press('Call me now');
    expect(container.textContent).toContain('Typing takes the same 10 minutes');
  });
});

describe('the typed interview', () => {
  it('opens with the AI, sends each answer with the whole conversation, and ends on the next steps', async () => {
    turnMock
      .mockResolvedValueOnce({ done: false, message: 'Which system holds the orders?' })
      .mockResolvedValueOnce({ done: true, message: 'Thanks, that is what we needed.', understood: true });
    await mount();
    await press('Type it instead');
    expect(turnMock).toHaveBeenLastCalledWith('tok-1', []);
    expect(q('[data-testid="intake-chat-log"]')!.textContent).toContain('Which system holds the orders?');

    const box = q('#dpi-reply') as HTMLTextAreaElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
      setter.call(box, 'Our TMS, McLeod.');
      box.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await press('Send');
    expect(turnMock).toHaveBeenLastCalledWith('tok-1', [
      { role: 'assistant', text: 'Which system holds the orders?' },
      { role: 'user', text: 'Our TMS, McLeod.' },
    ]);
    const done = q('[data-testid="intake-done"]')!.textContent || '';
    expect(done).toContain('We research Acme Logistics');
    expect(done).toContain('first meeting that starts with your options');
  });
});

describe('a returning visitor', () => {
  it('goes straight to the next steps once the interview is done', async () => {
    statusMock.mockResolvedValue({ ...STATUS, status: 'interviewed', interviewed: true, call: 'done' });
    await mount();
    expect(q('[data-testid="intake-done"]')).not.toBeNull();
    expect(q('[data-testid="intake-savings"]')).toBeNull();
  });
});
