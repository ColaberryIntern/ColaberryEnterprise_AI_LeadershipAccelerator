/**
 * The readiness card: where a build sits on the ladder, and the two things
 * it must never do: claim a rung the server did not compute, or offer a way
 * to publish.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { getCaseStudyFoundation } from '../../../../services/sbpApi';

jest.mock('../../../../services/sbpApi', () => ({ getCaseStudyFoundation: jest.fn() }));

import CaseStudyReadinessCard, { CaseStudyLadder } from '../CaseStudyReadinessCard';
import type { CaseStudyFoundation } from '../../../../services/sbpApi';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const mockGet = getCaseStudyFoundation as unknown as jest.Mock;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { jest.clearAllMocks(); container = document.createElement('div'); document.body.appendChild(container); });
afterEach(() => { act(() => { root.unmount(); }); document.body.removeChild(container); });
async function mount(ui: React.ReactElement) { await act(async () => { root = createRoot(container); root.render(ui); }); }

const LADDER = ['story_hypothesis', 'build_record', 'capability_demonstration', 'operational_result', 'impact_case_study'] as const;
const foundation = (over: Partial<CaseStudyFoundation> = {}): CaseStudyFoundation => ({
  project_id: 'p', maturity: 'build_record', ladder: [...LADDER],
  maturityReason: '1 verified story, no demonstration reference yet.',
  nextRungNeeds: 'A story that points at a demonstration.',
  truthRevision: 2, hypothesisCoverage: { filled: 3, total: 7 },
  buildEvidence: { facts: [{ dimension: 'integrations', label: 'What it talks to', value: 'Reads Xero.', evidence: 'src/xero.ts' }], stories: [], verifiedStories: 1 },
  demonstrationEvidence: [], outcomeEvidence: { items: [], why: 'No approved measurement definitions exist.', heldMeasurementEvents: 0 },
  openQuestions: 0, publicationPreference: 'undecided', publishable: false, limitations: [],
  ...over,
});

describe('the ladder', () => {
  it('marks the rung the server computed, and the top two as needing a measured result', async () => {
    await mount(<CaseStudyLadder foundation={foundation()} />);
    const rungs = Array.from(container.querySelectorAll('.pj-rung')).map((el) => [el.getAttribute('data-rung'), el.getAttribute('data-state')]);
    expect(rungs).toEqual([
      ['story_hypothesis', 'done'],
      ['build_record', 'here'],
      ['capability_demonstration', 'next'],
      ['operational_result', 'measured'],
      ['impact_case_study', 'measured'],
    ]);
    expect(container.textContent).toContain('You are here');
    expect((container.textContent!.match(/needs a measured result/g) ?? []).length).toBe(2);
  });
});

describe('the card', () => {
  it('renders the counts, the reason, the next rung, and the not-published line; and no button', async () => {
    mockGet.mockResolvedValue({ ok: true, foundation: foundation() });
    await mount(<CaseStudyReadinessCard projectId="p" />);
    const text = container.textContent || '';
    expect(text).toContain('Case study readiness');
    expect(text).toContain('1 verified story, no demonstration reference yet.');
    expect(text).toContain('Next: A story that points at a demonstration.');
    expect(text).toContain('Facts your build showed1');
    expect(text).toContain('Outcomes measured in use0');
    expect(container.querySelector('[data-testid="case-study-not-published"]')!.textContent).toMatch(/nothing on this page can publish it/);
    expect(container.querySelector('button')).toBeNull();
    expect(text).not.toMatch(/publish now|Publish/);
  });

  it('shows open questions only when there are any', async () => {
    mockGet.mockResolvedValue({ ok: true, foundation: foundation({ openQuestions: 2 }) });
    await mount(<CaseStudyReadinessCard projectId="p" />);
    expect(container.textContent).toContain('Questions a story raised2');
  });

  it('renders nothing when the intake never ran, and nothing when the server cannot be reached', async () => {
    mockGet.mockResolvedValue({ ok: true, foundation: null });
    await mount(<CaseStudyReadinessCard projectId="p" />);
    expect(container.innerHTML).toBe('');
    act(() => { root.unmount(); });

    mockGet.mockResolvedValue({ ok: false, error: { status: 503, kind: 'server_error', message: 'x' } });
    await mount(<CaseStudyReadinessCard projectId="p" />);
    expect(container.innerHTML).toBe('');
  });
});
