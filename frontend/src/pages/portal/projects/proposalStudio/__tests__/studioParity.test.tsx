/* eslint-disable */
/**
 * studioParity — the v4 page-by-page fidelity GATE (PAGE_SPEC "Pass/fail: tests/studio-parity.cjs").
 *
 * It renders each Proposal Studio surface with fixtures and asserts every required `data-testid` from the v4 demo is
 * in the DOM, plus the global rule that NO rendered button is named "Approve". The required-testid table below is the
 * contract taken straight from docs/gov-proposal-studio/designs/proposal-studio-v4.html; each v4 task flips its slice
 * green. Runs under CRA/jest (react-dom/client + act — this repo has no RTL); the repo-root tests/studio-parity.cjs
 * wrapper execSyncs this suite so `node tests/studio-parity.cjs` is the named gate.
 */
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import type { StudentGovProjectView, GovProposalDocument, GovStudioApi, GovReviewApi } from '../../../../../services/govProjectPortalApi';

import ContractBar from '../ContractBar';
import StageRail from '../StageRail';
import AgentPanel from '../AgentPanel';
import WhereWeAre from '../WhereWeAre';
import NeedsInbox from '../NeedsInbox';
import DocumentSet from '../DocumentSet';
import ReviewGatesView from '../ReviewGatesView';
import BuildEvidence from '../BuildEvidence';
import DraftVersions from '../DraftVersions';
import Blueprint from '../Blueprint';
import PackageView from '../PackageView';

// ── fixtures ───────────────────────────────────────────────────────────────────────────────────────────────────
const doc = (over: Partial<GovProposalDocument>): GovProposalDocument => ({
  key: 'technical', title: 'Technical Proposal', status: 'drafted', contentHtml: '<h3>Approach</h3><p>x</p>', version: 2,
  gate: false, order: 3, requirementIds: ['R-1', 'R-2'], docType: 'derived', pageLimit: 20, fileName: 'technical.pdf',
  comments: [], draftedAt: null, acceptedAt: null, superseded: false,
  latest: { versionId: 'v2', version: 2, scores: { coverage: 90, format: 90, fact: 90, evaluator: 88, proof: 85, clarity: 86 }, passes: false, pageCount: 8, createdAt: null },
  gates: { pink: 'approved', red: 'approved', gold: 'pending', white_glove: 'approved' } as any, currentGate: 'gold',
  openGapCount: 1, fatalCount: 0, needsCount: 1, fatalNeedsCount: 0, cycle: null, ...over,
});
const DOCS: GovProposalDocument[] = [
  doc({ key: 'cover_letter', title: 'Cover Letter', status: 'not_started', docType: 'derived', latest: null, needsCount: 0, requirementIds: ['R-1'] }),
  doc({ key: 'technical' }),
  doc({ key: 'pricing', title: 'Price Proposal', docType: 'generated', adminOnly: true } as any),
];
const NEED = (over: any = {}) => ({ kind: 'fact', key: 'fact:years', ask: 'How many years in business?', why: 'The draft left a placeholder.', usedIn: [{ docKey: 'technical', sectionKey: 'a' }], format: 'a short answer', blocking: 'fatal', source: { quote: 'Provide years', file: 'rfp.pdf', page: 4 }, ...over });
const VIEW = {
  projectId: 'p1', name: 'Saratoga Springs RFP', status: 'in_progress', tracks: [], requirements: [],
  requirementCounts: { total: 12, proposal: 8, build: 4 }, build: {} as any, viewerCanVerify: true, agency: 'City of Saratoga',
  keyDates: [], proposalDocuments: DOCS, proposalReadiness: { pct: 64, passing: 1, total: 3 }, needsCount: 2, fatalNeedsCount: 1,
  buildSummary: { studentProjectId: 'sp1', releases: [], rollup: { total: 10, verified: 6, complete: 6, inProgress: 0, blocked: 0, notStarted: 4, pct: 60 } },
  buildArtifacts: [
    { id: 'a1', storyId: 's1', requirementIds: ['R-1'], commitSha: 'abc1234', caption: 'Search screen', capturedAt: null, status: 'verified' },
    { id: 'a2', storyId: 's2', requirementIds: [], commitSha: null, caption: null, capturedAt: null, status: 'open' },
  ],
  blueprint: { rules: [{ key: 'page_limit', value: '20', quote: 'q', sourceFile: 'f', severity: 'fatal' }], forms: [], scoring: { basis: 'best_value', basisQuote: 'q', totalPoints: 100, factors: [{ label: 'Technical', points: 40, quote: 'q' }] }, addenda: [], eliminationRisks: [], buyerType: 'local_government', droppedRuleCount: 0, sourceFiles: ['f'], generatedAt: 'x', jurisdiction: { state: 'UT', quote: 'Utah' }, stateFormsStatus: { state: 'UT', loaded: false, note: 'no rulebook' } },
} as unknown as StudentGovProjectView;

const studioApi: GovStudioApi = {
  listQuestions: async () => [],
  answerQuestion: async () => ({ resolved: 0, documents: [] }),
  listActivity: async () => [{ kind: 'version', at: new Date().toISOString(), summary: 'Drafted Technical v2', docKey: 'technical' }],
  startReviewCycle: async () => ({ runId: 'r1' }),
  getReviewRun: async () => ({ id: 'r1', documentId: 'technical', status: 'running', iterations: 1, lastMessage: 'Drafting section 4 of 9', startedAt: null, finishedAt: null }),
  getVersionContent: async () => ({ contentHtml: '<h3>Approach</h3><p>[PLACEHOLDER: years in business]</p>', sections: [{ sectionKey: 'a', heading: 'Approach', requirementIds: ['R-1'], order: 1, plan: 'hot button', contentHtml: '<p>x</p>' }], figures: [] }),
  listNeeds: async () => ({ needs: [NEED(), NEED({ key: 'decision:x', kind: 'decision', blocking: 'score', ask: 'Pick A or B', options: ['A', 'B'] })], blockingExport: [NEED()], holdingScore: [NEED({ key: 'decision:x', blocking: 'score' })] }),
  resolveNeed: async () => ({ resolved: 'fact:years', store: 'library', status: 'answered', unblocked: ['technical'] }),
  buildAll: async () => ({ started: true, enqueued: [{ docKey: 'technical', runId: 'r1' }], skipped: [] }),
};
const reviewApi: GovReviewApi = {
  listReview: async () => ({ versions: [{ id: 'v2', version: 2, authorKind: 'agent', changeSummary: 'draft', scores: DOCS[1].latest!.scores, findings: [], passes: false, pageCount: 8, createdAt: null }], gates: [] }),
  runChecks: async () => ({ scores: { coverage: 90, format: 90, fact: 90, evaluator: 88, proof: 85, clarity: 86 }, findings: [], fatal: [], passes: false, pageCount: 8 }),
  decideGate: async () => ({ gates: [] }),
  diffVersions: async () => ({ segments: [] }),
  fetchArtifactImage: async () => 'blob:x',
  insertFigure: async () => ({ document: DOCS[1] }),
  setDemoUrl: async () => ({ ok: true }),
  recapture: async () => ({}),
  runReviewCycle: async () => ({ started: true, maxIterations: 3 }),
  answerQuestion: async () => ({ factId: 'f1', gapsResolved: 1 }),
  listSignatures: async () => ({ signatures: [] }),
  uploadSignedForm: async () => ({ ok: true }),
  assemblePackage: async () => ({ ok: false, blocking: ['Gold Go not given'] }),
  saveSectionPlan: async () => ({ document: DOCS[1] }),
  editDocument: async () => ({ saved: true, passes: false, resumed: true }),
  decideGold: async () => ({ decision: 'go', approved: ['technical'] }),
};
const noop = () => {};

// ── required data-testid contract (from designs/proposal-studio-v4.html) ─────────────────────────────────────────
const GLOBAL = ['studio-bar', 'bar-ready', 'bar-needs', 'bar-tour', 'rail', 'rail-step-needs', 'rail-needs-badge', 'rail-step-overview', 'rail-step-blueprint', 'rail-step-documents', 'rail-step-evidence', 'rail-step-editor', 'rail-step-gates', 'rail-step-package', 'agent-panel', 'agent-state', 'agent-log', 'agent-needs', 'agent-ask'];
const VIEW_TESTIDS: Record<string, string[]> = {
  overview: ['overview-build-hero', 'btn-build-all', 'overview-readiness', 'overview-doc-technical', 'overview-needs', 'help'],
  needs: ['needs-group-fatal', 'needs-group-score', 'need-card', 'need-quote', 'need-format', 'need-control', 'need-used'],
  documents: ['docs-library', 'btn-build-all', 'docs-table', 'docs-row', 'docs-build-it', 'docs-needs', 'help'],
  blueprint: ['bp-reanalyze', 'bp-log', 'bp-weights', 'bp-rules', 'bp-state-forms', 'help'],
  gates: ['gates-matrix', 'gates-row', 'gates-row-chips', 'gates-team-pink', 'gates-team-red', 'gates-team-glove', 'gates-team-gold', 'help'],
  evidence: ['ev-demo-url', 'ev-capture', 'ev-insert', 'ev-decide', 'help'],
  editor: ['ed-paper', 'ed-running-header', 'ed-tab-paper', 'ed-tab-outline', 'ed-tab-pdf', 'ed-doc-pick', 'ed-section', 'ed-reqref', 'ed-checks', 'ed-plan', 'ed-versions', 'help'],
  package: ['pkg-files', 'pkg-sealed', 'pkg-checklist', 'pkg-export', 'help'],
};

// ── render helpers (react-dom/client + act; no RTL in this repo) ─────────────────────────────────────────────────
let container: HTMLDivElement; let root: Root;
const flush = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0)); }); };
async function render(el: React.ReactElement) {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  await act(async () => { root.render(<MemoryRouter initialEntries={['/?view=overview']}>{el}</MemoryRouter>); });
  await flush();
}
afterEach(() => { if (root) act(() => root.unmount()); if (container) container.remove(); });
const present = (id: string) => !!container.querySelector(`[data-testid="${id}"]`);
const missing = (ids: string[]) => ids.filter((id) => !present(id));

const CHROME = (
  <>
    <ContractBar view={VIEW} onStartTour={noop} onNeeds={noop} />
    <StageRail view={VIEW} current={'overview' as any} onNavigate={noop} />
    <AgentPanel projectId="p1" studioApi={studioApi} docs={DOCS} onReload={noop} onNavigate={noop} onAsk={async () => 'ok'} onToast={noop} />
  </>
);
const VIEW_EL: Record<string, React.ReactElement> = {
  overview: <WhereWeAre view={VIEW} onNavigate={noop} studioApi={studioApi} onReload={noop} onToast={noop} />,
  blueprint: <Blueprint view={VIEW} onReanalyze={noop} reanalyzing={false} onToast={noop} />,
  needs: <NeedsInbox projectId="p1" docs={DOCS} studioApi={studioApi} onReload={noop} onNavigate={noop} onToast={noop} />,
  documents: <DocumentSet view={VIEW} projectId="p1" docs={DOCS} studioApi={studioApi} onOpen={noop} onReload={noop} onToast={noop} />,
  gates: <ReviewGatesView projectId="p1" docs={DOCS} reviewApi={reviewApi} onOpenDoc={noop} onToast={noop} />,
  evidence: <BuildEvidence view={VIEW} projectId="p1" reviewApi={reviewApi} onReload={noop} onToast={noop} />,
  editor: <DraftVersions view={VIEW} projectId="p1" docs={DOCS} studioApi={studioApi} reviewApi={reviewApi} initialDocKey="technical" onReload={noop} onToast={noop} />,
  package: <PackageView view={VIEW} projectId="p1" docs={DOCS} reviewApi={reviewApi} onToast={noop} />,
};

describe('Proposal Studio v4 parity', () => {
  it('global chrome exposes the bar/rail/agent testids', async () => {
    await render(CHROME);
    expect(missing(GLOBAL)).toEqual([]);
  });

  for (const [view, ids] of Object.entries(VIEW_TESTIDS)) {
    it(`${view} exposes its required testids`, async () => {
      await render(VIEW_EL[view]);
      expect(missing(ids)).toEqual([]);
    });
  }

  it('no button anywhere is named "Approve"', async () => {
    for (const el of Object.values(VIEW_EL)) {
      await render(el);
      const approve = Array.from(container.querySelectorAll('button')).filter((b) => (b.textContent || '').trim() === 'Approve');
      expect(approve.length).toBe(0);
      act(() => root.unmount()); container.remove();
    }
  });
});
