import React, { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { StudentGovProjectView, GovCockpitApi, GovReviewApi, GovStudioApi } from '../../../../services/govProjectPortalApi';
import ContractBar from './ContractBar';
import StageRail, { type StudioView } from './StageRail';
import WhereWeAre from './WhereWeAre';
import AgentPanel from './AgentPanel';
import './studio.css';
import Blueprint from './Blueprint';
import DocumentSet from './DocumentSet';
import BuildEvidence from './BuildEvidence';
// Transitional: the views not yet rebuilt (U4–U5) render the shipped govCockpit panels inside the new shell, so
// nothing is lost. Each is wrapped in a `.gck` element to carry its own tokens. The drafting drawer is reused until
// the Draft & versions editor lands.
import ProposalDocumentDrawer from '../govCockpit/ProposalDocumentDrawer';
import ReviewGates from '../govCockpit/ReviewGates';
import PackageSubmit from '../govCockpit/PackageSubmit';

const VIEWS: StudioView[] = ['overview', 'blueprint', 'documents', 'evidence', 'editor', 'gates', 'package', 'openitems'];

/**
 * StudioShell — the Proposal Studio desk: a sticky contract bar, a left process rail, a center workspace, and the
 * persistent agent panel on the right. Both entry points (admin + portal) render this: admin injects the review API
 * (gates, pricing) and the admin-token clients; the portal injects the participant-token clients and no review API.
 * The selected view lives in the URL (?view=…). Views not yet rebuilt render the shipped govCockpit panels.
 */
export default function StudioShell(
  { view, projectId, onReload, cockpitApi, studioApi, reviewApi, onReanalyze, reanalyzing = false }:
  { view: StudentGovProjectView; projectId: string; onReload: () => void; cockpitApi: GovCockpitApi; studioApi: GovStudioApi; reviewApi?: GovReviewApi; onReanalyze?: () => void; reanalyzing?: boolean },
): React.ReactElement {
  const [sp, setSp] = useSearchParams();
  const raw = sp.get('view');
  const current: StudioView = (raw && (VIEWS as string[]).includes(raw) ? raw : 'overview') as StudioView;
  const [openDocKey, setOpenDocKey] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const docs = useMemo(() => view.proposalDocuments ?? [], [view.proposalDocuments]);
  const openDoc = openDocKey ? docs.find((d) => d.key === openDocKey) ?? null : null;

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

  const openQuestionCount = 0; // the agent panel owns the live count; Where-we-are only needs a hint for next-moves
  const gck = (node: React.ReactNode) => <div className="gck">{node}</div>;

  let center: React.ReactNode;
  switch (current) {
    case 'overview':
      center = <WhereWeAre view={view} questionCount={openQuestionCount} onNavigate={go} />;
      break;
    case 'blueprint':
      center = <Blueprint view={view} onReanalyze={onReanalyze} reanalyzing={reanalyzing} onToast={toast} />;
      break;
    case 'documents':
      center = <DocumentSet docs={docs} onOpen={(d) => setOpenDocKey(d.key)} onToast={toast} />;
      break;
    case 'evidence':
      center = <BuildEvidence view={view} projectId={projectId} reviewApi={reviewApi} onReload={onReload} onToast={toast} />;
      break;
    case 'gates':
      center = gck(<ReviewGates projectId={projectId} docs={docs} reviewApi={reviewApi} />);
      break;
    case 'package':
      center = gck(<PackageSubmit projectId={projectId} reviewApi={reviewApi} />);
      break;
    case 'editor':
      center = (
        <div className="gps-view"><div className="gps-vh"><div><h2>Draft &amp; versions</h2><p>The paper preview, section plan, six-check scores, version history and the agent review cycle land here next. For now, open a document from Document set to draft it.</p></div></div>
          <div className="gps-panel"><button className="gps-btn primary" onClick={() => go('documents')}>Go to Document set</button></div></div>
      );
      break;
    case 'openitems':
    default:
      center = (
        <div className="gps-view"><div className="gps-vh"><div><h2>Open items</h2><p>Blueprint rules that need input, fatal findings, documents with no requirements, and unused artifacts collect here. This view is rebuilt in the final phase.</p></div></div>
          <div className="gps-panel"><p className="gps-muted" style={{ margin: 0 }}>Nothing blocking right now. Answer any questions in the agent panel, then run a review cycle.</p></div></div>
      );
      break;
  }

  return (
    <div className="gps">
      <ContractBar view={view} />
      <div className="gps-shell gps-gut">
        <StageRail view={view} current={current} onNavigate={go} />
        <main id="gps-main" style={{ minWidth: 0 }}>{center}</main>
        <AgentPanel projectId={projectId} studioApi={studioApi} onReload={onReload} onToast={toast} />
      </div>
      {openDoc && (
        gck(<ProposalDocumentDrawer doc={openDoc} projectId={projectId} canVerify={view.viewerCanVerify} onReload={onReload} onClose={() => setOpenDocKey(null)} api={cockpitApi} />)
      )}
      {toastMsg && <div className="gps-toast" role="status">{toastMsg}</div>}
    </div>
  );
}
