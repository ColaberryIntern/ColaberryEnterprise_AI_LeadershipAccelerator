import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { StudentGovProjectView, GovCockpitApi, GovReviewApi, GovStudioApi, GovProposalDocument } from '../../../../services/govProjectPortalApi';
import ContractBar from './ContractBar';
import StageRail, { type StudioView } from './StageRail';
import WhereWeAre from './WhereWeAre';
import AgentPanel from './AgentPanel';
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
const VIEWS: StudioView[] = ['overview', 'blueprint', 'documents', 'evidence', 'editor', 'gates', 'package', 'needs', 'openitems'];

/**
 * StudioShell — the Proposal Studio desk: a sticky contract bar, a left process rail, a center workspace, and the
 * persistent agent panel on the right. Both entry points (admin + portal) render this: admin injects the review API
 * (gates, pricing) and the admin-token clients; the portal injects the participant-token clients and no review API.
 * The selected view lives in the URL (?view=…). A scored document deep-links to
 * the editor (?doc=). Every stage view is a native `.gps` surface; only the drafting drawer for a form/pricing row
 * reuses the shipped govCockpit panel.
 */
export default function StudioShell(
  { view, projectId, onReload, cockpitApi, studioApi, reviewApi, onReanalyze, reanalyzing = false, bugReportEndpoint }:
  { view: StudentGovProjectView; projectId: string; onReload: () => void; cockpitApi: GovCockpitApi; studioApi: GovStudioApi; reviewApi?: GovReviewApi; onReanalyze?: () => void; reanalyzing?: boolean; bugReportEndpoint?: string },
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

  const go = useCallback((v: StudioView) => {
    const next = new URLSearchParams(sp);
    next.set('view', v);
    setSp(next);
    try { window.scrollTo({ top: 0 }); } catch { /* noop */ }
  }, [sp, setSp]);

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
      center = <WhereWeAre view={view} onNavigate={go} studioApi={studioApi} onReload={onReload} onToast={toast} />;
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
    case 'needs':
    case 'openitems':
    default:
      center = <NeedsInbox projectId={projectId} docs={docs} studioApi={studioApi} onReload={onReload} onNavigate={go} onToast={toast} />;
      break;
  }

  return (
    <div className="gps">
      <ContractBar view={view} onStartTour={() => setTourStep(0)} onNeeds={() => go('openitems')} />
      <div className="gps-shell gps-gut">
        <StageRail view={view} current={current} onNavigate={go} />
        <main id="gps-main" style={{ minWidth: 0 }}>{center}</main>
        <AgentPanel projectId={projectId} studioApi={studioApi} docs={docs} onReload={onReload} onNavigate={go} onAsk={(q) => cockpitApi.askCopilot(projectId, q).then((a) => a.answer)} onToast={toast} />
      </div>
      {drawerDoc && (
        gck(<ProposalDocumentDrawer doc={drawerDoc} projectId={projectId} canVerify={view.viewerCanVerify} onReload={onReload} onClose={() => setOpenDocKey(null)} api={cockpitApi} />)
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
