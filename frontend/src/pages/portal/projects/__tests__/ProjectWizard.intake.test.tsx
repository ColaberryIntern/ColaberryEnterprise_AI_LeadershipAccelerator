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
import { fetchIntakeQuestions, previewIntake } from '../../../../services/sbpApi';

jest.mock('../../../../services/sbpApi', () => ({
  fetchIntakeQuestions: jest.fn(),
  previewIntake: jest.fn(),
}));

jest.mock('../../useIsExplorer', () => ({ useIsExplorer: () => false }));

import ProjectWizard from '../ProjectWizard';

// React 18 wants this to treat `act` as a real act scope; this repo has no
// setupTests file, so it is set here rather than changing global test config.
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mockQuestions = fetchIntakeQuestions as unknown as jest.Mock;
const mockPreview = previewIntake as unknown as jest.Mock;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  jest.clearAllMocks();
  // Default: the preview cannot be reached, so step 3 takes its fallback path
  // and echoes the raw answers. The gate itself is exercised explicitly below.
  mockPreview.mockResolvedValue({ ok: false, error: { status: 503, kind: 'server_error', message: 'unreachable' } });
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

    // ONE question at a time now: the first is on screen, the second is not,
    // and the count tells the student how many are left. Seven boxes at once
    // read as a form and got form answers.
    let text = container.textContent || '';
    expect(text).toContain('How are pallets identified today');
    expect(text).not.toContain('What happens when a pallet weight is outside');
    expect(text).toMatch(/Question 1 of 2/);
    // and none of the old fixed questions
    expect(text).not.toContain('What data sources must it connect to?');

    await click(buttonByText('Skip this one')!);
    text = container.textContent || '';
    expect(text).toContain('What happens when a pallet weight is outside');
    expect(text).toMatch(/Question 2 of 2/);
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
    await setValue(container.querySelector('#q-p1') as HTMLTextAreaElement, 'RFID tags');
    // One question in this fixture, so the last-question button is Review.
    await click(buttonByText('Review & confirm')!);
    await click(buttonByText('Confirm & build in background')!);

    expect(onCreate).toHaveBeenCalledTimes(1);
    const submitted = onCreate.mock.calls[0][0];
    expect(submitted.idea).toBe(IDEA);
    expect(submitted.answers).toEqual([
      { id: 'p1', question: 'How are pallets identified today?', answer: 'RFID tags' },
    ]);
  });

  it('fills the box from a suggestion instead of answering for the student', async () => {
    // The chips are what make this answerable for someone new to AI — and where
    // they discover they can ask for an undo. Tapping one must leave the answer
    // editable rather than submitting it.
    mockQuestions.mockResolvedValue({
      ok: true,
      result: {
        generated: true, model: 'gpt-4o', attempts: 1,
        questions: [{
          ...q('p1', 'What would you need to see before letting it run on its own?'),
          suggestions: ['Let me undo it afterwards', 'Send me a summary at the end of the day'],
        }],
      },
    });

    await reachStep2();
    const chip = buttonByText('Let me undo it afterwards');
    expect(chip).toBeTruthy();
    await click(chip!);

    const box = container.querySelector('#q-p1') as HTMLTextAreaElement;
    expect(box.value).toBe('Let me undo it afterwards');
    // still on the question — nothing was submitted on their behalf
    expect(container.textContent).toContain('What would you need to see');
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
    await setValue(container.querySelector('#q-p1') as HTMLTextAreaElement, 'RFID tags');
    // Answering reveals Next; the second question is left blank on purpose.
    await click(buttonByText('Next')!);
    await click(buttonByText('Review & confirm')!);
    await click(buttonByText('Confirm & build in background')!);

    expect(onCreate.mock.calls[0][0].answers).toHaveLength(1);
  });
});

describe('step 3 — the confirmation gate shows what will be recorded', () => {
  const COVERED = [{ angle: 'THE TOOLS', evidence: 'our WMS and the dock scales' }];

  function previewOf(over: Partial<any> = {}) {
    return {
      ok: true,
      preview: {
        review: {
          items: [
            { index: 0, dimension: 'problem', label: 'What you are building', value: IDEA, group: 'needsConfirmation', quote: IDEA },
            { index: 1, dimension: 'approval_points', label: 'What a person checks before it acts', value: 'A supervisor signs off any pallet over 800kg', group: 'needsConfirmation', quote: 'A supervisor signs off any pallet over 800kg' },
            { index: 2, dimension: 'systems', label: 'What it has to work with', value: 'our WMS and the dock scales', group: 'needsConfirmation', quote: 'our WMS and the dock scales' },
          ],
          counts: { needsConfirmation: 3, inferences: 0, openQuestions: 0, unknowns: 0, confirmed: 0 },
          contradictions: [],
          blocksPlanning: false,
        },
        unanswered: [
          'there is no baseline, so nothing can be measured against it later',
          'who actually uses this is unrecorded',
        ],
        covered: COVERED,
        unmapped: 0,
        ...over,
      },
    };
  }

  async function reachStep3() {
    mockQuestions.mockResolvedValue({
      ok: true,
      result: {
        generated: true, model: 'gpt-4o', attempts: 1,
        covered: COVERED,
        questions: [{ ...q('g1', 'What would you want a person to check before it acts?'), angle: 'THE GUARDRAIL' }],
      },
    });
    await reachStep2();
    await setValue(container.querySelector('#q-g1') as HTMLTextAreaElement, 'A supervisor signs off any pallet over 800kg');
    await click(buttonByText('Review & confirm')!);
  }

  it('asks the server what it understood, sending the angle and the covered receipt', async () => {
    mockPreview.mockResolvedValue(previewOf());
    await reachStep3();

    expect(mockPreview).toHaveBeenCalledTimes(1);
    const sent = mockPreview.mock.calls[0][0];
    expect(sent.idea).toBe(IDEA);
    expect(sent.answers).toEqual([
      { id: 'g1', question: 'What would you want a person to check before it acts?', answer: 'A supervisor signs off any pallet over 800kg', angle: 'THE GUARDRAIL' },
    ]);
    expect(sent.covered).toEqual(COVERED);
  });

  it('renders each understood statement under a human heading, in the student\'s words', async () => {
    mockPreview.mockResolvedValue(previewOf());
    await reachStep3();

    const text = container.textContent || '';
    expect(text).toContain('What we heard');
    expect(text).toContain('What a person checks before it acts');
    expect(text).toContain('A supervisor signs off any pallet over 800kg');
    expect(text).toContain('What it has to work with');
    expect(text).toContain('our WMS and the dock scales');
    // Not the raw schema name.
    expect(text).not.toContain('approval_points');
    // The idea is shown once, verbatim, not again as a truncated item.
    expect(text.split(IDEA).length - 1).toBe(1);
  });

  it('lists what is still unanswered in plain words and says it does not block', async () => {
    mockPreview.mockResolvedValue(previewOf());
    await reachStep3();

    const text = container.textContent || '';
    expect(text).toContain('Still unanswered');
    expect(text).toContain('there is no baseline, so nothing can be measured against it later');
    expect(text).toContain('who actually uses this is unrecorded');
    expect(text).toContain('None of these blocks the build');
    // and the receipt for the short interview
    expect(text).toContain('already answered 1 of our questions');
    // Confirm is live: gaps are informational.
    expect(buttonByText('Confirm & build in background')!.disabled).toBe(false);
  });

  it('says so plainly when nothing is outstanding', async () => {
    mockPreview.mockResolvedValue(previewOf({ unanswered: [], covered: [] }));
    await reachStep3();

    const text = container.textContent || '';
    expect(text).toContain('Nothing is outstanding');
    expect(text).not.toContain('None of these blocks the build');
    expect(text).not.toContain('already answered');
  });

  it('reports answers the server could not file rather than hiding them', async () => {
    mockPreview.mockResolvedValue(previewOf({ unmapped: 1 }));
    await reachStep3();
    expect(container.textContent).toContain('One of your answers could not be filed');
  });

  it('blocks Confirm only on a contradiction, and shows it', async () => {
    mockPreview.mockResolvedValue(previewOf({
      review: {
        ...previewOf().preview.review,
        contradictions: ['item 1: an "unknowns" item cannot be a FACT'],
        blocksPlanning: true,
      },
    }));
    await reachStep3();

    expect(container.textContent).toContain('contradict each other');
    expect(container.textContent).toContain('an "unknowns" item cannot be a FACT');
    expect(buttonByText('Confirm & build in background')!.disabled).toBe(true);
  });

  it('falls back to the raw answers when the server cannot be reached, and Confirm still works', async () => {
    // beforeEach already makes the preview fail.
    const onCreate = jest.fn();
    mockQuestions.mockResolvedValue({
      ok: true,
      result: { generated: true, model: 'gpt-4o', attempts: 1, questions: [{ ...q('g1', 'Who checks it?'), angle: 'THE GUARDRAIL' }] },
    });
    await mount(<ProjectWizard onCreate={onCreate} />);
    await setValue(container.querySelector('textarea')!, IDEA);
    await click(buttonByText('Sharpen my idea')!);
    await setValue(container.querySelector('#q-g1') as HTMLTextAreaElement, 'Priya does');
    await click(buttonByText('Review & confirm')!);

    const text = container.textContent || '';
    expect(text).toContain("couldn't check this with the server");
    expect(text).toContain('Who checks it?');
    expect(text).toContain('Priya does');
    expect(text).not.toContain('What we heard');

    await click(buttonByText('Confirm & build in background')!);
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0][0].answers[0].angle).toBe('THE GUARDRAIL');
  });

  it('does not re-ask for the same inputs when the student goes back and returns unchanged', async () => {
    mockPreview.mockResolvedValue(previewOf());
    await reachStep3();
    await click(buttonByText('Back')!);
    await click(buttonByText('Review & confirm')!);
    expect(mockPreview).toHaveBeenCalledTimes(1);
  });
});
