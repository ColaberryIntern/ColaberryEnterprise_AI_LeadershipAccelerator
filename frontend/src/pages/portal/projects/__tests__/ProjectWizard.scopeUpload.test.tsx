/**
 * Step 1 scope-document upload (L12.2), in both modes.
 *
 * The contract: the server only reads the file; its text is folded into the
 * same `idea` the questions, preview and build already receive, after whatever
 * the student typed. Typed text is never cut to make room for the document.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { fetchIntakeQuestions, previewIntake, extractIntakeDocument } from '../../../../services/sbpApi';
import { withDocument } from '../outlineModel';

jest.mock('../../../../services/sbpApi', () => ({
  fetchIntakeQuestions: jest.fn(),
  previewIntake: jest.fn(),
  extractIntakeDocument: jest.fn(),
}));
jest.mock('../../useIsExplorer', () => ({ useIsExplorer: () => false }));

import ProjectWizard from '../ProjectWizard';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mockQuestions = fetchIntakeQuestions as unknown as jest.Mock;
const mockPreview = previewIntake as unknown as jest.Mock;
const mockExtract = extractIntakeDocument as unknown as jest.Mock;

let container: HTMLDivElement;
let root: Root | undefined;
let onCreate = jest.fn();

const DOC_TEXT = 'Scope: a claims triage agent for a 40-person logistics team. Release 1 reads the shared inbox.';

beforeEach(() => {
  jest.clearAllMocks();
  onCreate = jest.fn();
  mockQuestions.mockResolvedValue({ ok: true, result: { generated: true, model: 'x', attempts: 1, questions: [{ id: 'p1', question: 'Who signs off?', why: '', placeholder: '' }] } });
  mockPreview.mockResolvedValue({ ok: false, error: { status: 503, kind: 'server_error', message: 'unreachable' } });
  mockExtract.mockResolvedValue({ ok: true, doc: { fileName: 'scope.pdf', text: DOC_TEXT, truncated: false, chars: DOC_TEXT.length } });
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
async function setValue(el: HTMLTextAreaElement | HTMLInputElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
  await act(async () => { setter.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
}
const buttonByText = (text: string) =>
  Array.from(container.querySelectorAll('button')).find((b) => (b.textContent || '').includes(text)) as HTMLButtonElement;
async function click(el: HTMLElement) {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}
async function upload() {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['%PDF'], 'scope.pdf', { type: 'application/pdf' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
}

describe('withDocument', () => {
  it('appends the document after the typed text, under its file name', () => {
    expect(withDocument('My idea here', { fileName: 'a.pdf', text: 'Doc body' }, 1000))
      .toEqual({ idea: 'My idea here\n\nFrom my scope document (a.pdf):\nDoc body', kept: 8 });
  });
  it('gives the document only the room left, never cutting what was typed', () => {
    const typed = 'x'.repeat(90);
    const out = withDocument(typed, { fileName: 'a.pdf', text: 'y'.repeat(500) }, 200);
    expect(out.idea.startsWith(typed)).toBe(true);
    expect(out.idea.length).toBe(200);
    expect(out.kept).toBeLessThan(500);
  });
});

describe('step 1 — upload a scope document', () => {
  it('in Guided outline: a document alone is enough to Sharpen, and its text is the idea sent on', async () => {
    await mount();
    expect(buttonByText('Sharpen my idea').disabled).toBe(true);
    await upload();
    expect(container.textContent).toContain('scope.pdf');
    expect(container.textContent).toContain(`${DOC_TEXT.length} characters read`);
    await click(buttonByText('Sharpen my idea'));
    expect(mockQuestions.mock.calls[0][0].idea).toBe(`From my scope document (scope.pdf):\n${DOC_TEXT}`);
    await click(buttonByText('Review & confirm'));
    await click(buttonByText('Confirm & build in background'));
    expect(onCreate.mock.calls[0][0].idea).toContain(DOC_TEXT);
  });

  it('in Brain-dump: the document follows what they typed', async () => {
    await mount();
    await click(buttonByText('Brain-dump'));
    await setValue(container.querySelector('textarea')!, 'A claims agent for our logistics team');
    await upload();
    await click(buttonByText('Sharpen my idea'));
    expect(mockQuestions.mock.calls[0][0].idea)
      .toBe(`A claims agent for our logistics team\n\nFrom my scope document (scope.pdf):\n${DOC_TEXT}`);
  });

  it('keeps the document across a mode switch, and Remove takes it out', async () => {
    await mount();
    await upload();
    await click(buttonByText('Brain-dump'));
    expect(container.textContent).toContain('scope.pdf');
    await click(buttonByText('Remove'));
    expect(container.textContent).not.toContain('scope.pdf');
    expect(buttonByText('Sharpen my idea').disabled).toBe(true);
  });

  it('shows the server\'s reason when a file cannot be read', async () => {
    mockExtract.mockResolvedValue({ ok: false, error: { status: 422, kind: 'rejected', message: 'We couldn\'t find any text in that PDF.' } });
    await mount();
    await upload();
    expect(container.querySelector('[role="alert"]')!.textContent).toContain('couldn\'t find any text');
  });
});
