import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import AiVettingCard from './AiVettingCard';
import { ProposalSummaryPanel } from './ProposalSummaryPanel';
import { ClarificationDraftPanel } from './ClarificationDraftPanel';
import { FitCapabilitiesPanel } from './FitCapabilitiesPanel';
import { buildCandidateRows } from './candidateRows';
import { ScoreChip } from './govOpportunityParts';
import { band } from '../govOppFormat';
import * as factoryApi from '../../../services/factoryApi';

jest.mock('../../../services/factoryApi');

let container: HTMLDivElement; let root: Root;
const render = async (el: React.ReactElement) => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(el); });
  await act(async () => { await Promise.resolve(); });
};
const text = () => container.textContent ?? '';
const button = (label: string) => Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(label)) as HTMLButtonElement;
const click = async (b: HTMLButtonElement) => { await act(async () => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); }); };

beforeEach(() => { localStorage.clear(); });
afterEach(() => { act(() => { root.unmount(); }); container.remove(); jest.clearAllMocks(); });

const base = { status: 'completed', verdict: 'pursue', reason: 'A strong match.', quote: null, coveragePct: 80, errorClass: null, fit: null, summary: null, questions: null, extraction: null } as any;

describe('a bid with no fit score', () => {
  it('reads as unknown, not as a low score', async () => {
    expect(band(null)).toEqual({ label: 'Unknown', tone: 'secondary' });
    await render(<ScoreChip score={null} />);
    expect(text()).toContain('Unknown');
    expect(text()).not.toContain('Low');
    expect(container.querySelector('.bg-danger, .bg-danger-subtle')).toBeNull();
  });
});

describe('AiVettingCard', () => {
  it('renders nothing with no vetting, so a workspace before any upload is unchanged', async () => {
    await render(<AiVettingCard vetting={null} />);
    expect(container.querySelector('[data-testid="ai-vetting-card"]')).toBeNull();
  });
  it('stars a pursue, with coverage and the reason', async () => {
    await render(<AiVettingCard vetting={base} />);
    expect(text()).toContain('⭐ AI vetted');
    expect(text()).toContain('80%');
    expect(text()).toContain('A strong match.');
  });
  it('shows queued and running honestly, with no verdict', async () => {
    await render(<AiVettingCard vetting={{ ...base, status: 'running', verdict: null, reason: null }} />);
    expect(text()).toContain('running on this ZIP');
    expect(text()).not.toContain('AI vetted');
  });
  it('a failed try does not claim to be running: it says when it tries again', async () => {
    await render(<AiVettingCard vetting={{ ...base, status: 'queued', verdict: null, reason: null, errorClass: 'TimeoutError' }} />);
    expect(text()).not.toContain('running on this ZIP');
    expect(text()).toContain('TimeoutError');
    expect(text()).toContain('next morning');
  });
  it('with the AI off it says so, instead of showing a spinner forever', async () => {
    await render(<AiVettingCard vetting={{ ...base, aiEnabled: false, status: 'queued', verdict: null, reason: null }} />);
    expect(text()).toContain('checks are off');
    expect(text()).not.toContain('running on this ZIP');
  });
  it('shows inconclusive with why the checks stopped', async () => {
    await render(<AiVettingCard vetting={{ ...base, verdict: 'inconclusive', reason: 'Please read it yourself.', errorClass: 'attempts_exhausted', coveragePct: null }} />);
    expect(text()).toContain('needs your read');
    expect(text()).toContain('attempts_exhausted');
    expect(text()).not.toContain('AI vetted');
  });
  it('says what comes next: it does not approve anything', async () => {
    await render(<AiVettingCard vetting={base} />);
    expect(text()).toContain('then request approval');
  });
  it('renders AI text as text, never markup', async () => {
    await render(<AiVettingCard vetting={{ ...base, reason: '<img src=x onerror=alert(1)>', quote: '<script>x</script>' }} />);
    expect(container.querySelector('img,script')).toBeNull();
    expect(text()).toContain('<img src=x');
  });
});

describe('ProposalSummaryPanel saved results', () => {
  const saved = { whatTheyWant: 'Saved want', whatWedBuild: 'Saved build', cached: false, generatedAt: 't' } as any;
  const props = { canonical: 'gws:a', requirements: [], synopsis: null };
  it('a newer saved result beats a stale browser copy from an old ZIP; a newer button run beats the saved one', async () => {
    const local = { whatTheyWant: 'Old ZIP want', whatWedBuild: 'x', cached: false, generatedAt: '2026-11-01T00:00:00Z' };
    localStorage.setItem('govProposalSummary:gws:a', JSON.stringify(local));
    await render(<ProposalSummaryPanel {...props} saved={{ ...saved, generatedAt: '2026-11-04T00:00:00Z' }} />);
    expect(text()).toContain('Saved want');
    expect(text()).not.toContain('Old ZIP want');
    act(() => { root.unmount(); }); container.remove();
    await render(<ProposalSummaryPanel {...props} saved={{ ...saved, generatedAt: '2026-10-01T00:00:00Z' }} />);
    expect(text()).toContain('Old ZIP want');
  });
  it('shows them with no click and labels where they came from', async () => {
    await render(<ProposalSummaryPanel {...props} saved={saved} />);
    expect(text()).toContain('Saved want');
    expect(text()).toContain('Saved by the automatic AI checks');
    expect(factoryApi.getGovProposalSummary).not.toHaveBeenCalled();
  });
  it('keeps the button as a re-run, and a run replaces the saved result', async () => {
    (factoryApi.getGovProposalSummary as jest.Mock).mockResolvedValue({ whatTheyWant: 'Fresh want', whatWedBuild: 'Fresh build' });
    await render(<ProposalSummaryPanel {...props} requirements={[{ id: 'R1', text: 'x' }]} saved={saved} />);
    await click(button('Re-run AI summary'));
    expect(text()).toContain('Fresh want');
    expect(text()).not.toContain('Saved by the automatic AI checks');
  });
  it('an earlier run in this browser wins over the saved result', async () => {
    localStorage.setItem('govProposalSummary:gws:a', JSON.stringify({ whatTheyWant: 'Local want', whatWedBuild: 'Local build' }));
    await render(<ProposalSummaryPanel {...props} saved={saved} />);
    expect(text()).toContain('Local want');
    expect(text()).not.toContain('Saved want');
  });
  it('with nothing saved, behaves as before', async () => {
    await render(<ProposalSummaryPanel {...props} />);
    expect(button('Summarize this opportunity (AI)')).toBeDefined();
    expect(text()).not.toContain('Saved by the automatic');
  });
});

describe('ClarificationDraftPanel saved results', () => {
  const saved = { questions: [{ requirementId: 'R1', question: 'Which system?', ambiguity: 'Not named.' }], email: 'Dear buyer', cached: false, generatedAt: 't' } as any;
  it('shows the saved questions with no click, before anything is established', async () => {
    await render(<ClarificationDraftPanel canonical="gws:a" requirements={[]} saved={saved} />);
    expect(text()).toContain('Which system?');
    expect(text()).toContain('Saved by the automatic AI checks');
    expect(text()).not.toContain('Establish the cited requirements first');
    expect(factoryApi.getGovClarificationQuestions).not.toHaveBeenCalled();
  });
  it('a run replaces the saved draft', async () => {
    (factoryApi.getGovClarificationQuestions as jest.Mock).mockResolvedValue({ questions: [{ requirementId: 'R2', question: 'Fresh?', ambiguity: '' }], email: 'e' });
    await render(<ClarificationDraftPanel canonical="gws:a" requirements={[{ id: 'R2', text: 'x' }]} saved={saved} />);
    await click(button('Re-draft questions (AI)'));
    expect(text()).toContain('Fresh?');
    expect(text()).not.toContain('Which system?');
  });
  it('with nothing saved, still asks for established requirements', async () => {
    await render(<ClarificationDraftPanel canonical="gws:a" requirements={[]} />);
    expect(text()).toContain('Establish the cited requirements first');
  });
});

describe('FitCapabilitiesPanel saved results', () => {
  const cap = { id: 'C1', name: 'Permitting workflow', why: 'w', assessment: 'have', matchedServiceId: null, rationale: 'r' } as any;
  const props = { canonicalOpportunityId: 'gws:a', title: 'T', buyer: 'B', gaps: { items: [] } as any, biddingEntity: 'colaberry', version: 1, canWrite: true, onSaved: jest.fn() };
  it('shows the saved capabilities with no click', async () => {
    await render(<FitCapabilitiesPanel {...props} needs={[]} savedCapabilities={[cap]} />);
    expect(text()).toContain('Permitting workflow');
    expect(text()).toContain('Saved by the automatic AI checks');
    expect(factoryApi.assessCapabilityFit).not.toHaveBeenCalled();
    expect(text()).not.toContain('No requirements established yet');
  });
  it('Re-assess replaces them', async () => {
    (factoryApi.assessCapabilityFit as jest.Mock).mockResolvedValue({ capabilities: [{ ...cap, name: 'Fresh capability' }] });
    await render(<FitCapabilitiesPanel {...props} needs={[{ id: 'R1', text: 'x' }]} savedCapabilities={[cap]} />);
    await click(button('Re-assess'));
    expect(text()).toContain('Fresh capability');
    expect(text()).not.toContain('Permitting workflow');
    expect(text()).not.toContain('Saved by the automatic AI checks');
  });
  it('with nothing saved, behaves as before', async () => {
    await render(<FitCapabilitiesPanel {...props} needs={[]} savedCapabilities={null} />);
    expect(text()).toContain('No requirements established yet');
  });
});

describe('buildCandidateRows', () => {
  const dueStage = (c: any) => (c === 'scope' ? 'delivery' : 'submission') as any;
  it('ticks every candidate and takes the due stage from its item category', () => {
    const rows = buildCandidateRows(
      [{ id: 'R1', text: 'a' }, { id: 'R2', text: 'b' }] as any,
      [{ id: 'I1', category: 'scope', sourceFragments: [{ reqId: 'R1' }] }] as any,
      dueStage,
    );
    expect(rows.R1).toEqual({ checked: true, applicability: 'always', dueStage: 'delivery' });
    expect(rows.R2).toEqual({ checked: true, applicability: 'always', dueStage: 'submission' });
  });
  it('tolerates no items', () => expect(buildCandidateRows([{ id: 'R1', text: 'a' }] as any, null, dueStage).R1.dueStage).toBe('submission'));
});
