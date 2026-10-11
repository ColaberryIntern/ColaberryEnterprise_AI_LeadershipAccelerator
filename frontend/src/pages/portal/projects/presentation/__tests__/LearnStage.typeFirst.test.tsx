import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import LearnStage from '../LearnStage';
import * as api from '../presentationApi';

jest.mock('../presentationApi', () => ({
  fetchAssignment: jest.fn(),
  saveAssignment: jest.fn(),
  fetchTemplates: jest.fn(),
  fetchTemplateLesson: jest.fn(),
}));

const mockApi = api as jest.Mocked<typeof api>;

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;

const TEMPLATES = [
  { id: 'demo-day', label: 'Demo Day', speaking_seconds: 300, qa_seconds: 120, outcome: 'Show the one moment live.', prominent: true },
  { id: 'capstone-expo', label: 'Capstone Expo', speaking_seconds: 480, qa_seconds: 120, outcome: 'The final showcase.', prominent: true },
];

/** The real TemplateLesson shape — every array the panel maps over must exist. */
const lesson = (id: string) => ({
  id,
  label: id === 'demo-day' ? 'Demo Day' : 'Capstone Expo',
  prominent: true,
  defaultSeconds: 300,
  qaSeconds: 120,
  outcome: 'Show the one moment live.',
  objective: `Objective for ${id}`,
  expectedOutput: 'A five minute demo.',
  preface: `Preface for ${id}`,
  structure: ['Problem', 'Moment', 'Guardrail'],
  strongExample: { text: 'strong', why: 'because' },
  weakExample: { text: 'weak', why: 'because not' },
  timedOutline: [{ beat: 'Problem', seconds: 60, say: 'Who has it.' }],
  vocabulary: [{ term: 'guardrail', plain: 'what stops it going wrong' }],
  prepare: ['Open your system.'],
  checklist: ['Mic on'],
  rubric: [{ dimension: 'Clarity', weight: 40, lookFor: 'One idea per slide.' }],
  practiceDrill: 'Say the first 60 seconds out loud, twice.',
  reflection: 'What surprised you?',
});

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  mockApi.fetchAssignment.mockResolvedValue({ templateId: 'demo-day', templateLabel: 'Demo Day' } as any);
  mockApi.fetchTemplates.mockResolvedValue(TEMPLATES as any);
  mockApi.fetchTemplateLesson.mockImplementation(async (id: string) => lesson(id) as any);
  mockApi.saveAssignment.mockImplementation(async (_p: any, _s: any, body: any) => ({
    templateId: body.template, templateLabel: body.template === 'demo-day' ? 'Demo Day' : 'Capstone Expo',
  }) as any);
});
afterEach(() => { act(() => root?.unmount()); root = null; container.remove(); });

async function mount() {
  await act(async () => {
    const r = createRoot(container);
    root = r;
    r.render(<LearnStage projectId="p1" storyId="PREP-1" />);
  });
}

/**
 * Ali, 2026-10-06: "The presentation types should be at the very beginning since
 * they drive what is being built."
 *
 * The type used to be chosen on Prepare, the SECOND stage, while Learn — the first —
 * already fetched a lesson keyed on it and told the student it was showing them what
 * good looks like "for this kind of presentation". They learned from one type and
 * then picked another.
 */
describe('the presentation type is the first thing asked', () => {
  it('renders the chooser ABOVE the lesson, not after it', async () => {
    await mount();
    const html = container.innerHTML;
    const chooser = html.indexOf('data-testid="ps-type-first"');
    const lessonAt = html.indexOf('Preface for demo-day');
    expect(chooser).toBeGreaterThan(-1);
    expect(lessonAt).toBeGreaterThan(-1);
    expect(chooser).toBeLessThan(lessonAt);
  });

  it('says why it is first, rather than leaving the student to infer it', async () => {
    await mount();
    const why = container.querySelector('[data-testid="ps-type-why"]')!.textContent || '';
    expect(why).toContain('drives the rest');
    expect(why).toContain('deck prompt');
  });

  it('loads the lesson for the type on the assignment, not a guessed default', async () => {
    await mount();
    expect(mockApi.fetchTemplateLesson).toHaveBeenCalledWith('demo-day');
  });
});

describe('changing the type changes the lesson under it', () => {
  async function pickCapstone() {
    await mount();
    const btn = container.querySelector('[data-testid="ps-choice-capstone-expo"]') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    await act(async () => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  }

  it('saves the choice through the same endpoint Prepare used', async () => {
    await pickCapstone();
    expect(mockApi.saveAssignment).toHaveBeenCalledWith('p1', 'PREP-1', { template: 'capstone-expo' });
  });

  it('re-renders the lesson for the new type', async () => {
    await pickCapstone();
    expect(mockApi.fetchTemplateLesson).toHaveBeenLastCalledWith('capstone-expo');
    expect(container.textContent).toContain('Preface for capstone-expo');
  });

  /**
   * THE RULE. The lesson moves only once the SERVER has taken the choice. Swapping it
   * optimistically and then failing the save would leave a student reading the lesson
   * for a type their deck prompt will not use — the exact drift this ordering exists
   * to prevent.
   */
  it('keeps the old lesson, and says so, when the save fails', async () => {
    mockApi.saveAssignment.mockRejectedValue({ response: { data: { error: 'nope' } } });
    await pickCapstone();
    expect(container.textContent).toContain('Preface for demo-day');
    expect(container.querySelector('[data-testid="ps-type-error"]')).not.toBeNull();
    expect(mockApi.fetchTemplateLesson).not.toHaveBeenCalledWith('capstone-expo');
  });

  it('does not re-save the type that is already chosen', async () => {
    await mount();
    const current = container.querySelector('[data-testid="ps-choice-demo-day"]') as HTMLButtonElement;
    await act(async () => { current.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(mockApi.saveAssignment).not.toHaveBeenCalled();
  });
});
