import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import CaseStudyFinderSection from './CaseStudyFinderSection';
import { useCaseStudyFinder } from './useCaseStudyFinder';
import * as api from '../../../../services/caseStudyFinderApi';
import type { FinderProposal, FinderState } from '../../../../services/caseStudyFinderApi';

jest.mock('../../../../services/caseStudyFinderApi');
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const proposal = (over: Partial<FinderProposal> = {}): FinderProposal => ({
  id: 'abcdef0123456789', rank: 1,
  process: { key: 'k', owner: 'Org', repo: 'platform', source: 'platform', root: 'backend/src/services/hire', name: 'Hire', codeFiles: 12, testFiles: 4, docPaths: [], samplePaths: [], keywords: [] },
  need: { kind: 'service', id: 'svc-1', name: 'Data Talent Pipeline', status: 'active', reasons: ['Thin proof: evidence score 35 of 100', '2 open Gov opportunities match this service'], needScore: 42 },
  alternatives: [], match: 12, sharedTerms: [], fit: { score: 90, source: 'ai', why: 'A hiring pipeline is exactly this service.' }, possibleOverlaps: [],
  delta: { before: { score: 35, tier: 'thin', insideCount: 1 }, after: { score: 53, tier: 'emerging', insideCount: 2 }, scoreChange: 18, tierChange: true, openOpportunities: 2, firstProof: false, fitGapsAnswered: 0, assumption: 'Assumes it is built from our own repo.' },
  commits: { count: 16, first: '2026-09-01T00:00:00Z', last: '2026-11-10T00:00:00Z', recent: [] },
  narrative: { title: 'Hiring Pipeline for Data Talent', what: 'The hiring pipeline.', when: 'Built over 16 commits.', where: 'Org/platform.', why: 'Thin proof.', how: 'The skill.', need: 'n', helps: 'More proof, 35 -> 53.', solves: 'Inspectable work.', canShow: ['12 source files', '4 automated test files'], source: 'ai' },
  pathScope: ['backend/src/services/hire'], buildCommand: '/build-case-study repo=Org/platform scope=backend/src/services/hire',
  ...over,
});
const state = (over: Partial<FinderState> = {}): FinderState => ({
  run: { id: 'r1', status: 'completed', stage: null, lastError: null, startedBy: 'a', startedAt: '2026-11-16T23:00:00Z', finishedAt: '2026-11-16T23:01:30Z' },
  resultAt: '2026-11-16T23:01:30Z', builds: [],
  result: {
    generatedAt: '2026-11-16T23:01:30Z', needs: { services: 20, withNeed: 14, capabilities: 0, top: [{ kind: 'service', id: 'svc-1', name: 'Data Talent Pipeline', needScore: 42, reasons: [] }] },
    repos: [{ owner: 'Org', repo: 'platform', source: 'platform', status: 'read', processes: 80, note: null }, { owner: 'u', repo: 'gone', source: 'connected', status: 'unavailable', processes: 0, note: 'Could not read the repository.' }],
    processesFound: 232, proposals: [proposal()],
    excluded: [{ key: 'x', name: 'Inbox', reason: 'An existing case study is scoped to this code', caseStudy: { id: 'c', title: 'The interview was in the inbox', status: 'approved' } }],
    notes: ['Read 54 repositories.'],
  },
  ...over,
});

let container: HTMLDivElement; let root: Root;
function Harness(): React.ReactElement { return <CaseStudyFinderSection finder={useCaseStudyFinder()} />; }
const settle = async (): Promise<void> => { for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); }); };
async function render(): Promise<void> {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  await act(async () => { root.render(<Harness />); }); await settle();
}
const q = (sel: string): HTMLElement | null => container.querySelector(sel);
const click = async (el: Element | null): Promise<void> => { await act(async () => { el!.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await settle(); };

beforeEach(() => { (api.getFinder as jest.Mock).mockResolvedValue(state()); });
afterEach(() => { act(() => { root.unmount(); }); container.remove(); jest.clearAllMocks(); });

describe('CaseStudyFinderSection', () => {
  it('shows the proposal at a glance: the need, the fit, before -> after, the 5 Ws and what we can show', async () => {
    await render();
    const card = q('[data-testid="finder-proposal-abcdef0123456789"]')!;
    const text = card.textContent ?? '';
    expect(text).toContain('Hiring Pipeline for Data Talent');
    expect(text).toContain('Proves: Data Talent Pipeline');
    expect(text).toContain('Fit 90');
    expect(q('[data-testid="finder-delta-before"]')?.textContent).toContain('35');
    expect(q('[data-testid="finder-delta-after"]')?.textContent).toContain('53');
    expect(q('[data-testid="finder-delta"]')?.textContent).toContain('+18');
    for (const k of ['What', 'When', 'Where', 'Why', 'How']) expect(text).toContain(k);
    expect(text).toContain('4 automated test files');
    expect(q('[data-testid="finder-kpis"]')?.textContent).toContain('232processes found');
    expect(container.textContent).toContain('Already covered by a case study (1)');
  });

  it('Build is two clicks: review the exact scope and command, then confirm; the result links the draft and the ticket', async () => {
    (api.buildProposal as jest.Mock).mockResolvedValue({ kind: 'built', build: { id: 'b1' } });
    await render();
    await click(q('[data-testid="finder-build"]'));
    expect(q('[data-testid="finder-review"]')?.textContent).toContain('backend/src/services/hire');
    expect(api.buildProposal).not.toHaveBeenCalled();
    (api.getFinder as jest.Mock).mockResolvedValue(state({ builds: [{ id: 'b1', proposalId: 'abcdef0123456789', caseStudyId: 'cs1', title: 't', status: 'prepared', syncStatus: 'running', syncNote: null, scope: [], command: '/build-case-study x caseStudyId=cs1', ticketUrl: 'https://app.basecamp.com/t/1', ticketError: null, createdBy: 'a', createdAt: '', caseStudyUrl: 'https://x/admin/case-studies/cs1' }] }));
    await click(q('[data-testid="finder-confirm"]'));
    expect(api.buildProposal).toHaveBeenCalledWith('abcdef0123456789', ['backend/src/services/hire'], false);
    expect(q('[data-testid="finder-ticket"]')?.getAttribute('href')).toBe('https://app.basecamp.com/t/1');
    expect(q('[data-testid="finder-command"]')?.textContent).toContain('caseStudyId=cs1');
  });

  it('a hard-stop overlap is shown and nothing can be confirmed', async () => {
    (api.buildProposal as jest.Mock).mockResolvedValue({ kind: 'overlap', error: 'covered', needsAcknowledgement: false, overlaps: [{ reason: 'An existing case study is scoped to this code', caseStudy: { id: 'c', title: 'Hiring story', status: 'approved' } }] });
    await render();
    await click(q('[data-testid="finder-build"]'));
    await click(q('[data-testid="finder-confirm"]'));
    expect(q('[data-testid="finder-overlaps"]')?.textContent).toContain('Stopped: an existing case study already covers this');
    expect((q('[data-testid="finder-confirm"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('a possible overlap must be acknowledged before Confirm is enabled', async () => {
    (api.getFinder as jest.Mock).mockResolvedValue(state({ result: { ...state().result!, proposals: [proposal({ possibleOverlaps: [{ reason: 'A broad case study includes backend/src/services', caseStudy: { id: 'c', title: 'Platform', status: 'approved' } }] })] } }));
    (api.buildProposal as jest.Mock).mockResolvedValue({ kind: 'built', build: { id: 'b1' } });
    await render();
    await click(q('[data-testid="finder-build"]'));
    const confirm = q('[data-testid="finder-confirm"]') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    await click(q('#finder-ack-abcdef0123456789'));
    expect(confirm.disabled).toBe(false);
    await click(confirm);
    expect(api.buildProposal).toHaveBeenCalledWith('abcdef0123456789', ['backend/src/services/hire'], true);
  });

  it('while a run is going the stage shows, the button is disabled, and the last result stays', async () => {
    (api.getFinder as jest.Mock).mockResolvedValue(state({ run: { ...state().run!, status: 'running', stage: 'Judging fit (3 of 24)' } }));
    await render();
    expect(q('[data-testid="finder-stage"]')?.textContent).toContain('Judging fit (3 of 24)');
    expect((q('[data-testid="finder-run"]') as HTMLButtonElement).disabled).toBe(true);
    expect(q('[data-testid="finder-proposal-abcdef0123456789"]')).not.toBeNull();
  });

  it('with no run yet it says what the Finder does and offers to run it', async () => {
    (api.getFinder as jest.Mock).mockResolvedValue({ run: null, result: null, resultAt: null, builds: [] });
    (api.startFinderRun as jest.Mock).mockResolvedValue({ id: 'r2', status: 'running', stage: 'Starting' });
    await render();
    expect(container.textContent).toContain('No run yet');
    await click(q('[data-testid="finder-run"]'));
    expect(api.startFinderRun).toHaveBeenCalled();
  });
});
