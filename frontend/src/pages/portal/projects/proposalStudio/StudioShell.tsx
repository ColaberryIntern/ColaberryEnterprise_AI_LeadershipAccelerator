import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { StudentGovProjectView, GovCockpitApi, GovReviewApi, GovStudioApi, GovProposalDocument } from '../../../../services/govProjectPortalApi';
import ContractBar from './ContractBar';
import StageDetail from './StageDetail';
import StageRail, { type StudioView } from './StageRail';
import { viewOpensQualification, deriveContractStepState, STEP_TO_STUDIO_VIEW } from './buildHelpers';
import { StepBar } from '../../../admin/govWorkspace/StepBar';
import AdminGovQualificationPage, { type QualPageApi } from '../../../admin/AdminGovQualificationPage';
import { getPortalGovQualification, getPortalGovOpportunityDetail } from '../../../../services/govProjectPortalApi';
import { WORKSPACE_STEPS, type WorkspaceStep } from '../../../admin/govWorkspace/workspaceSteps';
import { parseDeadline, countdownTo, formatCountdown } from '../../../admin/govDeadline';
import WhereWeAre from './WhereWeAre';
import AgentPanel from './AgentPanel';
import QualRail from './QualRail';
import './studio.css';
import Blueprint from './Blueprint';
import DocumentSet from './DocumentSet';
import BuildEvidence from './BuildEvidence';
import DraftVersions from './DraftVersions';
import ReviewGatesView from './ReviewGatesView';
import PackageView from './PackageView';
import NeedsInbox from './NeedsInbox';
import StudioTour from './StudioTour';
// The drafting drawer for a form/pricing row is the one shipped govCockpit piece still reused (wrapped in `.gck` to
// carry its own tokens); every stage view is now a native `.gps` surface.
import ProposalDocumentDrawer from '../govCockpit/ProposalDocumentDrawer';
import ReportAProblem from '../../../admin/marketing/bugReport/ReportAProblem';

// v4: the Needs view's param is `needs`; `openitems` stays a working alias.
const VIEWS: StudioView[] = ['overview', 'blueprint', 'documents', 'evidence', 'editor', 'gates', 'package', 'needs', 'openitems', 'snapshot', 'solicitation', 'fit', 'decide', 'outcome'];

/**
 * StudioShell — the Proposal Studio desk: a sticky contract bar, a left process rail, a center workspace, and the
 * persistent agent panel on the right. Both entry points (admin + portal) render this: admin injects the review API
 * (gates, pricing) and the admin-token clients; the portal injects the participant-token clients and no review API.
 * The selected view lives in the URL (?view=…). A scored document deep-links to
 * the editor (?doc=). Every stage view is a native `.gps` surface; only the drafting drawer for a form/pricing row
 * reuses the shipped govCockpit panel.
 */
export default function StudioShell(
  { view, projectId, onReload, cockpitApi, studioApi, reviewApi, onReanalyze, reanalyzing = false, bugReportEndpoint, onOpenQualification, readOnly = false }:
  { view: StudentGovProjectView; projectId: string; onReload: () => void; cockpitApi: GovCockpitApi; studioApi: GovStudioApi; reviewApi?: GovReviewApi; onReanalyze?: () => void; reanalyzing?: boolean; bugReportEndpoint?: string;
    /** ADMIN mount only: open the real Gov Qualification Workspace for a pre-award assessment stage (Snapshot/
     *  Solicitation/Fit/Decide). Absent on the intern mount, so the intern keeps the student-safe StageDetail. */
    onOpenQualification?: (step: string) => void;
    /** READ-ONLY intern parity mount: the intern sees the SAME cockpit the admin sees, but every mutation control is
     *  disabled. The center panels are wrapped in a disabled <fieldset> (greys out every button/input/select/textarea
     *  inside); the agent panel, the due-date setter and the document drawer take `readOnly` directly. Navigation
     *  (the step bar + stage rail) stays enabled. Defaults OFF, so the admin cockpit is unchanged. */
    readOnly?: boolean },
): React.ReactElement {
  const [sp, setSp] = useSearchParams();
  const raw = sp.get('view');
  const current: StudioView = (raw && (VIEWS as string[]).includes(raw) ? raw : 'overview') as StudioView;
  const [openDocKey, setOpenDocKey] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [tourPrompt, setTourPrompt] = useState(false);

  // v4: on a first visit, offer the walkthrough with a NON-BLOCKING prompt (not an auto-opened card). It stays
  // reopenable from "Take the tour" in the contract bar.
  useEffect(() => {
    try {
      if (!window.localStorage.getItem('gps-tour-seen')) {
        window.localStorage.setItem('gps-tour-seen', '1');
        setTourPrompt(true);
      }
    } catch { /* storage blocked — the button is still there */ }
  }, []);

  const docs = useMemo(() => view.proposalDocuments ?? [], [view.proposalDocuments]);
  const drawerDoc = openDocKey ? docs.find((d) => d.key === openDocKey) ?? null : null;

  // READ-ONLY intern cockpit: the qualification steps (Snapshot/Solicitation/Fit/Decide) render the REAL admin
  // Qualification Workspace INLINE (embedded, read-only) — the same content the admin sees, not the StageDetail
  // subset — fed by the participant (award-stripped) qualification endpoints. The admin mount never reaches this
  // branch (it navigates away via onOpenQualification), so this api is intern-only.
  const qualApi = useMemo<QualPageApi>(() => ({
    getWorkspace: () => getPortalGovQualification(projectId),
    getOpportunityDetail: () => getPortalGovOpportunityDetail(projectId),
  }), [projectId]);

  const go = useCallback((v: StudioView) => {
    const next = new URLSearchParams(sp);
    next.set('view', v);
    setSp(next);
    try { window.scrollTo({ top: 0 }); } catch { /* noop */ }
  }, [sp, setSp]);

  // ADMIN contract view only: the four pre-award assessment chips (Snapshot/Solicitation/Fit/Decide) open the REAL
  // Gov Qualification Workspace rather than the student-safe StageDetail. Every other navigation — and the entire
  // intern mount (which never passes onOpenQualification) — falls through to `go` unchanged.
  const navTo = useCallback((v: StudioView) => {
    if (onOpenQualification && viewOpensQualification(v)) { onOpenQualification(v); return; }
    go(v);
  }, [onOpenQualification, go]);

  // The UNIFIED pursuit stepper — the same numbered 1-8 bar the Qualification Workspace shows, so the two views blend
  // into one flow. Steps 1-5 (Snapshot..Build) hand off to the real Qualification Workspace on the ADMIN mount; 6-8
  // (Proposal/Submit/Outcome) stay in the Proposal Studio. The intern mount passes no onOpenQualification, so its 1-5
  // fall through to the student-safe in-studio views (StageDetail / build evidence).
  const onStep = useCallback((key: WorkspaceStep) => {
    const isQual = key === 'snapshot' || key === 'solicitation' || key === 'fit' || key === 'decide' || key === 'build';
    if (onOpenQualification && isQual) { onOpenQualification(key); return; }
    go(STEP_TO_STUDIO_VIEW[key] as StudioView);
  }, [onOpenQualification, go]);
  const stepState = deriveContractStepState(view, current);
  // Step 6 (Proposal) is DRIVEN BY the proposal due date: its sub-line shows the auto-resolved deadline + days-left
  // countdown (from view.closeDate — now auto-populated from the feed, no manual entry) instead of the generic prompt.
  const stepBarSteps = useMemo(() => {
    const pd = view.closeDate ? parseDeadline(view.closeDate) : null;
    if (!pd) return WORKSPACE_STEPS;
    const label = formatCountdown(countdownTo(pd.ms, Date.now()), pd.hasTime);
    return WORKSPACE_STEPS.map((s) => (s.key === 'proposal' ? { ...s, question: `Due ${view.closeDate} · ${label}` } : s));
  }, [view.closeDate]);

  const toast = useCallback((m: string) => {
    setToastMsg(m);
    window.setTimeout(() => setToastMsg((cur) => (cur === m ? null : cur)), 3400);
  }, []);

  const gck = (node: React.ReactNode) => <div className="gck">{node}</div>;

  // A scored document opens in the Draft & versions editor (deep-linked via ?doc=); a form/pricing row opens the
  // drafting drawer or is admin-only.
  const openDoc = useCallback((d: GovProposalDocument) => {
    if (d.key !== 'pricing' && (d.docType === 'derived' || d.docType === 'build' || d.docType === 'generated')) {
      const next = new URLSearchParams(sp); next.set('view', 'editor'); next.set('doc', d.key); setSp(next);
      try { window.scrollTo({ top: 0 }); } catch { /* noop */ }
    } else {
      setOpenDocKey(d.key);
    }
  }, [sp, setSp]);

  let center: React.ReactNode;
  switch (current) {
    case 'overview':
      center = <WhereWeAre view={view} onNavigate={navTo} studioApi={studioApi} onReload={onReload} onToast={toast} />;
      break;
    case 'blueprint':
      center = <Blueprint view={view} onReanalyze={onReanalyze} reanalyzing={reanalyzing} onToast={toast} />;
      break;
    case 'documents':
      center = <DocumentSet view={view} projectId={projectId} docs={docs} studioApi={studioApi} onOpen={openDoc} onReload={onReload} onToast={toast} />;
      break;
    case 'evidence':
      center = <BuildEvidence view={view} projectId={projectId} reviewApi={reviewApi} studioApi={studioApi} onReload={onReload} onToast={toast} />;
      break;
    case 'gates':
      center = <ReviewGatesView projectId={projectId} docs={docs} reviewApi={reviewApi} onOpenDoc={openDoc} onToast={toast} />;
      break;
    case 'package':
      center = <PackageView view={view} projectId={projectId} docs={docs} reviewApi={reviewApi} onToast={toast} />;
      break;
    case 'editor':
      center = <DraftVersions view={view} projectId={projectId} docs={docs} studioApi={studioApi} reviewApi={reviewApi} initialDocKey={sp.get('doc')} onReload={onReload} onToast={toast} />;
      break;
    case 'snapshot':
    case 'solicitation':
    case 'fit':
    case 'decide':
      // The intern's read-only cockpit shows the REAL qualification content inline (embedded); the admin mount never
      // reaches here (it navigates to the standalone workspace). Pre-award assessment with no readOnly falls back to
      // the student-safe StageDetail (legacy intern behaviour for any non-parity caller).
      center = readOnly
        ? <AdminGovQualificationPage readOnly embedded opportunityKey={projectId} step={current} api={qualApi} />
        : <StageDetail stage={current} view={view} />;
      break;
    case 'outcome':
      center = <StageDetail stage={current} view={view} />;
      break;
    case 'needs':
    case 'openitems':
    default:
      center = <NeedsInbox projectId={projectId} docs={docs} studioApi={studioApi} onReload={onReload} onNavigate={go} onToast={toast} />;
      break;
  }

  return (
    <div className="gps">
      <ContractBar
        view={view}
        onStartTour={() => setTourStep(0)}
        onNeeds={() => go('openitems')}
        canManage={view.viewerCanVerify && !readOnly}
        onSetDueDate={studioApi.setProposalDueDate
          ? async (closeDate, priorityScore) => { await studioApi.setProposalDueDate!(projectId, { closeDate, priorityScore }); toast('Proposal due date saved'); onReload(); }
          : undefined}
      />
      <div className="gps-gut" style={{ paddingTop: 12 }}>
        <StepBar steps={stepBarSteps} statuses={stepState.statuses} frontier={stepState.frontier} onStep={onStep} />
      </div>
      <div className="gps-shell gps-gut">
        <StageRail view={view} current={current} onNavigate={go} />
        {/* READ-ONLY: a disabled <fieldset> greys out and blocks every form control in the center panels at once
            (buttons, inputs, selects, textareas) — the one-point disable. Reset to no box so layout is unchanged.
            Navigation lives outside it (the step bar + stage rail stay live). */}
        <main id="gps-main" style={{ minWidth: 0 }}>
          <fieldset disabled={readOnly} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>{center}</fieldset>
        </main>
        {/* On the pre-award assessment steps (1-5), the right column mirrors the admin Qualification Workspace's
            persistent rail (AI vetting + deadline + key dates), read-only and student-safe, instead of the
            Proposal-agent panel. Every other view keeps the agent panel. */}
        {(current === 'snapshot' || current === 'solicitation' || current === 'fit' || current === 'decide' || current === 'outcome')
          ? <QualRail view={view} />
          : <AgentPanel projectId={projectId} studioApi={studioApi} docs={docs} onReload={onReload} onNavigate={go} onAsk={(q) => cockpitApi.askCopilot(projectId, q).then((a) => a.answer)} onToast={toast} readOnly={readOnly} />}
      </div>
      {drawerDoc && (
        gck(<ProposalDocumentDrawer doc={drawerDoc} projectId={projectId} canVerify={view.viewerCanVerify && !readOnly} readOnly={readOnly} onReload={onReload} onClose={() => setOpenDocKey(null)} api={cockpitApi} />)
      )}
      {toastMsg && <div className="gps-toast" role="status">{toastMsg}</div>}
      {tourPrompt && tourStep === null && (
        <div className="gps-tour-prompt" data-testid="tour-prompt" role="status">
          New here? <button type="button" className="gps-link gps-tour-prompt-go" onClick={() => { setTourPrompt(false); setTourStep(0); }}>Take the 2-minute tour</button>
          <button type="button" className="gps-link gps-muted" onClick={() => setTourPrompt(false)}>Not now</button>
        </div>
      )}
      {tourStep !== null && <StudioTour step={tourStep} onNavigate={go} onSetStep={setTourStep} onClose={() => setTourStep(null)} variant={view.viewerCanVerify ? 'admin' : 'intern'} />}
      {bugReportEndpoint && <ReportAProblem brandLabel={null} endpoint={bugReportEndpoint} extra={{ projectId, contractName: view.name }} />}
    </div>
  );
}
