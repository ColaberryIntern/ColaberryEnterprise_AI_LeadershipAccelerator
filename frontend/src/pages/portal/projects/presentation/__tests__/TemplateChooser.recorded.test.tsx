import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import TemplateChooser from '../TemplateChooser';
import portalApi from '../../../../../utils/portalApi';

/**
 * "In the Learn picker, mark types that already have a recording with a small
 * '✓ recorded'." — the merge spec.
 *
 * MARKED, NOT DISABLED. A second take of a type you have already recorded is a
 * normal thing to want; the tick is there so someone scanning for the one they
 * have NOT done can find it, not to stop them.
 */

jest.mock('../../../../../utils/portalApi', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));
const api = portalApi as unknown as { get: jest.Mock };

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const TEMPLATES = [
  { id: 'project_introduction', label: 'Project introduction', prominent: true, outcome: 'Say what it is for.', speaking_seconds: 90, qa_seconds: 0 },
  { id: 'ai_visual_presentation', label: 'AI visual presentation', prominent: true, outcome: 'Argue with pictures.', speaking_seconds: 300, qa_seconds: 120 },
  { id: 'client_handoff', label: 'Client handoff', prominent: false, outcome: 'Teach someone to run it.', speaking_seconds: 420, qa_seconds: 300 },
];

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue({ data: TEMPLATES });
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => { act(() => root?.unmount()); root = null; container.remove(); });

const render = async (recordedTypeIds?: string[]) => {
  await act(async () => {
    const r = createRoot(container);
    root = r;
    r.render(
      <TemplateChooser
        value="project_introduction"
        onChange={jest.fn()}
        recordedTypeIds={recordedTypeIds}
      />,
    );
  });
  await act(async () => { await Promise.resolve(); });
};

const q = (testid: string) => container.querySelector(`[data-testid="${testid}"]`);

it('marks a type that already has a recording', async () => {
  await render(['project_introduction']);
  expect(q('ps-choice-recorded-project_introduction')?.textContent).toBe('✓ recorded');
});

it('leaves the types with no recording unmarked', async () => {
  await render(['project_introduction']);
  expect(q('ps-choice-recorded-ai_visual_presentation')).toBeNull();
});

it('marks nothing when nothing is recorded', async () => {
  await render([]);
  expect(container.textContent).not.toContain('recorded');
});

it('marks nothing when the caller passes no list at all', async () => {
  await render(undefined);
  expect(container.textContent).not.toContain('✓ recorded');
});

it('still lets a recorded type be chosen again', async () => {
  await render(['project_introduction']);
  const btn = q('ps-choice-project_introduction') as HTMLButtonElement;
  expect(btn.disabled).toBe(false);
});

it('marks a non-prominent type once it is revealed', async () => {
  await render(['client_handoff']);
  // Hidden behind "more" until asked for, so the mark must survive the reveal.
  expect(q('ps-choice-recorded-client_handoff')).toBeNull();
  act(() => {
    (q('ps-chooser-more') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  expect(q('ps-choice-recorded-client_handoff')?.textContent).toBe('✓ recorded');
});
