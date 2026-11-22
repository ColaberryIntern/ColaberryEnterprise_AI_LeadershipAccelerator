import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { ProgressDashboard, sourceButtonLabel } from '../ProgressDashboard';
import { RoomRail } from '../RoomRail';
import { SaveAnswerBox } from '../TryRecorder';
import { PlanView } from '../PlanView';
import type { AttemptView, PrepDashboard } from '../careerPrepApi';
import { initialSection } from '../../../pages/portal/portfolio/hire/hireStudioModel';

const mockSources = jest.fn();
const mockSave = jest.fn();
const mockDelete = jest.fn();
jest.mock('../careerPrepApi', () => ({
  ...jest.requireActual('../careerPrepApi'),
  fetchSkillSourcesApi: (...a: unknown[]) => mockSources(...a),
  saveAnswerApi: (...a: unknown[]) => mockSave(...a),
  deleteAnswerApi: (...a: unknown[]) => mockDelete(...a),
}));

const d: PrepDashboard = {
  anchorId: 'i1',
  readiness: { value: 64, target: 75, trend: [] },
  interviews: [{ id: 'i1', source: 'real', company: 'Acme', role: 'AI Engineer', type: 'technical', readiness: 64, target: 75 }],
  skills: [
    { key: 'pace_clarity', label: 'Pace and clarity', score: 31.5, count: 3, sources: ['video'] },
    { key: 'few_fillers', label: 'Few filler words', score: 97.1, count: 3, sources: ['video'] },
    { key: 'proof_of_work', label: 'Proof of work', count: 1, sources: ['project'] },
  ],
  sources: { video: 3, phone_mock: 0, real_interview: 0, training: 0, project: 1, read_aloud: 0 },
  weeklyMinutes: [], streak: 0, thisWeek: 0,
};

let host: HTMLDivElement | null = null;
let root: Root | null = null;
function mount(ui: React.ReactElement): HTMLDivElement {
  const h = document.createElement('div');
  document.body.appendChild(h);
  const r = createRoot(h);
  host = h; root = r;
  act(() => { r.render(<MemoryRouter>{ui}</MemoryRouter>); });
  return h;
}
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
afterEach(() => { if (root) { const r = root; act(() => r.unmount()); } host?.remove(); host = null; root = null; [mockSources, mockSave, mockDelete].forEach((m) => m.mockReset()); });

describe('R1.1 source icons (Ali: the video icon built a plan)', () => {
  it('each source icon is its own button OUTSIDE the plan button, and opens the evidence, not a plan', async () => {
    mockSources.mockResolvedValue([{ at: '2026-11-16T23:00:00Z', value: 31.5, kind: 'intro_video', label: 'Your intro video', link: '/portal/portfolio?tab=hire&section=video' }]);
    const onSkill = jest.fn();
    const h = mount(<ProgressDashboard d={d} onAnchor={jest.fn()} onSkill={onSkill} />);
    const icon = h.querySelector('[data-testid="cp-src-pace_clarity-video"]') as HTMLButtonElement;
    expect(icon.tagName).toBe('BUTTON');
    expect(icon.closest('[data-testid="cp-skill-pace_clarity"]')).toBeNull();
    expect(h.querySelectorAll('button button')).toHaveLength(0);
    expect(icon.getAttribute('aria-label')).toBe('Pace and clarity: 3 video results');
    act(() => icon.click());
    await flush();
    expect(onSkill).not.toHaveBeenCalled();
    expect(mockSources).toHaveBeenCalledWith('pace_clarity', 'video');
    const panel = document.querySelector('[data-testid="cp-srcpanel"]') as HTMLElement;
    expect(panel.textContent).toContain('Where this score comes from');
    expect((panel.querySelector('[data-testid="cp-srcitem-link"]') as HTMLAnchorElement).getAttribute('href')).toBe('/portal/portfolio?tab=hire&section=video');
  });
  it('a Try answer not saved says so; a saved one plays', async () => {
    mockSources.mockResolvedValue([
      { at: '2026-11-16T23:00:00Z', value: 40, kind: 'try_answer', label: 'A Try answer in Career Prep', notKept: true },
      { at: '2026-11-15T23:00:00Z', value: 45, kind: 'try_answer', label: 'Try answer: Q', video: { streamUrl: '/s', posterUrl: '/p' } },
    ]);
    const h = mount(<ProgressDashboard d={d} onAnchor={jest.fn()} onSkill={jest.fn()} />);
    act(() => (h.querySelector('[data-testid="cp-src-few_fillers-video"]') as HTMLButtonElement).click());
    await flush();
    expect(document.querySelector('[data-testid="cp-srcitem-notkept"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="cp-srcitem-video"] source')?.getAttribute('src')).toBe('/s');
  });
  it('labels a multi-source skill without inventing a per-source count', () => {
    expect(sourceButtonLabel({ key: 'k', label: 'Role knowledge', count: 4, sources: ['video', 'training'] }, 'training')).toBe('Role knowledge: the lessons behind this score');
  });
});

describe('R1.1 plan buttons wait while a plan is being built', () => {
  it('every plan button is disabled, and the one clicked says it is building', () => {
    const onSkill = jest.fn();
    const h = mount(<ProgressDashboard d={d} onAnchor={jest.fn()} onSkill={onSkill} planBusy />);
    const read = h.querySelector('[data-testid="cp-read-plan-pace_clarity"]') as HTMLButtonElement;
    expect(read.disabled).toBe(true);
    expect((h.querySelector('[data-testid="cp-skill-pace_clarity"]') as HTMLButtonElement).disabled).toBe(true);
    act(() => read.click());
    expect(onSkill).not.toHaveBeenCalled();
  });
  it('PlanView names the skill the student picked', () => {
    const plan = { kind: 'custom' as const, minutes: 10, days: [{ date: '2026-11-16', segments: [{ kind: 'try' as const, title: 'Try it on camera', minutes: 5, targetSkill: 'pace_clarity' }] }] };
    const h = mount(<PlanView plan={plan} focusSkill="pace_clarity" skillLabels={{ pace_clarity: 'Pace and clarity' }} onStart={jest.fn()} now={new Date('2026-11-16T18:00:00Z')} />);
    expect(h.querySelector('[data-testid="cp-plan-focus"]')?.textContent).toBe('Focused on Pace and clarity, the skill you picked.');
    expect(h.textContent).not.toContain('Built from your weakest skills');
  });
});

describe('R1.1 the left rail', () => {
  it('navigates tabs and sheets, and shows scores lowest first with unscored skills only counted', () => {
    const onTab = jest.fn(); const onSheet = jest.fn(); const onSkill = jest.fn();
    const h = mount(<RoomRail tab="progress" onTab={onTab} onSheet={onSheet} dashboard={d} anchor={d.interviews[0]} onSkill={onSkill} />);
    expect(h.querySelector('[data-testid="cp-rail-tab-progress"]')?.getAttribute('aria-current')).toBe('page');
    act(() => (h.querySelector('[data-testid="cp-rail-tab-plan"]') as HTMLButtonElement).click());
    expect(onTab).toHaveBeenCalledWith('plan');
    act(() => (h.querySelector('[data-testid="cp-rail-sheet-offers"]') as HTMLButtonElement).click());
    expect(onSheet).toHaveBeenCalledWith('offers');
    expect(h.querySelector('[data-testid="cp-rail-readiness"]')?.textContent).toContain('64');
    const names = [...h.querySelectorAll('.cp-rail-skill-name')].map((n) => n.textContent);
    expect(names).toEqual(['Pace and clarity', 'Few filler words']);
    expect(h.querySelector('[data-testid="cp-rail-unscored"]')?.textContent).toBe('1 skill needs more practice for a score');
    act(() => (h.querySelector('[data-testid="cp-rail-skill-pace_clarity"]') as HTMLButtonElement).click());
    expect(onSkill).toHaveBeenCalledWith('pace_clarity');
  });
  it('without readiness: says how far from a first score, never a number', () => {
    const h = mount(<RoomRail tab="plan" onTab={jest.fn()} onSheet={jest.fn()} dashboard={{ ...d, readiness: undefined }} anchor={null} onSkill={jest.fn()} />);
    expect(h.querySelector('[data-testid="cp-rail-readiness"]')).toBeNull();
    expect(h.querySelector('[data-testid="cp-rail-readiness-empty"]')?.textContent).toBe('Readiness: 2 of 5 skills scored for a first score');
  });
});

describe('R1.1 save a Try answer (unchecked by default, easy to delete)', () => {
  const attempt = (recording?: AttemptView['recording']): AttemptView => ({ id: 'a1', status: 'done', errorClass: null, result: null, recording });
  it('starts unchecked; ticking saves with the question; unticking deletes', async () => {
    mockSave.mockResolvedValue({}); mockDelete.mockResolvedValue(undefined);
    const h = mount(<SaveAnswerBox attempt={attempt('pending')} question="Tell me about a project." />);
    const box = h.querySelector('[data-testid="cp-save-check"]') as HTMLInputElement;
    expect(box.checked).toBe(false);
    act(() => box.click());
    await flush();
    expect(mockSave).toHaveBeenCalledWith('a1', 'Tell me about a project.');
    expect((h.querySelector('[data-testid="cp-save-check"]') as HTMLInputElement).checked).toBe(true);
    act(() => (h.querySelector('[data-testid="cp-save-check"]') as HTMLInputElement).click());
    await flush();
    expect(mockDelete).toHaveBeenCalledWith('a1');
    expect(h.querySelector('[data-testid="cp-save"]')?.getAttribute('data-state')).toBe('deleted');
  });
  it('after the hour (410), or for an attempt already gone, says the recording is gone', async () => {
    mockSave.mockRejectedValue({ response: { status: 410 } });
    const h = mount(<SaveAnswerBox attempt={attempt('pending')} question="Q" />);
    act(() => (h.querySelector('[data-testid="cp-save-check"]') as HTMLInputElement).click());
    await flush();
    expect(h.querySelector('[data-testid="cp-save"]')?.getAttribute('data-state')).toBe('gone');
    act(() => root?.unmount());
    root = null;
    const g = mount(<SaveAnswerBox attempt={attempt('gone')} question="Q" />);
    expect((g.querySelector('[data-testid="cp-save-check"]') as HTMLInputElement).disabled).toBe(true);
  });
});

it('R1.1 Portfolio > Hire opens a section named in the URL', () => {
  expect(initialSection('?tab=hire&section=video')).toBe('video');
  expect(initialSection('?tab=hire&section=nope')).toBe('overview');
});
