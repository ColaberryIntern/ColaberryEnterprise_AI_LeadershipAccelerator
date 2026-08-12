/**
 * ProjectWizard — the intake interview.
 *
 * These lock down the two defects the wizard shipped with: step 2 asked three
 * hardcoded questions pre-filled with a support-inbox example (so a student
 * building anything else was asked about their Zendesk), and step 3 rendered a
 * fabricated "generated plan" that no generator had produced.
 *
 * Uses the `createRoot` + `act` pattern already proven in this repo
 * (today/__tests__/TodayPlan.smoke.test.tsx) — this frontend has no
 * `@testing-library/*` dependency and adding one for a test would be a
 * drive-by install.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { fetchIntakeQuestions } from '../../../../services/sbpApi';

jest.mock('../../../../services/sbpApi', () => ({
  fetchIntakeQuestions: jest.fn(),
}));

jest.mock('../../useIsExplorer', () => ({ useIsExplorer: () => false }));

import ProjectWizard from '../ProjectWizard';

// React 18 wants this to treat `act` as a real act scope; this repo has no
// setupTests file, so it is set here rather than changing global test config.
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mockQuestions = fetchIntakeQuestions as unknown as jest.Mock;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  document.body.removeChild(container);
});

async function mount(ui: React.ReactElement) {
  await act(async () => {
    root = createRoot(container);
    root.render(ui);
  });
}

function q(id: string, question: string, why = '', placeholder = '') {
  return { id, question, why, placeholder };
}

/** Type into a field the way React's controlled inputs require. */
async function setValue(el: HTMLTextAreaElement | HTMLInputElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function buttonByText(text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button'))
    .find((b) => (b.textContent || '').includes(text)) as HTMLButtonElement | undefined;
}

async function click(el: HTMLElement) {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

const IDEA = 'A robot that sorts warehouse pallets by weight and destination automatically';

/** Walk step 1 -> step 2 with a given idea. */
async function reachStep2(idea = IDEA) {
  await mount(<ProjectWizard onCreate={() => {}} />);
  await setValue(container.querySelector('textarea')!, idea);
  await click(buttonByText('Sharpen my idea')!);
}

describe('step 1 — no pre-filled example content (A3)', () => {
  it('opens with an empty idea box, not someone else\'s idea', async () => {
    await mount(<ProjectWizard onCreate={() => {}} />);
    expect(container.querySelector('textarea')!.value).toBe('');
    // The name field is the only other input on step 1 and starts empty too.
    Array.from(container.querySelectorAll('input')).forEach((i) => expect(i.value).toBe(''));
  });

  it('contains none of the support-inbox example text anywhere', async () => {
    await mount(<ProjectWizard onCreate={() => {}} />);
    const html = container.innerHTML;
    expect(html).not.toMatch(/Zendesk/);
    expect(html).not.toMatch(/40-person SaaS/);
    // The idea box may still SUGGEST an example in its placeholder; what it
    // must not do is pre-fill one as the student's answer.
    expect(container.querySelector('textarea')!.value).not.toMatch(/support inbox/i);
  });
});

describe('step 2 — questions come from the student\'s own idea (A2)', () => {
  it('asks the server using the idea the student typed, and renders what comes back', async () => {
    mockQuestions.mockResolvedValue({
      ok: true,
      result: {
        generated: true,
        model: 'gpt-4o',
        attempts: 1,
        questions: [
          q('p1', 'How are pallets identified today — barcode, RFID, or manual?'),
          q('p2', 'What happens when a pallet weight is outside the expected range?'),
        ],
      },
    });

    await reachStep2();

    expect(mockQuestions).toHaveBeenCalledTimes(1);
    expect(mockQuestions.mock.calls[0][0].idea).toBe(IDEA);

    const text = container.textContent || '';
    expect(text).toContain('How are pallets identified today');
    expect(text).toContain('What happens when a pallet weight is outside');
    // and none of the old fixed questions
    expect(text).not.toContain('What data sources must it connect to?');
  });

  it('does not claim the questions were tailored when the server degraded', async () => {
    mockQuestions.mockResolvedValue({
      ok: true,
      result: {
        generated: false,
        model: null,
        attempts: 2,
        questions: [q('g1', 'Who will use this?'), q('g2', 'What must it never do?')],
      },
    });

    await reachStep2();

    const text = container.textContent || '';
    // The questions still render — a model outage must not strand a student.
    expect(text).toContain('Who will use this?');
    // But they are not sold as written for them.
    expect(text).toContain('Our standard scoping questions');
    expect(text).not.toContain('come from what you just wrote');
  });

  it('lets the student continue when the request itself fails', async () => {
    mockQuestions.mockResolvedValue({ ok: false, error: { status: 503, message: 'We are at capacity right now.' } });

    await reachStep2();

    expect(container.textContent).toContain('We are at capacity right now.');
    // Not a dead end: retry and continue are both offered.
    expect(buttonByText('Try again')).toBeTruthy();
    const carryOn = buttonByText('Continue without them');
    expect(carryOn).toBeTruthy();
    await click(carryOn!);
    expect(container.textContent).toContain('Review & confirm');
  });
});

describe('step 3 — nothing fabricated is presented as generated (A4)', () => {
  async function reachStep3WithAnswer() {
    mockQuestions.mockResolvedValue({
      ok: true,
      result: {
        generated: true,
        model: 'gpt-4o',
        attempts: 1,
        questions: [q('p1', 'How are pallets identified today?')],
      },
    });
    await reachStep2();
    await setValue(container.querySelector('#q-p1') as HTMLInputElement, 'RFID tags on every pallet');
    await click(buttonByText('Review & confirm')!);
  }

  it('shows the student their own words, not invented requirements or tasks', async () => {
    await reachStep3WithAnswer();

    const text = container.textContent || '';
    expect(text).toContain(IDEA);
    expect(text).toContain('RFID tags on every pallet');

    // The fabricated preview is gone: no invented REQ badges, no invented tasks,
    // and no claim that a plan exists yet.
    expect(text).not.toMatch(/FUNC|SAFE|REL/);
    expect(text).not.toMatch(/Scaffold the/);
    expect(text).not.toMatch(/Implement the .* read tool/);
    expect(text).not.toContain('Your generated plan');
    expect(container.innerHTML).not.toMatch(/pjw-req|pjw-gentask|rbadge/);
  });

  it('hands the interview up on confirm', async () => {
    const onCreate = jest.fn();
    mockQuestions.mockResolvedValue({
      ok: true,
      result: { generated: true, model: 'gpt-4o', attempts: 1, questions: [q('p1', 'How are pallets identified today?')] },
    });
    await mount(<ProjectWizard onCreate={onCreate} />);
    await setValue(container.querySelector('textarea')!, IDEA);
    await click(buttonByText('Sharpen my idea')!);
    await setValue(container.querySelector('#q-p1') as HTMLInputElement, 'RFID tags');
    await click(buttonByText('Review & confirm')!);
    await click(buttonByText('Confirm & build in background')!);

    expect(onCreate).toHaveBeenCalledTimes(1);
    const submitted = onCreate.mock.calls[0][0];
    expect(submitted.idea).toBe(IDEA);
    expect(submitted.answers).toEqual([
      { id: 'p1', question: 'How are pallets identified today?', answer: 'RFID tags' },
    ]);
  });

  it('omits unanswered questions rather than sending empty answers', async () => {
    const onCreate = jest.fn();
    mockQuestions.mockResolvedValue({
      ok: true,
      result: {
        generated: true, model: 'gpt-4o', attempts: 1,
        questions: [q('p1', 'How are pallets identified today?'), q('p2', 'What is the daily volume?')],
      },
    });
    await mount(<ProjectWizard onCreate={onCreate} />);
    await setValue(container.querySelector('textarea')!, IDEA);
    await click(buttonByText('Sharpen my idea')!);
    await setValue(container.querySelector('#q-p1') as HTMLInputElement, 'RFID tags');
    await click(buttonByText('Review & confirm')!);
    await click(buttonByText('Confirm & build in background')!);

    expect(onCreate.mock.calls[0][0].answers).toHaveLength(1);
  });
});
