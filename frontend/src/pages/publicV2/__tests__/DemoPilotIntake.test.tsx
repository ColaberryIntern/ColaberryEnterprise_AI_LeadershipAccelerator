/**
 * W28 + v2 (Ali, 2026-11-20 and 2026-11-21): after the form, their own time figure, what the
 * AI interview is FOR (against a 20-30 minute call with everyone), the AI interview now or
 * later, the meeting with Ali booked in the same visit, their own research files, and the
 * interview itself by phone or typed.
 */
jest.mock('../../../services/enterpriseIntakeApi', () => ({
  getIntakeStatus: jest.fn(),
  interviewTurn: jest.fn(),
  requestCall: jest.fn(),
  setInterviewPlan: jest.fn(),
  getMeetingSlots: jest.fn(),
  bookMeeting: jest.fn(),
  uploadResearchFile: jest.fn(),
  errorText: (_e: unknown, fallback: string) => fallback,
}));

/* eslint-disable import/first */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import * as api from '../../../services/enterpriseIntakeApi';
import { MemoryRouter } from 'react-router-dom';
import DemoPilotIntake, { resumeStage } from '../DemoPilotIntake';
/* eslint-enable import/first */

const statusMock = api.getIntakeStatus as jest.Mock;
const turnMock = api.interviewTurn as jest.Mock;
const callMock = api.requestCall as jest.Mock;
const planMock = api.setInterviewPlan as jest.Mock;
const slotsMock = api.getMeetingSlots as jest.Mock;
const bookMock = api.bookMeeting as jest.Mock;
const uploadMock = api.uploadResearchFile as jest.Mock;

const STATUS = {
  status: 'form',
  interviewed: false,
  call: 'none',
  callAvailable: true,
  company: 'Acme Logistics',
  peopleCount: 4,
  hoursPerWeek: 20,
  interviewMode: null,
  interviewScheduledFor: null,
  interviewVia: null,
  meeting: null,
  earliestMeeting: '2026-11-23T06:00:00.000Z',
  files: [],
};
const MEETING = { start: '2026-11-23T15:00:00.000Z', end: '2026-11-23T15:30:00.000Z', link: 'https://meet.google.com/x' };
const SLOTS = {
  earliest: '2026-11-23T06:00:00.000Z',
  timezone: 'America/Chicago',
  dates: [
    { date: '2026-11-23', slots: [{ start: '2026-11-23T15:00:00.000Z', end: '2026-11-23T15:30:00.000Z' }, { start: '2026-11-23T16:00:00.000Z', end: '2026-11-23T16:30:00.000Z' }] },
    { date: '2026-11-24', slots: [{ start: '2026-11-24T15:00:00.000Z', end: '2026-11-24T15:30:00.000Z' }] },
  ],
};

let container: HTMLDivElement;
let root: Root;

async function mount(): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter>
        <DemoPilotIntake token="tok-1" phone="214 555 0100" />
      </MemoryRouter>,
    );
  });
}

const q = (s: string): HTMLElement | null => container.querySelector(s);
const buttons = (): HTMLButtonElement[] => Array.from(container.querySelectorAll('button'));
const press = async (match: string | RegExp): Promise<void> => {
  const b = buttons().find((x) => (typeof match === 'string' ? (x.textContent || '').trim() === match : match.test(x.textContent || '')));
  if (!b) throw new Error(`no button ${match}: ${buttons().map((x) => x.textContent).join(' | ')}`);
  await act(async () => {
    b.click();
  });
};
const typeInto = async (el: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<void> => {
  await act(async () => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

beforeEach(() => {
  statusMock.mockResolvedValue(STATUS);
  slotsMock.mockResolvedValue(SLOTS);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

describe('what the AI interview is for', () => {
  it('shows their own hours a year, and the purpose of the interview', async () => {
    await mount();
    const save = q('[data-testid="intake-savings"]')!.textContent || '';
    expect(save).toContain('1,040 hours a year');
    expect(save).toContain('4 people, 20 hours a week');
    expect(q('[data-testid="intake-purpose"]')!.textContent).toContain('What the 10-minute AI interview is for');
  });

  it('compares a 20-30 minute call with everyone against 10 minutes with one person, and recalculates', async () => {
    await mount();
    expect(q('[data-testid="compare-human"]')!.textContent).toBe('80 to 120 minutes');
    expect(q('[data-testid="compare-ai"]')!.textContent).toBe('10 minutes');
    expect(q('[data-testid="compare-times"]')!.textContent).toContain('12 times less');
    await act(async () => {
      (container.querySelector('button[aria-label="One more person"]') as HTMLButtonElement).click();
    });
    expect(q('[data-testid="compare-people"]')!.textContent).toBe('5');
    expect(q('[data-testid="compare-human"]')!.textContent).toBe('100 to 150 minutes');
    expect(q('[data-testid="compare-times"]')!.textContent).toContain('15 times less');
  });

  it('shows the four steps, our research and the ROI-ranked options among them', async () => {
    await mount();
    const path = q('[data-testid="intake-path"]')!.textContent || '';
    expect(path).toContain('Your AI interview, 10 minutes');
    expect(path).toContain('Your own research, if you have it');
    expect(path).toContain('ranked by potential return');
    expect(path).toContain('Meet with Ali, 30 minutes');
  });

  it('shows no hours figure when they gave no hours, rather than inventing one', async () => {
    statusMock.mockResolvedValue({ ...STATUS, hoursPerWeek: null, peopleCount: null });
    await mount();
    expect(q('[data-testid="intake-savings"]')).toBeNull();
  });
});

describe('now: plan, book, then the interview', () => {
  it('saves "now", books a slot from Ali\'s calendar, then opens the interview', async () => {
    planMock.mockResolvedValue({ mode: 'now', at: null, via: 'chat' });
    await mount();
    statusMock.mockResolvedValue({ ...STATUS, interviewMode: 'now' });
    await press(/^Now/);
    expect(planMock).toHaveBeenCalledWith('tok-1', { mode: 'now' });
    expect(q('[data-testid="meeting-picker"]')).not.toBeNull();
    expect(slotsMock).toHaveBeenCalledWith('tok-1');

    const times = Array.from(container.querySelectorAll('[role="radio"]')) as HTMLButtonElement[];
    expect(times).toHaveLength(2);
    await act(async () => times[0].click());
    bookMock.mockResolvedValue({ status: 'booked', meeting: MEETING });
    statusMock.mockResolvedValue({ ...STATUS, interviewMode: 'now', meeting: MEETING });
    await press(/^Book /);
    expect(bookMock).toHaveBeenCalledWith('tok-1', '2026-11-23T15:00:00.000Z');
    expect(q('[data-testid="interview-runner"]')).not.toBeNull();
    expect(buttons().map((b) => b.textContent)).toEqual(expect.arrayContaining(['Call me now', 'Type it instead']));
  });

  it('booking with no time chosen says what is needed, and choosing one clears it', async () => {
    statusMock.mockResolvedValue({ ...STATUS, interviewMode: 'now' });
    await mount();
    await press('Book this meeting');
    expect(bookMock).not.toHaveBeenCalled();
    expect(q('[role="alert"]')?.textContent).toBe('Choose one of the times above first.');
    await act(async () => (container.querySelector('[role="radio"]') as HTMLButtonElement).click());
    expect(q('[role="alert"]')).toBeNull();
  });

  it('a calendar failure says so and offers a retry', async () => {
    slotsMock.mockRejectedValue(new Error('503'));
    statusMock.mockResolvedValue({ ...STATUS, interviewMode: 'now' });
    await mount();
    expect(container.textContent).toContain('We could not load the calendar');
    expect(buttons().some((b) => b.textContent === 'Try again')).toBe(true);
  });
});

describe('later: pick a time, book, done', () => {
  it('needs a time, saves it, then the meeting, then a summary with both', async () => {
    planMock.mockResolvedValue({ mode: 'later', at: '2026-11-22T16:00:00.000Z', via: 'chat' });
    await mount();
    await press(/^Later/);
    expect(q('[data-testid="interview-later"]')).not.toBeNull();
    const input = container.querySelector('#dpi-later-at') as HTMLInputElement;
    await typeInto(input, '');
    await press('Schedule my AI interview');
    expect(container.textContent).toContain('Pick a day and time');
    expect(planMock).not.toHaveBeenCalled();

    await typeInto(input, '2026-11-22T10:00');
    statusMock.mockResolvedValue({ ...STATUS, interviewMode: 'later', interviewScheduledFor: '2026-11-22T16:00:00.000Z' });
    await press('Schedule my AI interview');
    expect(planMock).toHaveBeenCalledWith('tok-1', expect.objectContaining({ mode: 'later', via: 'chat' }));
    expect(q('[data-testid="meeting-picker"]')).not.toBeNull();

    await act(async () => (container.querySelector('[role="radio"]') as HTMLButtonElement).click());
    bookMock.mockResolvedValue({ status: 'booked', meeting: MEETING });
    statusMock.mockResolvedValue({ ...STATUS, interviewMode: 'later', interviewScheduledFor: '2026-11-22T16:00:00.000Z', meeting: MEETING });
    await press(/^Book /);
    expect(q('[data-testid="done-interview"]')!.textContent).toContain('We will email you the link then');
    expect(q('[data-testid="done-meeting"]')!.textContent).toContain('30 minutes on Google Meet');
    expect(buttons().some((b) => b.textContent === 'Do my AI interview now instead')).toBe(true);
  });

  it('offers a call at that time only when calls are available', async () => {
    await mount();
    await press(/^Later/);
    expect(container.textContent).toContain('Our AI calls me then');
    act(() => root.unmount());
    container.remove();
    statusMock.mockResolvedValue({ ...STATUS, callAvailable: false });
    await mount();
    await press(/^Later/);
    expect(container.textContent).not.toContain('Our AI calls me then');
  });
});

describe('their own research', () => {
  it('refuses a wrong type before uploading, and lists what was shared', async () => {
    await mount();
    const input = container.querySelector('#dpi-file') as HTMLInputElement;
    const pick = async (file: File) => {
      await act(async () => {
        Object.defineProperty(input, 'files', { value: [file], configurable: true });
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
    };
    await pick(new File(['MZ'], 'tool.exe'));
    expect(container.textContent).toContain('Share a PDF, Word, PowerPoint or text file.');
    expect(uploadMock).not.toHaveBeenCalled();
    uploadMock.mockResolvedValue({ files: [{ name: 'plan.pdf', size: 2048 }] });
    await pick(new File(['%PDF-1.7'], 'plan.pdf'));
    expect(uploadMock).toHaveBeenCalledWith('tok-1', expect.any(File));
    expect(q('[data-testid="research-files"]')!.textContent).toContain('plan.pdf');
  });
});

describe('the interview (unchanged behavior)', () => {
  beforeEach(() => statusMock.mockResolvedValue({ ...STATUS, interviewMode: 'now', meeting: MEETING }));

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

  it('typed: sends each answer with the whole conversation, then shows the summary', async () => {
    turnMock
      .mockResolvedValueOnce({ done: false, message: 'Which system holds the orders?' })
      .mockResolvedValueOnce({ done: true, message: 'Thanks.', understood: true });
    await mount();
    await press('Type it instead');
    expect(turnMock).toHaveBeenLastCalledWith('tok-1', []);
    await typeInto(q('#dpi-reply') as HTMLTextAreaElement, 'Our TMS, McLeod.');
    statusMock.mockResolvedValue({ ...STATUS, interviewMode: 'now', meeting: MEETING, interviewed: true, status: 'interviewed', call: 'done' });
    await press('Send');
    expect(turnMock).toHaveBeenLastCalledWith('tok-1', [
      { role: 'assistant', text: 'Which system holds the orders?' },
      { role: 'user', text: 'Our TMS, McLeod.' },
    ]);
    expect(q('[data-testid="done-interview"]')!.textContent).toContain('We are researching your company');
  });
});

describe('resumeStage (a reload, or the link we email)', () => {
  const now = new Date('2026-11-22T12:00:00Z');
  const s = (over: Record<string, unknown>) => ({ ...STATUS, ...over }) as never;
  it.each([
    ['no plan yet', {}, 'plan'],
    ['planned, not booked', { interviewMode: 'later' }, 'meeting'],
    ['now and booked', { interviewMode: 'now', meeting: MEETING }, 'interview'],
    ['later, booked, before the time', { interviewMode: 'later', interviewScheduledFor: '2026-11-23T12:00:00Z', meeting: MEETING }, 'done'],
    ['later, booked, the time has come', { interviewMode: 'later', interviewScheduledFor: '2026-11-22T12:10:00Z', meeting: MEETING }, 'interview'],
    ['interviewed, not booked', { interviewed: true }, 'meeting'],
    ['interviewed and booked', { interviewed: true, meeting: MEETING }, 'done'],
    ['a call in progress', { call: 'in_progress' }, 'interview'],
  ])('%s', (_l, over, want) => expect(resumeStage(s(over), now)).toBe(want));
});
