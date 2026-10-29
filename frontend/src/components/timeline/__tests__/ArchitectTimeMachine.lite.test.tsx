/**
 * Week 0 of the Architect Time Machine is a LITE first taste.
 *
 * Feedback 2026-10-27: the first episode was too much to grasp this early in
 * the journey (10 stages, 10 interview questions, an essay, a receipt, a decision
 * record, a project transfer). A scenario with `lite: true` now runs 6 short
 * stages and finishes on one click question plus one sentence. These tests pin
 * that: the lite flow shows 6 stages and completes end to end, and a full week
 * still shows all 10.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

jest.mock('../../../pages/portal/runtime/runtimeApi', () => ({
  runtimeApi: { architectState: jest.fn(), architectAdvance: jest.fn(), architectInterview: jest.fn(), architectEvaluate: jest.fn(), architectComplete: jest.fn() },
}));
jest.mock('../../../services/pointsFx', () => ({ emitPointsEarned: jest.fn() }));

import ArchitectTimeMachine from '../ArchitectTimeMachine';
import { runtimeApi } from '../../../pages/portal/runtime/runtimeApi';

import { emitPointsEarned } from '../../../services/pointsFx';

const mockApi = runtimeApi as unknown as Record<string, jest.Mock>;
const mockEmit = emitPointsEarned as unknown as jest.Mock;

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const opt = (id: string, custom = false) => ({ id, label: `Option ${id}`, custom });
function scenario(lite: boolean): any {
  return {
    version: 'test', week: lite ? 0 : 1, baseline: lite, lite, title: 'Test scenario', series: 'Architect Mindset',
    experience: 'The Architect Time Machine', principle: 'Look around it.', tagline: 't',
    request: { from: 'your manager', text: 'Build an assistant.' },
    initial_system: ['An employee', 'An AI assistant', 'Company documents'],
    first_decision: { prompt: 'Go with your gut.', options: [opt('model'), opt('ask'), opt('custom', true)] },
    zoom_out: { people: ['Employees'], information: ['The handbook'], decisions: ['Legal questions'], operations: ['Fixing wrong answers'] },
    signature_reveals: ['It was bigger.'],
    interview_part_1: lite ? [] : [{ id: 'q1', text: 'Q1?', mode: 'single', options: [opt('a'), opt('custom', true)] }],
    interview_part_2: [{ id: 'r1', text: 'Big idea?', mode: 'single', options: [opt('system'), opt('custom', true)] }],
    consequence: { horizon: [{ point: 'Demo day', risk: 10 }, { point: 'Who owns this?', risk: 85 }], reveal: 'Nobody knew.', lesson: 'Architect it.' },
    rearchitecture: { prompt: 'Last step.' },
    receipt: { counts: [{ label: 'request', value: '1' }], represented_hours: 450, minutes: 5, qualification: 'q' },
    adr: { fields: [] }, project_transfer: { prompt: 'p', questions: ['a?', 'b?'] }, commitment_prompt: 'Before I build, I will always',
  };
}
const stateFor = (lite: boolean) => ({
  scenario: scenario(lite), status: 'available', receipt: null, ledger: null, gaps: [],
  progress: { state: 'not_started', interview: {}, flags: {} },
});

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  jest.clearAllMocks();
  mockApi.architectAdvance.mockResolvedValue({ saved: true });
  mockApi.architectInterview.mockResolvedValue({ saved: true });
  mockApi.architectEvaluate.mockResolvedValue({});
});
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); act(() => { root = createRoot(container); }); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

async function mount(lite: boolean) {
  mockApi.architectState.mockResolvedValue(stateFor(lite));
  await act(async () => { root.render(<ArchitectTimeMachine cardId="c1" variant="workspace" />); });
}
const steps = () => Array.from(container.querySelectorAll('.am-step')).map((b) => b.textContent || '');
const next = async () => { await act(async () => { (container.querySelector('.am-btn.pri') as HTMLButtonElement).click(); }); };
const choose = async (label: string) => {
  const btn = Array.from(container.querySelectorAll('.am-opt')).find((b) => b.textContent === label) as HTMLButtonElement;
  await act(async () => { btn.click(); });
};
const type = async (sel: string, value: string) => {
  const el = container.querySelector(sel) as HTMLTextAreaElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
  await act(async () => { setter.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
};

describe('ArchitectTimeMachine lite (Week 0 first taste)', () => {
  it('shows 6 short stages, not 10', async () => {
    await mount(true);
    expect(steps().length).toBe(6);
    expect(steps().join('|')).toContain('Your Takeaway');
    expect(steps().join('|')).not.toContain('Re-Architecture');
  });

  it('a full week still shows all 10 stages', async () => {
    await mount(false);
    expect(steps().length).toBe(10);
  });

  it('completes end to end with one click question and one sentence', async () => {
    mockApi.architectComplete.mockResolvedValue({ receipt: null, ledger: null, evaluation: { baseline: true, observation: 'Nice.' }, readiness: null, points: { value: 160, awarded_now: 160 } });
    await mount(true);
    await next();                                   // arrival
    await next();                                   // request
    await choose('Option ask'); await next();       // your call (no "why?" box in lite)
    expect(container.querySelector('#am-reason')).toBeNull();
    await next();                                   // bigger picture
    await next(); await next();                     // fast-forward: reveal, then continue
    await next();                                   // takeaway with nothing filled in is blocked
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(mockApi.architectComplete).not.toHaveBeenCalled();
    await choose('Option system');
    await type('#am-commit', 'ask who will use it before I pick a tool');
    await next();
    expect(mockApi.architectInterview).toHaveBeenCalledWith('c1', 2, expect.objectContaining({ r1: expect.objectContaining({ choice: 'system' }) }));
    expect(mockApi.architectAdvance).toHaveBeenCalledWith('c1', 'adr_generated', { commitment: 'ask who will use it before I pick a tool' });
    expect(mockApi.architectComplete).toHaveBeenCalledWith('c1');
    expect(container.textContent).toContain('You are ready for Week 1');
    expect(container.textContent).not.toContain('fourteen completion gates');
    // Points are awarded automatically on completion; the student must SEE that.
    expect(container.textContent).toContain('+160 points');
    expect(mockEmit).toHaveBeenCalledWith(160);
  });
});

describe('ArchitectTimeMachine points (2026-10-29: "no way to get my points")', () => {
  const completedState = (awarded_now: number) => ({
    ...stateFor(true), status: 'completed',
    progress: { state: 'completed', interview: {}, flags: {}, evaluation: { baseline: true } },
    points: { value: 160, awarded_now },
  });

  it('reopening a completed card shows the points it earned', async () => {
    mockApi.architectState.mockResolvedValue(completedState(0));
    await act(async () => { root.render(<ArchitectTimeMachine cardId="c1" variant="workspace" />); });
    expect(container.textContent).toContain('+160 points');
    expect(container.textContent).toContain('nothing else to collect');
    expect(mockEmit).toHaveBeenCalledWith(0);          // already on the ledger: emit is a silent no-op
  });

  it('a previously-missed award healed on open fires the points burst', async () => {
    mockApi.architectState.mockResolvedValue(completedState(160));
    await act(async () => { root.render(<ArchitectTimeMachine cardId="c1" variant="workspace" />); });
    expect(mockEmit).toHaveBeenCalledWith(160);
  });

  it('a card worth 0 points shows no points banner', async () => {
    mockApi.architectState.mockResolvedValue({ ...completedState(0), points: { value: 0, awarded_now: 0 } });
    await act(async () => { root.render(<ArchitectTimeMachine cardId="c1" variant="workspace" />); });
    expect(container.querySelector('.am-pts')).toBeNull();
  });
});
