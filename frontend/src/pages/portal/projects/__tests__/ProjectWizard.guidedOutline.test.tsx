/**
 * Step 1 "Guided outline" — the ten-question shape for the same idea.
 *
 * The contract: the outline is presentation only. Whatever is filled in is
 * folded into ONE `idea` string and sent exactly where the brain-dump text
 * went (question writer, preview, build). With the outline empty the idea is
 * the free text byte-for-byte, and switching modes never loses anything.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { fetchIntakeQuestions, previewIntake } from '../../../../services/sbpApi';
import { composeIdea, EMPTY_OUTLINE } from '../outlineModel';

jest.mock('../../../../services/sbpApi', () => ({
  fetchIntakeQuestions: jest.fn(),
  previewIntake: jest.fn(),
}));
jest.mock('../../useIsExplorer', () => ({ useIsExplorer: () => false }));

import ProjectWizard from '../ProjectWizard';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mockQuestions = fetchIntakeQuestions as unknown as jest.Mock;
const mockPreview = previewIntake as unknown as jest.Mock;

let container: HTMLDivElement;
let root: Root | undefined;

beforeEach(() => {
  jest.clearAllMocks();
  mockQuestions.mockResolvedValue({
    ok: true,
    result: { generated: true, model: 'x', attempts: 1, questions: [{ id: 'p1', question: 'Who signs off?', why: '', placeholder: '' }] },
  });
  mockPreview.mockResolvedValue({ ok: false, error: { status: 503, kind: 'server_error', message: 'unreachable' } });
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  if (root) { const r = root; act(() => { r.unmount(); }); root = undefined; }
  document.body.removeChild(container);
});

async function mount() {
  await act(async () => { root = createRoot(container); root.render(<ProjectWizard onCreate={onCreate} />); });
}
let onCreate = jest.fn();

async function setValue(el: HTMLTextAreaElement | HTMLInputElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
  await act(async () => { setter.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
}
function buttonByText(text: string): HTMLButtonElement {
  return Array.from(container.querySelectorAll('button')).find((b) => (b.textContent || '').trim() === text
    || (b.textContent || '').includes(text)) as HTMLButtonElement;
}
async function click(el: HTMLElement) {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}
const field = (id: string) => container.querySelector(`#pjg-f-${id}`) as HTMLTextAreaElement | HTMLInputElement;

describe('composeIdea', () => {
  it('returns the free text untouched when the outline is empty', () => {
    expect(composeIdea(EMPTY_OUTLINE, '  my raw idea \n')).toBe('  my raw idea \n');
  });

  it('writes one labelled line per filled answer, skips blanks, and keeps the free text', () => {
    const out = composeIdea(
      { ...EMPTY_OUTLINE, produce: 'Drafts replies to support email', tools: ['Gmail', 'Slack'], unsure: 'Ask me' },
      'Also handle Spanish.',
    );
    expect(out).toBe(
      'What it should produce, and for whom: Drafts replies to support email\n'
      + 'Tools it needs to read from or write to: Gmail, Slack\n'
      + "When it isn't sure, it should: Ask me\n\n"
      + 'Anything else:\nAlso handle Spanish.',
    );
    expect(out).not.toMatch(/Who uses it/);
  });
});

describe('step 1 — guided outline', () => {
  beforeEach(() => { onCreate = jest.fn(); });

  it('opens in Guided outline with 0 of 10 and Sharpen disabled', async () => {
    await mount();
    expect(buttonByText('Guided outline').getAttribute('aria-pressed')).toBe('true');
    expect(container.textContent).toContain('0 of 10');
    expect(buttonByText('Sharpen my idea').disabled).toBe(true);
  });

  it('ticks sections off as they are answered', async () => {
    await mount();
    await setValue(field('q1'), 'An agent that drafts replies to our support inbox for two reps');
    await click(buttonByText('Something arrives'));
    await click(buttonByText('Gmail'));
    expect(container.textContent).toContain('3 of 10');
    expect(container.textContent).toContain('7 still open');
    // A single-choice chip toggles off when tapped again.
    await click(buttonByText('Something arrives'));
    expect(container.textContent).toContain('2 of 10');
  });

  it('sends the whole outline as the idea to Sharpen it, preview, and the build', async () => {
    await mount();
    await setValue(field('q1'), 'An agent that drafts replies to our support inbox');
    await click(buttonByText('Slack'));
    await click(buttonByText('Flag it for me'));
    await setValue(field('else'), 'It should learn our tone.');
    const expected = composeIdea(
      { ...EMPTY_OUTLINE, produce: 'An agent that drafts replies to our support inbox', tools: ['Slack'], unsure: 'Flag it for me' },
      'It should learn our tone.',
    );

    await click(buttonByText('Sharpen my idea'));
    expect(mockQuestions.mock.calls[0][0].idea).toBe(expected);

    await click(buttonByText('Review & confirm'));
    expect(mockPreview.mock.calls[0][0].idea).toBe(expected);

    await click(buttonByText('Confirm & build in background'));
    expect(onCreate.mock.calls[0][0].idea).toBe(expected);
  });

  it('adds a custom tool from "Add your own"', async () => {
    await mount();
    await click(buttonByText('Add your own'));
    const input = container.querySelector('input[aria-label="Add a tool"]') as HTMLInputElement;
    await setValue(input, 'Zoho Desk');
    await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(buttonByText('Zoho Desk').getAttribute('aria-pressed')).toBe('true');
    expect(container.textContent).toContain('1 of 10');
  });

  it('switching modes keeps everything written', async () => {
    await mount();
    await setValue(field('q1'), 'An agent that drafts replies');
    await setValue(field('else'), 'Brain-dump text that should survive the switch');
    await click(buttonByText('Brain-dump'));
    expect(container.querySelector('textarea')!.value).toBe('Brain-dump text that should survive the switch');
    expect(container.textContent).toContain('outline answers (1 of 10) are kept');
    await click(buttonByText('Guided outline'));
    expect(field('q1').value).toBe('An agent that drafts replies');
  });
});
