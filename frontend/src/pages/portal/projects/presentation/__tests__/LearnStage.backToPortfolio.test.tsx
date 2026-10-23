import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import LearnStage from '../LearnStage';
import * as api from '../presentationApi';

/**
 * THE RETURN LEG.
 *
 * An empty portfolio slot sends a learner to Learn with the type pre-picked. The
 * banner that explains why the page changed shipped with only a Dismiss button —
 * which hides the sentence and leaves someone who clicked the wrong slot with no
 * route back to the grid except the browser's own back button.
 *
 * The spec asked for "← Back to portfolio" on that banner. These tests are about
 * the link existing, going somewhere, and not appearing where there is nothing to
 * go back to.
 */

jest.mock('../presentationApi', () => ({
  fetchAssignment: jest.fn(),
  saveAssignment: jest.fn(),
  fetchTemplates: jest.fn(),
  fetchTemplateLesson: jest.fn(),
  fetchPresentationTypes: jest.fn(),
}));

const mockApi = api as jest.Mocked<typeof api>;

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const TEMPLATES = [
  { id: 'working_system_demo', label: 'Working-system demo', speaking_seconds: 420, qa_seconds: 180, outcome: 'Show it run.', prominent: true },
];

const LESSON = {
  id: 'working_system_demo',
  label: 'Working-system demo',
  prominent: true,
  defaultSeconds: 420,
  qaSeconds: 180,
  outcome: 'Show it run.',
  objective: 'Demonstrate one outcome.',
  expectedOutput: 'A seven minute demo.',
  preface: 'Preface.',
  structure: ['Problem', 'Moment'],
  strongExample: { text: 'strong', why: 'because' },
  weakExample: { text: 'weak', why: 'because not' },
  timedOutline: [{ beat: 'Problem', seconds: 60, say: 'Who has it.' }],
  vocabulary: [{ term: 'guardrail', plain: 'what stops it going wrong' }],
  prepare: ['Open your system.'],
  checklist: ['Mic on'],
  rubric: [{ dimension: 'Clarity', weight: 40, lookFor: 'One idea per slide.' }],
  practiceDrill: 'Say it out loud.',
  reflection: 'What would you cut?',
};

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.fetchAssignment.mockResolvedValue({ templateId: 'working_system_demo' } as any);
  // Arriving with a type the assignment does not already hold makes the stage
  // persist it, so this has to resolve or the apply effect throws.
  mockApi.saveAssignment.mockResolvedValue({ templateId: 'working_system_demo' } as any);
  mockApi.fetchTemplates.mockResolvedValue(TEMPLATES as any);
  mockApi.fetchTemplateLesson.mockResolvedValue(LESSON as any);
  mockApi.fetchPresentationTypes.mockResolvedValue(
    [{ id: 'working_system_demo', label: 'Working-system demo', defaultSeconds: 420 }] as any,
  );
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => { act(() => root?.unmount()); root = null; container.remove(); });

const render = async (props: Partial<React.ComponentProps<typeof LearnStage>>) => {
  await act(async () => {
    const r = createRoot(container);
    root = r;
    r.render(<LearnStage projectId="p1" storyId="PREP-4" {...props} />);
  });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
};

const q = (testid: string) => container.querySelector(`[data-testid="${testid}"]`);

it('offers a way back to the grid the learner came from', async () => {
  const onBack = jest.fn();
  await render({ pendingType: 'working_system_demo', onBackToPortfolio: onBack });

  const back = q('ps-learn-banner-back') as HTMLElement;
  expect(back).not.toBeNull();
  expect(back.textContent).toBe('← Back to portfolio');

  act(() => { back.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  expect(onBack).toHaveBeenCalledTimes(1);
});

it('keeps Dismiss, because hiding the line and leaving are different wants', async () => {
  await render({ pendingType: 'working_system_demo', onBackToPortfolio: jest.fn() });
  expect(q('ps-learn-banner-dismiss')).not.toBeNull();

  act(() => {
    (q('ps-learn-banner-dismiss') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  expect(q('ps-learn-type-banner')).toBeNull();
});

it('shows no back link when the caller gave nowhere to go', async () => {
  await render({ pendingType: 'working_system_demo' });
  expect(q('ps-learn-type-banner')).not.toBeNull();
  expect(q('ps-learn-banner-back')).toBeNull();
});

it('shows no banner at all when the learner did not arrive from a slot', async () => {
  await render({ onBackToPortfolio: jest.fn() });
  expect(q('ps-learn-type-banner')).toBeNull();
  expect(q('ps-learn-banner-back')).toBeNull();
});

it('does not raise a banner for a type the registry does not know', async () => {
  mockApi.fetchPresentationTypes.mockResolvedValue([] as any);
  await render({ pendingType: 'not_a_real_type', onBackToPortfolio: jest.fn() });
  // Better no banner than one naming a raw id back at the learner.
  expect(q('ps-learn-type-banner')).toBeNull();
});

it('survives the type registry being unreachable', async () => {
  mockApi.fetchPresentationTypes.mockRejectedValue(new Error('offline'));
  await render({ pendingType: 'working_system_demo', onBackToPortfolio: jest.fn() });
  expect(q('ps-learn-type-banner')).toBeNull();
  expect(q('ps-type-first')).not.toBeNull();
});
