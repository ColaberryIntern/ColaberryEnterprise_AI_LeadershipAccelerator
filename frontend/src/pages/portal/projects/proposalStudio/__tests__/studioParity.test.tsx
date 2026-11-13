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
import type { StudentGovProjectView, GovProposalDocument, GovStudioApi, GovReviewApi, GovCockpitApi } from '../../../../../services/govProjectPortalApi';

import ContractBar from '../ContractBar';
import StageDetail from '../StageDetail';
import StageRail from '../StageRail';
import AgentPanel from '../AgentPanel';
import QualRail from '../QualRail';
import WhereWeAre from '../WhereWeAre';
import NeedsInbox from '../NeedsInbox';
import DocumentSet from '../DocumentSet';
import ReviewGatesView from '../ReviewGatesView';
import BuildEvidence from '../BuildEvidence';
import DraftVersions from '../DraftVersions';
import Blueprint from '../Blueprint';
import PackageView from '../PackageView';
import StudioShell from '../StudioShell';
import { viewOpensQualification, deriveContractStepState } from '../buildHelpers';

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

describe('ContractBar — deadline + urgency survive the move into the Studio', () => {
  const withDates = (over: Partial<StudentGovProjectView>) => ({ ...VIEW, ...over } as StudentGovProjectView);
  const text = (id: string) => container.querySelector(`[data-testid="${id}"]`)?.textContent ?? '';

  it('shows the authoritative close date, a countdown, and the priority chip', async () => {
    await render(<ContractBar view={withDates({ closeDate: '2030-01-15', priorityScore: 70, keyDates: [] })} onNeeds={noop} />);
    expect(present('bar-closes')).toBe(true);
    expect(present('bar-countdown')).toBe(true);
    expect(present('bar-priority')).toBe(true);
    expect(text('bar-closes')).toContain('2030-01-15');
    expect(text('bar-priority')).toContain('70');
  });

  it('PREFERS the authoritative closeDate over the AI-extracted dossier key dates', async () => {
    await render(<ContractBar view={withDates({ closeDate: '2030-01-15', keyDates: [{ date: '2027-02-02', text: 'Proposals due' }] })} onNeeds={noop} />);
    expect(text('bar-closes')).toContain('2030-01-15');
    expect(text('bar-closes')).not.toContain('2027-02-02');
  });

  it('falls back to the dossier key date when the payload carries no authoritative closeDate (older backend)', async () => {
    await render(<ContractBar view={withDates({ closeDate: null, keyDates: [{ date: '2030-03-03', text: 'Proposals due' }] })} onNeeds={noop} />);
    expect(present('bar-closes')).toBe(true); // the countdown still shows from the dossier fallback
  });

  it('hides the priority chip when no priority score is carried (older backend)', async () => {
    await render(<ContractBar view={withDates({ priorityScore: null, closeDate: '2030-01-15', keyDates: [] })} onNeeds={noop} />);
    expect(present('bar-priority')).toBe(false);
  });
});

describe('ContractBar — management can set a due date when the pursuit carried none', () => {
  const withDates = (over: Partial<StudentGovProjectView>) => ({ ...VIEW, ...over } as StudentGovProjectView);
  const q = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const setValue = (el: HTMLInputElement, v: string) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };

  it('offers "Set due date" ONLY to a manager with no close date — hidden for an intern, and once a date exists', async () => {
    await render(<ContractBar view={withDates({ closeDate: null, keyDates: [] })} onNeeds={noop} canManage={false} onSetDueDate={noop} />);
    expect(present('bar-set-due')).toBe(false); // an intern never sets the deadline
    act(() => root.unmount()); container.remove();
    await render(<ContractBar view={withDates({ closeDate: null, keyDates: [] })} onNeeds={noop} canManage onSetDueDate={noop} />);
    expect(present('bar-set-due')).toBe(true);
    act(() => root.unmount()); container.remove();
    await render(<ContractBar view={withDates({ closeDate: '2030-01-15', keyDates: [] })} onNeeds={noop} canManage onSetDueDate={noop} />);
    expect(present('bar-set-due')).toBe(false); // a date is set -> the Closes chip replaces the setter
    expect(present('bar-closes')).toBe(true);
  });

  it('expands, takes a date + urgency, and calls onSetDueDate with them', async () => {
    const calls: Array<[string, number | null]> = [];
    const onSet = (closeDate: string, priorityScore: number | null): void => { calls.push([closeDate, priorityScore]); };
    await render(<ContractBar view={withDates({ closeDate: null, keyDates: [] })} onNeeds={noop} canManage onSetDueDate={onSet} />);
    await act(async () => { (q('bar-set-due') as HTMLButtonElement).click(); });
    setValue(q('bar-due-date') as HTMLInputElement, '2026-12-15');
    setValue(q('bar-due-prio') as HTMLInputElement, '55');
    await act(async () => { (q('bar-due-save') as HTMLButtonElement).click(); });
    await flush();
    expect(calls).toEqual([['2026-12-15', 55]]);
  });
});

describe('StageDetail — read-only vetting-stage panels (Snapshot/Solicitation/Fit/Decide/Outcome)', () => {
  const text = (id: string) => container.querySelector(`[data-testid="${id}"]`)?.textContent ?? '';

  it('Solicitation shows the requirement count, key dates and the blueprint summary from the projection', async () => {
    await render(<StageDetail stage="solicitation" view={VIEW} />);
    expect(present('stage-solicitation')).toBe(true);
    expect(text('stage-reqcount')).toContain('12');
    expect(present('stage-blueprint')).toBe(true);
    expect(text('stage-blueprint')).toContain('100'); // Section M total points
    expect(present('stage-coming')).toBe(false);       // the rich stage carries real data, not a placeholder
  });

  it('Snapshot surfaces agency + readiness and flags the deeper record as the next increment', async () => {
    await render(<StageDetail stage="snapshot" view={VIEW} />);
    expect(present('stage-snapshot')).toBe(true);
    expect(text('stage-snapshot')).toContain('City of Saratoga');
    expect(text('stage-snapshot')).toContain('64%');
    expect(present('stage-coming')).toBe(true);
  });

  it('Fit, Decide and Outcome each render their panel from available projection data', async () => {
    await render(<StageDetail stage="fit" view={VIEW} />);
    expect(text('stage-fit')).toContain('6 / 10'); // build stories verified
    act(() => root.unmount()); container.remove();
    await render(<StageDetail stage="decide" view={VIEW} />);
    expect(text('stage-decision')).toContain('Approved');
    act(() => root.unmount()); container.remove();
    await render(<StageDetail stage="outcome" view={VIEW} />);
    expect(present('stage-outcome-status')).toBe(true);
  });
});

describe('StageDetail — the legacy workspace read (meetings, AI vetting, what-they-want) now rides on the stage panels', () => {
  const text = (id: string) => container.querySelector(`[data-testid="${id}"]`)?.textContent ?? '';
  const VIEW_VETTED = {
    ...VIEW,
    requirements: [{ canonicalReqId: 'R-1', statement: 'Data platform', priority: 'must', tracks: ['proposal'], evidenceState: 'open' }],
    meetings: [{ date: 'November 10, 2026', text: 'A pre-proposal conference will be held Tuesday, November 10, 2026 at 10:00 am local time.' }],
    vetting: { status: 'completed', verdict: 'pursue', coveragePct: 75, reason: 'The core work matches Our Services.', quote: 'The vendor shall provide an integrated data platform.' },
    opportunitySummary: { whatTheyWant: 'An integrated data platform.', whatWedBuild: 'A cloud-native platform.' },
  } as unknown as StudentGovProjectView;

  it('Solicitation surfaces the pre-proposal meeting from the dossier', async () => {
    await render(<StageDetail stage="solicitation" view={VIEW_VETTED} />);
    expect(present('stage-meetings')).toBe(true);
    expect(text('stage-meetings')).toContain('pre-proposal conference');
  });

  it('Snapshot shows the AI verdict, coverage and the what-they-want summary, and drops the placeholder', async () => {
    await render(<StageDetail stage="snapshot" view={VIEW_VETTED} />);
    expect(text('stage-vetting')).toContain('pursuing');
    expect(text('stage-coverage')).toContain('75%');
    expect(text('stage-summary')).toContain('What they want');      // the two-column card renders
    expect(text('stage-summary')).toContain('integrated data platform');
    expect(text('ai-vetting-card')).toContain('vendor shall provide'); // the source quote renders in the full card
    expect(present('stage-coming')).toBe(false);
  });

  it('Fit and Decide carry the vetting read instead of the placeholder', async () => {
    await render(<StageDetail stage="fit" view={VIEW_VETTED} />);
    expect(text('stage-coverage')).toContain('75%');
    expect(present('stage-coming')).toBe(false);
    act(() => root.unmount()); container.remove();
    await render(<StageDetail stage="decide" view={VIEW_VETTED} />);
    expect(text('stage-vetting')).toContain('pursuing');
    expect(present('stage-coming')).toBe(false);
  });
});

describe('StageDetail — FULL workspace depth on the intern side (admin-parity enrichment, read-only)', () => {
  const text = (id: string) => container.querySelector(`[data-testid="${id}"]`)?.textContent ?? '';

  it('Solicitation renders the FULL blueprint — scoring factors and submission rules, not just counts', async () => {
    await render(<StageDetail stage="solicitation" view={VIEW} />);
    expect(present('stage-scoring')).toBe(true);
    expect(present('stage-scoring-factor')).toBe(true);
    expect(text('stage-scoring-factor')).toContain('Technical');
    expect(text('stage-scoring-factor')).toContain('40');   // the factor's points, straight from the projection
    expect(present('stage-rules')).toBe(true);
    expect(present('stage-rule')).toBe(true);                // the Section L mechanics, each with its quote
  });

  it('Snapshot surfaces the close date and priority score from the projection', async () => {
    const dated = { ...VIEW, closeDate: '2030-01-15', priorityScore: 70 } as unknown as StudentGovProjectView;
    await render(<StageDetail stage="snapshot" view={dated} />);
    expect(text('snapshot-close')).toContain('2030-01-15');
    expect(text('snapshot-priority')).toContain('70');
  });

  it('Snapshot shows an in-progress note when the AI vetting is still running (no verdict yet)', async () => {
    const running = { ...VIEW, vetting: { status: 'running', verdict: null, coveragePct: null, reason: null, quote: null } } as unknown as StudentGovProjectView;
    await render(<StageDetail stage="snapshot" view={running} />);
    expect(present('stage-vetting-pending')).toBe(true);
    expect(text('stage-vetting-pending')).toContain('still running');
    expect(present('stage-vetting')).toBe(false);           // no verdict badge while it runs
  });

  it('Fit lists each requirement with its coverage/evidence state', async () => {
    const withReqs = { ...VIEW, requirements: [{ canonicalReqId: 'R-1', statement: 'Asset register', priority: 'must', tracks: ['build'], evidenceState: 'open' }] } as unknown as StudentGovProjectView;
    await render(<StageDetail stage="fit" view={withReqs} />);
    expect(present('fit-requirements')).toBe(true);
    expect(text('fit-req')).toContain('Asset register');
    expect(text('fit-req-evidence')).toContain('Not yet covered'); // 'open' → humanized, no jargon
  });

  it('Fit GROUPS requirements by due stage (admin-parity) when the projection carries it', async () => {
    const withStages = { ...VIEW, requirements: [
      { canonicalReqId: 'R-1', statement: 'Submit the cover letter', priority: 'must', tracks: [], evidenceState: 'open', dueStage: 'submission' },
      { canonicalReqId: 'R-2', statement: 'Provide the asset register', priority: 'must', tracks: ['build'], evidenceState: 'covered', dueStage: 'delivery' },
    ] } as unknown as StudentGovProjectView;
    await render(<StageDetail stage="fit" view={withStages} />);
    expect(present('fit-req-group')).toBe(true);
    const body = text('fit-requirements');
    expect(body).toContain('Due with the submission');
    expect(body).toContain('Due during delivery');
  });

  it('Fit falls back to the flat list when no due stage is present (older projections)', async () => {
    const flat = { ...VIEW, requirements: [{ canonicalReqId: 'R-1', statement: 'Asset register', priority: 'must', tracks: [], evidenceState: 'open' }] } as unknown as StudentGovProjectView;
    await render(<StageDetail stage="fit" view={flat} />);
    expect(present('fit-req')).toBe(true);
    expect(present('fit-req-group')).toBe(false);
  });

  it('Fit renders the ADMIN "Requirements by due stage" panel (same component + data) when requirementEvals are present', async () => {
    // The whole point of this change: the intern Fit step renders the EXACT admin component fed by the SAME
    // evaluateRequirements() output — REQ id, applicability + blocking badges, block reason — grouped under the
    // admin stage label ("Due at submission"), not the prose "Requirements & coverage" look-alike. The admin-only
    // label and block-reason copy, and the absence of the prose `fit-req` row, discriminate the two renders.
    const withEvals = { ...VIEW, requirementEvals: [
      { id: 'R-1', dueStage: 'submission', applicability: 'always', blocking: true, reason: 'submission_prerequisite_no_evidence' },
      { id: 'R-2', dueStage: 'delivery', applicability: 'conditional', blocking: false, reason: null },
    ] } as unknown as StudentGovProjectView;
    await render(<StageDetail stage="fit" view={withEvals} />);
    const body = text('fit-requirements');
    expect(body).toContain('R-1');
    expect(body).toContain('R-2');
    expect(body).toContain('blocking');
    expect(body).toContain('Binding submission requirement with no evidence on file'); // admin BLOCK_REASON copy
    expect(body).toContain('Due at submission'); // admin STAGE_LABEL, not the prose 'Due with the submission'
    expect(present('fit-req')).toBe(false); // the prose coverage row is NOT used — the admin panel replaced it
  });

  it('stays student-safe — renders no dollars, no buyer contacts, no builder identities', async () => {
    // The blueprint carries evaluation POINTS (public), never pricing. The projection itself drops contacts/$,
    // so this asserts the enriched view introduces none by accident.
    await render(<StageDetail stage="solicitation" view={VIEW} />);
    const body = container.textContent ?? '';
    expect(body).not.toMatch(/\$[0-9]/);           // no dollar amounts
    expect(body).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i); // no email contacts
  });

  it('leads with the blueprint ABOVE the requirements list (admin prominence, not buried under a 200-row dump)', async () => {
    await render(<StageDetail stage="solicitation" view={VIEW} />);
    const bp = container.querySelector('[data-testid="stage-blueprint"]');
    const reqs = container.querySelector('[data-testid="stage-reqcount"]');
    expect(bp).toBeTruthy();
    expect(reqs).toBeTruthy();
    // DOCUMENT_POSITION_FOLLOWING: the requirements panel comes AFTER the blueprint in document order.
    expect(bp!.compareDocumentPosition(reqs!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('deriveContractStepState — unified stepper statuses for an assigned contract', () => {
  it('marks the qualification steps done and the viewed step current', () => {
    const v = { proposalReadiness: { pct: 64, passing: 1, total: 3 }, submissionChecklist: { ready: false } } as any;
    const s = deriveContractStepState(v, 'overview'); // viewing the proposal overview
    expect(s.statuses.snapshot).toBe('done');
    expect(s.statuses.build).toBe('done');          // an assigned contract is post-approval, so 1-5 are settled
    expect(s.statuses.proposal).toBe('current');    // 'overview' maps to the Proposal step, and it is the viewed step
    expect(s.statuses.submit).toBe('todo');
    expect(s.frontier).toBe('submit');              // Proposal is current, Submit is the first still-todo step
  });
  it('marks Proposal done at the 95 bar and reflects the viewed Submit step', () => {
    const v = { proposalReadiness: { pct: 96, passing: 3, total: 3 }, submissionChecklist: { ready: false } } as any;
    const s = deriveContractStepState(v, 'package'); // viewing Submit (package)
    expect(s.statuses.proposal).toBe('done');
    expect(s.statuses.submit).toBe('current');       // 'package' maps to the Submit step
  });
});

describe('StudioShell — the UNIFIED stepper routes steps 1-5 to the Qualification Workspace, 6-8 in the Studio', () => {
  const cockpitApi = { askCopilot: async () => ({ intent: 'other', answer: 'ok' }) } as any;

  it('viewOpensQualification selects only the pre-award assessment stages', () => {
    expect(['snapshot', 'solicitation', 'fit', 'decide'].every(viewOpensQualification)).toBe(true);
    expect(['evidence', 'overview', 'package', 'outcome', 'editor', 'needs'].some(viewOpensQualification)).toBe(false);
  });

  it('ADMIN mount: stepper Snapshot..Build open the Qualification Workspace; Proposal stays in the Studio', async () => {
    const opened: string[] = [];
    await render(<StudioShell view={VIEW} projectId="p1" onReload={noop} cockpitApi={cockpitApi} studioApi={studioApi} reviewApi={reviewApi} onOpenQualification={(s) => opened.push(s)} />);
    const click = async (id: string) => { await act(async () => { (container.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement).click(); }); };
    await click('step-snapshot'); await click('step-fit'); await click('step-decide'); await click('step-build');
    expect(opened).toEqual(['snapshot', 'fit', 'decide', 'build']); // all five qualification steps hand off to the workspace
    await click('step-proposal'); // Proposal (step 6) stays in the Proposal Studio
    expect(opened).toEqual(['snapshot', 'fit', 'decide', 'build']);
  });

  it('INTERN mount (no onOpenQualification): the stepper keeps the student-safe in-studio views', async () => {
    await render(<StudioShell view={VIEW} projectId="p1" onReload={noop} cockpitApi={cockpitApi} studioApi={studioApi} reviewApi={reviewApi} />);
    await act(async () => { (container.querySelector('[data-testid="step-fit"]') as HTMLButtonElement).click(); });
    expect(present('stage-fit')).toBe(true); // in-studio StageDetail — the intern never reaches the admin workspace
  });

  it('step 6 (Proposal) is driven by the proposal due date — shows the auto-resolved deadline + countdown', async () => {
    const dated = { ...VIEW, closeDate: '2030-01-15' } as unknown as StudentGovProjectView;
    await render(<StudioShell view={dated} projectId="p1" onReload={noop} cockpitApi={cockpitApi} studioApi={studioApi} reviewApi={reviewApi} />);
    const txt = (container.querySelector('[data-testid="step-proposal"]') as HTMLElement)?.textContent ?? '';
    expect(txt).toContain('2030-01-15'); // the auto-populated due date drives step 6 (no manual entry)
    expect(txt).toContain('left');       // ...with a days-left countdown
  });

  it('INTERN mount: steps 1-5 show the student-safe Qualification rail in place of the agent panel', async () => {
    await render(<StudioShell view={VIEW} projectId="p1" onReload={noop} cockpitApi={cockpitApi} studioApi={studioApi} reviewApi={reviewApi} />);
    // A proposal-production view (overview) keeps the Proposal-agent panel.
    expect(present('agent-panel')).toBe(true);
    expect(present('qual-rail')).toBe(false);
    // Stepping to a pre-award stage (Fit) swaps in the admin-mirror rail and drops the agent panel.
    await act(async () => { (container.querySelector('[data-testid="step-fit"]') as HTMLButtonElement).click(); });
    expect(present('qual-rail')).toBe(true);
    expect(present('agent-panel')).toBe(false);
  });
});

describe('QualRail — the student-safe mirror of the admin workspace right rail (steps 1-5)', () => {
  const vetted = {
    ...VIEW,
    closeDate: '2030-02-01',
    vetting: { status: 'completed', verdict: 'pursue', coveragePct: 50, reason: 'Core work is software delivery.', quote: 'The Vendor shall provide all professional services.' },
    meetings: [{ date: '2030-01-10', text: 'Pre-proposal conference' }],
    keyDates: [{ date: '2030-01-20', text: 'Questions due' }],
  } as unknown as StudentGovProjectView;
  const textOf = (id: string) => container.querySelector(`[data-testid="${id}"]`)?.textContent ?? '';

  it('shows the AI vetting verdict, capability coverage, deadline and key dates from the projection', async () => {
    await render(<QualRail view={vetted} />);
    expect(present('qual-rail')).toBe(true);
    expect(textOf('qual-vetting-verdict')).toContain('recommends pursuing');
    expect(textOf('qual-vetting-card')).toContain('50%');
    expect(textOf('qual-deadline-card')).toContain('2030-02-01');
    expect(present('qual-keydates')).toBe(true);
  });

  it('shows an in-progress note while the AI vetting is still running (no verdict)', async () => {
    const running = { ...vetted, vetting: { status: 'running', verdict: null, coveragePct: null, reason: null, quote: null } } as unknown as StudentGovProjectView;
    await render(<QualRail view={running} />);
    expect(present('qual-vetting-pending')).toBe(true);
    expect(present('qual-vetting-verdict')).toBe(false);
  });

  it('stays student-safe — no dollars and no buyer contact emails in the rail', async () => {
    await render(<QualRail view={vetted} />);
    const body = container.textContent ?? '';
    expect(body).not.toMatch(/\$[0-9]/);
    expect(body).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i);
  });
});

describe('BuildEvidence — the build-artifacts repository the proposal writer draws from', () => {
  const withBuild = {
    ...VIEW,
    build: { releases: [], buildStoryCount: 1, stories: [
      {
        id: 'STORY-1', requirementId: 'R-1', title: 'Search screen', statement: 'Build search', release: 'R1',
        acceptance: [], status: 'assigned', prompt: '', stage: 'done', owner: 'ai', mine: false,
        commit: { sha: 'abc1234', message: 'search' },
        evidence: [{ id: 'EV1', storyId: 'STORY-1', canonicalReqId: 'R-1', description: 'Search screen deployed', artifactRef: 'https://demo.example.com/search', status: 'verified', submittedAt: null, source: 'student', commitSha: 'abc1234' }],
      },
    ] },
  } as unknown as StudentGovProjectView;

  it('lists the submitted build artifacts with an openable link', async () => {
    await render(<BuildEvidence view={withBuild} projectId="p1" reviewApi={reviewApi} onReload={noop} onToast={noop} />);
    expect(present('ev-artifact')).toBe(true);
    expect(container.querySelector('[data-testid="ev-artifact-link"]')?.getAttribute('href')).toBe('https://demo.example.com/search');
  });

  it('shows the empty state (ready for repo artifacts + demo videos) when nothing is submitted yet', async () => {
    await render(<BuildEvidence view={VIEW} projectId="p1" reviewApi={reviewApi} onReload={noop} onToast={noop} />);
    expect(present('ev-artifacts-empty')).toBe(true);
  });

  // Connected-repo display (Phase A): the intern (readOnly) sees the connected repo read-only and NEVER a demo-URL
  // input — even though the read-only reviewApi still defines setDemoUrl. The admin (readOnly=false) keeps its input.
  const withRepo = { ...VIEW, connectedRepo: { owner: 'ColaberryIntern', name: 'crash-records', url: 'https://github.com/ColaberryIntern/crash-records', files: ['src/App.tsx', 'README.md', 'docs/plan.pdf'], fileCount: 3, syncedAt: '2026-11-13T00:00:00.000Z', deliverables: [{ path: 'docs/plan.pdf', name: 'plan.pdf', kind: 'pdf' }, { path: 'README.md', name: 'README.md', kind: 'text' }] } } as unknown as StudentGovProjectView;
  const noRepo = { ...VIEW, connectedRepo: null } as unknown as StudentGovProjectView;

  it('admin (not readOnly) keeps the demo-URL input and shows no connected-repo line', async () => {
    await render(<BuildEvidence view={withRepo} projectId="p1" reviewApi={reviewApi} onReload={noop} onToast={noop} />);
    expect(present('ev-demo-url')).toBe(true);
    expect(present('ev-connected-repo')).toBe(false);
  });

  it('intern (readOnly) shows the connected repo linked, and NO demo-URL input', async () => {
    await render(<BuildEvidence view={withRepo} projectId="p1" reviewApi={reviewApi} onReload={noop} onToast={noop} readOnly />);
    const repo = container.querySelector('[data-testid="ev-connected-repo"]');
    expect(repo?.textContent).toBe('ColaberryIntern/crash-records');
    expect(repo?.getAttribute('href')).toBe('https://github.com/ColaberryIntern/crash-records');
    expect(present('ev-demo-url')).toBe(false);
  });

  it('intern (readOnly) with no connected repo shows the blank state and NO demo-URL input', async () => {
    await render(<BuildEvidence view={noRepo} projectId="p1" reviewApi={reviewApi} onReload={noop} onToast={noop} readOnly />);
    expect(present('ev-no-repo')).toBe(true);
    expect(present('ev-connected-repo')).toBe(false);
    expect(present('ev-demo-url')).toBe(false);
  });

  // Phase C + cards: the connected repo's deliverable DOCUMENTS show as typed cards (not a flat path list).
  it('shows the connected repo deliverables as typed cards (one per deliverable)', async () => {
    await render(<BuildEvidence view={withRepo} projectId="p1" reviewApi={reviewApi} onReload={noop} onToast={noop} readOnly />);
    expect(present('ev-repo-files')).toBe(true);
    const cards = container.querySelectorAll('[data-testid="ev-repo-card"]');
    expect(cards.length).toBe(2);
    // typed by kind, so a per-type viewer can open; source files are not carded (only the 2 deliverables)
    expect(Array.from(cards).map((c) => c.getAttribute('data-kind')).sort()).toEqual(['pdf', 'text']);
  });

  it('opening a card opens the per-type viewer and fetches that file via the studio api', async () => {
    const fetchRepoFile = jest.fn().mockResolvedValue(new Blob(['# Readme'], { type: 'text/markdown' }));
    const studioApi = { fetchRepoFile } as unknown as GovStudioApi;
    await render(<BuildEvidence view={withRepo} projectId="p1" reviewApi={reviewApi} studioApi={studioApi} onReload={noop} onToast={noop} readOnly />);
    const textCard = container.querySelector('[data-testid="ev-repo-card"][data-kind="text"]') as HTMLElement;
    await act(async () => { textCard.click(); });
    expect(present('ev-repo-viewer')).toBe(true);
    expect(fetchRepoFile).toHaveBeenCalledWith('p1', 'README.md', undefined);
  });

  it('a card whose fetch fails shows an error in the viewer (not a blank frame)', async () => {
    const fetchRepoFile = jest.fn().mockRejectedValue(new Error('network'));
    const studioApi = { fetchRepoFile } as unknown as GovStudioApi;
    await render(<BuildEvidence view={withRepo} projectId="p1" reviewApi={reviewApi} studioApi={studioApi} onReload={noop} onToast={noop} readOnly />);
    await act(async () => { (container.querySelector('[data-testid="ev-repo-card"][data-kind="text"]') as HTMLElement).click(); });
    await act(async () => { await Promise.resolve(); });
    expect(present('ev-repo-viewer')).toBe(true);
    expect(container.querySelector('[data-testid="ev-repo-viewer"]')?.textContent).toMatch(/could not load/i);
  });

  it('a Word card opens to a Download (no inline office preview in v1, no fetch on open)', async () => {
    const fetchRepoFile = jest.fn().mockResolvedValue(new Blob(['x']));
    const studioApi = { fetchRepoFile } as unknown as GovStudioApi;
    const wordRepo = { ...VIEW, connectedRepo: { owner: 'o', name: 'r', url: 'u', files: ['d/a.docx'], fileCount: 1, syncedAt: null, deliverables: [{ path: 'd/a.docx', name: 'a.docx', kind: 'word' }] } } as unknown as StudentGovProjectView;
    await render(<BuildEvidence view={wordRepo} projectId="p1" reviewApi={reviewApi} studioApi={studioApi} onReload={noop} onToast={noop} readOnly />);
    await act(async () => { (container.querySelector('[data-testid="ev-repo-card"][data-kind="word"]') as HTMLElement).click(); });
    expect(present('ev-repo-viewer')).toBe(true);
    expect(present('ev-repo-download')).toBe(true);
    expect(fetchRepoFile).not.toHaveBeenCalled(); // office downloads on demand, not on open
  });

  it('no repo-files panel when no repo is connected (keeps the existing empty state)', async () => {
    await render(<BuildEvidence view={noRepo} projectId="p1" reviewApi={reviewApi} onReload={noop} onToast={noop} readOnly />);
    expect(present('ev-repo-files')).toBe(false);
    expect(present('ev-artifacts-empty')).toBe(true);
  });
});

// ── READ-ONLY intern parity: the intern mounts the SAME StudioShell cockpit, but every mutation control is disabled.
// The center panels are wrapped in a disabled <fieldset> (the one-point disable); the agent panel is threaded readOnly
// directly (it is the right rail, a sibling of the center, so the fieldset does not reach it). The admin mount
// (readOnly=false) is unchanged. jsdom does not propagate fieldset[disabled] to descendants' .disabled, so we assert
// the fieldset itself carries disabled (the browser does the propagation) plus a directly-threaded control.
describe('StudioShell read-only (intern parity) — same cockpit, mutation controls disabled', () => {
  const cockpitApi = {
    askCopilot: async () => ({ answer: 'ok' }),
    draftDocument: async () => ({}),
    acceptDocument: async () => ({}),
    requestChanges: async () => ({}),
    commentDocument: async () => ({}),
  } as unknown as GovCockpitApi;
  const mount = (readOnly: boolean) => (
    <StudioShell view={VIEW} projectId="p1" onReload={noop} cockpitApi={cockpitApi} studioApi={studioApi} reviewApi={reviewApi} readOnly={readOnly} />
  );

  it('readOnly: the center fieldset is disabled AND the agent Ask input is disabled', async () => {
    await render(mount(true));
    const fs = container.querySelector('#gps-main fieldset') as HTMLFieldSetElement | null;
    expect(fs).not.toBeNull();
    expect(fs!.disabled).toBe(true);
    const ask = container.querySelector('[data-testid="agent-ask"]') as HTMLInputElement | null;
    expect(ask).not.toBeNull();
    expect(ask!.disabled).toBe(true); // AgentPanel is outside the fieldset; proves the direct readOnly threading
    act(() => root.unmount()); container.remove();
  });

  it('admin mount (readOnly=false) is UNCHANGED — the center fieldset is not disabled and the agent Ask input is enabled', async () => {
    await render(mount(false));
    const fs = container.querySelector('#gps-main fieldset') as HTMLFieldSetElement | null;
    expect(fs).not.toBeNull();
    expect(fs!.disabled).toBe(false);
    const ask = container.querySelector('[data-testid="agent-ask"]') as HTMLInputElement | null;
    expect(ask!.disabled).toBe(false);
    act(() => root.unmount()); container.remove();
  });
});

// ── PHASE B intern authoring: an EDIT-shared intern (view.proposal.canEdit) AUTHORS the proposal lane. On an
// authorable step the center fieldset is ENABLED and the agent panel works; on a LOCKED step (Package/Export, the
// qualification steps) it stays disabled. With authoring OFF it is fully read-only, as before.
describe('StudioShell intern authoring (Phase B) — proposal lane writable, approvals/export/qualification locked', () => {
  const cockpitApi = {
    askCopilot: async () => ({ answer: 'ok' }), draftDocument: async () => ({}), acceptDocument: async () => ({}),
    requestChanges: async () => ({}), commentDocument: async () => ({}),
  } as unknown as GovCockpitApi;
  const EDIT = { ...VIEW, proposal: { level: 'edit', canComment: true, canEdit: true, responses: [] } } as unknown as StudentGovProjectView;
  const mountAuthor = (proposalAuthoring: boolean) => (
    <StudioShell view={EDIT} projectId="p1" onReload={noop} cockpitApi={cockpitApi} studioApi={studioApi} reviewApi={reviewApi} readOnly proposalAuthoring={proposalAuthoring} />
  );
  const renderAt = async (el: React.ReactElement, view: string) => {
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    await act(async () => { root.render(<MemoryRouter initialEntries={[`/?view=${view}`]}>{el}</MemoryRouter>); });
    await flush();
  };

  it('authoring ON, authorable step (overview): the center fieldset is ENABLED and the agent Ask input is enabled', async () => {
    await renderAt(mountAuthor(true), 'overview');
    const fs = container.querySelector('#gps-main fieldset') as HTMLFieldSetElement | null;
    expect(fs!.disabled).toBe(false); // proposal lane is writable for an edit-shared intern
    const ask = container.querySelector('[data-testid="agent-ask"]') as HTMLInputElement | null;
    expect(ask!.disabled).toBe(false);
  });

  it('authoring ON, LOCKED step (package/export): the center fieldset stays DISABLED — export is management-only', async () => {
    await renderAt(mountAuthor(true), 'package');
    const fs = container.querySelector('#gps-main fieldset') as HTMLFieldSetElement | null;
    expect(fs!.disabled).toBe(true);
  });

  it('authoring OFF (no edit share): fully read-only — the center fieldset is disabled even on an authorable step', async () => {
    await renderAt(mountAuthor(false), 'overview');
    const fs = container.querySelector('#gps-main fieldset') as HTMLFieldSetElement | null;
    expect(fs!.disabled).toBe(true);
    const ask = container.querySelector('[data-testid="agent-ask"]') as HTMLInputElement | null;
    expect(ask!.disabled).toBe(true);
  });
});
